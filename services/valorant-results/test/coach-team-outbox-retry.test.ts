import test from 'node:test';
import assert from 'node:assert/strict';
import {canClaimCoachOutbox,nextCoachOutboxRetry,coachOutboxTerminal,COACH_OUTBOX_MAX_ATTEMPTS} from '../src/coach-team-outbox-retry.ts';
const base={state:'pending' as const,attempts:0,nextAttemptAt:100,claimedUntil:0};
test('E2 outbox claim requires due time and nonterminal state',()=>{
 assert.equal(canClaimCoachOutbox(base,100),true);
 assert.equal(canClaimCoachOutbox(base,99),false);
 assert.equal(canClaimCoachOutbox({...base,state:'claimed',claimedUntil:110},100),false);
 assert.equal(canClaimCoachOutbox({...base,state:'claimed',claimedUntil:100},100),true);
 assert.equal(canClaimCoachOutbox({...base,state:'delivered'},100),false);
 assert.equal(canClaimCoachOutbox({...base,state:'cancelled'},100),false);
 assert.equal(canClaimCoachOutbox({...base,attempts:COACH_OUTBOX_MAX_ATTEMPTS},100),false);
});
test('E2 retry is bounded, monotonic and fails closed on invalid timestamps',()=>{
 assert.equal(nextCoachOutboxRetry(1,1_000),61_000);
 assert.equal(nextCoachOutboxRetry(4,1_000),481_000);
 assert.equal(nextCoachOutboxRetry(5,1_000),null);
 assert.equal(nextCoachOutboxRetry(0,1_000),null);
 assert.equal(nextCoachOutboxRetry(1,Number.MAX_SAFE_INTEGER),null);
 assert.equal(canClaimCoachOutbox({...base,nextAttemptAt:-1},100),false);
 assert.equal(canClaimCoachOutbox(base,Number.NaN),false);
});
test('E2 delivered, cancelled and exhausted items never retry',()=>{
 assert.equal(coachOutboxTerminal('delivered',1),true);
 assert.equal(coachOutboxTerminal('cancelled',1),true);
 assert.equal(coachOutboxTerminal('pending',5),true);
 assert.equal(coachOutboxTerminal('pending',2),false);
});
