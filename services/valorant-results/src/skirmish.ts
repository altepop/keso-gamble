import type {KpEnv} from './kp.ts';
import {kpEventId} from './kp.ts';
import {enqueue,ensurePosts} from './racing-posts.ts';
export const SKIRMISH_POLICY='skirmish-risk-v1';
export const SKIRMISH_PRIZES=[0,100,250,600,1500] as const;
export interface SkirmishState {guild:string;puuid:string;user:string;wins:number;pot:number;phase:'ready'|'choice'|'armed';eligible_after:number;last_end:number;version:number}
const ready=new WeakMap<object,Promise<void>>();
export async function ensureSkirmish(env:KpEnv){
 if(ready.has(env.DB))return ready.get(env.DB)!;
 const p=(async()=>{await env.DB.batch([
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS skirmish_state(guild TEXT NOT NULL,puuid TEXT NOT NULL,user TEXT NOT NULL,wins INTEGER NOT NULL DEFAULT 0,pot INTEGER NOT NULL DEFAULT 0,phase TEXT NOT NULL DEFAULT 'ready',eligible_after INTEGER NOT NULL DEFAULT 0,last_end INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild,puuid))`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS skirmish_receipts(id TEXT PRIMARY KEY,kind TEXT NOT NULL,guild TEXT NOT NULL,puuid TEXT NOT NULL,user TEXT NOT NULL,match TEXT NOT NULL,outcome TEXT,wins INTEGER NOT NULL,pot INTEGER NOT NULL,phase TEXT NOT NULL,eligible_after INTEGER NOT NULL,last_end INTEGER NOT NULL,expected_version INTEGER NOT NULL,delta INTEGER NOT NULL,note TEXT NOT NULL,at INTEGER NOT NULL)`),
  env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS skirmish_apply AFTER INSERT ON skirmish_receipts BEGIN
   UPDATE skirmish_state SET wins=NEW.wins,pot=NEW.pot,phase=NEW.phase,eligible_after=NEW.eligible_after,last_end=NEW.last_end,version=version+1 WHERE guild=NEW.guild AND puuid=NEW.puuid AND user=NEW.user AND version=NEW.expected_version;
   SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'Skirmish state conflict') END;
   INSERT INTO kp_events(id,guild,user,puuid,match,mode,outcome,amount,policy,at) SELECT NEW.id,NEW.guild,NEW.user,NEW.puuid,NEW.match,'skirmish',NEW.outcome,NEW.delta,'skirmish-risk-v1',NEW.at WHERE NEW.kind='match';
   INSERT INTO kp_reward_notes(id,note) SELECT NEW.id,NEW.note WHERE NEW.kind='match';
   INSERT INTO kp_ledger(id,guild,user,delta,kind,at) SELECT NEW.id,NEW.guild,NEW.user,NEW.delta,'skirmish',NEW.at WHERE NEW.kind='cash' AND NEW.delta>0;
  END`),
 ]);})();ready.set(env.DB,p);try{await p;}catch(e){ready.delete(env.DB);throw e;}
}
export async function skirmishState(env:KpEnv,guild:string,user:string){await ensureSkirmish(env);return env.DB.prepare('SELECT * FROM skirmish_state WHERE guild=? AND user=?').bind(guild,user).first<SkirmishState>();}
async function insert(env:KpEnv,s:SkirmishState,next:Omit<SkirmishState,'version'>,r:{id:string;kind:string;match?:string;outcome?:string;delta:number;note:string;now:number}){
 return env.DB.prepare(`INSERT INTO skirmish_receipts(id,kind,guild,puuid,user,match,outcome,wins,pot,phase,eligible_after,last_end,expected_version,delta,note,at)
 SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM skirmish_state WHERE guild=? AND puuid=? AND user=? AND version=?) ON CONFLICT(id) DO NOTHING`)
 .bind(r.id,r.kind,s.guild,s.puuid,s.user,r.match??'',r.outcome??null,next.wins,next.pot,next.phase,next.eligible_after,next.last_end,s.version,r.delta,r.note,r.now,s.guild,s.puuid,s.user,s.version).run();
}
/** Called only for server-fetched, completed matches in a verified public queue, after account/cutoff checks. */
export async function settleSkirmishMatch(env:KpEnv,input:{guild:string;puuid:string;user:string;match:string;start:number;end:number;win:boolean;now:number}){
 if(!input.match||!input.puuid||![input.start,input.end,input.now].every(n=>Number.isSafeInteger(n)&&n>=0)||input.start>=input.end||input.end>input.now+60000)throw Error('Invalid Skirmish match');
 await ensureSkirmish(env);const id=kpEventId(input.guild,input.match,input.puuid);
 await env.DB.prepare('INSERT OR IGNORE INTO skirmish_state(guild,puuid,user) VALUES(?,?,?)').bind(input.guild,input.puuid,input.user).run();
 for(let attempt=0;attempt<5;attempt++){
  const old=await env.DB.prepare('SELECT delta,note FROM skirmish_receipts WHERE id=? AND user=?').bind(id,input.user).first<{delta:number;note:string}>();if(old)return old;
  const s=await skirmishState(env,input.guild,input.user);if(!s||s.puuid!==input.puuid)throw Error('Skirmish owner mismatch');
  const next={...s,last_end:Math.max(s.last_end,input.end)};let delta=0,note='';
  if(s.phase==='choice')note=`（保留 ${s.pot} KP。/kp balance で受取か続行を選択。未選択中の試合は対象外）`;
  else if(input.start<s.last_end||input.start<s.eligible_after)note='（続行の選択前に開始した試合・古い試合は対象外）';
  else if(!input.win){next.wins=0;next.pot=0;next.phase='ready';note=s.pot?`（保留 ${s.pot} KPを失いました。口座のKPは減りません）`:'（次の勝利から挑戦開始）';}
  else {
   const wins=s.wins+1;
   if(wins===4){delta=1500;next.wins=0;next.pot=0;next.phase='ready';next.eligible_after=input.end;note='（4連勝！1,500 KPを自動受取）';}
   else{next.wins=wins;next.pot=SKIRMISH_PRIZES[wins];next.phase='choice';note=`（${wins}勝・${next.pot} KP保留。次の試合を始める前に、速報のボタンか /kp balance で受取か続行を選択）`;}
  }
  const result=await insert(env,s,next,{id,kind:'match',match:input.match,outcome:input.win?'win':'loss',delta,note,now:input.now});
  if(result.meta.changes){
   // The challenge in 稼ぎch: a four-win run and a lost pot. Missing a post never undoes the settlement.
   const post=delta?`👑 <@${input.user}> スカーミッシュ4連勝！ **1,500 KP** 持っていきよった！`:s.phase==='armed'&&!input.win&&s.pot?`💥 <@${input.user}> スカーミッシュ${s.wins+1}勝目ならず…保留してた **${s.pot.toLocaleString('ja-JP')} KP** は全部パーや。`:'';
   if(post)try{await ensurePosts(env);await enqueue(env,'sk-post:'+id,post,input.now);}catch{console.warn('skirmish_post_pending');}
   return {delta,note};
  }
 }
 throw Error('Skirmish settlement pending');
}
export function skirmishPrompt(s:SkirmishState|null){
 if(!s)return {content:'スカーミッシュの最初の勝利から挑戦が始まります。',components:[]};
 const content=s.phase==='choice'?`🔥 スカーミッシュ ${s.wins}勝：**${s.pot} KP保留**\nここで受け取る？ 続行すると次の勝利で${SKIRMISH_PRIZES[s.wins+1]} KP。負けると保留分は0。\n続行は次の試合を始める前に選んでください。`:
 s.phase==='armed'?`🔥 次のスカーミッシュで勝てば${SKIRMISH_PRIZES[s.wins+1]} KP。${s.pot} KPを賭けて続行中。口座残高は賭けていません。`:'スカーミッシュの次の勝利から挑戦開始。';
 const components=s.phase==='choice'?[{type:1,components:[{type:2,style:3,label:`${s.pot} KPを受け取る`,custom_id:`sk:${s.user}:${s.version}:cash`},{type:2,style:4,label:'続行する',custom_id:`sk:${s.user}:${s.version}:continue`}]}]:[];
 return {content,components};
}
export const SKIRMISH_BUTTON=/^sk:(\d{15,22}):(\d{1,10}):(cash|continue)$/;
export async function decideSkirmish(env:KpEnv,guild:string,user:string,custom:string,now=Date.now()){
 const parsed=SKIRMISH_BUTTON.exec(custom);if(!parsed||parsed[1]!==user)return {content:'本人だけが選べます。',components:[]};
 const s=await skirmishState(env,guild,user);if(!s||s.phase!=='choice'||s.version!==Number(parsed[2]))return {content:'この選択は処理済みです。/kp balance で現在の状態を確認してください。',components:[]};
 const cash=parsed[3]==='cash',next={...s,wins:cash?0:s.wins,pot:cash?0:s.pot,phase:cash?'ready' as const:'armed' as const,eligible_after:now};
 const id=`sk-choice:${guild}:${s.puuid}:${s.version}`;
 const result=await insert(env,s,next,{id,kind:cash?'cash':'continue',delta:cash?s.pot:0,note:'',now});
 if(!result.meta.changes)return {content:'先に別の選択が確定しました。/kp balance で確認してください。',components:[]};
 const pot=s.pot.toLocaleString('ja-JP'),prize=SKIRMISH_PRIZES[s.wins+1].toLocaleString('ja-JP');
 try{await ensurePosts(env);await enqueue(env,'sk-post:'+id,cash?`💰 <@${user}> スカーミッシュ${s.wins}勝で降りた。**${pot} KP**、手堅く回収や。`:`🔥 <@${user}> スカーミッシュ${s.wins}勝、**${pot} KP** を蹴って続行や！ 次勝ったら ${prize} KP、負けたら全部パー。`,now);}catch{console.warn('skirmish_post_pending');}
 return {content:cash?`${s.pot} KPを受け取りました。次の試合から新しく挑戦できます。`:`続行しました。今から始まる次の試合が対象です。勝てば${SKIRMISH_PRIZES[s.wins+1]} KP、負けると保留分は0。`,components:[]};
}
const plain=(s:string)=>s.replace(/[\r\n`*_~|<>@]/g,'').slice(0,24);
/** The あかんbot result of the win that opened a choice carries that member's 受取／続行 buttons, while the choice is
 * still the one this match opened. Members who already chose (or played on) get none. */
