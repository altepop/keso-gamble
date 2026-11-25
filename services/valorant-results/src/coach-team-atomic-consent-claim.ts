// Phase 3-E2: dormant SQLite single-statement conditional claim.
// No HTTP, cron, production D1 writes or Discord sends are wired.
import {coachClaimLeaseUntil} from './coach-team-outbox-claim.ts';
import {coachNoticeDedupKey,type CoachNoticeKind} from './coach-team-notice-policy.ts';
export type CoachAtomicClaim={eventKey:string;attempts:number;claimedUntil:number};
export async function claimCoachOutboxWithFreshConsent(db:D1Database,input:{
 guild:string;eventKey:string;event:CoachNoticeKind;revision:number;
 expectedSubjects:readonly string[];now:number;adminProofVerified:boolean;
}):Promise<CoachAtomicClaim|null>{
 if(!/^\d{15,22}$/.test(input.guild)||input.adminProofVerified!==true||
  !Number.isSafeInteger(input.now)||input.now<0||
  !Array.isArray(input.expectedSubjects)||input.expectedSubjects.length<1||
  input.expectedSubjects.length>5||
  input.expectedSubjects.some(x=>typeof x!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(x))||
  new Set(input.expectedSubjects).size!==input.expectedSubjects.length||
  coachNoticeDedupKey('coach-roster-v1',input.event,input.revision)!==input.eventKey)return null;
 const leaseUntil=coachClaimLeaseUntil(input.now);
 if(leaseUntil===null)return null;
 const holders=input.expectedSubjects.map(()=>'?').join(',');
 const sql=[
 "UPDATE coach_team_notice_outbox AS o",
 "SET state='claimed',attempts=attempts+1,claimed_until=?,updated_at=?",
 "WHERE o.guild=? AND o.team_id='coach-roster-v1'",
 "AND o.event_key=? AND o.event_type=? AND o.revision=?",
 "AND o.attempts<5 AND o.next_attempt_at<=?",
 "AND (o.state='pending' OR (o.state='claimed' AND o.claimed_until>0 AND o.claimed_until<=?))",
 "AND EXISTS(SELECT 1 FROM coach_team_notice_channels ch",
 "WHERE ch.guild=o.guild AND ch.team_id=o.team_id AND ch.enabled=1 AND ch.version>=1",
 "AND length(ch.channel_id) BETWEEN 15 AND 22 AND ch.channel_id NOT GLOB '*[^0-9]*'",
 "AND length(ch.configured_by) BETWEEN 15 AND 22 AND ch.configured_by NOT GLOB '*[^0-9]*')",
 "AND (SELECT COUNT(*) FROM coach_team_consents c WHERE c.guild=o.guild AND c.team_id=o.team_id)=?",
 "AND NOT EXISTS(SELECT 1 FROM coach_team_consents c",
 "LEFT JOIN coach_team_notice_preferences p ON p.guild=c.guild AND p.team_id=c.team_id",
 "AND p.subject_id=c.subject_id AND p.owner_user=c.owner_user",
 "WHERE c.guild=o.guild AND c.team_id=o.team_id AND (",
 "c.subject_id NOT IN ("+holders+") OR c.joined<>1 OR c.version<1",
 "OR p.subject_id IS NULL OR p.enabled IS NOT 1 OR p.consent_version IS NOT c.version",
 "OR (?='status' AND c.share_status<>1)))",
 "RETURNING event_key,attempts,claimed_until"
 ].join('\n');
 // Consent, channel, lease and attempt predicates are all in one SQLite UPDATE.
 const result=await db.prepare(sql).bind(
  leaseUntil,input.now,input.guild,input.eventKey,input.event,input.revision,
  input.now,input.now,input.expectedSubjects.length,
  ...input.expectedSubjects,input.event
 ).first<{event_key:string;attempts:number;claimed_until:number}>();
 if(!result||result.event_key!==input.eventKey||
  !Number.isSafeInteger(result.attempts)||result.attempts<1||result.attempts>5||
  result.claimed_until!==leaseUntil)return null;
 return {eventKey:result.event_key,attempts:result.attempts,claimedUntil:result.claimed_until};
}
