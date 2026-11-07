import test from 'node:test';
import assert from 'node:assert/strict';
import {friendReason,friendTransfers,FRIEND_RATES} from '../src/mahjong-friend.ts';
import {head,sample} from './fixtures/mahjong-paipu.ts';
import {summarizePaipu} from '../src/mahjong-summary.ts';

const now=Date.parse('2026-10-28T00:00:00+09:00');
const base=summarizePaipu({...head,config:{category:1,meta:{room_id:12345},mode:{mode:2,ai:false}}},sample);
const friend={...base,end:now-10_000,start:now-2_000_000};
const links=friend.seats.map((p,i)=>({user:'10000000000000010'+i,account:p.accountId}));
test('only recent full human friend rooms can move KP',()=>{
 assert.equal(friendReason(friend,now),null);
 assert.equal(friendReason({...friend,category:2},now),'not_verified_friend_room');
 assert.equal(friendReason({...friend,roomId:0},now),'not_verified_friend_room');
 assert.equal(friendReason({...friend,ai:true},now),'not_verified_friend_room');
 assert.equal(friendReason({...friend,end:now-7*3600_000},now),'outside_recent_window');
 assert.equal(friendReason({...friend,seats:friend.seats.map((x,i)=>i?x:{...x,accountId:0})},now),'invalid_seats');
 assert.equal(friendReason({...friend,seats:friend.seats.map((x,i)=>i?x:{...x,rank:2})},now),'invalid_seats');
});
test('all participants must be mapped one-to-one; no unlinked payout',()=>{
 const transfer=friendTransfers(friend,links)!;
 assert.equal(transfer.length,4);assert.equal(transfer.reduce((n,x)=>n+x.delta,0),0);
 assert.equal(friendTransfers(friend,links.slice(1)),null);
 assert.equal(friendTransfers(friend,[...links,{user:'another',account:links[0].account}]),null);
 assert.equal(friendTransfers(friend,[...links.slice(1),{user:links[1].user,account:links[0].account}]),null);
});
test('all rates conserve KP and are zero sum',()=>{
 for(const [game,rates] of Object.entries(FRIEND_RATES)){
  assert.equal(rates.reduce((a,b)=>a+b,0),0,game);
  assert.equal(rates.length,Number(game[0]));
 }
 assert.deepEqual(FRIEND_RATES['4-hanchan'],[600,200,-200,-600]);
 assert.deepEqual(FRIEND_RATES['3-tonpu'],[300,0,-300]);
});
