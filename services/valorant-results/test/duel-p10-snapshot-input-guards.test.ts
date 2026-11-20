import assert from 'node:assert/strict';
import test from 'node:test';
import {spectatorPublicSnapshot,type SpectatorSource,type SpectatorGame} from '../src/duel-spectator-public.ts';
const base:SpectatorSource={id:'match-1',guild:'guild-1',game:'othello',status:'active',user_a:'a',user_b:'b',turn_user:'a',winner:null,version:1,updated_at:1,board:'........'};
test('P10 readiness: all six game projections accept valid fixture data without route publication',()=>{
 for(const game of ['othello','gomoku','connect4','hitblow','bluffdice','poker'] as SpectatorGame[]){
  const snapshot=spectatorPublicSnapshot({...base,game});
  assert.equal(snapshot.game,game);
  assert.deepEqual(snapshot.participants,['a','b']);
  assert.equal(snapshot.version,1);
  assert.equal(Object.hasOwn(snapshot,'guild'),false);
 }
});
test('P10 readiness: missing identifying fields and unsafe clock or revision fail closed',()=>{
 const invalid=[
  {id:''},{id:'x'.repeat(257)},{guild:''},{user_a:''},{user_b:''},
  {version:-1},{version:NaN},{version:1.5},{version:Number.MAX_SAFE_INTEGER+1},
  {updated_at:-1},{updated_at:Infinity},{updated_at:0.5},
  {board:null},
 ] as Array<Partial<SpectatorSource>>;
 for(const change of invalid){
  assert.throws(()=>spectatorPublicSnapshot({...base,...change}),/spectator snapshot unavailable/);
 }
});
test('P10 readiness: snapshots expose only explicitly selected top-level fields',()=>{
 const result=spectatorPublicSnapshot({...base,board:'board-state'});
 assert.deepEqual(Object.keys(result).sort(),['game','id','participants','publicState','status','turn','updatedAt','version','winner'].sort());
 assert.deepEqual(result.publicState,{board:'board-state'});
});
