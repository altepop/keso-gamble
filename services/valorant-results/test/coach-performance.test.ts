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

test('same-map/agent history compares disjoint ten-game periods and exposes uncontrolled factors',()=>{
 const rows=Array.from({length:40},(_,i)=>{const r=row(i),ps=JSON.parse(r.players_json);ps[0].k=i<20?10:30;ps[0].d=i<20?20:5;return {...r,map:i%2?'Lotus':'Ascent',players_json:JSON.stringify(ps)};});
 const result=coachPerformance(rows,accounts);
 assert.equal(result.conditionalWindows.length,2);assert.ok(result.conditionalWindows.every(w=>w.recent.matches===10&&w.previous.matches===10));
 assert.ok(result.notes.some(n=>n.kind==='strength'&&n.title.includes('同条件期間比較：キル効率')));
 assert.ok(result.notes.some(n=>n.kind==='strength'&&n.title.includes('同条件期間比較：死亡頻度')));
 assert.ok(result.conditionalWindows[0].uncontrolled.includes('相手の強さ'));
 assert.equal(coachPerformance(rows.slice(0,8),accounts).notes.some(n=>n.title.includes('同条件期間比較')),false);
});
test('win trend names its draw-inclusive denominator; unknown results are excluded, not losses',()=>{
 const loss=row(1,{teams_json:JSON.stringify([{id:'Blue',won:false,rounds:7},{id:'Red',won:true,rounds:13}])});
 const draw=row(2,{teams_json:JSON.stringify([{id:'Blue',won:false,rounds:12},{id:'Red',won:false,rounds:12}])});
 const out=coachPerformance([row(0),loss,draw,row(3,{teams_json:null})],accounts);
 assert.equal(out.overall.knownOutcomes,3);assert.equal(out.overall.unknownOutcomes,1);assert.equal(out.overall.winPct,100/3);
 assert.equal(out.overall.draws,1);assert.equal(out.timeline[0].rollingWinPct5,100/3);
 assert.equal(coachPerformance([row(0,{teams_json:null})],accounts).overall.winPct,null);
});

test('same-map/role comparisons use teammate player-rounds, not opponent or whole-team averages',()=>{
 const a=row(0),ps=JSON.parse(a.players_json);ps[1]={...ps[1],agent:'Sage',k:10,d:20,a:15};ps[2]={...ps[2],agent:'Killjoy',k:30,d:5,a:5};ps[5]={...ps[5],agent:'Sage',k:100,d:0,a:99};a.players_json=JSON.stringify(ps);
 const b={...a,match_id:'second'};const ps2=JSON.parse(b.players_json);delete ps2[1].k;b.players_json=JSON.stringify(ps2);
 const out=coachPerformance([a,b],accounts),g=out.rolePeers[0];
 assert.equal(g.value,'Ascent / センチネル');assert.equal(g.kpr.ownRate,1);assert.equal(g.kpr.peerRate,1);assert.equal(g.kpr.peerPlayerGames,2);assert.equal(g.kpr.peerRounds,40);assert.equal(g.kpr.matches,1);assert.equal(g.kpr.excluded,1);
 assert.equal(g.dpr.ownRate,.5);assert.equal(g.dpr.peerRate,.625);assert.equal(g.dpr.matches,2);assert.equal(g.apr.peerRate,.5);
 assert.equal(JSON.stringify(g).includes('private'),false);assert.equal(coachPerformance([row()],accounts).rolePeers.length,0);
});
test('ACT and JST end-time groups retain unknown dates and do not pretend to know start/sleep',()=>{
 const out=coachPerformance([row(0,{ended_at:Date.parse('2026-11-17T14:59:59Z'),act_name:'e11a1'}),row(1,{ended_at:Date.parse('2026-11-17T15:00:00Z'),act_name:'e11a2'}),row(2,{ended_at:NaN})],accounts);
 assert.deepEqual(out.acts.map(g=>g.value).sort(),['ACT未取得','e11a1','e11a2']);
 assert.ok(out.timeBuckets.some(g=>g.value==='20–24時終了（JST）'));assert.ok(out.timeBuckets.some(g=>g.value==='00–04時終了（JST）'));assert.ok(out.timeBuckets.some(g=>g.value==='終了時刻未取得'));
 assert.equal(out.overall.matches,3);assert.equal(out.timeline.length,2);assert.equal(out.windows[0].recent.matches,2);assert.equal(out.quality.timeSeries.excluded,1);assert.equal(out.form.currentPositiveStreak,null);
});

test('enriched hit/damage provenance never makes the old KDA snapshot appear freshly fetched',()=>{
 const r=row(0,{recorded_at:1000}),ps=JSON.parse(r.players_json);Object.assign(ps[0],{hs:4,bs:12,ls:4,hsAt:2000,damageDealt:2400,damageReceived:3000,damageDealtAt:2500,damagePairAt:3000});r.players_json=JSON.stringify(ps);
 const q=coachPerformance([r],accounts).quality.metricCoverage;
 assert.equal(q.kd.recordedAt!.newest,1000);assert.equal(q.hs.recordedAt!.newest,2000);assert.equal(q.adr.recordedAt!.newest,2500);assert.equal(q.ddDelta.recordedAt!.newest,3000);
});

test('Phase 4 verified map rotation separates historic and missing maps',()=>{
 const rows=[...Array.from({length:5},(_,i)=>row(100+i,{map:'Bind'})),row(200,{map:'Corrode'}),row(201,{map:'Ascent'}),row(202,{map:null})];
 const c=coachPerformance(rows,accounts).mapPoolCoverage;
 assert.equal(c.version,'2026-act6-patch-13.08');
 assert.deepEqual(c.pool.map(m=>m.map),['Abyss','Bind','Corrode','Haven','Lotus','Summit','Sunset']);
 assert.equal(c.pool.find(m=>m.map==='Bind')?.status,'集計可能');
 assert.deepEqual(c.pool.find(m=>m.map==='Bind')?.observedAgents,[{agent:'Sage',matches:5}]);
 assert.equal(c.pool.find(m=>m.map==='Corrode')?.status,'まだ分かりません');
 assert.equal(c.pool.find(m=>m.map==='Abyss')?.status,'未収集');
 assert.deepEqual(c.outsidePool,[{map:'Ascent',matches:1}]);
 assert.equal(c.unknownMapMatches,1);
 assert.equal(c.sampleMatches,8);
 assert.equal(c.poolComplete,false);
 for(const secret of ['private-a','private-match','private-other'])assert.equal(JSON.stringify(c).includes(secret),false);
});

test('timestamp-only roster with valid identities is excluded without inventing zero stats',()=>{
 const real=row(1,{ended_at:Date.parse('2026-11-19T15:00:00Z')});
 const blank=row(2,{ended_at:Date.parse('2026-11-21T21:57:00Z'),map:null,teams_json:null});
 const ps=JSON.parse(blank.players_json);ps.forEach((p:Record<string,unknown>)=>{p.agent=null;p.k=null;p.d=null;p.a=null;p.score=null;});
 const result=coachPerformance([{...blank,players_json:JSON.stringify(ps)},real],accounts);
 assert.equal(result.overall.matches,1);
 assert.equal(result.quality.excluded['time-only-record'],1);
 assert.equal(result.timeline[0].date,new Date(real.ended_at).toISOString());
});
