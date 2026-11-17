import test from 'node:test';import assert from 'node:assert/strict';
import {coachPerformance} from '../src/coach-performance.ts';
const accounts=[{name:'A',tag:'one',puuid:'private-a'},{name:'B',tag:'two',puuid:'private-b'}];
const row=(i=1,changes={})=>({match_id:'private-match'+i,ended_at:1700000000000+i,map:'Ascent',players_json:JSON.stringify([{puuid:'private-a',name:'A',tag:'one',team_id:'Blue',agent:'Sage',k:20,d:10,a:5,score:4000},...Array.from({length:9},(_,i)=>({puuid:'private-other'+i,team_id:i<4?'Blue':'Red'}))]),teams_json:JSON.stringify([{id:'Blue',won:true,rounds:13},{id:'Red',won:false,rounds:7}]),rounds_json:null,...changes});
test('valid roster stats survive missing kill/round event logs; score is divided by verified team rounds',()=>{
 const r=coachPerformance([row()],accounts);assert.equal(r.overall.kd,2);assert.equal(r.overall.acs,200);assert.equal(r.overall.kpr,1);assert.equal(r.overall.dpr,.5);assert.equal(r.overall.apr,.25);
 assert.equal(r.overall.rateBases.kpr.numerator,20);assert.equal(r.overall.rateBases.kpr.rounds,20);
 for(const secret of ['private-a','private-match','private-other','one'])assert.equal(JSON.stringify(r).includes(secret),false);
});
test('missing score, assists and rounds remain independently unknown, never zero-filled',()=>{
 const r0=row(),ps=JSON.parse(r0.players_json);delete ps[0].a;delete ps[0].score;
 const r=coachPerformance([{...r0,players_json:JSON.stringify(ps)}],accounts);
 assert.equal(r.overall.kd,2);assert.equal(r.overall.kpr,1);assert.equal(r.overall.apr,null);assert.equal(r.overall.acs,null);
 assert.equal(coachPerformance([row(1,{teams_json:null})],accounts).overall.kpr,null);
});
test('person views deduplicate match IDs and reject ambiguous simultaneous ownership',()=>{
 assert.equal(coachPerformance([row(),row()],accounts).overall.matches,1);
 const r=row(),ps=JSON.parse(r.players_json);ps[1]={...ps[1],puuid:'private-b',name:'B',tag:'two'};
 const out=coachPerformance([{...r,players_json:JSON.stringify(ps)}],accounts);
 assert.equal(out.overall.matches,0);assert.equal(out.quality.excluded['multiple-owned-accounts-in-match'],1);
});
test('ratio of totals differs from match mean, zero deaths stay unknown in ratio distribution',()=>{
 const r=row(),ps=JSON.parse(r.players_json);ps[0].k=5;ps[0].d=20;
 const out=coachPerformance([row(),{...r,match_id:'second',players_json:JSON.stringify(ps)}],accounts);
 assert.equal(out.overall.kd,25/30);assert.equal(out.overall.medianKd,1.125);assert.ok(out.overall.kdStandardDeviation!>0);
 ps[0].d=0;assert.equal(coachPerformance([{...r,players_json:JSON.stringify(ps)}],accounts).overall.kd,null);
});
test('window comparisons require data on both sides and are never called same-condition controls',()=>{
 const out=coachPerformance(Array.from({length:20},(_,i)=>row(i)),accounts);
 assert.deepEqual(out.windows.map(w=>w.requested),[5,10,20,50]);assert.equal(out.windows[1].recent.matches,10);assert.equal(out.windows[1].previous.matches,10);assert.equal(out.windows[1].sameCondition,false);
 assert.equal(coachPerformance([row()],accounts).notes.length,0);
});

test('known roles and party sizes are descriptive; missing party is never called solo',()=>{
 const r=row(),ps=JSON.parse(r.players_json);ps[0].party_id='private-party';ps[1].party_id='private-party';
 const result=coachPerformance([{...r,players_json:JSON.stringify(ps)}],accounts);
 assert.equal(result.parties[0].value,'2人パーティー');assert.equal(result.roles[0].value,'センチネル');
 assert.equal(JSON.stringify(result).includes('private-party'),false);
 assert.equal(coachPerformance([row()],accounts).parties[0].value,'パーティー未取得');
});

