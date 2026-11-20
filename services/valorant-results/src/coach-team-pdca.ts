import {resolveCoachIdentity,type CoachIdentity} from './coach-identity.ts';
import type {KpMapping} from './kp.ts';
import {COACH_TEAM_ID,CoachTeamError} from './coach-team-consent.ts';
type Linked=Extract<CoachIdentity,{status:'linked'}>;
type Consent={subject_id:string;owner_user:string;joined:number;share_status:number;version:number};
type Challenge={guild:string;team_id:string;version:number;author_subject:string;author_user:string;category:string;title:string;action:string;measure:string;period_end:string;active:number;change_reason:string;updated_at:number};
type SelfStatus={subject_id:string;owner_user:string;challenge_version:number;version:number;self_status:string;self_action:string;updated_at:number};
const denied=()=>new CoachTeamError('この表示は利用できません。',404);
const stale=()=>new CoachTeamError('別の画面で更新されています。最新の内容を確認してください。',409);
const categories=new Set(['連携','序盤','トレード','守り','リテイク','攻め','その他']);
const states=new Set(['未着手','実施予定','本人が試した','振り返り待ち','本人が確認','不参加']);
const clean=(s:unknown,max:number)=>typeof s==='string'&&s.trim()===s&&
 [...s].length<=max&&!/[\u0000-\u001f\u007f]/u.test(s)&&!/<[a-z!]/i.test(s);
const required=(s:unknown,max:number)=>clean(s,max)&&typeof s==='string'&&s.length>0;
async function body(request:Request){
 const reader=request.body?.getReader();if(!reader)throw new CoachTeamError('入力内容を確認してください。',400);
 let size=0;const chunks:Uint8Array[]=[];
 try{for(;;){const result=await reader.read();if(result.done)break;size+=result.value.byteLength;
  if(size>2048){await reader.cancel();throw new CoachTeamError('入力は2 KiB以内にしてください。',413);}
  chunks.push(result.value);
 }}finally{reader.releaseLock();}
 const all=new Uint8Array(size);let i=0;for(const c of chunks){all.set(c,i);i+=c.length;}
 let value:any;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(all));}
 catch{throw new CoachTeamError('入力形式を確認してください。',400);}
 if(!value||Array.isArray(value)||typeof value!=='object')throw new CoachTeamError('入力形式を確認してください。',400);
 return value;
}
function exact(b:any,names:string[]){
 if(Object.keys(b).length!==names.length||Object.keys(b).some(k=>!names.includes(k)))
  throw new CoachTeamError('入力内容を確認してください。',400);
}
const version=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=2147483647;
async function consent(db:D1Database,guild:string,id:Linked,user:string){
 const r=await db.prepare(`SELECT subject_id,owner_user,joined,share_status,version
 FROM coach_team_consents WHERE guild=? AND team_id=? AND subject_id=? AND owner_user=?`)
 .bind(guild,COACH_TEAM_ID,id.subjectId,user).first<Consent>();
 if(!r||r.joined!==1||r.owner_user!==user||r.subject_id!==id.subjectId)throw denied();
 return r;
}
async function verified(db:D1Database,mapping:KpMapping,user:string,id:Linked){
 const current=await resolveCoachIdentity(db,mapping,user);
 if(current.status!=='linked'||current.subjectId!==id.subjectId)throw denied();
 return {identity:current,consent:await consent(db,mapping.guildId,current,user)};
}
const challenge=async(db:D1Database,guild:string)=>db.prepare(`SELECT guild,team_id,version,author_subject,author_user,category,title,action,measure,period_end,active,change_reason,updated_at
 FROM coach_team_challenges WHERE guild=? AND team_id=?`).bind(guild,COACH_TEAM_ID).first<Challenge>();
const ownStatus=async(db:D1Database,guild:string,id:Linked,user:string)=>db.prepare(`SELECT subject_id,owner_user,challenge_version,version,self_status,self_action,updated_at
 FROM coach_team_member_status WHERE guild=? AND team_id=? AND subject_id=? AND owner_user=?`)
 .bind(guild,COACH_TEAM_ID,id.subjectId,user).first<SelfStatus>();
