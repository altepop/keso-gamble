import test from 'node:test';
import assert from 'node:assert/strict';
import {initialDuelBoard,duelLegalMoves,playDuelMove,duelScore} from '../js/duel-rules.js';
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
 assert.equal(playDuelMove('gomoku',b,'B',4*(n+1)).winner,'B');
 assert.equal(playDuelMove('gomoku',b,'B',5*(n+1)).winner,'B');
 assert.throws(()=>playDuelMove('gomoku',b,'W',0),/置けません/);
});
