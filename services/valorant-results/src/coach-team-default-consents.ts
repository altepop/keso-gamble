// One-time server-verified roster consent bootstrap, not a delivery operation.
// Existing rows, including explicit OFF and withdrawals, are never overwritten.
import {resolveCoachIdentity} from './coach-identity.ts';
import {COACH_TEAM_ID} from './coach-team-consent.ts';
import type {KpMapping} from './kp.ts';

export async function provisionConfirmedCoachRosterConsents(
 db:D1Database,mapping:KpMapping,now=Date.now()
){
 let initialized=0,skipped=0;
 for(const account of mapping.accounts){
  const owner=account.discordUserId;
  const identity=await resolveCoachIdentity(db,mapping,owner);
  // A verified primary identity is sufficient; optional extra game accounts may still be pending.
  if(identity.status!=='linked'){skipped++;continue;}
  const inserted=await db.prepare(`INSERT OR IGNORE INTO coach_team_consents
   (guild,team_id,subject_id,owner_user,joined,share_status,share_metrics,version,updated_at)
   SELECT ?,?,?,?,1,1,1,1,? WHERE EXISTS(
    SELECT 1 FROM coach_profiles p
    JOIN coach_profile_accounts a ON a.guild=p.guild AND a.subject_id=p.subject_id
    JOIN kp_accounts k ON k.guild=p.guild AND k.user=p.owner_user AND k.puuid=a.puuid
    WHERE p.guild=? AND p.subject_id=? AND p.owner_user=? AND k.riot=?)
   RETURNING subject_id,owner_user,version`)
   .bind(mapping.guildId,COACH_TEAM_ID,identity.subjectId,owner,now,
    mapping.guildId,identity.subjectId,owner,account.riotId)
   .first<{subject_id:string;owner_user:string;version:number}>();
  if(!inserted||inserted.subject_id!==identity.subjectId||
   inserted.owner_user!==owner||inserted.version!==1){skipped++;continue;}
  // Only fresh team consents get initial notification consent.
  // Existing notification preferences (especially OFF) are never upgraded.
  await db.prepare(`INSERT OR IGNORE INTO coach_team_notice_preferences
    (guild,team_id,subject_id,owner_user,enabled,consent_version,version,updated_at)
    SELECT ?,?,?,?,1,1,1,? WHERE EXISTS(
      SELECT 1 FROM coach_team_consents c
      WHERE c.guild=? AND c.team_id=? AND c.subject_id=? AND c.owner_user=?
       AND c.version=1 AND c.joined=1 AND c.share_status=1 AND c.share_metrics=1)`)
   .bind(mapping.guildId,COACH_TEAM_ID,identity.subjectId,owner,now,
    mapping.guildId,COACH_TEAM_ID,identity.subjectId,owner).run();
  initialized++;
 }
 return {initialized,skipped};
}
