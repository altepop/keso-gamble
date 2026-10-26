import test from 'node:test';
import assert from 'node:assert/strict';
import legacy from '../taunts.json' with { type:'json' };
import {commentTones,commentToneNames,commentPools,resultComment,selectedTone} from '../src/comments.ts';
import type {CommentGroup,Tone} from '../src/comments.ts';

test('every situation supports all five tones and keeps the original catalogue available',()=>{
 const allLines=Object.values(commentPools).flat();
 assert.equal(allLines.length,784);
 assert.equal(new Set(allLines).size,allLines.length,'catalogue must not pad its count with duplicate lines');
 assert.deepEqual([...commentToneNames].sort(),['dry','hot','meme','normal','roast']);
 for(const group of Object.keys(commentTones) as CommentGroup[]){
  assert.deepEqual(Object.keys(commentTones[group]).sort(),['dry','hot','meme','normal','roast']);
  for(const tone of commentToneNames)assert.equal(commentTones[group][tone].length,tone==='meme'?12:5);
  for(const line of (legacy as Record<string,string[]>)[group]??[])assert.ok(commentPools[group].includes(line));
 }
});
test('all five tones and new lines can actually be selected within each situation',()=>{
 for(const group of Object.keys(commentTones) as CommentGroup[]){
  const seen=new Map<Tone,Set<string>>();
  for(let n=0;n<2000;n++){
   const id='tone-coverage-'+n,tone=selectedTone(id,'test-player');
   const text=resultComment(id,'test-player',group,7).slice('\n💬 '.length);
   const allowed=[...commentTones[group][tone],...(tone==='normal'?((legacy as Record<string,string[]>)[group]??[]):[])];
   assert.ok(allowed.some(line=>line.replaceAll('{streak}','7')===text),group+':'+tone);
   if(!seen.has(tone))seen.set(tone,new Set());seen.get(tone)!.add(text);
  }
  for(const tone of commentToneNames)for(const line of commentTones[group][tone])assert.ok(seen.get(tone)?.has(line.replaceAll('{streak}','7')),group+':'+tone);
 }
});
test('tone and wording remain stable on refetches and substitute actual streak counts',()=>{
 for(const group of ['losing_streak','long_losing_streak','winning_streak','long_winning_streak'] as CommentGroup[]){
  const first=resultComment('same-match','same-player',group,6);
  assert.equal(resultComment('same-match','same-player',group,6),first);
  assert.match(first,/6連/);assert.doesNotMatch(first,/\{streak\}|@everyone|@here/);
 }
 const completion=resultComment('same-match','@everyone','completed');
 assert.doesNotMatch(completion,/@everyone|@here|<@|\d+連勝|\d+連敗/);
});
