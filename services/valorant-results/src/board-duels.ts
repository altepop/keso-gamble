import type {KpEnv,KpMapping} from './kp.ts';
import {debtOf} from './kp-debt.ts';
// @ts-expect-error Pure shared ledger verifier, independently covered by node:test.
import {checkDuelLedger} from '../../../js/duel-kp-audit.js';
import {kpTargetMembers,kpTargetAllowed} from './kp-target-members.ts';
// @ts-expect-error Shared pure browser-side rules (no declaration file).
import {initialDuelBoard,playDuelMove,duelPlayerForColor,DUEL_GAMES} from '../../../js/duel-rules.js';

// @ts-expect-error Shared pure mini-game rules, no TypeScript declaration file.
import {EXTRA_DUEL_GAMES,miniStart,miniMove} from '../../../js/duel-mini-games.js';
const GAMES={...DUEL_GAMES,...EXTRA_DUEL_GAMES};
const MINIS=new Set(['connect4','hitblow','bluffdice','poker']);
function randInt(n:number){const raw=new Uint32Array(1),limit=Math.floor(0x1_0000_0000/n)*n;do{crypto.getRandomValues(raw);}while(raw[0]>=limit);return raw[0]%n;}
export const DUEL_MAX_STAKE=100_000;
export const DUEL_TURN_MS=10*60_000;
export const DUEL_INVITE_MS=15*60_000;
type DuelGame='othello'|'gomoku'|'connect4'|'hitblow'|'bluffdice'|'poker';
type DuelStatus='pending'|'active'|'finished'|'cancelled';
export interface BoardDuel{
 id:string;guild:string;user_a:string;user_b:string;game:DuelGame;stake:number;
 status:DuelStatus;board:string;black_user:string|null;turn_user:string|null;
 winner:string|null;version:number;created_at:number;updated_at:number;deadline_at:number;
 private_hand?:string|null;
}
interface DuelAction{ id:string;guild:string;duel_id:string;actor:string;kind:string;version:number;at:number;
 board:string|null;next_turn:string|null;winner:string|null;first_user:string|null;deadline_at:number; }
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ready=new WeakMap<object,Promise<void>>();
export async function ensureBoardDuels(env:KpEnv){
 const existing=ready.get(env.DB);if(existing)return existing;
 const task=(async()=>{
  // Existing two-game installations have an immutable SQLite CHECK constraint.
  // Migrate just once, preserving all open escrowed duels and the existing ledger.
  const installed=await env.DB.prepare("SELECT value FROM kp_settings WHERE key='board_duel_schema_version'")
   .first<{value:string}>();
  if(installed?.value==='2')return;
  const old=await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='kp_board_duels'")
   .first<{sql:string}>();
  if(old&& !old.sql.includes("'connect4'")){
   await env.DB.batch([
    env.DB.prepare('DROP TRIGGER IF EXISTS kp_board_duel_apply'),
    env.DB.prepare(`CREATE TABLE kp_board_duels_upgraded(
     id TEXT PRIMARY KEY,guild TEXT NOT NULL,user_a TEXT NOT NULL,user_b TEXT NOT NULL,
     game TEXT NOT NULL CHECK(game IN ('othello','gomoku','connect4','hitblow','bluffdice','poker')),
     stake INTEGER NOT NULL CHECK(stake BETWEEN 100 AND 100000),
     status TEXT NOT NULL CHECK(status IN ('pending','active','finished','cancelled')),
     board TEXT NOT NULL,black_user TEXT,turn_user TEXT,winner TEXT,version INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,deadline_at INTEGER NOT NULL,
     CHECK(user_a!=user_b))`),
    env.DB.prepare(`INSERT INTO kp_board_duels_upgraded
     SELECT id,guild,user_a,user_b,game,stake,status,board,black_user,turn_user,winner,version,created_at,updated_at,deadline_at FROM kp_board_duels`),
    env.DB.prepare('DROP TABLE kp_board_duels'),
    env.DB.prepare('ALTER TABLE kp_board_duels_upgraded RENAME TO kp_board_duels')
   ]);
  }
  await env.DB.batch([
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS kp_board_duels(
   id TEXT PRIMARY KEY,guild TEXT NOT NULL,user_a TEXT NOT NULL,user_b TEXT NOT NULL,
   game TEXT NOT NULL CHECK(game IN ('othello','gomoku','connect4','hitblow','bluffdice','poker')),
   stake INTEGER NOT NULL CHECK(stake BETWEEN 100 AND 100000),
   status TEXT NOT NULL CHECK(status IN ('pending','active','finished','cancelled')),
   board TEXT NOT NULL,black_user TEXT,turn_user TEXT,winner TEXT,version INTEGER NOT NULL DEFAULT 0,
   created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,deadline_at INTEGER NOT NULL,
   CHECK(user_a!=user_b))`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS kp_board_duel_secrets(
   id TEXT PRIMARY KEY,guild TEXT NOT NULL,data TEXT NOT NULL)`),
  env.DB.prepare('CREATE INDEX IF NOT EXISTS kp_board_duels_a ON kp_board_duels(guild,user_a,updated_at DESC)'),
  env.DB.prepare('CREATE INDEX IF NOT EXISTS kp_board_duels_b ON kp_board_duels(guild,user_b,updated_at DESC)'),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS kp_board_duels_expiry ON kp_board_duels(guild,status,deadline_at)"),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS kp_board_duels_retention ON kp_board_duels(guild,status,updated_at)"),
  env.DB.prepare("INSERT OR IGNORE INTO kp_settings(key,value) VALUES('board_duels_enabled','1')"),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS kp_board_duel_actions(
   id TEXT PRIMARY KEY,guild TEXT NOT NULL,duel_id TEXT NOT NULL,actor TEXT NOT NULL,
   kind TEXT NOT NULL CHECK(kind IN ('accept','move','cancel','resign','timeout')),
   version INTEGER NOT NULL,at INTEGER NOT NULL,board TEXT,next_turn TEXT,winner TEXT,
   first_user TEXT,deadline_at INTEGER NOT NULL)`),
  env.DB.prepare("CREATE INDEX IF NOT EXISTS kp_board_duel_actions_duel ON kp_board_duel_actions(duel_id)"),
  env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS kp_board_duel_apply AFTER INSERT ON kp_board_duel_actions BEGIN
   UPDATE kp_board_duels SET
    status=CASE WHEN NEW.kind='accept' THEN 'active'
      WHEN NEW.kind='cancel' THEN 'cancelled'
      WHEN NEW.kind IN ('resign','timeout') OR (NEW.kind='move' AND NEW.winner IS NOT NULL) THEN 'finished'
      ELSE status END,
    board=CASE WHEN NEW.kind IN ('accept','move') THEN NEW.board ELSE board END,
    black_user=CASE WHEN NEW.kind='accept' THEN NEW.first_user ELSE black_user END,
    turn_user=CASE WHEN NEW.kind='accept' THEN NEW.first_user
      WHEN NEW.kind='move' THEN NEW.next_turn ELSE turn_user END,
    winner=CASE WHEN NEW.kind IN ('move','resign','timeout') THEN NEW.winner ELSE winner END,
    version=version+1,updated_at=NEW.at,deadline_at=NEW.deadline_at
   WHERE id=NEW.duel_id AND guild=NEW.guild AND version=NEW.version
     AND (
      (NEW.kind='accept' AND status='pending' AND user_b=NEW.actor AND deadline_at>=NEW.at
         AND NEW.first_user IN (user_a,user_b) AND (NEW.board=board OR game IN ('connect4','hitblow','bluffdice','poker')))
      OR (NEW.kind='cancel' AND status='pending' AND NEW.actor IN (user_a,user_b))
      OR (NEW.kind='move' AND status='active' AND turn_user=NEW.actor AND deadline_at>=NEW.at
          AND (NEW.next_turn IN (user_a,user_b) OR (NEW.next_turn IS NULL AND NEW.winner IS NOT NULL))
          AND (NEW.winner IS NULL OR NEW.winner IN (user_a,user_b,'draw')))
      OR (NEW.kind='resign' AND status='active' AND NEW.actor IN (user_a,user_b)
         AND NEW.winner=CASE WHEN NEW.actor=user_a THEN user_b ELSE user_a END)
      OR (NEW.kind='timeout' AND status='active' AND (NEW.actor IN (user_a,user_b) OR NEW.actor='system')
         AND deadline_at<NEW.at AND NEW.winner=CASE WHEN turn_user=user_a THEN user_b ELSE user_a END)
     );
   SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'duel conflict or expired') END;
  END`),
  env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS kp_board_duel_escrow AFTER UPDATE OF status ON kp_board_duels
   WHEN OLD.status='pending' AND NEW.status='active' BEGIN
    INSERT INTO kp_ledger(id,guild,user,delta,kind,at)
     SELECT 'duel:stake:a:'||NEW.id,NEW.guild,NEW.user_a,-NEW.stake,'duel',NEW.updated_at
     FROM kp_wallets w WHERE w.guild=NEW.guild AND w.user=NEW.user_a AND w.balance>=NEW.stake
     AND NOT EXISTS(SELECT 1 FROM kp_debts d WHERE d.guild=NEW.guild AND d.user=NEW.user_a AND d.amount>0);
    SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'duel stake unavailable') END;
    INSERT INTO kp_ledger(id,guild,user,delta,kind,at)
     SELECT 'duel:stake:b:'||NEW.id,NEW.guild,NEW.user_b,-NEW.stake,'duel',NEW.updated_at
     FROM kp_wallets w WHERE w.guild=NEW.guild AND w.user=NEW.user_b AND w.balance>=NEW.stake
     AND NOT EXISTS(SELECT 1 FROM kp_debts d WHERE d.guild=NEW.guild AND d.user=NEW.user_b AND d.amount>0);
    SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'duel stake unavailable') END;
   END`),
  env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS kp_board_duel_payout AFTER UPDATE OF status ON kp_board_duels
   WHEN OLD.status='active' AND NEW.status='finished' BEGIN
    INSERT INTO kp_ledger(id,guild,user,delta,kind,at)
     SELECT 'duel:payout:a:'||NEW.id,NEW.guild,NEW.user_a,
       CASE WHEN NEW.winner='draw' THEN NEW.stake ELSE NEW.stake*2 END,'duel',NEW.updated_at
     WHERE NEW.winner IN ('draw',NEW.user_a);
    INSERT INTO kp_ledger(id,guild,user,delta,kind,at)
     SELECT 'duel:payout:b:'||NEW.id,NEW.guild,NEW.user_b,
       CASE WHEN NEW.winner='draw' THEN NEW.stake ELSE NEW.stake*2 END,'duel',NEW.updated_at
     WHERE NEW.winner IN ('draw',NEW.user_b);
    SELECT CASE WHEN (NEW.winner='draw' OR NEW.winner IN (NEW.user_a,NEW.user_b))
      THEN 1 ELSE RAISE(ABORT,'duel winner invalid') END;
   END`)
 ,env.DB.prepare("INSERT INTO kp_settings(key,value) VALUES('board_duel_schema_version','2') ON CONFLICT(key) DO UPDATE SET value='2'")
  ]);
 })();
 ready.set(env.DB,task);try{await task;}catch(e){ready.delete(env.DB);throw e;}
}
async function room(env:KpEnv,guild:string,id:string,user:string):Promise<BoardDuel>{
 if(!UUID.test(id))throw Error('対戦IDが不正です。');
 const row=await env.DB.prepare(`SELECT d.*,
   CASE WHEN d.black_user=? THEN json_extract(s.data,'$.privateA')
        ELSE json_extract(s.data,'$.privateB') END AS private_hand
   FROM kp_board_duels d LEFT JOIN kp_board_duel_secrets s ON s.guild=d.guild AND s.id=d.id
   WHERE d.guild=? AND d.id=? AND (d.user_a=? OR d.user_b=?)`)
  .bind(user,guild,id,user,user).first<BoardDuel>();
 if(!row)throw Error('対戦が見つかりません。');return row;
}
// Check real transitions only, using one indexed ledger-ID lookup per escrow/settlement.
// Never poll for anomalies or repeat a KP credit after an audit read fails.
async function verifyDuelLedger(env:KpEnv,match:BoardDuel){
 if(!['active','finished'].includes(match.status))return;
 try{
  const ids=['duel:stake:a:','duel:stake:b:','duel:payout:a:','duel:payout:b:'].map(prefix=>prefix+match.id);
  const rows=(await env.DB.prepare('SELECT id,guild,user,delta,kind FROM kp_ledger WHERE id IN (?,?,?,?)')
   .bind(...ids).all<{id:string;guild:string;user:string;delta:number;kind:string}>()).results;
  const verdict=checkDuelLedger(match,rows);
  if(!verdict.ok)console.error('duel-ledger-integrity-anomaly',JSON.stringify({duel:match.id,problems:verdict.problems}));
 }catch(error){console.error('duel-ledger-audit-unavailable',match.id,String(error));}
}
async function present(env:KpEnv,mapping:KpMapping,user:string,id:string){
 return room(env,mapping.guildId,id,user);
}
function validateActionId(id:unknown){if(typeof id!=='string'||!UUID.test(id))throw Error('操作IDが不正です。');return id;}

