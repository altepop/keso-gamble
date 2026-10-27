import test from 'node:test';
import assert from 'node:assert/strict';
import { RACE_INTERVAL, CLOSE_BEFORE, RUN_MS, COURSE_M, WEEKLY_LIMIT, openRaceStart, latestRaceStart, bigRaceName, raceNumber, weekStart, raceCard, raceResult, raceOdds, raceTimeline, raceCommentary, distanceAt, oddsFromProbability, finishProbabilities, payoutFor, betWins, placeRaceBet, settleRaceBets, hydrateRacing, raceRuns } from '../js/racing.js';
import { createInitialState, hydrateState } from '../js/engine.js';

const jst=(text)=>Date.parse(text+'+09:00');
const tuesday9pm=jst('2026-10-27T21:00:00');

test('races start every 15 minutes and close one minute before the start', () => {
  assert.equal(openRaceStart(jst('2026-10-27T21:05:30')),jst('2026-10-27T21:15:00'));
  assert.equal(openRaceStart(jst('2026-10-27T21:13:59')),jst('2026-10-27T21:15:00'));
  assert.equal(openRaceStart(jst('2026-10-27T21:14:00')),jst('2026-10-27T21:30:00'));
  assert.equal(latestRaceStart(jst('2026-10-27T21:14:59')),tuesday9pm);
  assert.equal(raceNumber(jst('2026-10-27T00:00:00')),1);
  assert.equal(raceNumber(jst('2026-10-27T23:45:00')),96);
  assert.equal(RACE_INTERVAL-CLOSE_BEFORE>RUN_MS,true);
});

test('big races follow the weekday and weekend timetables in Japan time', () => {
  assert.equal(bigRaceName(jst('2026-10-27T08:00:00')),'出勤前レース');
  assert.equal(bigRaceName(jst('2026-10-27T12:30:00')),'昼休みレース');
  assert.equal(bigRaceName(tuesday9pm),'メインレース');
  assert.equal(bigRaceName(jst('2026-10-28T00:00:00')),'日付またぎレース');
  assert.equal(bigRaceName(jst('2026-10-27T16:00:00')),null);
  assert.equal(bigRaceName(jst('2026-10-31T16:00:00')),'おやつレース');
  assert.equal(bigRaceName(jst('2026-10-31T08:00:00')),null);
  assert.equal(raceCard(tuesday9pm).size,10);
  assert.equal(raceCard(tuesday9pm+RACE_INTERVAL).size,8);
});

test('a week starts on Monday 0:00 JST like /valo week', () => {
  assert.equal(weekStart(jst('2026-10-27T21:00:00')),jst('2026-10-26T00:00:00'));
  assert.equal(weekStart(jst('2026-10-26T00:00:00')),jst('2026-10-26T00:00:00'));
  assert.equal(weekStart(jst('2026-10-25T23:59:59')),jst('2026-10-19T00:00:00'));
});

test('cards and results are deterministic for the same race and differ by salt', () => {
  const start=tuesday9pm+RACE_INTERVAL;
  assert.deepEqual(raceCard(start),raceCard(start));
  assert.deepEqual(raceResult(raceCard(start)),raceResult(raceCard(start)));
  assert.notDeepEqual(raceResult(raceCard(start),'secret-a').order,raceResult(raceCard(start),'secret-b').order);
  assert.deepEqual(raceResult(raceCard(start),'secret-a').order.toSorted((a,b)=>a-b),[1,2,3,4,5,6,7,8]);
  assert.throws(()=>raceCard(start+1),/レース/);
  const names=raceCard(start).horses.map(h=>h.name);
  assert.equal(new Set(names).size,names.length);
});

test('playback reaches the post in the result order, moves forward and ends inside the run', () => {
  for(let k=0;k<200;k++){
    const card=raceCard(tuesday9pm+k*RACE_INTERVAL),result=raceResult(card),timeline=raceTimeline(card,result);
    const finish=result.order.map(n=>timeline.horses[n].finish);
    assert.deepEqual(finish,[...finish].sort((a,b)=>a-b));
    assert.ok(finish.at(-1)<RUN_MS);
    for(const n of result.order){
      let last=-1;
      for(let t=0;t<=RUN_MS;t+=250){const d=distanceAt(timeline,n,t);assert.ok(d>=last);last=d;}
      assert.ok(Math.abs(distanceAt(timeline,n,timeline.horses[n].finish)-COURSE_M)<1e-6);
    }
  }
});

