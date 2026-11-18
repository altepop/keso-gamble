import test from 'node:test';
import assert from 'node:assert/strict';
import {connect4Board,connect4Move,connect4WinningLine} from '../js/duel-mini-games.js';
import {classifyConnect4Transition} from '../duel-quality/duel-quality.js';
import {miniBoardView} from '../js/duel-mini-view.js';
const A='100000000000000101',B='100000000000000102';
const room=(board,status='active',winner=null)=>({
 id:'11111111-2222-4333-8444-555555555555',game:'connect4',user_a:A,user_b:B,
 black_user:A,turn_user:A,board,status,winner,stake:1000,version:8,
 deadline_at:Date.now()+600000
});
const info={games:{connect4:{name:'四目並べ'}},members:[{id:A,name:'A'},{id:B,name:'B'}]};
test('gravity drop detector accepts only one newly confirmed bottom-supported piece',()=>{
 const empty=connect4Board(),first=connect4Move(empty,'a',0).board;
 assert.deepEqual(classifyConnect4Transition(empty,first),{index:35,row:5,column:0,side:'a'});
 const second=connect4Move(first,'b',0).board;
 assert.deepEqual(classifyConnect4Transition(first,second),{index:28,row:4,column:0,side:'b'});
 assert.equal(classifyConnect4Transition(empty,second),null,'missed turns cannot be animated as one move');
 assert.equal(classifyConnect4Transition(first,empty),null,'resets cannot look like a drop');
 assert.equal(classifyConnect4Transition(empty,empty),null);
 assert.equal(classifyConnect4Transition(empty,'a'+empty.slice(1)),null,'floating piece cannot be animated');
});
test('win line detects rows, columns and diagonal; never guesses a win from invalid data',()=>{
 let board=connect4Board();
 for(const [side,column] of [['a',0],['b',1],['a',0],['b',1],['a',0],['b',1],['a',0]])
  board=connect4Move(board,side,column).board;
 assert.deepEqual(connect4WinningLine(board,'a'),[14,21,28,35]);
 assert.deepEqual(connect4WinningLine(board,'b'),[]);
 assert.deepEqual(connect4WinningLine('bad','a'),[]);
 const row='.'.repeat(35)+'aaaa'+'.'.repeat(3);
 assert.deepEqual(connect4WinningLine(row,'a'),[35,36,37,38]);
 const diag=[...connect4Board()];
 for(let i=0;i<4;i++)diag[(5-i)*7+i]='b';
 assert.deepEqual(connect4WinningLine(diag.join(''),'b'),[17,23,29,35]);
});
test('finished board shows a celebration only for a line that matches server winner',()=>{
 let board=connect4Board();
 for(const [side,column] of [['a',0],['b',1],['a',0],['b',1],['a',0],['b',1],['a',0]])
  board=connect4Move(board,side,column).board;
 const html=miniBoardView(room(board,'finished',A),info,A,false);
 assert.equal((html.match(/duel-c4-win(?=\s|")/g)||[]).length,4);
 assert.match(html,/duel-c4-victory-board/);
 assert.match(html,/FOUR IN A ROW!/);
 assert.match(html,/A が4つそろえた/);
 assert.match(html,/data-c4-version="8"/);
 const resign=miniBoardView(room(connect4Board(),'finished',B),info,A,false);
 assert.doesNotMatch(resign,/duel-c4-celebration|duel-c4-victory-board/);
 const wrongWinner=miniBoardView(room(board,'finished',B),info,A,false);
 assert.doesNotMatch(wrongWinner,/duel-c4-celebration|duel-c4-victory-board/);
});
