// Phase 3-E2: pure, fail-closed policy only. No Discord requests or database writes.
export type CoachNoticeKind='task'|'status';
export type CoachNoticeGate={
  enabled:boolean; joined:boolean; shareStatus:boolean;
  consentVersion:number; preferenceConsentVersion:number;
  channelEnabled:boolean; adminSignatureVerified:boolean; channelId:string;
  event:CoachNoticeKind; now:number; lastDeliveredAt:number|null;
};
export const COACH_NOTICE_COOLDOWN_MS=15*60*1000;
export function canQueueCoachNotice(g:CoachNoticeGate):boolean{
  if(!g.enabled||!g.joined||!g.channelEnabled||!g.adminSignatureVerified)return false;
  if(!/^\d{15,22}$/.test(g.channelId))return false;
  if(!Number.isSafeInteger(g.consentVersion)||g.consentVersion<1||
    g.preferenceConsentVersion!==g.consentVersion)return false;
  if(g.event==='status'&&!g.shareStatus)return false;
  if(g.event!=='task'&&g.event!=='status')return false;
  if(!Number.isSafeInteger(g.now)||g.now<0)return false;
  if(g.lastDeliveredAt!==null){
    if(!Number.isSafeInteger(g.lastDeliveredAt)||g.lastDeliveredAt<0)return false;
    const elapsed=g.now-g.lastDeliveredAt;
    if(elapsed<COACH_NOTICE_COOLDOWN_MS)return false;
  }
  return true;
}
// Never include identifiers from users or any content in a delivery key.
export function coachNoticeDedupKey(teamId:string,event:CoachNoticeKind,revision:number):string|null{
  if(teamId!=='coach-roster-v1'||(event!=='task'&&event!=='status')||
     !Number.isSafeInteger(revision)||revision<1||revision>2147483647)return null;
  return teamId+':'+event+':'+revision;
}
