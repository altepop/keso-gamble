import assert from 'node:assert/strict';
import test from 'node:test';
import {spectatorPublicSnapshot,type SpectatorSource} from '../src/duel-spectator-public.ts';
const base:SpectatorSource={id:'match-1',guild:'guild',game:'hitblow',status:'active',user_a:'a',user_b:'b',turn_user:'a',winner:null,version:1,updated_at:1,board:'{}'};
const marker='PRIVATE_ANSWER_SENTINEL';
test('P10 readiness: hitblow public history truncates exactly at 100 and never includes hidden answer',()=>{
 for(const length of [0,1,99,100,101,200]){
  const history=Array.from({length},(_,i)=>({by:'a',guess:String(i),hit:0,blow:1,answer:marker}));
  const state=spectatorPublicSnapshot({...base,board:JSON.stringify({history,answer:marker})}).publicState as {history:Array<{guess:string}>};
  assert.equal(state.history.length,Math.min(length,100));
  if(length>100)assert.equal(state.history[0]?.guess,String(length-100));
  assert.doesNotMatch(JSON.stringify(state),/PRIVATE_ANSWER_SENTINEL/);
 }
});
test('P10 readiness: invalid public history field shapes fail closed to empty history',()=>{
 for(const history of [null,false,123,'unexpected',{}]){
  const state=spectatorPublicSnapshot({...base,board:JSON.stringify({history,answer:marker})}).publicState;
  assert.deepEqual(state,{history:[]});
 }
});
test('P10 readiness: invalid history entries cannot carry private fields into the projection',()=>{
 const history=[null,42,false,{by:'a',guess:'1234',hit:-1,blow:Infinity,answer:marker}];
 const state=spectatorPublicSnapshot({...base,board:JSON.stringify({history})}).publicState;
 assert.deepEqual(state,{history:[{by:'a',guess:'1234',hit:null,blow:null}]});
 assert.doesNotMatch(JSON.stringify(state),/PRIVATE_ANSWER_SENTINEL/);
});
