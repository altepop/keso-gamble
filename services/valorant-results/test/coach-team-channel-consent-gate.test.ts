import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyFreshCoachChannelAndConsent} from '../src/coach-team-channel-consent-gate.ts';
const guild='123456789012345678',id='member-1';
const channel={channel_id:'234567890123456789',enabled:1,version:2,configured_by:'345678901234567890'};
const member={subject_id:id,owner_user:'456789012345678901',joined:1,
 share_status:1,version:2,pref_subject:id,pref_owner:'456789012345678901',
 pref_enabled:1,pref_consent_version:2};
const db=(c:unknown,m:unknown[])=>({
 prepare(sql:string){
  return {
   bind(g:string){
    assert.equal(g,guild);
    return {
     async first(){assert.match(sql,/coach_team_notice_channels/);return c;},
     async all(){assert.match(sql,/coach_team_consents/);return {results:m};}
    };
   }
  };
 }
} as unknown as D1Database);
const input=()=>({guild,expectedSubjects:[id],event:'status' as const,now:1_000_000,
 adminProofVerified:true,outbox:{state:'pending' as const,attempts:0,nextAttemptAt:999_000,claimedUntil:0},
 lastDeliveredAt:null});
test('fresh channel + every member consent requires independent admin verification',async()=>{
 assert.equal(await verifyFreshCoachChannelAndConsent(db(channel,[member]),input()),true);
 assert.equal(await verifyFreshCoachChannelAndConsent(db(channel,[member]),{...input(),adminProofVerified:false}),false);
 for(const bad of [{...channel,enabled:0},{...channel,configured_by:''},{...channel,channel_id:'bad'}])
  assert.equal(await verifyFreshCoachChannelAndConsent(db(bad,[member]),input()),false);
 for(const bad of [{...member,joined:0},{...member,pref_enabled:0},
  {...member,pref_consent_version:1},{...member,share_status:0}])
  assert.equal(await verifyFreshCoachChannelAndConsent(db(channel,[bad]),input()),false);
 assert.equal(await verifyFreshCoachChannelAndConsent(db(channel,[]),input()),false);
 assert.equal(await verifyFreshCoachChannelAndConsent(db(channel,[member]),{
  ...input(),outbox:{...input().outbox,attempts:5}}),false);
});
