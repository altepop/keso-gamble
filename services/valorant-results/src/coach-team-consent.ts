import {resolveCoachIdentity,type CoachIdentity} from './coach-identity.ts';
import type {KpMapping} from './kp.ts';
// The Phase 3 pilot is limited to the existing, server-verified five-person coach roster.
// No team ID, guild ID, owner ID, or subject ID comes from the browser.
export const COACH_TEAM_ID='coach-roster-v1';
export class CoachTeamError extends Error {status:number;constructor(message='この表示は利用できません。',status=404){super(message);this.status=status;}}
type Linked=Extract<CoachIdentity,{status:'linked'}>;
type Row={subject_id:string;owner_user:string;joined:number;share_status:number;share_metrics:number;version:number;updated_at:number};
export type CoachTeamSettings={joined:boolean;shareStatus:boolean;shareMetrics:boolean;version:number};
const hidden=():never=>{throw new CoachTeamError();};
const validRow=(r:Row|undefined|null,subject:string,user:string)=>
 r&&r.subject_id===subject&&r.owner_user===user&&
 Number.isSafeInteger(r.version)&&r.version>=1&&
 [r.joined,r.share_status,r.share_metrics].every(v=>v===0||v===1)&&
 (r.joined===1||(r.share_status===0&&r.share_metrics===0));
const show=(r:Row|null):CoachTeamSettings=>r?
 {joined:r.joined===1,shareStatus:r.share_status===1,shareMetrics:r.share_metrics===1,version:r.version}:
 {joined:false,shareStatus:false,shareMetrics:false,version:0};
