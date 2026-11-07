import test from 'node:test';
import assert from 'node:assert/strict';
import {initialDuelBoard,duelLegalMoves,playDuelMove,duelScore,duelPlayerForColor} from '../js/duel-rules.js';
test('othello opens with four legal black moves and flips one white stone',()=>{
 const b=initialDuelBoard('othello');assert.equal(b.length,64);
 assert.deepEqual(duelLegalMoves('othello',b,'B'),[19,26,37,44]);
 const played=playDuelMove('othello',b,'B',19);
 assert.deepEqual(played.score,{B:4,W:1});assert.equal(played.nextColor,'W');
 assert.throws(()=>playDuelMove('othello',b,'B',0),/置けません/);
});
test('othello auto passes, then ends with correct score',()=>{
 let b='B'.repeat(64);b=b.slice(0,1)+'.'+b.slice(2);
 assert.equal(duelLegalMoves('othello',b,'B').length,0);
 assert.equal(duelScore(b).B,63);
 const almost='B'.repeat(61)+'.WB';
 assert.equal(duelLegalMoves('othello',almost,'B').length,1);
 const done=playDuelMove('othello',almost,'B',61);
 assert.equal(done.winner,'B');assert.equal(done.nextColor,null);
});
test('gomoku five contiguous wins including diagonal, not only six',()=>{
 let b=initialDuelBoard('gomoku');const n=15;
 for(let i=0;i<4;i++)b=playDuelMove('gomoku',b,'B',i*(n+1)).board;
 const won=playDuelMove('gomoku',b,'B',4*(n+1));
 assert.equal(won.winner,'B');
 assert.equal(playDuelMove('gomoku',won.board,'B',5*(n+1)).winner,'B');
 assert.throws(()=>playDuelMove('gomoku',b,'W',0),/置けません/);
});

const BLACK_PASS={board:'WW.W.BBBWWWWWWBBWWWWWWWBWWBWBWWBWWBBWBWB.WBWBWBBWWBBBBBB.WBBBWWW',move:4};
const WHITE_PASS={board:'.WWWW.B.BBBBBBBBBBBWBBBBBBWBWBBBBBBWWWBBBBWWWWWBBBWWBWBBBBBBBBWW',move:7};
test('Othello auto-pass returns the SAME mover for both black and white, with a subsequent legal move',()=>{
 for(const [color,fixture] of [['B',BLACK_PASS],['W',WHITE_PASS]]){
  const after=playDuelMove('othello',fixture.board,color,fixture.move);
  const opposite=color==='B'?'W':'B';
  assert.equal(after.winner,null);
  assert.equal(after.passed,true);
  assert.equal(after.nextColor,color,'passed opponent must not receive the turn');
  assert.deepEqual(duelLegalMoves('othello',after.board,opposite),[]);
  const allowed=duelLegalMoves('othello',after.board,color);
  assert.ok(allowed.length>0,'same player can move again after pass');
  assert.doesNotThrow(()=>playDuelMove('othello',after.board,color,allowed[0]));
 }
});
test('Othello color-to-user mapping handles both participants, white-pass and consecutive white turns',()=>{
 for(const [black,a,b] of [['player-a','player-a','player-b'],['player-b','player-a','player-b']]){
  const white=black===a?b:a;
  const whitePass=playDuelMove('othello',WHITE_PASS.board,'W',WHITE_PASS.move);
  const blackPass=playDuelMove('othello',BLACK_PASS.board,'B',BLACK_PASS.move);
  assert.equal(duelPlayerForColor(black,a,b,whitePass.nextColor),white);
  assert.equal(duelPlayerForColor(black,a,b,blackPass.nextColor),black);
  assert.equal(duelPlayerForColor(black,a,b,null),null);
  const whiteWin=playDuelMove('othello','W'.repeat(61)+'.BW','W',61);
  assert.equal(whiteWin.winner,'W');
  assert.equal(duelPlayerForColor(black,a,b,whiteWin.winner),white,'white receives the actual winning payout');
 }
 assert.throws(()=>duelPlayerForColor('player-a','player-a','player-b','Q'),/色が不正/);
});
