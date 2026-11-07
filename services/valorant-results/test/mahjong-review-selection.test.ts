import test from 'node:test';import assert from 'node:assert/strict';
import {selectReviewFindings} from '../src/mahjong-review-selection.ts';
const finding=(seat:number,turn=1,same=false)=>({seat,round:0,turn,actual:'1p',recommended:same?'1p':'2p'});
test('all represented seats survive even if the earliest differences and agreement belong to one player',()=>{
 const all=[finding(0),finding(0,2,true),finding(0,3),finding(1),finding(2),finding(3)];
 const result=selectReviewFindings(all,4);
 assert.equal(result.length,4);assert.deepEqual(result.map(f=>f.seat).sort(),[0,1,2,3]);
 assert.ok(result.some(f=>f.actual===f.recommended));assert.ok(result.some(f=>f.actual!==f.recommended));
 assert.ok(result.every(f=>all.includes(f)));assert.deepEqual(selectReviewFindings(all,4),result);
});
test('three seats keep room for another genuine note without duplicating the same decision',()=>{
 const all=[finding(0),finding(0),finding(1),finding(2),finding(0,2,true)];
 const result=selectReviewFindings(all,3);
 assert.equal(result.length,4);assert.deepEqual([...new Set(result.map(f=>f.seat))],[0,1,2]);
 assert.ok(result.some(f=>f.actual===f.recommended));assert.equal(new Set(result.map(f=>[f.seat,f.round,f.turn].join(':'))).size,4);
});
test('selection never manufactures an agreement or alternative when the engine did not produce one',()=>{
 for(const same of [true,false]){const all=Array.from({length:4},(_,s)=>finding(s,1,same));assert.deepEqual(selectReviewFindings(all,4),all);}
 assert.deepEqual(selectReviewFindings([],3),[]);assert.deepEqual(selectReviewFindings([finding(3)],3),[]);
});
