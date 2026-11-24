/** Authenticated Worker-only P9.4b server-authoritative PvE sessions.
 * No client CPU, KP payout, relic, or browser practice can supply a result.
 * D1 isolates opponent secrets; only public snapshots cross the API boundary.
 */
import type {KpEnv,KpMapping} from './kp.ts';
import {startServerPve,advanceServerPve,pvePublicSnapshot,type TrustedPveState} from './duel-pve-engine.ts';
import {ensureVerifiedPveProgression} from './duel-pve-progression.ts';
import {duelDailyChallenge} from './duel-daily-challenge.ts';
import {ensureTrioGameConstraint} from './duel-trio-schema.ts';
import {ensureDuelDailyHistory} from './duel-history.ts';

export const DUEL_PVE_SESSION_DDL=[
 `CREATE TABLE IF NOT EXISTS kp_duel_pve_sessions(
  id TEXT PRIMARY KEY,
  guild TEXT NOT NULL,user TEXT NOT NULL,request_id TEXT NOT NULL,
  game TEXT NOT NULL CHECK(game IN ('othello','gomoku','connect4','hitblow','bluffdice','poker','trio')),
  difficulty TEXT NOT NULL CHECK(difficulty IN ('easy','normal','strong')),
  board TEXT NOT NULL,
  turn TEXT NOT NULL CHECK(turn IN ('human','finished')),
  winner TEXT CHECK(winner IN ('human','cpu','draw')),
  version INTEGER NOT NULL DEFAULT 0 CHECK(version>=0),
  human_moves INTEGER NOT NULL DEFAULT 0 CHECK(human_moves>=0),
  cpu_moves INTEGER NOT NULL DEFAULT 0 CHECK(cpu_moves>=0),
  created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
  UNIQUE(guild,user,request_id)
 )`,
 `CREATE TABLE IF NOT EXISTS kp_duel_pve_secrets(
   id TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,
   data TEXT
 )`,
 `CREATE TABLE IF NOT EXISTS kp_duel_pve_actions(
  id TEXT PRIMARY KEY,
  guild TEXT NOT NULL,user TEXT NOT NULL,session_id TEXT NOT NULL,
  expected_version INTEGER NOT NULL,at INTEGER NOT NULL,
  board TEXT NOT NULL,turn TEXT NOT NULL,
  winner TEXT, human_moves INTEGER NOT NULL,cpu_moves INTEGER NOT NULL,
  CHECK(turn IN ('human','finished') AND (winner IS NULL OR winner IN ('human','cpu','draw')))
 )`,
 `CREATE TRIGGER IF NOT EXISTS kp_duel_pve_action_apply
   AFTER INSERT ON kp_duel_pve_actions BEGIN
    UPDATE kp_duel_pve_sessions SET
     board=NEW.board,turn=NEW.turn,winner=NEW.winner,
     human_moves=NEW.human_moves,cpu_moves=NEW.cpu_moves,
     version=version+1,updated_at=NEW.at
    WHERE id=NEW.session_id AND guild=NEW.guild AND user=NEW.user
      AND version=NEW.expected_version AND turn='human'
      AND NEW.human_moves=human_moves+1 AND NEW.cpu_moves>=cpu_moves;
    SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'pve version conflict') END;
   END`,
 'CREATE INDEX IF NOT EXISTS kp_duel_pve_recent ON kp_duel_pve_sessions(guild,user,updated_at DESC)',
 'CREATE INDEX IF NOT EXISTS kp_duel_pve_actions_session ON kp_duel_pve_actions(guild,user,session_id,at DESC)'
] as const;