export async function boardDuelList(env:KpEnv,m:KpMapping,user:string,cursor:string|null=null){
 await ensureBoardDuels(env);
 let cutoff:number|null=null,id='';
 if(cursor!==null){
  const parsed=/^([0-9]{10,15}):([0-9a-f-]{36})$/i.exec(cursor);
  if(!parsed||!UUID.test(parsed[2]))throw Error('履歴の読み込み位置が不正です。');
  cutoff=Number(parsed[1]);id=parsed[2];
  if(!Number.isSafeInteger(cutoff))throw Error('履歴の読み込み位置が不正です。');
 }
 const condition=cutoff===null?'':' AND (d.updated_at<? OR (d.updated_at=? AND d.id<?))';
 const query=`SELECT d.*,
  CASE WHEN d.black_user=? THEN json_extract(s.data,'$.privateA')
       ELSE json_extract(s.data,'$.privateB') END AS private_hand
  FROM kp_board_duels d LEFT JOIN kp_board_duel_secrets s ON s.guild=d.guild AND s.id=d.id
  WHERE d.guild=? AND (d.user_a=? OR d.user_b=?)${condition}
  ORDER BY d.updated_at DESC,d.id DESC LIMIT 20`;
 const stmt=env.DB.prepare(query);
 const matches=(await (cutoff===null?stmt.bind(user,m.guildId,user,user):
   stmt.bind(user,m.guildId,user,user,cutoff,cutoff,id)).all<BoardDuel>()).results;
 return {games:GAMES,limit:DUEL_MAX_STAKE,turnMs:DUEL_TURN_MS,invitationMs:DUEL_INVITE_MS,
   // Only first page needs a roster. Subsequent pages reuse already loaded members.
   members:cursor===null?await kpTargetMembers(env,m):[],matches,hasMore:matches.length===20};
}
export async function boardDuelAction(env:KpEnv,m:KpMapping,user:string,body:Record<string,unknown>){
 await ensureBoardDuels(env);
 const id=validateActionId(body.id),kind=String(body.action??'');
 const existing=await env.DB.prepare('SELECT guild,duel_id,actor,kind FROM kp_board_duel_actions WHERE id=?')
  .bind(id).first<Pick<DuelAction,'guild'|'duel_id'|'actor'|'kind'>>();
 if(existing){
  if(existing.guild!==m.guildId||existing.actor!==user||existing.kind!==kind||existing.duel_id!==body.duel)throw Error('操作IDの再利用はできません。');
  return present(env,m,user,existing.duel_id);
 }
 if(kind==='create'){
  const game=String(body.game??''),target=String(body.opponent??''),stake=Number(body.stake);
  if(!Object.hasOwn(GAMES,game))throw Error('ゲームを選んでください。');
  if(target===user||!await kpTargetAllowed(env,m,target))throw Error('KP口座のある対戦相手を選んでください。');
  if(!Number.isSafeInteger(stake)||stake<100||stake>DUEL_MAX_STAKE)throw Error('賭け金は100〜100,000 KPです。');
  const old=await env.DB.prepare('SELECT * FROM kp_board_duels WHERE id=?').bind(id).first<BoardDuel>();
  if(old){
   if(old.guild!==m.guildId||old.user_a!==user||old.user_b!==target||old.game!==game||old.stake!==stake)throw Error('操作IDの再利用はできません。');
   return present(env,m,user,id);
  }
  if(await debtOf(env,m.guildId,user)>0)throw Error('借KPを完済してから決闘してください。');
  const balance=await env.DB.prepare('SELECT balance FROM kp_wallets WHERE guild=? AND user=?').bind(m.guildId,user).first<{balance:number}>();
  if(!balance||balance.balance<stake)throw Error('賭け金のKPが足りません。');
  const count=await env.DB.prepare(`SELECT COUNT(*) AS n FROM kp_board_duels
   WHERE guild=? AND user_a=? AND status='pending' AND deadline_at>?`).bind(m.guildId,user,Date.now()).first<{n:number}>();
  if((count?.n??0)>=3)throw Error('招待中の決闘は3件までです。');
  const now=Date.now();
  await env.DB.prepare(`INSERT INTO kp_board_duels
   (id,guild,user_a,user_b,game,stake,status,board,black_user,turn_user,winner,version,created_at,updated_at,deadline_at)
   VALUES(?,?,?,?,?,?,'pending',?,NULL,NULL,NULL,0,?,?,?) ON CONFLICT(id) DO NOTHING`)
   .bind(id,m.guildId,user,target,game,stake,MINIS.has(game)?'.':initialDuelBoard(game),now,now,now+DUEL_INVITE_MS).run();
  return present(env,m,user,id);
 }
 const match=await room(env,m.guildId,String(body.duel??''),user);
 if(!['accept','move','cancel','resign','timeout'].includes(kind))throw Error('操作が不正です。');
 if(!Number.isSafeInteger(body.version)||body.version!==match.version)throw Error('対戦盤が更新されました。再読み込みしてください。');
 const now=Date.now();let board:string|null=null,next_turn:string|null=null,winner:string|null=null,first_user:string|null=null;
 let deadline=match.deadline_at;
 let privateData:string|null=null;
 if(kind==='accept'){
  if(match.status!=='pending'||match.user_b!==user||deadline<now)throw Error('招待は期限切れ、または受付済みです。');
  if(await debtOf(env,m.guildId,user)>0)throw Error('借KPを完済してから決闘してください。');
  first_user=crypto.getRandomValues(new Uint8Array(1))[0]%2===0?match.user_a:match.user_b;
  if(MINIS.has(match.game)){
   const started=miniStart(match.game,randInt);
   board=started.board;privateData=started.secret;
  }else board=match.board;
  deadline=now+DUEL_TURN_MS;
 }else if(kind==='move'){
  if(match.status!=='active'||match.turn_user!==user||deadline<now)throw Error('今は着手できません。');
  const other=match.black_user===match.user_a?match.user_b:match.user_a;
  if(MINIS.has(match.game)){
   let secret:string|null=null;
   if(match.game!=='connect4'){
    const row=await env.DB.prepare('SELECT data FROM kp_board_duel_secrets WHERE guild=? AND id=?')
     .bind(m.guildId,match.id).first<{data:string}>();
    if(!row)throw Error('非公開ゲーム情報を確認できません。');secret=row.data;
   }
   const side=match.black_user===user?'a':'b';
   const after=miniMove(match.game,match.board,secret,side,body,randInt);
   board=after.board;privateData=after.secret;
   next_turn=after.turnSide?(after.turnSide==='a'?match.black_user:other):null;
   winner=after.winner?(after.winner==='draw'?'draw':after.winner==='a'?match.black_user:other):null;
  }else{
   const color=match.black_user===user?'B':'W';
   const after=playDuelMove(match.game,match.board,color,Number(body.cell));
   board=after.board;next_turn=duelPlayerForColor(match.black_user,match.user_a,match.user_b,after.nextColor);
   winner=after.winner?(after.winner==='draw'?'draw':duelPlayerForColor(match.black_user,match.user_a,match.user_b,after.winner)):null;
  }
  deadline=now+DUEL_TURN_MS;
 }else if(kind==='cancel'){
  if(match.status!=='pending')throw Error('招待はすでに受諾済みです。');
 }else if(kind==='resign'){
  if(match.status!=='active')throw Error('進行中の対戦がありません。');
  winner=match.user_a===user?match.user_b:match.user_a;
 }else if(kind==='timeout'){
  if(match.status!=='active'||deadline>=now)throw Error('まだ時間切れではありません。');
  winner=match.turn_user===match.user_a?match.user_b:match.user_a;
 }
 // The insert and all its triggers are one SQLite transaction: escrow, board update
 // and both settlement credits either all succeed or all roll back.
 try{
  const action=env.DB.prepare(`INSERT INTO kp_board_duel_actions
   (id,guild,duel_id,actor,kind,version,at,board,next_turn,winner,first_user,deadline_at)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`)
   .bind(id,m.guildId,match.id,user,kind,match.version,now,board,next_turn,winner,first_user,deadline);
  if(kind==='accept'&&MINIS.has(match.game)&&privateData!==null){
   await env.DB.batch([
    env.DB.prepare('INSERT INTO kp_board_duel_secrets(id,guild,data) VALUES(?,?,?)')
     .bind(match.id,m.guildId,privateData),action]);
  }else if(kind==='move'&&MINIS.has(match.game)&&privateData!==null&&match.game!=='connect4'){
   await env.DB.batch([action,env.DB.prepare(`UPDATE kp_board_duel_secrets SET data=?
     WHERE guild=? AND id=? AND EXISTS(SELECT 1 FROM kp_board_duel_actions WHERE id=? AND duel_id=? AND version=?)`)
     .bind(privateData,m.guildId,match.id,id,match.id,match.version)]);
  }else await action.run();
 }catch(error){
  const msg=String(error);
  if(msg.includes('stake unavailable')||msg.includes('CHECK constraint failed'))throw Error('どちらかのKPが不足しているため、対戦を開始できません。');
  if(msg.includes('duel conflict'))throw Error('相手が先に操作したため、盤面を更新してください。');
  throw error;
 }
 const latest=await present(env,m,user,match.id);
 if((kind==='accept'&&latest.status==='active')||
    (['move','resign','timeout'].includes(kind)&&latest.status==='finished'))
  await verifyDuelLedger(env,latest);
 return latest;
}

