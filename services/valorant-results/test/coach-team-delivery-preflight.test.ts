import test from 'node:test';
import assert from 'node:assert/strict';
import {canPrepareCoachTeamDelivery} from '../src/coach-team-delivery-preflight.ts';
const base=()=>({
 now:1_000_000,checkedAt:999_999,event:'task' as const,
 channelEnabled:true,channelId:'123456789012345678',adminSignatureVerified:true,
 lastDeliveredAt:null,
 outbox:{state:'pending' as const,attempts:0,nextAttemptAt:999_998,claimedUntil:0},
 members:[{subjectId:'member-1',joined:true,enabled:true,shareStatus:false,
  consentVersion:2,preferenceConsentVersion:2}]
});
test('E2 team-wide delivery preflight accepts only freshly verified full consent',()=>{
 assert.equal(canPrepareCoachTeamDelivery(base()),true);
 const second={...base().members[0],subjectId:'member-2'};
 assert.equal(canPrepareCoachTeamDelivery({...base(),members:[base().members[0],second]}),true);
 assert.equal(canPrepareCoachTeamDelivery({...base(),members:[]}),false);
 assert.equal(canPrepareCoachTeamDelivery({...base(),members:[base().members[0],base().members[0]]}),false);
 for(const change of [{enabled:false},{joined:false},{preferenceConsentVersion:1}]){
  assert.equal(canPrepareCoachTeamDelivery({...base(),members:[{...base().members[0],...change}]}),false);
 }
 assert.equal(canPrepareCoachTeamDelivery({...base(),checkedAt:990_000}),false);
 assert.equal(canPrepareCoachTeamDelivery({...base(),channelEnabled:false}),false);
 assert.equal(canPrepareCoachTeamDelivery({...base(),adminSignatureVerified:false}),false);
 assert.equal(canPrepareCoachTeamDelivery({...base(),outbox:{...base().outbox,attempts:5}}),false);
});
test('E2 status is forbidden without explicit status consent from all',()=>{
 assert.equal(canPrepareCoachTeamDelivery({...base(),event:'status'}),false);
 assert.equal(canPrepareCoachTeamDelivery({...base(),event:'status',
  members:[{...base().members[0],shareStatus:true}]}),true);
 assert.equal(canPrepareCoachTeamDelivery({...base(),lastDeliveredAt:999_999}),false);
});
