import test from 'node:test';
import assert from 'node:assert/strict';
import {BOXES,CLASSES,drawHorse,MAX_OWNED,RETIRE_RACES} from '../js/racing.js';
import {ownerPanel} from '../js/racing-view.js';

test('頂上級確定ボックスは常に頂上級を排出する',()=>{
 const box=BOXES.find(b=>b.id==='apex');
 assert.ok(box);
 assert.equal(box.price,1500000);
 assert.deepEqual(box.odds,[0,0,0,0,100]);
 assert.equal(box.odds.reduce((a,b)=>a+b,0),100);
 assert.equal(CLASSES[4].grade,'頂上級');
 for(const r of [0.000001,0.01,0.5,0.9,0.999999]){
  const horse=drawHorse('apex',()=>r);
  assert.equal(horse.grade,4,'random draw cannot select another grade');
  assert.ok(Number.isFinite(horse.ability));
  assert.ok(Number.isInteger(horse.style)&&horse.style>=0&&horse.style<4);
 }
});
test('排出確率と所持・引退制限は維持し、購入価格のみ改定する',()=>{
 assert.deepEqual(BOXES.find(b=>b.id==='legend').odds,[0,0,0,70,30]);
 assert.equal(BOXES.find(b=>b.id==='legend').price,650000);
 assert.equal(BOXES.find(b=>b.id==='platinum').price,200000);
 assert.equal(MAX_OWNED,3);
 assert.equal(RETIRE_RACES,20);
});
test('馬主の購入画面で確定排出と非保証部分を明示する',()=>{
 const html=ownerPanel({horses:[],cash:4000000},Date.parse('2026-11-05T12:00:00+09:00'));
 assert.match(html,/頂上級確定/);
 assert.match(html,/頂上級 100%/);
 assert.match(html,/1,500,000/);
 assert.match(html,/能力値・脚質・レースの勝敗は保証されません/);
 assert.match(html,/data-box="apex"/);
});
