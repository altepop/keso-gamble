import test from 'node:test';
import assert from 'node:assert/strict';
import {canQueueCoachNotice,coachNoticeDedupKey,COACH_NOTICE_COOLDOWN_MS} from '../src/coach-team-notice-policy.ts';
const gate=()=>({enabled:true,joined:true,shareStatus:true,consentVersion:2,preferenceConsentVersion:2,
  channelEnabled:true,adminSignatureVerified:true,channelId:'123456789012345678',event:'task' as const,
  now:100000000,lastDeliveredAt:null});
test('E2 policy refuses absent admin signature, opt-in, channel and revoked consent',()=>{
 assert.equal(canQueueCoachNotice(gate()),true);
 for(const patch of [{enabled:false},{joined:false},{shareStatus:false,event:'status' as const},
  {consentVersion:3},{channelEnabled:false},{adminSignatureVerified:false},
  {channelId:'not-a-channel'},{lastDeliveredAt:99999999},{lastDeliveredAt:100000001}]){
  assert.equal(canQueueCoachNotice({...gate(),...patch}),false,JSON.stringify(patch));
 }
});
test('E2 policy enforces deterministic per-channel cooldown and invalid timestamps fail closed',()=>{
 const g={...gate(),lastDeliveredAt:gate().now-COACH_NOTICE_COOLDOWN_MS};
 assert.equal(canQueueCoachNotice(g),true);
 assert.equal(canQueueCoachNotice({...g,lastDeliveredAt:g.lastDeliveredAt+1}),false);
 assert.equal(canQueueCoachNotice({...g,now:Number.NaN}),false);
 assert.equal(canQueueCoachNotice({...g,lastDeliveredAt:-1}),false);
});
test('E2 dedup keys contain only fixed team, event and positive revision',()=>{
 assert.equal(coachNoticeDedupKey('coach-roster-v1','task',3),'coach-roster-v1:task:3');
 assert.equal(coachNoticeDedupKey('coach-roster-v1','status',3),'coach-roster-v1:status:3');
 assert.equal(coachNoticeDedupKey('evil','task',3),null);
 assert.equal(coachNoticeDedupKey('coach-roster-v1','task',0),null);
});