async function row(db:D1Database,guild:string,identity:Linked,user:string){
 const r=await db.prepare('SELECT subject_id,owner_user,joined,share_status,share_metrics,version,updated_at FROM coach_team_consents WHERE guild=? AND team_id=? AND subject_id=? AND owner_user=?')
  .bind(guild,COACH_TEAM_ID,identity.subjectId,user).first<Row>();
 if(r&&!validRow(r,identity.subjectId,user))hidden();
 return r;
}
export async function readCoachTeamConsent(db:D1Database,guild:string,identity:Linked,user:string){
 return {team:'確認済みコーチロスター',settings:show(await row(db,guild,identity,user))};
}
async function parse(request:Request){
 const reader=request.body?.getReader();if(!reader)throw new CoachTeamError('入力内容を確認してください。',400);
 let length=0;const blocks:Uint8Array[]=[];
 try{for(;;){const r=await reader.read();if(r.done)break;length+=r.value.length;if(length>1024){await reader.cancel();throw new CoachTeamError('入力は1 KiB以内にしてください。',413);}blocks.push(r.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let at=0;for(const part of blocks){bytes.set(part,at);at+=part.length;}
 let b:any;try{b=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(bytes));}catch{throw new CoachTeamError('入力形式を確認してください。',400);}
 if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).length!==4||
  Object.keys(b).some(k=>!['joined','shareStatus','shareMetrics','expectedVersion'].includes(k))||
  typeof b.joined!=='boolean'||typeof b.shareStatus!=='boolean'||typeof b.shareMetrics!=='boolean'||
  !Number.isSafeInteger(b.expectedVersion)||b.expectedVersion<0||b.expectedVersion>2147483647||
  (!b.joined&&(b.shareStatus||b.shareMetrics)))throw new CoachTeamError('同意内容と更新番号を確認してください。',400);
 return b as {joined:boolean;shareStatus:boolean;shareMetrics:boolean;expectedVersion:number};
}
export async function saveCoachTeamConsent(db:D1Database,guild:string,identity:Linked,user:string,request:Request,now=Date.now()){
 const b=await parse(request),current=await row(db,guild,identity,user);
 const conflict=()=>new CoachTeamError('別の画面で同意内容が更新されています。最新の設定を確認してください。',409);
 if((current?.version??0)!==b.expectedVersion)throw conflict();
 const flags=[b.joined?1:0,b.shareStatus?1:0,b.shareMetrics?1:0];
 const ownerGuard='EXISTS(SELECT 1 FROM coach_profiles p JOIN kp_accounts k ON k.guild=p.guild AND k.user=p.owner_user JOIN coach_profile_accounts a ON a.guild=p.guild AND a.subject_id=p.subject_id AND a.puuid=k.puuid WHERE p.guild=? AND p.subject_id=? AND p.owner_user=?)';
 // Bind primary PUUID from a freshly server-verified identity; client cannot select it.
 if(!current){
  const inserted=await db.prepare(`INSERT OR IGNORE INTO coach_team_consents
   (guild,team_id,subject_id,owner_user,joined,share_status,share_metrics,version,updated_at)
   SELECT ?,?,?,?,?,?,?,1,? WHERE ${ownerGuard} RETURNING subject_id,owner_user,joined,share_status,share_metrics,version,updated_at`)
   .bind(guild,COACH_TEAM_ID,identity.subjectId,user,...flags,now,guild,identity.subjectId,user).first<Row>();
  if(!validRow(inserted,identity.subjectId,user))throw conflict();
  return {team:'確認済みコーチロスター',settings:show(inserted)};
 }
 const updated=await db.prepare(`UPDATE coach_team_consents SET joined=?,share_status=?,share_metrics=?,version=version+1,updated_at=?
 WHERE guild=? AND team_id=? AND subject_id=? AND owner_user=? AND version=?
 AND ${ownerGuard} RETURNING subject_id,owner_user,joined,share_status,share_metrics,version,updated_at`)
  .bind(...flags,now,guild,COACH_TEAM_ID,identity.subjectId,user,b.expectedVersion,guild,identity.subjectId,user).first<Row>();
 if(!validRow(updated,identity.subjectId,user))throw conflict();
 return {team:'確認済みコーチロスター',settings:show(updated)};
}
export async function coachTeamRoster(db:D1Database,mapping:KpMapping,viewer:Linked,user:string){
 const guild=mapping.guildId,own=await row(db,guild,viewer,user);
 if(!own||own.joined!==1)throw new CoachTeamError();
 const rows=(await db.prepare(`SELECT c.subject_id,c.owner_user,c.joined,c.share_status,c.share_metrics,c.version,c.updated_at,
 p.display_name FROM coach_team_consents c JOIN coach_profiles p
 ON p.guild=c.guild AND p.subject_id=c.subject_id AND p.owner_user=c.owner_user
 WHERE c.guild=? AND c.team_id=? AND c.joined=1 AND c.share_status=1
 ORDER BY c.subject_id LIMIT 5`).bind(guild,COACH_TEAM_ID).all<Row&{display_name:string}>()).results;
 const members:{displayName:string;status:string}[]=[];
 for(const r of rows){
  if(!validRow(r,r.subject_id,r.owner_user))continue;
  const linked=await resolveCoachIdentity(db,mapping,r.owner_user);
  if(linked.status!=='linked'||linked.subjectId!==r.subject_id)continue;
  const fresh=await row(db,guild,linked,r.owner_user);
  if(!fresh||fresh.version!==r.version||fresh.joined!==1||fresh.share_status!==1)continue;
  // Status is not yet persisted in Phase 3-D; never invent an execution claim.
  members.push({displayName:r.display_name.slice(0,40),status:'まだ分かりません'});
 }
 // Revalidate viewer membership and ownership immediately before returning.
 const latest=await resolveCoachIdentity(db,mapping,user);
 if(latest.status!=='linked'||latest.subjectId!==viewer.subjectId)throw new CoachTeamError();
 const current=await row(db,guild,latest,user);
 if(!current||current.version!==own.version||current.joined!==1)hidden();
 return {team:'確認済みコーチロスター',members,participantCount:members.length,
  metricAccess:'評価範囲外',note:'他メンバーの試合指標は同意・認可済みAPIが接続されるまで表示しません。'};
}
