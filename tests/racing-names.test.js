import test from 'node:test';
import assert from 'node:assert/strict';
import {HORSE_NAMES,FILLER_CROWNS,NAME_EXPANSION_FROM,RACE_INTERVAL,bigRaceName,fillerCrownName,raceCard,raceNumber,regularRaceName} from '../js/racing.js';
import {EXTRA_HORSE_NAMES,EXTRA_CROWN_NAMES,REGULAR_RACE_NAMES} from '../js/racing-name-catalog.js';
const jst=text=>Date.parse(text+'+09:00');

test('large fictional catalogs are distinct, compact, and safe in Discord and race UI',()=>{
 assert.equal(NAME_EXPANSION_FROM,jst('2026-11-03T00:00:00'));
 assert.ok(EXTRA_HORSE_NAMES.length>=280);
 assert.ok(EXTRA_CROWN_NAMES.length>=110);
 assert.ok(REGULAR_RACE_NAMES.length>=140);
 assert.equal(HORSE_NAMES.length,53+EXTRA_HORSE_NAMES.length);
 assert.equal(FILLER_CROWNS.length,22+EXTRA_CROWN_NAMES.length);
 for(const names of [HORSE_NAMES,FILLER_CROWNS,REGULAR_RACE_NAMES]){
  assert.equal(new Set(names).size,names.length,'a name must not be repeated in its category');
  assert.ok(names.every(name=>name===name.trim()&&name.length>=3&&name.length<=20&&!/[@<>`\r\n]/.test(name)),'safe, compact names');
 }
 // Existing fictional names still stay in their original order.
 assert.equal(HORSE_NAMES[0],'ゲートニキヅカナイ');
 assert.equal(HORSE_NAMES[52],'ヤリラフィー');
 assert.equal(FILLER_CROWNS[0],'うおw記念');
});

test('past race cards and event names keep the legacy pools, including existing special events',()=>{
 const oldOrdinary=jst('2026-10-31T18:15:00'),oldCrown=jst('2026-10-31T19:30:00');
 const ordinary=raceCard(oldOrdinary),crown=raceCard(oldCrown);
 assert.equal(ordinary.name,'第'+raceNumber(oldOrdinary)+'レース');
 assert.ok(FILLER_CROWNS.slice(0,22).includes(crown.name));
 assert.deepEqual(ordinary,raceCard(oldOrdinary),'past horse order and odds inputs are stable');
 assert.ok(ordinary.horses.every(h=>HORSE_NAMES.slice(0,53).includes(h.name)));
 assert.ok(crown.horses.every(h=>HORSE_NAMES.slice(0,53).includes(h.name)));
 assert.equal(bigRaceName(jst('2026-10-31T21:00:00')),'KESO TOWN メインレース 松本等しい杯');
 assert.equal(bigRaceName(jst('2026-11-03T21:00:00')),'KESO TOWN メインレース 松本等しい杯');
});

test('all future ordinary races get seeded names, but no extra crown slots or extra big races',()=>{
 const start=jst('2026-11-03T00:15:00');
 const card=raceCard(start);
 assert.equal(card.name,'第'+raceNumber(start)+'レース '+regularRaceName(start));
 assert.equal(card.crown,false);
 assert.equal(card.big,false);
 assert.ok(REGULAR_RACE_NAMES.includes(regularRaceName(start)));
 assert.deepEqual(card,raceCard(start),'new catalogs must remain deterministic');
 assert.equal(fillerCrownName(start),null,'ordinary race is not a crown');
 const oldBig=jst('2026-11-03T21:00:00');
 assert.equal(raceCard(oldBig).name,bigRaceName(oldBig));
 assert.equal(raceCard(oldBig).size,10,'big event and prize classes are unchanged');
 const futureCrown=jst('2026-11-03T19:30:00');
 assert.equal(raceCard(futureCrown).name,fillerCrownName(futureCrown));
 assert.equal(raceCard(futureCrown).crown,true);
});

test('hundreds of future cards use varied names with no duplicate wild runners',()=>{
 const start=jst('2026-11-04T00:00:00');
 const horses=new Set(),ordinary=new Set(),crowns=new Set();
 for(let i=0;i<1200;i++){
  const at=start+i*RACE_INTERVAL;
  const card=raceCard(at);
  assert.equal(new Set(card.horses.map(h=>h.name)).size,card.horses.length,'duplicate horse on the same race');
  card.horses.forEach(h=>horses.add(h.name));
  if(!card.crown&&!card.big)ordinary.add(card.name.replace(/^第\d+レース /,''));
  if(card.crown)crowns.add(card.name);
 }
 assert.ok(horses.size>230,'wide coverage of the expanded horse pool');
 assert.ok(ordinary.size>100,'ordinary race titles must really vary');
 assert.ok(crowns.size>60,'crown titles must really vary');
});