test('odds are 1 / probability rounded down to 0.1x with no house cut', () => {
  assert.equal(oddsFromProbability(0.5),20);
  assert.equal(oddsFromProbability(1),10);
  assert.equal(oddsFromProbability(0.1),100);
  assert.equal(oddsFromProbability(0.03),333);
  assert.equal(payoutFor(1000,264),26400);
  for(const start of [tuesday9pm,tuesday9pm+RACE_INTERVAL]){
    const card=raceCard(start),odds=raceOdds(card),{win,place}=finishProbabilities(card);
    assert.ok(Math.abs(win.reduce((a,b)=>a+b,0)-1)<1e-9);
    assert.ok(Math.abs(place.reduce((a,b)=>a+b,0)-3)<1e-9);
    for(const h of card.horses)for(const type of ['win','place']){
      const expected=odds[`${type}Prob`][h.number]*odds[type][h.number]/10;
      assert.ok(expected<=1+1e-9&&expected>0.9,`${type} ${h.number}: ${expected}`);
    }
  }
});

test('exact probabilities match a brute-force count of the same model', () => {
  const card=raceCard(tuesday9pm+RACE_INTERVAL),{win,place}=finishProbabilities(card),trials=20000;
  const wins=new Array(card.size).fill(0),places=new Array(card.size).fill(0);
  for(let i=0;i<trials;i++){const order=raceResult(card,'count-'+i).order;wins[order[0]-1]++;for(const n of order.slice(0,3))places[n-1]++;}
  for(let i=0;i<card.size;i++){
    assert.ok(Math.abs(wins[i]/trials-win[i])<4*Math.sqrt(win[i]*(1-win[i])/trials)+1e-3,`win ${i+1}`);
    assert.ok(Math.abs(places[i]/trials-place[i])<4*Math.sqrt(place[i]*(1-place[i])/trials)+1e-3,`place ${i+1}`);
  }
});

test('the real run matches the odds: predicted and actual winners agree across many races', () => {
  let predicted=0,actual=0,favPredicted=0,favActual=0;
  for(let k=0;k<1500;k++){
    const card=raceCard(tuesday9pm+k*RACE_INTERVAL),odds=raceOdds(card),winner=raceResult(card,'calibration').order[0];
    const favourite=card.horses.map(h=>h.number).sort((a,b)=>odds.winProb[b]-odds.winProb[a])[0];
    favPredicted+=odds.winProb[favourite];favActual+=favourite===winner?1:0;
    for(const h of card.horses){const p=odds.winProb[h.number];if(p<0.1){predicted+=p;actual+=h.number===winner?1:0;}}
  }
  // Roughly 4 standard deviations: a biased model fails, normal noise passes.
  assert.ok(Math.abs(favActual-favPredicted)<4*Math.sqrt(favPredicted),`favourites ${favActual} vs ${favPredicted}`);
  assert.ok(Math.abs(actual-predicted)<4*Math.sqrt(predicted),`outsiders ${actual} vs ${predicted}`);
});

test('commentary is text only, ordered, and names the winner and the last horse', () => {
  const card=raceCard(tuesday9pm),result=raceResult(card),timeline=raceTimeline(card,result),lines=raceCommentary(card,result,timeline,raceOdds(card));
  assert.deepEqual(lines.map(l=>l.t),[...lines.map(l=>l.t)].sort((a,b)=>a-b));
  assert.match(lines[0].text,/スタート/);
  assert.ok(lines.some(l=>l.text.includes(card.horses[result.order[0]-1].name)&&l.text.includes('勝った')));
  assert.ok(lines.some(l=>l.text.includes(card.horses[result.order.at(-1)-1].name)&&l.text.includes('最下位')));
});

