import test from 'node:test';
import assert from 'node:assert/strict';
import {FESTIVAL_FROM,FESTIVAL_FIRST,FESTIVAL_PRICE,FESTIVAL_MAX_ODDS10,festivalRace,festivalFactor,festivalOdds10,raceCard,raceOdds,raceResult,raceTimeline,distanceAt,createRacing,placeRaceBet,hydrateRacing,settleRaceBets,weekStart,RUN_MS} from '../js/racing.js';
import {racePreview} from '../js/racing-view.js';
const firstFestival=()=>{for(let t=FESTIVAL_FROM;t<FESTIVAL_FROM+70*86400000;t+=900000)if(festivalRace(t))return t;throw Error('fixture festival missing');};
const RACE=firstFestival(),NOW=RACE-120000;

test('festivals are future-only, deterministic and at most one evening slot per week',()=>{
 assert.equal(festivalRace(FESTIVAL_FROM-900000),null);
 const weeks=new Map();let count=0;
 for(let t=FESTIVAL_FROM;t<FESTIVAL_FROM+365*86400000;t+=900000){const e=festivalRace(t);if(!e)continue;
  const key=weekStart(t);assert(!weeks.has(key));weeks.set(key,t);count++;
  const japan=new Date(t+9*3600000);assert.equal(japan.getUTCMinutes(),t===FESTIVAL_FIRST?0:45);assert(japan.getUTCHours()>=19&&japan.getUTCHours()<=23);
  assert.deepEqual(festivalRace(t),e);
 }
 assert(count>=15&&count<=38);
});
test('one ticket per race; exact price; mutation occurs only after every validation and archived tickets retain their real payout',()=>{
 const state={...createRacing(),cash:10000};
 assert.throws(()=>placeRaceBet(state,{raceId:RACE,type:'win',horse:1,amount:100},NOW),/1,000/);assert.equal(state.cash,10000);
 const bet=placeRaceBet(state,{raceId:RACE,type:'win',horse:1,amount:FESTIVAL_PRICE},NOW,[],10000);
 assert.equal(bet.festival,true);assert(bet.odds<=FESTIVAL_MAX_ODDS10);assert.equal(state.cash,9000);
 assert.throws(()=>placeRaceBet(state,{raceId:RACE,type:'place',horse:2,amount:FESTIVAL_PRICE},NOW,[],10),/1人1枚/);assert.equal(state.cash,9000);
 assert.equal(hydrateRacing(state).raceBets[0].odds,bet.odds);
 const publicState={raceBets:[{...bet,odds:null}],raceWeek:state.raceWeek};assert.equal(hydrateRacing(publicState).raceBets.length,1);
 assert.throws(()=>settleRaceBets({...hydrateRacing(publicState),cash:9000},RACE+RUN_MS),/確定配当/);
});
test('payout lottery is deterministic, has huge tiers, and cannot exceed the advertised ticket maximum',()=>{
 const seen=new Set();for(let i=0;i<20000;i++)seen.add(festivalFactor('fixture-'+i));
 assert.deepEqual([...seen].sort((a,b)=>a-b),[10,50,200,1000,10000]);
 assert.equal(festivalFactor('same-seed'),festivalFactor('same-seed'));
 for(const base of [10,100,100000])for(const factor of seen)assert(FESTIVAL_PRICE*festivalOdds10(base,factor)/10<=100000000);
});
test('festival preview never leaks base odds or a purported payout, and its show still has the committed final order',()=>{
 const card=raceCard(RACE),odds=raceOdds(card),result=raceResult(card,'fixture-result'),timeline=raceTimeline(card,result,'fixture-result');
 for(const draft of [{type:'win',horse:1,amount:1000},{type:'trifecta',order:[1,2,3],amount:1000}]){
  const preview=racePreview(card,odds,draft);assert.match(preview,/ゴールまで内緒/);assert.doesNotMatch(preview,/当たれば|[0-9]+\.[0-9]倍/);
 }
 const order=[...card.horses].sort((a,b)=>distanceAt(timeline,b.number,RUN_MS)-distanceAt(timeline,a.number,RUN_MS)).map(h=>h.number);
 assert.deepEqual(order,result.order);assert.equal(card.size,10);
});


test('opening night is Saturday November 14 at 22:00 JST and replaces that week’s random festival',()=>{
 assert.equal(FESTIVAL_FIRST,Date.parse('2026-11-14T22:00:00+09:00'));
 assert.equal(firstFestival(),FESTIVAL_FIRST);assert(festivalRace(FESTIVAL_FIRST));
 assert.equal(festivalRace(Date.parse('2026-11-15T22:45:00+09:00')),null);
 assert.equal(festivalRace(FESTIVAL_FIRST-900000),null);assert.equal(festivalRace(FESTIVAL_FIRST+900000),null);
});
