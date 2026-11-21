import type {CoachIdentity} from './coach-identity.ts';
import {COACH_TEAM_ID,CoachTeamError} from './coach-team-consent.ts';
type Linked=Extract<CoachIdentity,{status:'linked'}>;
type Consent={subject_id:string;owner_user:string;joined:number;share_status:number;version:number};
type Pref={subject_id:string;owner_user:string;enabled:number;consent_version:number;version:number};
type Channel={enabled:number;channel_id:string};
const deny=()=>new CoachTeamError('この表示は利用できません。',404);
const stale=()=>new CoachTeamError('別の画面で通知設定が更新されています。最新の状態を確認してください。',409);
async function member(db:D1Database,guild:string,id:Linked,user:string){
 const r=await db.prepare(`SELECT subject_id,owner_user,joined,share_status,version
 FROM coach_team_consents WHERE guild=? AND team_id=? AND subject_id=? AND owner_user=?`)
  .bind(guild,COACH_TEAM_ID,id.subjectId,user).first<Consent>();
 if(!r||r.subject_id!==id.subjectId||r.owner_user!==user||r.joined!==1||r.version<1)throw deny();
 return r;
}
async function stored(db:D1Database,guild:string,id:Linked,user:string){
 return db.prepare(`SELECT subject_id,owner_user,enabled,consent_version,version
 FROM coach_team_notice_preferences WHERE guild=? AND team_id=? AND subject_id=? AND owner_user=?`)
 .bind(guild,COACH_TEAM_ID,id.subjectId,user).first<Pref>();
}
const preview=()=>({
 event:'共有課題が更新された場合',
 message:'KESO COACH：チームの共有課題が更新されました。内容は本人認証後のチーム画面で確認してください。',
 includesPersonalNotes:false,includesMatchIds:false,mentions:'なし',mode:'送信しないプレビュー'
});
export function coachNoticeAllowed(input:{
 enabled:boolean;consentVersion:number;currentConsentVersion:number;joined:boolean;shareStatus:boolean;
 channelEnabled:boolean;channelId:string;event:'task'|'status';adminConfigured:boolean;recentlyDelivered:boolean;
}):boolean{
 return input.enabled===true&&input.joined===true&&
 input.consentVersion===input.currentConsentVersion&&input.currentConsentVersion>0&&
 input.channelEnabled===true&&input.adminConfigured===true&&/^\d{15,22}$/.test(input.channelId)&&
 (input.event==='task'||input.event==='status'&&input.shareStatus===true)&&!input.recentlyDelivered;
}
export async function readCoachTeamNotice(db:D1Database,guild:string,id:Linked,user:string){
 const c=await member(db,guild,id,user),p=await stored(db,guild,id,user);
 const channel=await db.prepare('SELECT enabled,channel_id FROM coach_team_notice_channels WHERE guild=? AND team_id=?')
   .bind(guild,COACH_TEAM_ID).first<Channel>();
 const current=await member(db,guild,id,user);
 if(c.version!==current.version)throw stale();
 const effective=!!p&&p.enabled===1&&p.consent_version===current.version;
 return {settings:{enabled:effective,version:p?.version??0},
  deliveryReady:false,channelConfigured:channel?.enabled===1&&/^\d{15,22}$/.test(channel.channel_id) || false,
  preview:preview(),
  note:'登録済みロスターの通知同意は初期ONです。本人はいつでもOFFにできます。送信先・開始の管理者設定は無効のままであり、通知は送信されません。'};
}
export async function saveCoachTeamNotice(db:D1Database,guild:string,id:Linked,user:string,request:Request,now=Date.now()){
 const reader=request.body?.getReader();if(!reader)throw new CoachTeamError('通知設定を確認してください。',400);
 let size=0;const parts:Uint8Array[]=[];
 try{for(;;){const v=await reader.read();if(v.done)break;size+=v.value.byteLength;
  if(size>512){await reader.cancel();throw new CoachTeamError('通知設定は512バイト以内にしてください。',413);}
  parts.push(v.value);
 }}finally{reader.releaseLock();}
 let bytes=new Uint8Array(size),at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}
 let b:any;try{b=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(bytes));}catch{throw new CoachTeamError('通知設定を確認してください。',400);}
 if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).length!==2||
  !Object.keys(b).every(k=>['enabled','expectedVersion'].includes(k))||typeof b.enabled!=='boolean'||
  !Number.isSafeInteger(b.expectedVersion)||b.expectedVersion<0||b.expectedVersion>2147483647)
  throw new CoachTeamError('通知設定を確認してください。',400);
 const c=await member(db,guild,id,user),p=await stored(db,guild,id,user);
 if((p?.version??0)!==b.expectedVersion)throw stale();
 const guard=`EXISTS(SELECT 1 FROM coach_team_consents c WHERE c.guild=? AND c.team_id=? AND c.subject_id=?
 AND c.owner_user=? AND c.joined=1 AND c.version=?)`;
 let result:{version:number}|null;
 if(!p)result=await db.prepare(`INSERT OR IGNORE INTO coach_team_notice_preferences
 (guild,team_id,subject_id,owner_user,enabled,consent_version,version,updated_at)
 SELECT ?,?,?,?,?,?,1,? WHERE ${guard} RETURNING version`)
 .bind(guild,COACH_TEAM_ID,id.subjectId,user,b.enabled?1:0,c.version,now,guild,COACH_TEAM_ID,id.subjectId,user,c.version).first<{version:number}>();
 else result=await db.prepare(`UPDATE coach_team_notice_preferences SET enabled=?,consent_version=?,version=version+1,updated_at=?
 WHERE guild=? AND team_id=? AND subject_id=? AND owner_user=? AND version=? AND ${guard} RETURNING version`)
 .bind(b.enabled?1:0,c.version,now,guild,COACH_TEAM_ID,id.subjectId,user,b.expectedVersion,guild,COACH_TEAM_ID,id.subjectId,user,c.version).first<{version:number}>();
 if(!result||result.version!==b.expectedVersion+1)throw stale();
 return {settings:{enabled:b.enabled,version:result.version},deliveryReady:false,
  preview:preview(),note:'送信は停止中です。管理者側の配信設定が有効になった場合のみ、同意した範囲で通知できます。'};
}
