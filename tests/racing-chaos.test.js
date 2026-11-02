import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CHAOS_RACES_FROM,CHAOS_RACE_TYPES,raceEvent,raceCard,finishProbabilities,raceOdds,raceResult,raceRuns,betWins,placeSlots} from '../js/racing.js';

const toTime=(d,t)=>Date.parse(d+'T'+t+':00+09:00');
test('chaos races are only eligible after activation at explicit hours, never retroactively',()=>{
  assert.equal(CHAOS_RACES_FROM,toTime('2026-11-04','00:00'));
  assert.equal(raceEvent(toTime('2026-11-03','21:15')),null);
  assert.equal(raceEvent(toTime('2026-11-04','21:00')),null);
  assert.equal(raceEvent(toTime('2026-11-04','21:30')),null);
  assert.equal(raceEvent(toTime('2026-11-04','18:15'))?.id!==undefined,true);
  assert.equal(raceEvent(toTime('2026-11-04','21:15'))?.id!==undefined,true);
  assert.equal(raceEvent(toTime('2026-11-04','23:15'))?.id!==undefined,true);
  assert.equal(raceEvent(toTime('2026-11-07','12:15'))?.id!==undefined,true);
  assert.equal(raceEvent(toTime('2026-11-07','16:15'))?.id!==undefined,true);
  assert.equal(raceEvent(toTime('2026-11-05','12:15')),null);
  assert.equal(raceEvent(toTime('2026-11-07','12:16')),null);
  assert.equal('event' in raceCard(toTime('2026-11-03','21:15')),false);
  assert.equal(raceRuns(raceCard(toTime('2026-11-03','21:15')),{raceBets:[]}),false,'old ordinary races still require a bet');
});

test('event cards and odds are deterministic, unbiased probabilities sum to one',()=>{
  const seen=new Set();
  for(let day=4;day<24;day++){
    const start=toTime('2026-11-'+String(day).padStart(2,'0'),'21:15');
    const event=raceEvent(start);assert.ok(event);
    seen.add(event.id);
    const card=raceCard(start);
    assert.equal(raceRuns(card,{raceBets:[]}),true,'a special race runs even without bets');
    assert.equal(card.event?.id,event.id);
    assert.equal(card.name.includes(event.name),true);
    assert.deepEqual(raceCard(start),card);
    const probs=finishProbabilities(card);
    assert.ok(Math.abs(probs.win.reduce((a,b)=>a+b,0)-1)<1e-9);
    assert.ok(Math.abs(probs.place.reduce((a,b)=>a+b,0)-placeSlots(card.size))<1e-9);
    const odds=raceOdds(card),result=raceResult(card,'test-secret-seed');
    assert.deepEqual(result,raceResult(card,'test-secret-seed'));
    assert.ok(odds.win[1]>=10);
    assert.equal(betWins('win',result.order[0],result,card.size),true);
    assert.equal(betWins('place',result.order[0],result,card.size),true);
    const baseline={...card,event:undefined};
    const base=finishProbabilities(baseline).win;
    const diff=probs.win.reduce((sum,p,i)=>sum+Math.abs(p-base[i]),0);
    assert.ok(diff>0.0001,'each event must have a real effect, not cosmetic-only');
  }
  assert.equal(seen.size,CHAOS_RACE_TYPES.length,'all event variants should occur');
});
