import {resolveCoachIdentity,type CoachIdentity} from './coach-identity.ts';
import type {KpMapping} from './kp.ts';
import {COACH_TEAM_ID,CoachTeamError} from './coach-team-consent.ts';
// @ts-ignore: this existing, separately tested Phase 3-C pure function is JavaScript.
import {calculateVerifiedPartyMetrics} from '../../../coach/team-metrics.js';
type Linked=Extract<CoachIdentity,{status:'linked'}>;
type Consent={subject_id:string;owner_user:string;version:number;joined:number;share_metrics:number};
type MatchRow={match_id:string;ended_at:number;map:string|null;players_json:string;teams_json:string};
const denied=()=>new CoachTeamError('この表示は利用できません。',404);
const valid=(r:Consent)=>r&&typeof r.subject_id==='string'&&typeof r.owner_user==='string'&&
 Number.isSafeInteger(r.version)&&r.version>=1&&r.joined===1&&r.share_metrics===1;
const memberSignature=(rows:Consent[])=>rows.map(r=>r.subject_id+'|'+r.owner_user+'|'+r.version).sort().join(';');
const summary=(s:any)=>({
 matches:s.matches,wins:s.wins,losses:s.losses,draws:s.draws,unknownOutcomes:s.unknownOutcomes,
 winRate:{value:s.winRate.value,numerator:s.winRate.numerator,denominator:s.winRate.denominator},
 kd:{value:s.kd.value,numerator:s.kd.numerator,denominator:s.kd.denominator,
  validPlayerSamples:s.kd.validPlayerSamples,excludedPlayerSamples:s.kd.excludedPlayerSamples}
});
// Strict allowlist: no PUUID, match ID, Discord ID, personal execution, notes,
// agents, player names, per-person scores or round events escape this module.
function publicMetrics(result:any){
 return {scope:'consented-team-only',ruleVersion:'party-verified-v1',
  overall:summary(result.overall),
  maps:result.maps.map((m:any)=>({map:m.map,...summary(m)})),
  // Scanned/excluded counts include unrelated solo games: never reveal them to teammates.
  quality:{eligibleMatches:result.overall.matches},
  positionBasedTradeDistance:'評価範囲外',
  note:'直近90日・最大250件の候補から、確認済みの同一パーティ試合のみを表示します。候補や個人のソロ試合数は共有しません。'};
}
async function permitted(db:D1Database,mapping:KpMapping){
 return (await db.prepare(`SELECT c.subject_id,c.owner_user,c.version,c.joined,c.share_metrics
  FROM coach_team_consents c JOIN coach_profiles p
  ON p.guild=c.guild AND p.subject_id=c.subject_id AND p.owner_user=c.owner_user
  WHERE c.guild=? AND c.team_id=? AND c.joined=1 AND c.share_metrics=1
  ORDER BY c.subject_id LIMIT 6`).bind(mapping.guildId,COACH_TEAM_ID).all<Consent>()).results;
}
export async function coachAuthorizedPartyMetrics(db:D1Database,mapping:KpMapping,viewer:Linked,user:string){
 const checkViewer=async()=>{
  const identity=await resolveCoachIdentity(db,mapping,user);
  if(identity.status!=='linked'||identity.subjectId!==viewer.subjectId)throw denied();
  return identity;
 };
 await checkViewer();
 const consents=await permitted(db,mapping);
 if(consents.length<2||consents.length>5||consents.some(r=>!valid(r))||
  new Set(consents.map(r=>r.owner_user)).size!==consents.length||
  !consents.some(r=>r.subject_id===viewer.subjectId&&r.owner_user===user))throw denied();
 const members:{guildId:string;teamId:string;ownerId:string;shareTeamMetrics:true;puuids:string[]}[]=[];
 for(const consent of consents){
  const id=await resolveCoachIdentity(db,mapping,consent.owner_user);
  if(id.status!=='linked'||id.subjectId!==consent.subject_id||
   !id.accounts.length||id.pendingAccounts>0)throw denied();
  members.push({guildId:mapping.guildId,teamId:COACH_TEAM_ID,
   ownerId:consent.owner_user,shareTeamMetrics:true,puuids:id.accounts.map(a=>a.puuid)});
 }
 const puuids=members.flatMap(m=>m.puuids);
 if(puuids.length>12||new Set(puuids).size!==puuids.length)throw denied();
 // Only last 90 days and at most 250 saved rosters; indexed ended_at lookup.
 // Metadata and player rosters are needed transiently on the Worker ONLY.
 const since=Date.now()-90*86400000;
 const rows=(await db.prepare(`SELECT r.match_id,r.ended_at,r.map,r.players_json,r.teams_json
  FROM valorant_match_rosters r WHERE r.ended_at>=?
  AND EXISTS(SELECT 1 FROM json_each(r.players_json) p WHERE
  json_extract(p.value,'$.puuid') IN (${puuids.map(()=>'?').join(',')}))
  ORDER BY r.ended_at DESC LIMIT 250`).bind(since,...puuids).all<MatchRow>()).results;
 const result=calculateVerifiedPartyMetrics({rows,members,scope:{
  authorized:true,guildId:mapping.guildId,teamId:COACH_TEAM_ID}});
 if(!result)throw denied();
 // A revocation/ownership change while D1 was being read must invalidate
 // the entire response, not return partially stale aggregate results.
 const latest=await permitted(db,mapping);
 if(memberSignature(latest)!==memberSignature(consents)||latest.length!==consents.length||
  latest.some(r=>!valid(r)))throw denied();
 for(const consent of latest){
  const id=await resolveCoachIdentity(db,mapping,consent.owner_user);
  if(id.status!=='linked'||id.subjectId!==consent.subject_id||
   id.pendingAccounts>0||!id.accounts.length)throw denied();
  const before=members.find(m=>m.ownerId===consent.owner_user);
  if(!before||before.puuids.length!==id.accounts.length||
   before.puuids.some(p=>!id.accounts.some(a=>a.puuid===p)))throw denied();
 }
 await checkViewer();
 return publicMetrics(result);
}
