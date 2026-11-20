import assert from 'node:assert/strict';
import test from 'node:test';
import {spectatorPublicSnapshot,type SpectatorSource} from '../src/duel-spectator-public.ts';
const source:SpectatorSource={id:'match-1',guild:'guild-1',game:'poker',status:'active',user_a:'a',user_b:'b',turn_user:'a',winner:null,version:1,updated_at:100,board:'{}'};
const secret='TOP_SECRET_DO_NOT_EXPOSE';
test('P10: poker spectator never reveals private cards or board metadata',()=>{
 const board=JSON.stringify({private_hand:[secret],holeCards:[secret],deck:[secret],publicPot:100});
 const result=spectatorPublicSnapshot({...source,board});
 assert.deepEqual(result.publicState,{});
 assert.doesNotMatch(JSON.stringify(result),/TOP_SECRET_DO_NOT_EXPOSE/);
});
test('P10: bluffdice spectator exposes bid allowlist only',()=>{
 const board=JSON.stringify({bid:{by:'a',count:2,face:5,secret},dice:[secret],private_hand:secret});
 const result=spectatorPublicSnapshot({...source,game:'bluffdice',board});
 assert.deepEqual(result.publicState,{bid:{by:'a',count:2,face:5}});
 assert.doesNotMatch(JSON.stringify(result),/TOP_SECRET_DO_NOT_EXPOSE/);
});
test('P10: hitblow history is capped at 100 rows and strips secrets',()=>{
 const history=Array.from({length:105},(_,i)=>({by:'a',guess:String(i),hit:1,blow:0,answer:secret}));
 const result=spectatorPublicSnapshot({...source,game:'hitblow',board:JSON.stringify({history,answer:secret})});
 const state=result.publicState as {history:unknown[]};
 assert.equal(state.history.length,100);
 assert.deepEqual(state.history[0],{by:'a',guess:'5',hit:1,blow:0});
 assert.doesNotMatch(JSON.stringify(result),/TOP_SECRET_DO_NOT_EXPOSE/);
});
test('P10: malformed private boards cannot expose raw content',()=>{
 for(const game of ['poker','bluffdice','hitblow'] as const){
  const result=spectatorPublicSnapshot({...source,game,board:'{'+secret});
  assert.equal(result.publicState,null);
  assert.doesNotMatch(JSON.stringify(result),/TOP_SECRET_DO_NOT_EXPOSE/);
 }
});
