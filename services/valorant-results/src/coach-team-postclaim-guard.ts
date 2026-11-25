// Phase 3-E2: dormant post-claim consent and lease revalidation.
// Read-only second gate. This does NOT authorize Discord delivery by itself.
import {coachNoticeDedupKey,type CoachNoticeKind} from './coach-team-notice-policy.ts';
export async function verifyCoachClaimStillConsented(db:D1Database,input:{
 guild:string;event:CoachNoticeKind;revision:number;eventKey:string;
 expectedSubjects:readonly string[];attempts:number;claimedUntil:number;
 now:number;adminProofVerified:boolean;
}):Promise<boolean>{
 if(!/^\d{15,22}$/.test(input.guild)||input.adminProofVerified!==true||
  !Number.isSafeInteger(input.now)||input.now<0||
  !Number.isSafeInteger(input.claimedUntil)||input.claimedUntil<=input.now||
  !Number.isSafeInteger(input.attempts)||input.attempts<1||input.attempts>5||
  !Array.isArray(input.expectedSubjects)||input.expectedSubjects.length<1||
  input.expectedSubjects.length>5||
  input.expectedSubjects.some(x=>typeof x!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(x))||
  new Set(input.expectedSubjects).size!==input.expectedSubjects.length||
  coachNoticeDedupKey('coach-roster-v1',input.event,input.revision)!==input.eventKey)return false;
 const names=input.expectedSubjects.map(()=>'?').join(',');
 // One SQLite SELECT views a consistent snapshot: every member must still consent.
 const sql=[
  "SELECT 1 AS eligible FROM coach_team_notice_outbox o",
  "WHERE o.guild=? AND o.team_id='coach-roster-v1'",
  "AND o.event_key=? AND o.event_type=? AND o.revision=?",
  "AND o.state='claimed' AND o.attempts=? AND o.claimed_until=?",
  "AND o.claimed_until>?",
  "AND EXISTS (SELECT 1 FROM coach_team_notice_channels ch",
  " WHERE ch.guild=o.guild AND ch.team_id=o.team_id AND ch.enabled=1",
  " AND ch.version>=1 AND length(ch.channel_id) BETWEEN 15 AND 22",
  " AND ch.channel_id NOT GLOB '*[^0-9]*'",
  " AND length(ch.configured_by) BETWEEN 15 AND 22",
  " AND ch.configured_by NOT GLOB '*[^0-9]*')",
  "AND (SELECT COUNT(*) FROM coach_team_consents c",
  " WHERE c.guild=o.guild AND c.team_id=o.team_id)=?",
  "AND NOT EXISTS (SELECT 1 FROM coach_team_consents c",
  " LEFT JOIN coach_team_notice_preferences p",
  " ON p.guild=c.guild AND p.team_id=c.team_id",
  " AND p.subject_id=c.subject_id AND p.owner_user=c.owner_user",
  " WHERE c.guild=o.guild AND c.team_id=o.team_id",
  " AND (c.subject_id NOT IN ("+names+") OR c.joined IS NOT 1",
  " OR c.version<1 OR p.subject_id IS NULL OR p.enabled IS NOT 1",
  " OR p.consent_version IS NOT c.version",
  " OR (?='status' AND c.share_status IS NOT 1)))",
  "LIMIT 1"
 ].join('\n');
 const row=await db.prepare(sql).bind(
  input.guild,input.eventKey,input.event,input.revision,input.attempts,
  input.claimedUntil,input.now,input.expectedSubjects.length,
  ...input.expectedSubjects,input.event
 ).first<{eligible:number}>();
 return row?.eligible===1;
}