/** Low-budget cron sweep every five minutes; escrow is never held indefinitely after a time-out. */
export async function settleExpiredBoardDuels(env:KpEnv,guild:string,now=Date.now()){
 const flag=await env.DB.prepare("SELECT value FROM kp_settings WHERE key='board_duels_enabled'").first();
 if(!flag)return {settled:0};
 await ensureBoardDuels(env);
 const expired=(await env.DB.prepare(`SELECT * FROM kp_board_duels
  WHERE guild=? AND status='active' AND deadline_at<? ORDER BY deadline_at LIMIT 20`)
  .bind(guild,now).all<BoardDuel>()).results;
 let settled=0;
 for(const match of expired){
  if(!match.turn_user)continue;
  const winner=match.turn_user===match.user_a?match.user_b:match.user_a;
  try{
   const done=await env.DB.prepare(`INSERT INTO kp_board_duel_actions
    (id,guild,duel_id,actor,kind,version,at,board,next_turn,winner,first_user,deadline_at)
    VALUES(?,?,?,'system','timeout',?,?,NULL,NULL,?,NULL,?)`)
    .bind(crypto.randomUUID(),guild,match.id,match.version,now,winner,match.deadline_at).run();
   const applied=Number(done.meta.changes??0);
   settled+=applied;
   if(applied)await verifyDuelLedger(env,{...match,status:'finished',winner});
  }catch(error){
   if(!String(error).includes('duel conflict'))throw error;
   // An opponent made the last move while this cron was checking the deadline.
  }
 }
 return {settled};
}