test('HS is head hits over all hits, independently of kills; missing hits are not zero',()=>{
 const r=row(),ps=JSON.parse(r.players_json);ps[0].hs=4;ps[0].bs=12;ps[0].ls=4;
 const out=coachPerformance([{...r,players_json:JSON.stringify(ps)}],accounts);
 assert.equal(out.overall.hsPct,20);assert.equal(out.quality.hs.denominator,20);assert.equal(out.quality.hs.numerator,4);
 assert.equal(coachPerformance([row()],accounts).overall.hsPct,null);
});

test('damage metrics have their own round denominator and preserve negative DD delta',()=>{
 const r=row(),ps=JSON.parse(r.players_json);ps[0].damageDealt=2400;ps[0].damageReceived=3000;
 const out=coachPerformance([{...r,players_json:JSON.stringify(ps)},row(2)],accounts);
 assert.equal(out.overall.adr,120);assert.equal(out.overall.ddDeltaPerRound,-30);assert.equal(out.quality.adr.valid,1);assert.equal(out.quality.adr.denominator,20);
 assert.equal(coachPerformance([row()],accounts).overall.adr,null);
});

test('form uses past games of the same agent and does not join a streak across missing rounds',()=>{
 const rows=Array.from({length:13},(_,i)=>{const r=row(i),ps=JSON.parse(r.players_json);if(i>=10){ps[0].k=30;ps[0].d=5;}return {...r,players_json:JSON.stringify(ps)};});
 const result=coachPerformance(rows,accounts);assert.equal(result.form.currentPositiveStreak,3);assert.equal(result.form.negative,0);assert.ok(result.form.unclassified>=5);
 const missing={...row(99),teams_json:null};assert.equal(coachPerformance([missing,...rows],accounts).form.currentPositiveStreak,0);
});

test('own same-agent map contrasts find both strengths and reviews, not role norms',()=>{
 const rows=Array.from({length:12},(_,i)=>{const r=row(i),ps=JSON.parse(r.players_json);ps[0].k=i<6?30:10;ps[0].d=i<6?5:20;return {...r,map:i<6?'Ascent':'Lotus',players_json:JSON.stringify(ps)};});
 const out=coachPerformance(rows,accounts);
 assert.ok(out.notes.some(n=>n.kind==='strength'&&n.title.includes('Ascent / Sage')));
 assert.ok(out.notes.some(n=>n.kind==='review'&&n.title.includes('Lotus / Sage')));
 assert.equal(coachPerformance(rows.slice(0,4),accounts).notes.some(n=>n.title.includes('/ Sage')),false);
});
test('independent quality timestamps and rolling KD never use future games or missing stats as zero',()=>{
 const a=row(0,{recorded_at:1700000000000}),b=row(1,{recorded_at:1700000001000});
 const ps=JSON.parse(b.players_json);delete ps[0].score;ps[0].k=2;ps[0].d=4;b.players_json=JSON.stringify(ps);
 const out=coachPerformance([a,b],accounts);
 assert.equal(out.quality.metricCoverage.acs.valid,1);assert.equal(out.quality.metricCoverage.acs.recordedAt!.newest,1700000000000);
 assert.equal(out.quality.metricCoverage.kd.valid,2);assert.equal(out.timeline[0].rollingKd5,22/14);assert.equal(out.timeline[1].rollingKd5,2);
});
test('teammate splits describe the selected player and never disclose party or unknown teammates',()=>{
 const a=row(0),ps=JSON.parse(a.players_json);ps[1].name='Known';ps[1].tag='Tag';a.players_json=JSON.stringify(ps);
 const out=coachPerformance([a,row(1)],accounts,[{person:'小林',riotId:'Known#Tag'}]);
 assert.equal(out.teammates[0].person,'小林');assert.equal(out.teammates[0].with.matches,1);assert.equal(out.teammates[0].without.matches,1);
 assert.equal(JSON.stringify(out).includes('Known'),false);
});
