// Phase 3-E2: read-only consent snapshot; NOT connected to delivery/HTTP routes.
// The expected subject IDs MUST originate from a server-trusted roster, never the client.
import type {CoachPreflightMember} from './coach-team-delivery-preflight.ts';
type ConsentRow={
 subject_id:string;owner_user:string;joined:number;share_status:number;
 version:number;pref_subject:string|null;pref_owner:string|null;
 pref_enabled:number|null;pref_consent_version:number|null
};
const id=(x:string)=>/^[a-zA-Z0-9_-]{1,128}$/.test(x);
export async function readCompleteCoachConsentSnapshot(
 db:D1Database,guild:string,expectedSubjects:readonly string[]
):Promise<CoachPreflightMember[]|null>{
 if(!/^\d{15,22}$/.test(guild)||!Array.isArray(expectedSubjects)||
  expectedSubjects.length<1||expectedSubjects.length>5||
  expectedSubjects.some(x=>typeof x!=='string'||!id(x))||
  new Set(expectedSubjects).size!==expectedSubjects.length)return null;
 // No LIMIT before the completeness check: unexpected rows must fail closed.
 const rows=(await db.prepare(`SELECT c.subject_id,c.owner_user,c.joined,c.share_status,c.version,
  p.subject_id AS pref_subject,p.owner_user AS pref_owner,
  p.enabled AS pref_enabled,p.consent_version AS pref_consent_version
  FROM coach_team_consents c
  LEFT JOIN coach_team_notice_preferences p ON p.guild=c.guild AND p.team_id=c.team_id
   AND p.subject_id=c.subject_id AND p.owner_user=c.owner_user
  WHERE c.guild=? AND c.team_id='coach-roster-v1'`)
  .bind(guild).all<ConsentRow>()).results;
 if(!Array.isArray(rows)||rows.length!==expectedSubjects.length)return null;
 const expected=new Set(expectedSubjects),seen=new Set<string>();
 const result:CoachPreflightMember[]=[];
 for(const r of rows){
  if(!r||typeof r.subject_id!=='string'||!expected.has(r.subject_id)||
   seen.has(r.subject_id)||typeof r.owner_user!=='string'||
   !/^\d{15,22}$/.test(r.owner_user)||r.joined!==1||
   ![0,1].includes(r.share_status)||!Number.isSafeInteger(r.version)||
   r.version<1||r.pref_subject!==r.subject_id||r.pref_owner!==r.owner_user||
   r.pref_enabled!==1||r.pref_consent_version!==r.version)return null;
  seen.add(r.subject_id);
  result.push({subjectId:r.subject_id,joined:true,enabled:true,
   shareStatus:r.share_status===1,consentVersion:r.version,
   preferenceConsentVersion:r.version});
 }
 return result;
}
