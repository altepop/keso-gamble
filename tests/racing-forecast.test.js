import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FORM_REFORM_FROM,CLASSES,raceCard,raceBrief,runningNotes,groundAffinity,raceOdds,marketProbabilities,finishProbabilities,oddsFromProbability,raceResult,placeSlots} from '../js/racing.js';

const jst=(date,time)=>Date.parse(date+'T'+time+':00+09:00');
test('reform only changes new race cards and does not change the old exact odds',()=>{
 assert.equal(FORM_REFORM_FROM,jst('2026-11-04','00:00'));
 const old=raceCard(jst('2026-11-03','18:15'));
 assert.equal(old.trackBias,undefined);
 assert.equal(old.horses[0].record,undefined);
 assert.deepEqual(marketProbabilities(old),finishProbabilities(old));
 const odds=raceOdds(old);
 const p=finishProbabilities(old);
 for(const h of old.horses){
   assert.equal(odds.win[h.number],oddsFromProbability(p.win[h.number-1]));
   assert.equal(odds.place[h.number],oddsFromProbability(p.place[h.number-1]));
 }
});
test('new market odds are imperfect estimates, not oracle fair odds; racing settles by actual model',()=>{
 let analyzed=0,differ=0;
 for(let day=4;day<26;day++){
  const dayText='2026-11-'+String(day).padStart(2,'0'),start=jst(dayText,'21:15');
  const card=raceCard(start),market=marketProbabilities(card),real=finishProbabilities(card),odds=raceOdds(card);
  assert.ok(card.trackBias>=0&&card.trackBias<=2);
  const b=raceBrief(card);
  assert.ok(/ペース/.test(b.pace));assert.ok(b.bias.length>0);
  assert.equal(b.front,card.horses.filter(h=>h.style<=1).length);
  assert.match(b.hint,/概算評価/);
  assert.ok(Math.abs(real.win.reduce((a,x)=>a+x,0)-1)<1e-9);
  assert.ok(Math.abs(market.win.reduce((a,x)=>a+x,0)-1)<1e-9);
  assert.ok(Math.abs(real.place.reduce((a,x)=>a+x,0)-placeSlots(card.size))<1e-9);
  for(const h of card.horses){
   const i=h.number-1,notes=runningNotes(card,h);
   assert.match(notes.training,/^[A-E]$/);
   assert.ok(['◎','○','△'].includes(notes.trackFit));
   assert.equal(groundAffinity(h),notes.apt);
   assert.equal(odds.win[h.number],oddsFromProbability(market.win[i]*1.05));
   assert.equal(odds.place[h.number],oddsFromProbability(market.place[i]*1.05));
   assert.ok(odds.win[h.number]>=10);
  }
  const dist=real.win.reduce((a,p,i)=>a+Math.abs(p-market.win[i]),0);
  if(dist>0.08)differ++;
  assert.deepEqual(raceResult(card,'secret-'+start),raceResult(card,'secret-'+start));
  analyzed++;
 }
 assert.equal(analyzed,22);
 assert.ok(differ>=10,'the actual probability must materially differ from the market often enough to reward investigation');
});
test('owned horses retain aptitude, recorded finishes, and physical advantage across different starts',()=>{
 const a={horseId:'own-horse-a',name:'TESTHORSE',ability:CLASSES[0].mean+.3,style:3,record:{races:8,wins:2,seconds:2,thirds:1},recentRanks:[2,1,4,3,1]};
 const b={...a,name:'RENAMED HORSE'};
 assert.equal(groundAffinity(a),groundAffinity(b));
 const start=jst('2026-11-05','18:15'),card=raceCard(start,undefined,[a]);
 const owned=card.horses.find(h=>h.horseId===a.horseId);
 assert.ok(owned);
 assert.deepEqual(runningNotes(card,owned).recentRanks,[2,1,4,3,1]);
 assert.equal(runningNotes(card,owned).form.wins,2);
 const past=raceCard(jst('2026-11-03','18:15'),undefined,[a]);
 assert.equal(past.horses.find(h=>h.horseId===a.horseId).record,undefined,'archive card stays byte-compatible');
});
