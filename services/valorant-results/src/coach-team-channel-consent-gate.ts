// Phase 3-E2: read-only server-side channel and team consent preflight.
// Deliberately NOT wired into HTTP routes, outbox claims, or Discord delivery.
import {readCompleteCoachConsentSnapshot} from './coach-team-consent-snapshot.ts';
import {canPrepareCoachTeamDelivery,type CoachDeliveryPreflight} from './coach-team-delivery-preflight.ts';
import type {CoachOutboxLease} from './coach-team-outbox-retry.ts';
import type {CoachNoticeKind} from './coach-team-notice-policy.ts';
type ChannelRow={channel_id:string;enabled:number;version:number;configured_by:string};
export async function verifyFreshCoachChannelAndConsent(db:D1Database,input:{
 guild:string;expectedSubjects:readonly string[];event:CoachNoticeKind;
 now:number;adminProofVerified:boolean;outbox:CoachOutboxLease;
 lastDeliveredAt:number|null;
}):Promise<boolean>{
 if(!/^\d{15,22}$/.test(input.guild)||!Number.isSafeInteger(input.now)||
  input.now<0||input.adminProofVerified!==true)return false;
 // No channel ID, consent flag, or snapshot timestamp is trusted from a request body.
 const channel=await db.prepare(`SELECT channel_id,enabled,version,configured_by
 FROM coach_team_notice_channels WHERE guild=? AND team_id='coach-roster-v1'`)
 .bind(input.guild).first<ChannelRow>();
 if(!channel||channel.enabled!==1||!/^\d{15,22}$/.test(channel.channel_id)||
  !Number.isSafeInteger(channel.version)||channel.version<1||
  !/^\d{15,22}$/.test(channel.configured_by))return false;
 const members=await readCompleteCoachConsentSnapshot(db,input.guild,input.expectedSubjects);
 if(!members)return false;
 // No await after the final check; this only yields a policy decision, NEVER permission to send.
 const preflight:CoachDeliveryPreflight={
  now:input.now,checkedAt:input.now,event:input.event,
  channelEnabled:true,channelId:channel.channel_id,
  adminSignatureVerified:true,lastDeliveredAt:input.lastDeliveredAt,
  outbox:input.outbox,members
 };
 return canPrepareCoachTeamDelivery(preflight);
}
