import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculateVerifiedPartyMetrics as calculate} from '../coach/team-metrics.js';

const scope={guildId:'guild-1',teamId:'team-1',authorized:true};
const members=[
 {guildId:'guild-1',teamId:'team-1',ownerId:'owner-A',puuids:['a-main','a-alt'],shareTeamMetrics:true},
 {guildId:'guild-1',teamId:'team-1',ownerId:'owner-B',puuids:['b'],shareTeamMetrics:true},
];
const players=()=>[
 {puuid:'a-main',team_id:'Blue',party_id:'party-1',agent:'Sage',k:20,d:10},
 {puuid:'b',team_id:'Blue',party_id:'party-1',agent:'Jett',k:10,d:5},
 ...Array.from({length:3},(_,i)=>({puuid:'ally-'+i,team_id:'Blue',party_id:'other-party',agent:'Sova'})),
 ...Array.from({length:5},(_,i)=>({puuid:'enemy-'+i,team_id:'Red',party_id:'enemy-party',agent:'Reyna'})),
];
const teams=()=>[{id:'Blue',won:true,rounds:13},{id:'Red',won:false,rounds:7}];
const match=(id='match-1',extra={})=>({
 match_id:id,ended_at:1795100000000,map:'Ascent',recorded_at:1795100000010,
 players_json:JSON.stringify(players()),teams_json:JSON.stringify(teams()),...extra
});
const run=(rows,opts={})=>calculate({rows,members,scope,...opts});
test('only explicit, same-scope consent and a trusted authorization gate permit computation',()=>{
 const rows=[match()];
 for(const scoped of [{...scope,authorized:false},{...scope,teamId:'wrong'},{...scope,guildId:'wrong'}])
  assert.equal(run(rows,{scope:scoped}),null);
 for(const m of [members.map(x=>({...x,shareTeamMetrics:false})),
  [members[0]],members.concat(members[0]),[members[0],{...members[1],ownerId:'owner-A'}],
  [members[0],{...members[1],puuids:['a-main']}],null])
  assert.equal(run(rows,{members:m}),null);
 assert.equal(run(null),null);
});
test('fully verified party totals use weighted kills/deaths, win denominator and map breakdown',()=>{
 const r=run([match()]);
 assert.equal(r.quality.eligibleMatches,1);
 assert.equal(r.overall.winRate.value,1);
 assert.deepEqual(r.overall.kd,{value:2,numerator:30,denominator:15,validPlayerSamples:2,excludedPlayerSamples:0});
 assert.equal(r.maps[0].map,'Ascent');
 assert.equal(r.maps[0].agents.find(x=>x.agent==='Sage').playerMatches,1);
 assert.deepEqual(r.overall.period,{from:1795100000000,to:1795100000000});
 assert.equal(r.positionBasedTradeDistance,'評価範囲外');
 assert.doesNotMatch(JSON.stringify(r),/a-main|a-alt|party-1|match-1|owner-A|guild-1|team-1|ally-/);
});
test('missing, mismatched, opposite-side, and ambiguous parties never count as confirmed party',()=>{
 const base=players();
 const makeRow=(i,fn)=>{const p=structuredClone(base);fn(p);return match('invalid-'+i,{players_json:JSON.stringify(p)});};
 const rows=[
  makeRow(1,p=>{delete p[0].party_id;}),
  makeRow(2,p=>{p[1].party_id='not-same';}),
  makeRow(3,p=>{p[1].team_id='Red';}),
  makeRow(4,p=>{p[1].puuid='a-alt';}),
  makeRow(5,p=>{p[1].puuid=p[0].puuid;}),
  makeRow(6,p=>{p[1].puuid='unknown-user';}),
 ];
 const r=run(rows);
 assert.equal(r.overall.matches,0);
 assert.equal(r.overall.winRate.value,null);
 assert.equal(r.quality.excludedMatches,rows.length);
 assert.equal(r.quality.excludedReasons['party-unverified'],2);
 assert.equal(r.quality.excludedReasons['different-sides'],1);
 assert.equal(r.quality.excludedReasons['ambiguous-owner'],1);
 assert.equal(r.quality.excludedReasons['invalid-roster'],1);
 assert.equal(r.quality.excludedReasons['less-than-two-verified-members'],1);
});
test('duplicate match IDs are not counted again; unavailable outcomes never become a loss',()=>{
 const noWinner=match('uncertain',{teams_json:JSON.stringify([{id:'Blue',rounds:13},{id:'Red',rounds:7}])});
 const r=run([match('victory'),match('victory'),noWinner]);
 assert.equal(r.quality.eligibleMatches,2);
 assert.equal(r.overall.wins,1);
 assert.equal(r.overall.losses,0);
 assert.equal(r.overall.unknownOutcomes,1);
 assert.deepEqual(r.overall.winRate,{value:1,numerator:1,denominator:1});
 assert.equal(r.quality.excludedReasons['duplicate-match'],1);
});
test('K/D missing and zero deaths are marked unknown rather than fabricated 0',()=>{
 const p=players();delete p[0].k;delete p[1].d;
 const noStats=run([match('missing',{players_json:JSON.stringify(p)})]);
 assert.equal(noStats.overall.kd.value,null);
 assert.equal(noStats.overall.kd.excludedPlayerSamples,2);
 const zeroDeath=players();zeroDeath[0].d=0;zeroDeath[1].d=0;
 const r=run([match('zero',{players_json:JSON.stringify(zeroDeath)})]);
 assert.equal(r.overall.kd.value,null);
 assert.equal(r.overall.kd.numerator,30);
 assert.equal(r.overall.kd.denominator,0);
});
test('input is capped, quality exposes the limit, malformed players are rejected',()=>{
 const rows=Array.from({length:253},(_,i)=>match('id-'+i));
 const r=run(rows);
 assert.equal(r.quality.inspectedMatches,250);
 assert.equal(r.quality.eligibleMatches,250);
 assert.equal(r.quality.limitReached,true);
 const bad=run([match('broken',{players_json:'<not-json>'}),match('wrong',{ended_at:-1})]);
 assert.deepEqual(bad.quality.excludedReasons,{'invalid-roster':1,'missing-time':1});
});
test('read-only rendering requires a trusted DTO and never performs fetch, storage or HTML injection',()=>{
 const renderer=readFileSync(new URL('../coach/team-metrics-view.js',import.meta.url),'utf8');
 const calc=readFileSync(new URL('../coach/team-metrics.js',import.meta.url),'utf8');
 assert.doesNotMatch(renderer,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|innerHTML\s*=|sendBeacon/);
 assert.doesNotMatch(calc,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|\bprepare\s*\(|sendBeacon/);
 assert.match(renderer,/textContent=text/);
 assert.match(renderer,/font-size:16px;line-height:1.9/);
 assert.match(renderer,/同じ味方チームにいたことだけで/);
});

test('untrusted position snapshots cannot become team trade distance or leak personal coordinates',()=>{
 const row=match('position-private',{
  positions_json:JSON.stringify({puuid:'private-position-owner',x:12345,y:67890,tradeDistance:42}),
  players_json:JSON.stringify(players().map((p,i)=>({...p,location:{x:100+i,y:200+i}})))
 });
 const result=run([row]);
 assert.equal(result.quality.eligibleMatches,1);
 assert.equal(result.positionBasedTradeDistance,'評価範囲外');
 const shared=JSON.stringify(result);
 assert.doesNotMatch(shared,/private-position-owner|12345|67890|tradeDistance|location|"x"|"y"/);
});
