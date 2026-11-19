import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateBoardDuelTerminal,type VerifiedBoardDuelTerminal} from '../src/duel-progression-terminal.ts';

const base:VerifiedBoardDuelTerminal={
 guild:'guild1',id:'12345678-1234-4234-8234-123456789abc',
 user_a:'alice',user_b:'bob',game:'othello',status:'finished',
 winner:'alice',version:9,action_kind:'move',action_version:8,
 action_winner:'alice',action_actor:'alice'
};
test('only verified natural terminal moves are progression eligible',()=>{
 const a=evaluateBoardDuelTerminal(base,'alice');
 assert.equal(a.eligible,true);
 if(a.eligible){assert.equal(a.outcome,'win');assert.equal(a.mode,'pvp');assert.equal(a.game,'othello');}
 const b=evaluateBoardDuelTerminal(base,'bob');
 assert.equal(b.eligible,true);
 if(b.eligible)assert.equal(b.outcome,'loss');
 for(const game of ['othello','gomoku','connect4','hitblow','bluffdice','poker']){
  assert.equal(evaluateBoardDuelTerminal({...base,game},'alice').eligible,true,game);
 }
 assert.equal(evaluateBoardDuelTerminal({...base,winner:'draw',action_winner:'draw'},'bob').eligible,true);
});
test('resign, timeout, cancellation, replayed or inconsistent actions cannot grant progress',()=>{
 const cases:VerifiedBoardDuelTerminal[]=[
  {...base,action_kind:'resign',action_actor:'bob'},
  {...base,action_kind:'timeout',action_actor:'system'},
  {...base,action_kind:'cancel'},
  {...base,status:'active'},
  {...base,version:10},
  {...base,action_winner:'bob'},
  {...base,winner:'mallory',action_winner:'mallory'},
  {...base,action_actor:'mallory'},
  {...base,user_b:'alice'},
  {...base,game:'not-a-game'},
  {...base,id:'forged'}
 ];
 for(const value of cases)assert.equal(evaluateBoardDuelTerminal(value,'alice').eligible,false,JSON.stringify(value));
 assert.equal(evaluateBoardDuelTerminal(base,'mallory').eligible,false);
});