/** Bounded daily house-keeping: preserve the immutable KP ledger, discard only old game artifacts. */
export async function cleanupBoardDuels(env:KpEnv,guild:string,now=Date.now()){
 const ready=await env.DB.prepare("SELECT value FROM kp_settings WHERE key='board_duels_enabled'").first();
 if(!ready)return {expired:0,removed:0};
 await ensureBoardDuels(env);
 const expired=await env.DB.prepare(`UPDATE kp_board_duels SET status='cancelled',updated_at=?,version=version+1
  WHERE id IN(SELECT id FROM kp_board_duels WHERE guild=? AND status='pending' AND deadline_at<?
   ORDER BY deadline_at LIMIT 30)`).bind(now,guild,now).run();
 // No unsettled escrow can be deleted: only 30+ day-old finished / cancelled rooms.
 const rows=(await env.DB.prepare(`SELECT id FROM kp_board_duels WHERE guild=?
  AND status IN ('finished','cancelled') AND updated_at<? ORDER BY updated_at LIMIT 30`)
  .bind(guild,now-30*86400_000).all<{id:string}>()).results;
 if(!rows.length)return {expired:Number(expired.meta.changes??0),removed:0};
 const placeholders=rows.map(()=>'?').join(','),ids=rows.map(x=>x.id);
 await env.DB.batch([
  env.DB.prepare(`DELETE FROM kp_board_duel_actions WHERE duel_id IN(${placeholders})`).bind(...ids),
  env.DB.prepare(`DELETE FROM kp_board_duel_secrets WHERE guild=? AND id IN(${placeholders})`).bind(guild,...ids),
  env.DB.prepare(`DELETE FROM kp_board_duels WHERE guild=? AND status IN ('finished','cancelled') AND id IN(${placeholders})`).bind(guild,...ids)
 ]);
 return {expired:Number(expired.meta.changes??0),removed:rows.length};
}

export async function boardDuelApi(request:Request,env:KpEnv,m:KpMapping,user:string,headers:Record<string,string>={}){
 const response=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});
 try{
  if(request.method==='GET')return response(await boardDuelList(env,m,user,new URL(request.url).searchParams.get('cursor')));
  if(request.method!=='POST')return response({error:'不正な操作です。'},405);
  const raw=await request.text();if(raw.length>1024)return response({error:'操作内容が長すぎます。'},400);
  const body=JSON.parse(raw) as Record<string,unknown>;
  if(!body||typeof body!=='object'||Array.isArray(body))return response({error:'操作内容が不正です。'},400);
  return response({match:await boardDuelAction(env,m,user,body)});
 }catch(error){
  const message=error instanceof Error?error.message:'';
  const safe=/[ぁ-んァ-ヶ一-龯]/.test(message)&&!message.includes('SQL');
  return response({error:safe?message:'対戦操作を確認できませんでした。盤面を更新してください。'},400);
 }
}