const ready=new WeakMap<object,Promise<void>>();
export async function ensureServerPveTables(env:Pick<KpEnv,'DB'>){
 const previous=ready.get(env.DB);if(previous)return previous;
 const promise=(async()=>{
  await ensureTrioGameConstraint(env,'kp_duel_pve_sessions');
  for(const sql of DUEL_PVE_SESSION_DDL)await env.DB.prepare(sql).run();
 })();
 ready.set(env.DB,promise);
 try{await promise;}catch(error){ready.delete(env.DB);throw error;}
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function randomInt(n:number){
 if(!Number.isSafeInteger(n)||n<1||n>4294967296)throw Error('乱数範囲が不正です。');
 const slot=new Uint32Array(1),limit=Math.floor(4294967296/n)*n;
 do{crypto.getRandomValues(slot);}while(slot[0]>=limit);
 return slot[0]%n;
}
const randomFraction=()=>randomInt(4294967296)/4294967296;
type SessionRow={id:string;game:TrustedPveState['game'];difficulty:TrustedPveState['level'];
 board:string;data:string|null;turn:TrustedPveState['turn'];winner:TrustedPveState['winner'];
 version:number;human_moves:number;cpu_moves:number;request_id:string};
async function find(env:KpEnv,guild:string,user:string,id:string):Promise<SessionRow|null>{
 if(!uuid.test(id))throw Error('CPU戦IDが不正です。');
 const row=await env.DB.prepare(`SELECT s.id,s.game,s.difficulty,s.board,s.turn,s.winner,
   s.version,s.human_moves,s.cpu_moves,s.request_id,x.data
   FROM kp_duel_pve_sessions s JOIN kp_duel_pve_secrets x
   ON x.id=s.id AND x.guild=s.guild AND x.user=s.user
   WHERE s.id=? AND s.guild=? AND s.user=?`).bind(id,guild,user).first<SessionRow>();
 return row??null;
}
function trusted(row:SessionRow):TrustedPveState{
 return {game:row.game,level:row.difficulty,board:row.board,secret:row.data,
  turn:row.turn,winner:row.winner,version:row.version,
  humanMoves:row.human_moves,cpuMoves:row.cpu_moves};
}
function publicMatch(row:SessionRow){return {id:row.id,...pvePublicSnapshot(trusted(row))};}
export async function serverPveOperation(env:KpEnv,guild:string,user:string,body:Record<string,unknown>){
 const action=String(body.action??'');
 await ensureServerPveTables(env);
 if(action==='get'){
  const row=await find(env,guild,user,String(body.session??''));
  if(!row)throw Error('CPU戦が見つかりません。');
  return publicMatch(row);
 }
 if(action==='abandon'){
  const id=String(body.session??'');
  const row=await find(env,guild,user,id);
  if(!row)throw Error('CPU戦が見つかりません。');
  if(row.turn==='finished')return publicMatch(row);
  // Abandoned games never insert a progress receipt or reward roll.
  // The version predicate prevents discarding a match after a concurrent move.
  const result=await env.DB.prepare(`UPDATE kp_duel_pve_sessions
    SET turn='finished',winner=NULL,version=version+1,updated_at=?
    WHERE id=? AND guild=? AND user=? AND turn='human' AND version=?`)
   .bind(Date.now(),id,guild,user,row.version).run();
  if(result.meta.changes!==1)throw Error('盤面が更新されました。再取得してください。');
  const updated=await find(env,guild,user,id);
  if(!updated)throw Error('CPU戦が見つかりません。');
  return publicMatch(updated);
 }
 if(action==='start'||action==='daily'){
  const requestId=String(body.requestId??'');
  if(!uuid.test(requestId))throw Error('操作IDが不正です。');
  const challenge=action==='daily'?duelDailyChallenge(Date.now()):null;
  const game=challenge?.game??String(body.game??''),level=challenge?.level??String(body.level??'normal');
  const existing=await env.DB.prepare('SELECT id,game,difficulty FROM kp_duel_pve_sessions WHERE guild=? AND user=? AND request_id=?')
   .bind(guild,user,requestId).first<{id:string;game:string;difficulty:string}>();
  if(existing){
   if(existing.game!==game||existing.difficulty!==level)throw Error('操作IDの再利用はできません。');
   const prior=await find(env,guild,user,existing.id);
   if(!prior)throw Error('CPU戦が見つかりません。');
   return publicMatch(prior);
  }
  if(challenge)await ensureDuelDailyHistory(env);
  const state=startServerPve(game,level,randomInt);
  const id=crypto.randomUUID(),now=Date.now();
  // P12: only the first three qualifying active sessions are needed to decide
  // the existing <3 safety gate. Preserve the predicate inside the atomic INSERT.
  await env.DB.batch([
   env.DB.prepare(`INSERT OR IGNORE INTO kp_duel_pve_sessions
    (id,guild,user,request_id,game,difficulty,board,turn,winner,version,human_moves,cpu_moves,created_at,updated_at)
    SELECT ?,?,?,?,?,?,?,?,NULL,0,0,0,?,?
    WHERE (SELECT COUNT(*) FROM (
      SELECT 1 FROM kp_duel_pve_sessions
      WHERE guild=? AND user=? AND turn='human' AND updated_at>?
      LIMIT 3
    ))<3`)
    .bind(id,guild,user,requestId,game,level,state.board,'human',now,now,guild,user,now-86400000),
   env.DB.prepare(`INSERT OR IGNORE INTO kp_duel_pve_secrets(id,guild,user,data)
    SELECT id,guild,user,? FROM kp_duel_pve_sessions WHERE id=? AND guild=? AND user=?`)
    .bind(state.secret,id,guild,user),
   ...(challenge?[env.DB.prepare(`INSERT OR IGNORE INTO kp_duel_pve_daily_entries
    (guild,user,session_id,jst_day,game,difficulty,created_at)
    SELECT guild,user,id,?,?,?,created_at FROM kp_duel_pve_sessions
    WHERE guild=? AND user=? AND request_id=? AND game=? AND difficulty=?`)
    .bind(challenge.day,game,level,guild,user,requestId,game,level)]:[])
  ]);
  // Retry-compatible even if two requests with the same id raced.
  const row=await env.DB.prepare(`SELECT s.id,s.game,s.difficulty,s.board,s.turn,s.winner,
   s.version,s.human_moves,s.cpu_moves,s.request_id,x.data,x.id AS secret_id
   FROM kp_duel_pve_sessions s LEFT JOIN kp_duel_pve_secrets x
   ON x.id=s.id AND x.guild=s.guild AND x.user=s.user
   WHERE s.guild=? AND s.user=? AND s.request_id=?`)
   .bind(guild,user,requestId).first<SessionRow & {secret_id:string|null}>();
  if(!row)throw Error('進行中のCPU戦が多すぎます。時間をおいてから再開してください。');
  if(!uuid.test(row.id)||row.secret_id!==row.id)throw Error('CPU戦の保存を確認できません。');
  return publicMatch(row);
 }
 if(action!=='move')throw Error('CPU戦の操作が不正です。');
 // Natural terminal progress remains in the SAME transaction as the board action.
 await ensureVerifiedPveProgression(env);
 const session=String(body.session??''),requestId=String(body.requestId??'');
 if(!uuid.test(requestId)||!uuid.test(session))throw Error('操作IDまたはCPU戦IDが不正です。');
 const earlier=await env.DB.prepare('SELECT guild,user,session_id FROM kp_duel_pve_actions WHERE id=?')
  .bind(requestId).first<{guild:string;user:string;session_id:string}>();
 if(earlier){
  if(earlier.guild!==guild||earlier.user!==user||earlier.session_id!==session)throw Error('操作IDの再利用はできません。');
  const prior=await find(env,guild,user,session);
  if(!prior)throw Error('CPU戦が見つかりません。');
  return publicMatch(prior);
 }
 const old=await find(env,guild,user,session);
 if(!old)throw Error('CPU戦が見つかりません。');
 if(!Number.isSafeInteger(body.version)||body.version!==old.version)throw Error('盤面が更新されました。再取得してください。');
 if(old.turn!=='human')throw Error('CPU戦は既に終了しています。');
 const after=advanceServerPve(trusted(old),body,randomInt,randomFraction);
 const now=Date.now();
 try{
  await env.DB.batch([
   env.DB.prepare(`INSERT INTO kp_duel_pve_actions
    (id,guild,user,session_id,expected_version,at,board,turn,winner,human_moves,cpu_moves)
    VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`)
    .bind(requestId,guild,user,session,old.version,now,after.board,after.turn,after.winner,after.humanMoves,after.cpuMoves),
   env.DB.prepare(`UPDATE kp_duel_pve_secrets SET data=?
    WHERE id=? AND guild=? AND user=?
      AND EXISTS(SELECT 1 FROM kp_duel_pve_sessions WHERE id=? AND guild=? AND user=?
       AND version=? AND updated_at=?)`)
    .bind(after.secret,session,guild,user,session,guild,user,old.version+1,now)
  ]);
 }catch(error){
  if(String(error).includes('pve version conflict')||String(error).includes('UNIQUE'))
   throw Error('盤面が更新されました。再取得してください。');
  throw error;
 }
 const result=await find(env,guild,user,session);
 if(!result||result.version!==old.version+1)throw Error('操作結果を確認できません。再取得してください。');
 return publicMatch(result);
}
export async function serverPveApi(request:Request,env:KpEnv,m:KpMapping,user:string,headers:Record<string,string>={}){
 const respond=(v:unknown,status=200)=>Response.json(v,{status,headers:{...headers,'Cache-Control':'no-store'}});
 try{
  if(request.method==='GET'){
   const id=new URL(request.url).searchParams.get('session')??'';
   return respond({match:await serverPveOperation(env,m.guildId,user,{action:'get',session:id})});
  }
  if(request.method!=='POST')return respond({error:'操作方法が不正です。'},405);
  const raw=await request.text();
  if(raw.length>1024)return respond({error:'操作内容が長すぎます。'},400);
  const body=JSON.parse(raw) as Record<string,unknown>;
  if(!body||typeof body!=='object'||Array.isArray(body))return respond({error:'操作内容が不正です。'},400);
  // Preview never creates a D1 table or changes the normal PvE return type.
  if(body.action==='daily-preview')return respond({challenge:duelDailyChallenge(Date.now())});
  return respond({match:await serverPveOperation(env,m.guildId,user,body)});
 }catch(error){
  const message=error instanceof Error?error.message:'';
  const safe=/[ぁ-んァ-ヶ一-龯]/.test(message)&&!message.includes('SQL');
  return respond({error:safe?message:'CPU戦の操作を確認できませんでした。再取得してください。'},400);
 }
}
