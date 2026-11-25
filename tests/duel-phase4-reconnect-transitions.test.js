import test from 'node:test';
import assert from 'node:assert/strict';
import {
 classifyOthelloTransition,classifyConnect4Transition,classifyGomokuTransition,
 classifyHitBlowFeedback,classifyBluffReveal,classifyPokerReveal
} from '../duel-quality/duel-quality.js';

// Test only read-only visual transition detectors. A reconnect snapshot must
// not be mistaken for a new move or reveal; this does not exercise D1/KP.
const board=(size)=>Array(size).fill('.');
test('Othello: single placement is recognized, snapshots and deletions ignored',()=>{
 const a=board(64),b=[...a];b[0]='B';
 assert.deepEqual(classifyOthelloTransition(a,b),{placed:0,flipped:[]});
 const c=[...b];c[1]='W';
 assert.equal(classifyOthelloTransition(a,c),null);
 const removed=[...b];removed[0]='.';
 assert.equal(classifyOthelloTransition(b,removed),null);
 assert.equal(classifyOthelloTransition(b,b),null);
});
test('Connect4: one grounded chip only; multi-change and floating reconnect rejected',()=>{
 const a='.'.repeat(42),b=a.slice(0,35)+'a'+a.slice(36);
 assert.deepEqual(classifyConnect4Transition(a,b),{index:35,row:5,column:0,side:'a'});
 const floating=a.slice(0,28)+'a'+a.slice(29);
 assert.equal(classifyConnect4Transition(a,floating),null);
 assert.equal(classifyConnect4Transition(a,'a'+a.slice(1,41)+'b'),null);
 assert.equal(classifyConnect4Transition(b,b),null);
});
test('Gomoku: only one new stone after a confirmed state',()=>{
 const a='.'.repeat(225),b=a.slice(0,112)+'B'+a.slice(113);
 assert.deepEqual(classifyGomokuTransition(a,b),{index:112,color:'B',row:8,column:8});
 assert.equal(classifyGomokuTransition(a,b.slice(0,113)+'W'+b.slice(114)),null);
 assert.equal(classifyGomokuTransition(b,a),null);
 assert.equal(classifyGomokuTransition(b,b),null);
});
test('Hit & Blow: reconnect jumps, repeats and corrupted scores never animate',()=>{
 const before={id:'m',version:7,count:2},after={id:'m',version:8,count:3,last:'a:0123:1:2'};
 assert.deepEqual(classifyHitBlowFeedback(before,after),{id:'m',version:8,hit:1,blow:2,key:after.last});
 assert.equal(classifyHitBlowFeedback(before,{...after,version:9}),null);
 assert.equal(classifyHitBlowFeedback(before,{...after,count:4}),null);
 assert.equal(classifyHitBlowFeedback(before,{...after,last:'a:0123:3:2'}),null);
 assert.equal(classifyHitBlowFeedback(before,{...after,id:'other'}),null);
});
test('Bluff Dice: only one new confirmed challenge, never reconnect backlog',()=>{
 const before={id:'m',version:4,history:2,bid:'2:4:1'};
 const after={id:'m',version:5,history:3,last:'3:2:4:1'};
 assert.deepEqual(classifyBluffReveal(before,after),{round:3,version:5});
 assert.equal(classifyBluffReveal(before,{...after,version:6}),null);
 assert.equal(classifyBluffReveal(before,{...after,history:4}),null);
 assert.equal(classifyBluffReveal(before,{...after,id:'other'}),null);
});
test('Poker: only a freshly confirmed second swap reveals, not stale results',()=>{
 const before={id:'m',version:3,revealed:false,done:'1:0'};
 const after={id:'m',version:4,revealed:true,done:'1:1'};
 assert.deepEqual(classifyPokerReveal(before,after),{id:'m',version:4});
 assert.equal(classifyPokerReveal(before,{...after,version:6}),null);
 assert.equal(classifyPokerReveal({...before,revealed:true},after),null);
 assert.equal(classifyPokerReveal(before,{...after,id:'other'}),null);
 assert.equal(classifyPokerReveal({...before,done:'0:0'},after),null);
});
