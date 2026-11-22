import test from 'node:test';
import assert from 'node:assert/strict';
import {duelDailyChallenge} from '../src/duel-daily-challenge.ts';
import {DUEL_PROGRESSION_GAMES} from '../src/duel-progression.ts';

test('Phase 11 challenge uses JST midnight, not browser-supplied choices',()=>{
 const before=Date.parse('2026-11-22T14:59:59Z');
 assert.equal(duelDailyChallenge(before).day,'20261122');
 assert.equal(duelDailyChallenge(before+1000).day,'20261123');
 assert.deepEqual(duelDailyChallenge(before),duelDailyChallenge(before-300000));
});
test('all six audited games and three existing CPU levels rotate without new rewards',()=>{
 const day=Date.parse('2026-01-01T03:00:00Z');
 const challenges=Array.from({length:18},(_,i)=>duelDailyChallenge(day+i*86_400_000));
 assert.deepEqual(new Set(challenges.map(c=>c.game)),new Set(DUEL_PROGRESSION_GAMES.filter(game=>game!=='trio')));
 assert.deepEqual(new Set(challenges.map(c=>c.level)),new Set(['easy','normal','strong']));
 for(const challenge of challenges){
  assert.equal(challenge.rule,'standard-server-pve');
  assert.equal(challenge.bonusKp,0);
 }
});
test('reject impossible clocks rather than silently selecting an unsafe challenge',()=>{
 for(const now of [NaN,-1,Infinity,1.3,Number.MAX_SAFE_INTEGER])
  assert.throws(()=>duelDailyChallenge(now));
});
