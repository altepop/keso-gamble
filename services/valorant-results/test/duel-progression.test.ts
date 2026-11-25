import test from 'node:test';
import assert from 'node:assert/strict';
import {DUEL_PROGRESSION_GAMES,evaluateVerifiedDuelProgression,duelProgressionAllowsRelicWinModifier} from '../src/duel-progression.ts';

const base={origin:'server',guild:'guild1',matchId:'12345678-1234-4234-8234-123456789abc',
 user:'player1',opponent:'player2',mode:'pvp',game:'othello',status:'finished',
 finishReason:'natural',outcome:'win',verifiedTerminal:true} as const;
test('every game accepts only verified natural terminal server matches',()=>{
 for(const game of DUEL_PROGRESSION_GAMES){
  const row=evaluateVerifiedDuelProgression({...base,game});
  assert.equal(row.eligible,true,game);
  if(row.eligible)assert.match(row.receiptKey,new RegExp(':'+game+'$'));
 }
});
test('practice, unconfirmed outcome, timeout, resign and self-play do not issue progression',()=>{
 const rejected=[
  {...base,origin:'browser-practice'},{...base,verifiedTerminal:false},
  {...base,status:'active'},{...base,finishReason:'timeout'},
  {...base,finishReason:'resign'},{...base,opponent:'player1'},
  {...base,opponent:null},{...base,matchId:'not-a-uuid'},
  {...base,game:'invented'},{...base,outcome:'hidden'}
 ];
 for(const item of rejected)assert.equal(evaluateVerifiedDuelProgression(item as typeof base).eligible,false);
});
test('PvE progress has separate receipt identity, CPU identity and no forced PvP relic advantage',()=>{
 const pve=evaluateVerifiedDuelProgression({...base,mode:'pve',opponent:null});
 const pvp=evaluateVerifiedDuelProgression(base);
 assert.equal(pve.eligible,true);assert.equal(pvp.eligible,true);
 if(pve.eligible&&pvp.eligible)assert.notEqual(pve.receiptKey,pvp.receiptKey);
 assert.equal(evaluateVerifiedDuelProgression({...base,mode:'pve'}).eligible,false);
 assert.equal(duelProgressionAllowsRelicWinModifier('pvp'),false);
 assert.equal(duelProgressionAllowsRelicWinModifier('pve'),true);
});
test('eligibility response never echoes hidden hands, KP or opponent state',()=>{
 const x=evaluateVerifiedDuelProgression({...base,private_hand:'SECRET',kp:1000} as typeof base);
 assert.equal(x.eligible,true);
 assert.doesNotMatch(JSON.stringify(x),/SECRET|private_hand|kp|player2/);
});
