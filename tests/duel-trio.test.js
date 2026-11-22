import test from 'node:test';
import assert from 'node:assert/strict';
import {trioPlayTurn,trioMove,trioWinner,trioCpuChoice} from '../js/duel-trio.js';
test('new game begins with legal human move and strong CPU reply without KP state',()=>{
 const state=trioPlayTurn('.........',4,'strong');
 assert.equal(state.board.length,9);
 assert.equal(state.board[4],'X');
 assert.equal([...state.board].filter(x=>x==='O').length,1);
 assert.equal(state.winner,null);
 assert.deepEqual(Object.keys(state).sort(),['board','cpuCell','winner']);
});
test('normal and strong CPU win immediately and block immediate loss',()=>{
 assert.equal(trioCpuChoice('OO.XX...X','strong'),2);
 assert.equal(trioCpuChoice('XX..O....','normal'),2);
 assert.equal(trioCpuChoice('XX..O....','strong'),2);
});
test('strong CPU never loses from an empty board against any legal human sequence',()=>{
 const visited=new Set();
 function explore(board){
  if(visited.has(board))return;visited.add(board);
  const w=trioWinner(board);
  assert.notEqual(w,'X','strong CPU lost: '+board);
  if(w)return;
  for(let i=0;i<9;i++)if(board[i]==='.'){
   const next=trioPlayTurn(board,i,'strong');
   assert.notEqual(next.winner,'X','strong CPU lost at '+board+' / '+i);
   explore(next.board);
  }
 }
 explore('.........');
 assert.ok(visited.size>20);
});
test('invalid cells, turns, corrupt boards, random values fail closed',()=>{
 assert.throws(()=>trioMove('.........',9,'X'));
 assert.throws(()=>trioMove('.........',0,'O'));
 assert.throws(()=>trioWinner('..X'));
 assert.throws(()=>trioCpuChoice('.........'));
 assert.throws(()=>trioCpuChoice('X........','easy',()=>1));
});