export async function skirmishResultButtons(env:KpEnv,match:string,notices:{riot_id:string;mode:string|null}[],labels:ReadonlyMap<string,string>=new Map()){
 const rows:unknown[]=[];
 if(!notices.some(n=>n.mode?.startsWith('skirmish')))return rows;
 await ensureSkirmish(env);
 for(const n of notices){
  if(!n.mode?.startsWith('skirmish'))continue;
  const s=await env.DB.prepare(`SELECT s.user,s.wins,s.pot,s.version FROM kp_accounts a JOIN skirmish_state s ON s.guild=a.guild AND s.puuid=a.puuid
   JOIN skirmish_receipts r ON r.guild=a.guild AND r.puuid=a.puuid AND r.match=? AND r.kind='match' AND r.phase='choice'
   WHERE lower(a.riot)=lower(?) AND s.user=a.user AND s.phase='choice' AND s.version=r.expected_version+1`).bind(match,n.riot_id).first<{user:string;wins:number;pot:number;version:number}>();
  if(!s||rows.length>=5)continue;
  const who=plain(labels.get(n.riot_id)??n.riot_id.split('#')[0]);
  rows.push({type:1,components:[
   {type:2,style:3,label:`${who}：${s.pot.toLocaleString('ja-JP')} KPで降りる`,custom_id:`sk:${s.user}:${s.version}:cash`},
   {type:2,style:4,label:`${who}：続行（次勝てば${SKIRMISH_PRIZES[s.wins+1].toLocaleString('ja-JP')} KP）`,custom_id:`sk:${s.user}:${s.version}:continue`},
  ]});
 }
 return rows;
}
/** After a press on a public result: the presser's buttons go, everyone else's stay. */
export function withoutSkirmishButtons(rows:unknown,user:string){
 return (Array.isArray(rows)?rows:[]).map((row:{components?:{custom_id?:string}[]})=>({...row,components:(row.components??[]).filter(c=>!String(c.custom_id??'').startsWith(`sk:${user}:`))})).filter(row=>row.components.length);
}