test('bets use fixed odds, pay once after the run and respect the weekly limit', () => {
  const now=jst('2026-10-27T21:05:30'),state=createInitialState(now),raceId=openRaceStart(now);
  const card=raceCard(raceId),result=raceResult(card),odds=raceOdds(card);
  const winner=result.order[0],loser=result.order.at(-1);
  placeRaceBet(state,{raceId,type:'win',horse:winner,amount:1000},now);
  placeRaceBet(state,{raceId,type:'place',horse:loser,amount:500},now);
  assert.equal(state.cash,8500);
  assert.deepEqual(settleRaceBets(state,raceId+RUN_MS-1),[]);
  const settled=settleRaceBets(state,raceId+RUN_MS);
  assert.equal(settled.length,2);
  assert.equal(state.cash,8500+payoutFor(1000,odds.win[winner]));
  assert.deepEqual(settleRaceBets(state,raceId+RUN_MS+1),[]);
  const secret=createInitialState(now);
  placeRaceBet(secret,{raceId,type:'win',horse:1,amount:100},now);
  assert.deepEqual(settleRaceBets(secret,raceId+RUN_MS,()=>null),[]);
  assert.equal(secret.raceBets[0].status,'pending');
  const seeded=settleRaceBets(secret,raceId+RUN_MS,id=>id===raceId?'server-seed':null)[0];
  assert.equal(seeded.status,raceResult(card,'server-seed').order[0]===1?'won':'lost');
  assert.equal(betWins('place',result.order[2],result,card.size),true);
  assert.equal(betWins('place',result.order[3],result,card.size),false);
  assert.throws(()=>placeRaceBet(state,{raceId,type:'win',horse:1,amount:100},raceId-CLOSE_BEFORE),/締め切り/);
  assert.throws(()=>placeRaceBet(state,{raceId:raceId+RACE_INTERVAL,type:'win',horse:1,amount:100},now),/締め切り/);
  assert.throws(()=>placeRaceBet(state,{raceId,type:'win',horse:1,amount:150},now),/100 KP単位/);
  assert.throws(()=>placeRaceBet(state,{raceId,type:'win',horse:9,amount:100},now),/馬を選んで/);
  assert.throws(()=>placeRaceBet(state,{raceId,type:'exacta',horse:1,amount:100},now),/券の種類/);
  const rich={...createInitialState(now),cash:1000000};
  placeRaceBet(rich,{raceId,type:'win',horse:1,amount:WEEKLY_LIMIT},now);
  assert.throws(()=>placeRaceBet(rich,{raceId,type:'win',horse:1,amount:100},now),/1週間/);
  const nextWeek=jst('2026-11-02T09:00:00');
  placeRaceBet(rich,{raceId:openRaceStart(nextWeek),type:'win',horse:1,amount:100},nextWeek);
  assert.deepEqual(rich.raceWeek,{start:jst('2026-11-02T00:00:00'),spent:100});
});

test('a race without bets is a no contest unless it is a big race', () => {
  const normal=raceCard(tuesday9pm+RACE_INTERVAL),big=raceCard(tuesday9pm);
  assert.equal(raceRuns(normal,{raceBets:[]}),false);
  assert.equal(raceRuns(big,{raceBets:[]}),true);
  assert.equal(raceRuns(normal,{raceBets:[{raceId:normal.id}]}),true);
});

test('saved race bets survive reloads and invalid records are dropped', () => {
  const now=jst('2026-10-27T21:05:30'),state=createInitialState(now),raceId=openRaceStart(now);
  placeRaceBet(state,{raceId,type:'win',horse:2,amount:300},now);
  const restored=hydrateState(JSON.parse(JSON.stringify(state)),now);
  assert.deepEqual(restored.raceBets,state.raceBets);
  assert.deepEqual(restored.raceWeek,state.raceWeek);
  const tampered=hydrateRacing({raceBets:[{...state.raceBets[0],status:'won',payout:999999},{...state.raceBets[0],amount:150},{...state.raceBets[0],raceId:raceId+1}],raceWeek:{start:-1,spent:5}});
  assert.deepEqual(tampered,{raceBets:[],raceWeek:{start:0,spent:0}});
  assert.deepEqual(hydrateState(null,now).raceBets,[]);
});
