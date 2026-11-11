import test from 'node:test';
import assert from 'node:assert/strict';
import {escalationBigCopy,escalationBigNote,escalationBigPost} from '../src/escalation-messages.ts';

test('five tiers give ten distinct comments without pretending a nominal prize is net cash',()=>{
 const denominations=[500,1000,2500,5000,15000];
 const notes=new Set<string>();
 for(let tier=1;tier<=5;tier++)for(const sign of [-1,1]){
  const award=denominations[tier-1]*sign,info=escalationBigCopy(tier,award);
  const copy=escalationBigNote(tier,award);
  assert.match(copy,/エスカ大勝負/);
  assert.ok(copy.includes(info.tierLabel));
  assert.ok(copy.includes(info.nominal+' KP'));
  assert.ok(copy.includes(info.comment));
  notes.add(info.comment);
  const post=escalationBigPost('100000000000000101',tier,award,award,award<0?100:0);
  if(tier<=3)assert.equal(post,null);
  else{
   assert.ok(post?.includes('この試合の口座増減'));
   assert.ok(post?.includes('通常の基本報酬の置き換え'));
   assert.ok(post?.includes('第'+info.tierLabel+'段階'));
   assert.ok(!post?.includes('1通のお知らせです'));
   assert.ok(post?.includes('借KPに計上')===Boolean(award<0));
   assert.ok(post!.length<2000,'Discord payload limit');
   assert.ok(post!.includes('\n'));
  }
 }
 assert.equal(notes.size,10);
 assert.throws(()=>escalationBigCopy(0,500));
 assert.throws(()=>escalationBigCopy(1,1000));
 assert.throws(()=>escalationBigPost('not-an-id',5,15000,15000));
});


test('Swift signed draws say plus/minus rather than claiming the player won or lost the match',()=>{
 const positive=escalationBigNote(1,500,'swiftplay'),negative=escalationBigNote(1,-500,'swiftplay');
 assert.match(positive,/プラス/);assert.match(negative,/マイナス/);assert.doesNotMatch(positive+negative,/勝利|敗北/);
 const post=escalationBigPost('100000000000000101',5,-15000,-15000,0,'swiftplay')!;
 assert.match(post,/マイナス/);assert.match(post,/2\/3でプラス/);assert.doesNotMatch(post,/敗北／基準額/);
 assert.match(escalationBigNote(1,500),/勝利/);assert.match(escalationBigNote(1,-500),/敗北/);
});
