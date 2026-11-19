import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
import '../coach/benchmarks.js';const B=globalThis.KesoCoachBenchmarks;
const perf=(extra={})=>({overall:{kd:1,acs:216,adr:139,hsPct:20.9,kdMatches:10,acsMatches:10,damageMatches:10,hitMatches:10,...extra},maps:[],agents:[],roles:[],windows:[],outcomes:[]});
test('dated public sources distinguish quartiles, mean-only values and incompatible HS definitions',()=>{
 assert.equal(B.asOf,'2026-11-19');assert.equal(B.ranks.gold.n,82);assert.deepEqual(B.ranks.gold.acs,[200,216,239]);
 assert.equal(B.pro.n,60);assert.deepEqual(B.pro.adr,[122.8,130.3,136.5]);assert.equal(B.pro.hs,undefined);
 assert.match(B.sources.vlr.limits,/プロ相当の実力とは言えません/);assert.match(B.sources.radianite.method,/命中部位/);
});
test('quartile boundaries are inclusive; labels compare reference samples, not a verified rank',()=>{
 for(const [value,level] of [[199.99,'low'],[200,'typical'],[216,'typical'],[239,'typical'],[239.01,'high']]){
  const result=B.compare(perf({acs:value}),'gold');assert.equal(result.rows[1].level,level);assert.equal(result.rankVerified,false);assert.equal(result.roleMatched,false);
 }
});
test('each metric requires its own sample; missing values are unknown, low counts provisional',()=>{
 const rows=B.compare(perf({kd:null,acsMatches:4,damageMatches:0,hsPct:NaN}),'gold').rows;
 assert.deepEqual(rows.map(r=>r.level),['unknown','provisional','unknown','unknown']);
 assert.equal(B.compare(perf(),'immortal').rows[0].level,'provisional');
 assert.equal(B.compare(perf(),'pro').rows[3].level,'unknown');
});
test('published means never create invented high/low percentiles',()=>{
 const r=B.compare(perf({adr:145,hsPct:30}),'gold');assert.equal(r.rows[2].level,'mean-only');assert.equal(r.rows[2].difference,6);assert.equal(r.rows[2].range,null);
 assert.equal(B.compare(perf(),'radiant').rows[0].level,'mean-only');
 assert.deepEqual(B.compare(perf(),'unverified').rows,[]);
});
test('the combination of HS, damage and KD selects different concrete practice hypotheses',()=>{
 const precision=B.personal(perf({hsPct:30,adr:120}),'gold');assert.equal(precision.focus.topic,'participation');assert.match(precision.cards[0].title,/HS 30.0%/);
 const finish=B.personal(perf({hsPct:15,adr:160,kd:.8}),'gold');assert.equal(finish.focus.topic,'conversion');assert.match(finish.focus.action,/味方が回収/);
 const survival=B.personal(perf({kd:1.3,acs:180}),'gold');assert.equal(survival.focus.topic,'participation');assert.match(survival.cards[0].title,/KD 1.30/);
 const lowSample=B.personal(perf({hsPct:30,adr:120,damageMatches:2}),'gold');assert.equal(lowSample.focus,null);
});
test('personal maps, agents, win/loss and recent history keep actual values and do not mutate records',()=>{
 const p=perf();p.maps=[{value:'Ascent',matches:6,acsMatches:6,acs:250},{value:'Lotus',matches:6,acsMatches:6,acs:190}];p.agents=[{value:'Sage',matches:12}];p.roles=[{value:'センチネル',matches:12}];
 const before=JSON.stringify(p),a=B.personal(p,'gold');assert.match(a.signature,/Sage 12試合/);assert.match(a.focus.action,/Lotus/);assert.match(a.cards[0].title,/250.0/);assert.equal(JSON.stringify(p),before);
 const q=perf();q.outcomes=[{value:'win',acsMatches:5,acs:200},{value:'loss',acsMatches:5,acs:210}];assert.equal(B.personal(q,'gold').focus.topic,'timing');
});
test('public reference asset uses a version matching its bytes',()=>{
 const code=readFileSync(new URL('../coach/benchmarks.js',import.meta.url));const v='coach-'+createHash('sha256').update(code).digest('hex').slice(0,12);
 assert.ok(readFileSync(new URL('../coach.html',import.meta.url),'utf8').includes('./coach/benchmarks.js?v='+v));
});

test('low precision/output and high output select different exercises instead of the same generic aim advice',()=>{
 const low=B.personal(perf({kd:.7,adr:100,hsPct:12}),'gold');assert.equal(low.focus.topic,'precision');assert.match(low.focus.action,/崩れていた方だけ/);
 const high=B.personal(perf({acs:260,adr:170}),'gold');assert.equal(high.focus.topic,'repeat');assert.match(high.cards[0].title,/強み候補/);
});