function publicChallenge(r:Challenge|null){
 return r?{version:r.version,category:r.category,title:r.title,action:r.action,measure:r.measure,
  periodEnd:r.period_end,active:r.active===1,updatedAt:r.updated_at}:null;
}
function publicStatus(r:SelfStatus|null,ch:Challenge|null){
 return r&&ch&&r.challenge_version===ch.version?{
  version:r.version,state:r.self_status,action:r.self_action,updatedAt:r.updated_at,
  challengeVersion:r.challenge_version}:{
  version:r?.version??0,state:'未着手',action:'',challengeVersion:ch?.version??0};
}
export async function readTeamPdca(db:D1Database,mapping:KpMapping,viewer:Linked,user:string){
 const guild=mapping.guildId;
 const initial=await verified(db,mapping,user,viewer);
 const ch=await challenge(db,guild);
 const self=await ownStatus(db,guild,viewer,user);
 const history=ch?(await db.prepare(`SELECT version,category,title,action,measure,period_end,active,change_reason
  FROM coach_team_challenge_history WHERE guild=? AND team_id=?
  ORDER BY version DESC LIMIT 5`).bind(guild,COACH_TEAM_ID).all<{
   version:number;category:string;title:string;action:string;measure:string;period_end:string;active:number;change_reason:string;
  }>()).results:[];
 const candidates=ch?(await db.prepare(`SELECT s.subject_id,s.owner_user,s.challenge_version,s.version,s.self_status,s.self_action,s.updated_at,
 c.version AS consent_version,p.display_name
 FROM coach_team_member_status s
 JOIN coach_team_consents c ON c.guild=s.guild AND c.team_id=s.team_id AND c.subject_id=s.subject_id AND c.owner_user=s.owner_user
 JOIN coach_profiles p ON p.guild=s.guild AND p.subject_id=s.subject_id AND p.owner_user=s.owner_user
 WHERE s.guild=? AND s.team_id=? AND s.challenge_version=? AND c.joined=1 AND c.share_status=1
 ORDER BY s.updated_at DESC LIMIT 6`).bind(guild,COACH_TEAM_ID,ch.version).all<
  SelfStatus&{consent_version:number;display_name:string}>()).results:[];
 const shared:{displayName:string;state:string;action:string}[]=[];
 if(candidates.length<=5)for(const c of candidates){
  if(!states.has(c.self_status)||!clean(c.self_action,100))continue;
  const verifiedMember=await resolveCoachIdentity(db,mapping,c.owner_user);
  if(verifiedMember.status!=='linked'||verifiedMember.subjectId!==c.subject_id)continue;
  const latest=await consent(db,guild,verifiedMember,c.owner_user).catch(()=>null);
  if(!latest||latest.version!==c.consent_version||latest.share_status!==1)continue;
  const fresh=await ownStatus(db,guild,verifiedMember,c.owner_user);
  if(!fresh||fresh.version!==c.version||fresh.challenge_version!==c.challenge_version)continue;
  shared.push({displayName:c.display_name.slice(0,40),state:c.self_status,action:c.self_action});
 }
 const current=await verified(db,mapping,user,viewer);
 const latestCh=await challenge(db,guild);
 if(initial.consent.version!==current.consent.version||ch?.version!==latestCh?.version)throw stale();
 return {team:'確認済みコーチロスター',challenge:publicChallenge(ch),
  canEdit:ch===null||ch.author_user===user&&ch.author_subject===viewer.subjectId,
  history:history.map(h=>({version:h.version,category:h.category,title:h.title,action:h.action,measure:h.measure,
   periodEnd:h.period_end,active:h.active===1,reason:h.change_reason})),
  self:publicStatus(self,ch),shared,
  note:'本人の実施申告です。練習効果や勝敗の改善を証明するものではありません。'};
}
export async function writeTeamChallenge(db:D1Database,mapping:KpMapping,id:Linked,user:string,request:Request,now=Date.now()){
 await verified(db,mapping,user,id);
 const b=await body(request);
 exact(b,['expectedVersion','category','title','action','measure','periodEnd','active','reason']);
 if(!version(b.expectedVersion)||!categories.has(b.category)||
 !required(b.title,50)||!required(b.action,120)||!required(b.measure,120)||
 !required(b.periodEnd,10)||!/^\d{4}-\d{2}-\d{2}$/.test(b.periodEnd)||
 !Number.isFinite(Date.parse(b.periodEnd+'T00:00:00Z'))||typeof b.active!=='boolean'||
 !clean(b.reason,120))throw new CoachTeamError('共有課題の入力と期間を確認してください。',400);
 const previous=await challenge(db,mapping.guildId);
 if((previous?.version??0)!==b.expectedVersion)throw stale();
 if(previous&&(previous.author_subject!==id.subjectId||previous.author_user!==user))throw denied();
 const guild=mapping.guildId,team=COACH_TEAM_ID;
 if(!previous){
  if(!b.active)throw new CoachTeamError('最初の課題は実施予定として登録してください。',400);
  const inserted=await db.prepare(`INSERT OR IGNORE INTO coach_team_challenges
 (guild,team_id,version,author_subject,author_user,category,title,action,measure,period_end,active,change_reason,updated_at)
 SELECT ?,?,1,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (
 SELECT 1 FROM coach_team_consents WHERE guild=? AND team_id=? AND subject_id=? AND owner_user=? AND joined=1)
 RETURNING version`).bind(guild,team,id.subjectId,user,b.category,b.title,b.action,b.measure,b.periodEnd,1,b.reason,now,guild,team,id.subjectId,user).first<{version:number}>();
  if(inserted?.version!==1)throw stale();
 }else{
  const updated=await db.prepare(`UPDATE coach_team_challenges SET version=version+1,category=?,title=?,action=?,measure=?,period_end=?,active=?,change_reason=?,updated_at=?
  WHERE guild=? AND team_id=? AND version=? AND author_subject=? AND author_user=?
   AND EXISTS(SELECT 1 FROM coach_team_consents WHERE guild=? AND team_id=? AND subject_id=? AND owner_user=? AND joined=1)
  RETURNING version`).bind(b.category,b.title,b.action,b.measure,b.periodEnd,b.active?1:0,b.reason,now,guild,team,b.expectedVersion,id.subjectId,user,guild,team,id.subjectId,user).first<{version:number}>();
  if(updated?.version!==previous.version+1)throw stale();
 }
 return {saved:true,version:b.expectedVersion+1};
}
export async function writeTeamSelfStatus(db:D1Database,mapping:KpMapping,id:Linked,user:string,request:Request,now=Date.now()){
 const membership=await verified(db,mapping,user,id);
 if(membership.consent.share_status!==1)throw denied();
 const b=await body(request);
 exact(b,['challengeVersion','expectedVersion','state','action']);
 if(!version(b.expectedVersion)||!version(b.challengeVersion)||!states.has(b.state)||!clean(b.action,100))
  throw new CoachTeamError('本人申告の内容を確認してください。',400);
 const ch=await challenge(db,mapping.guildId);
 if(!ch||ch.active!==1||ch.version!==b.challengeVersion)throw stale();
 const old=await ownStatus(db,mapping.guildId,id,user);
 if((old?.version??0)!==b.expectedVersion)throw stale();
 const guard=`EXISTS(SELECT 1 FROM coach_team_consents c WHERE c.guild=? AND c.team_id=? AND c.subject_id=? AND c.owner_user=? AND c.joined=1 AND c.share_status=1 AND c.version=?)
 AND EXISTS(SELECT 1 FROM coach_team_challenges t WHERE t.guild=? AND t.team_id=? AND t.version=? AND t.active=1)`;
 const args=[mapping.guildId,COACH_TEAM_ID,id.subjectId,user,membership.consent.version,
  mapping.guildId,COACH_TEAM_ID,ch.version];
 let result:{version:number}|null;
 if(!old)result=await db.prepare(`INSERT OR IGNORE INTO coach_team_member_status
 (guild,team_id,subject_id,owner_user,challenge_version,version,self_status,self_action,updated_at)
 SELECT ?,?,?,?,?,1,?,?,? WHERE ${guard} RETURNING version`)
  .bind(mapping.guildId,COACH_TEAM_ID,id.subjectId,user,ch.version,b.state,b.action,now,...args).first<{version:number}>();
 else result=await db.prepare(`UPDATE coach_team_member_status SET challenge_version=?,version=version+1,self_status=?,self_action=?,updated_at=?
 WHERE guild=? AND team_id=? AND subject_id=? AND owner_user=? AND version=? AND ${guard} RETURNING version`)
  .bind(ch.version,b.state,b.action,now,mapping.guildId,COACH_TEAM_ID,id.subjectId,user,b.expectedVersion,...args).first<{version:number}>();
 if(!result||result.version!==b.expectedVersion+1)throw stale();
 return {saved:true,version:result.version,challengeVersion:ch.version};
}
