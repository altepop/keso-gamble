// Phase 3-E2: pure delivery preflight. No HTTP route, D1 writes or Discord send.
import {canQueueCoachNotice,type CoachNoticeKind} from './coach-team-notice-policy.ts';
import {canClaimCoachOutbox,type CoachOutboxLease} from './coach-team-outbox-retry.ts';
const SNAPSHOT_MAX_AGE_MS=5000;
// The caller MUST load these values afresh from server-controlled, authenticated D1 reads.
// Never accept member state, administrator validation or time from browser request JSON.
export type CoachPreflightMember={
 subjectId:string;joined:boolean;enabled:boolean;shareStatus:boolean;
 consentVersion:number;preferenceConsentVersion:number;
};
export type CoachDeliveryPreflight={
 now:number;checkedAt:number;event:CoachNoticeKind;
 channelEnabled:boolean;channelId:string;adminSignatureVerified:boolean;
 lastDeliveredAt:number|null;outbox:CoachOutboxLease;
 members:CoachPreflightMember[];
};
export function canPrepareCoachTeamDelivery(input:CoachDeliveryPreflight):boolean{
 if(!Number.isSafeInteger(input.now)||input.now<0||
  !Number.isSafeInteger(input.checkedAt)||input.checkedAt<0||
  input.now<input.checkedAt||input.now-input.checkedAt>SNAPSHOT_MAX_AGE_MS)return false;
 // Team-wide messages are only eligible when *every* team member currently opts in.
 if(!Array.isArray(input.members)||input.members.length<1||input.members.length>5)return false;
 const subjects=new Set<string>();
 for(const m of input.members){
  if(!m||typeof m.subjectId!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(m.subjectId)||
    subjects.has(m.subjectId))return false;
  subjects.add(m.subjectId);
  if(!canQueueCoachNotice({
   enabled:m.enabled,joined:m.joined,shareStatus:m.shareStatus,
   consentVersion:m.consentVersion,preferenceConsentVersion:m.preferenceConsentVersion,
   channelEnabled:input.channelEnabled,adminSignatureVerified:input.adminSignatureVerified,
   channelId:input.channelId,event:input.event,now:input.now,
   lastDeliveredAt:input.lastDeliveredAt
  }))return false;
 }
 return canClaimCoachOutbox(input.outbox,input.now);
}
