import type {KpEnv,KpMapping} from './kp.ts';
import {debtOf} from './kp-debt.ts';
// @ts-expect-error Shared pure browser-side rules (no declaration file).
import {initialDuelBoard,playDuelMove,DUEL_GAMES} from '../../../js/duel-rules.js';

export const DUEL_MAX_STAKE=100_000;
export const DUEL_TURN_MS=10*60_000;
export const DUEL_INVITE_MS=15*60_000;
type DuelGame='othello'|'gomoku';
type DuelStatus='pending'|'active'|'finished'|'cancelled';
export interface BoardDuel{
 id:string;guild:string;user_a:string;user_b:string;game:DuelGame;stake:number;
 status:DuelStatus;board:string;black_user:string|null;turn_user:string|null;
 winner:string|null;version:number;created_at:number;updated_at:number;deadline_at:number;
}
interface DuelAction{ id:string;guild:string;duel_id:string;actor:string;kind:string;version:number;at:number;
 board:string|null;next_turn:string|null;winner:string|null;first_user:string|null;deadline_at:number; }
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ready=new WeakMap<object,Promise<void>>();
export async function ensureBoardDuels(env:KpEnv){
 const existing=ready.get(env.DB);if(existing)return existing;
 const task=Promise.resolve(env.DB.batch([
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS kp_board_duels(
   id TEXT PRIMARY KEY,guild TEXT NOT NULL,user_a TEXT NOT NULL,user_b TEXT NOT NULL,
   game TEXT NOT NULL CHECK(game IN ('othello','gomoku')),
   stake INTEGER NOT NULL CHECK(stake BETWEEN 100 AND 100000),
   status TEXT NOT NULL CHECK(status IN ('pending','active','finished','cancelled')),
   board TEXT NOT NULL,black_user TEXT,turn_user TEXT,winner TEXT,version INTEGER NOT NULL DEFAULT 0,
   created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,deadline_at INTEGER NOT NULL,
   CHECK(user_a!=user_b))`),
  env.DB.prepare('CREATE INDEX IF NOT EXISTS kp_board_duels_a ON kp_board_duels(guild,user_a,updated_at DESC)'),
  env.DB.prepare('CREATE INDEX IF NOT EXISTS kp_board_duels_b ON kp_board_duels(guild,user_b,updated_at DESC)'),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS kp_board_duel_actions(
   id TEXT PRIMARY KEY,guild TEXT NOT NULL,duel_id TEXT NOT NULL,actor TEXT NOT NULL,
   kind TEXT NOT NULL CHECK(kind IN ('accept','move','cancel','resign','timeout')),
   version INTEGER NOT NULL,at INTEGER NOT NULL,board TEXT,next_turn TEXT,winner TEXT,
   first_user TEXT,deadline_at INTEGER NOT NULL)`),
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
         AND NEW.first_user IN (user_a,user_b) AND NEW.board=board)
      OR (NEW.kind='cancel' AND status='pending' AND NEW.actor IN (user_a,user_b))
      OR (NEW.kind='move' AND status='active' AND turn_user=NEW.actor AND deadline_at>=NEW.at
          AND (NEW.next_turn IN (user_a,user_b) OR (NEW.next_turn IS NULL AND NEW.winner IS NOT NULL))
          AND (NEW.winner IS NULL OR NEW.winner IN (user_a,user_b,'draw')))
      OR (NEW.kind='resign' AND status='active' AND NEW.actor IN (user_a,user_b)
         AND NEW.winner=CASE WHEN NEW.actor=user_a THEN user_b ELSE user_a END)
      OR (NEW.kind='timeout' AND status='active' AND NEW.actor IN (user_a,user_b)
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
 ])).then(()=>{});
 ready.set(env.DB,task);try{await task;}catch(e){ready.delete(env.DB);throw e;}
}
async function room(env:KpEnv,guild:string,id:string,user:string):Promise<BoardDuel>{
 if(!UUID.test(id))throw Error('対戦IDが不正です。');
 const row=await env.DB.prepare('SELECT * FROM kp_board_duels WHERE guild=? AND id=? AND (user_a=? OR user_b=?)')
  .bind(guild,id,user,user).first<BoardDuel>();
 if(!row)throw Error('対戦が見つかりません。');return row;
}
async function present(env:KpEnv,mapping:KpMapping,user:string,id:string){
 return room(env,mapping.guildId,id,user);
}
function validateActionId(id:unknown){if(typeof id!=='string'||!UUID.test(id))throw Error('操作IDが不正です。');return id;}
const activeMembers=(m:KpMapping)=>new Set(m.accounts.map(a=>a.discordUserId));
export async function boardDuelList(env:KpEnv,m:KpMapping,user:string){
 await ensureBoardDuels(env);
 const matches=(await env.DB.prepare(`SELECT * FROM kp_board_duels
 WHERE guild=? AND (user_a=? OR user_b=?)
 ORDER BY updated_at DESC LIMIT 30`).bind(m.guildId,user,user).all<BoardDuel>()).results;
 return {games:DUEL_GAMES,limit:DUEL_MAX_STAKE,turnMs:DUEL_TURN_MS,invitationMs:DUEL_INVITE_MS,
  members:m.accounts.map(a=>({id:a.discordUserId,name:a.riotId.split('#')[0]})),matches};
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
  if(!Object.hasOwn(DUEL_GAMES,game))throw Error('ゲームを選んでください。');
  if(!activeMembers(m).has(target)||target===user)throw Error('対戦する相手を選んでください。');
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
   .bind(id,m.guildId,user,target,game,stake,initialDuelBoard(game),now,now,now+DUEL_INVITE_MS).run();
  return present(env,m,user,id);
 }
 const match=await room(env,m.guildId,String(body.duel??''),user);
 if(!['accept','move','cancel','resign','timeout'].includes(kind))throw Error('操作が不正です。');
 if(!Number.isSafeInteger(body.version)||body.version!==match.version)throw Error('対戦盤が更新されました。再読み込みしてください。');
 const now=Date.now();let board:string|null=null,next_turn:string|null=null,winner:string|null=null,first_user:string|null=null;
 let deadline=match.deadline_at;
 if(kind==='accept'){
  if(match.status!=='pending'||match.user_b!==user||deadline<now)throw Error('招待は期限切れ、または受付済みです。');
  if(await debtOf(env,m.guildId,user)>0)throw Error('借KPを完済してから決闘してください。');
  first_user=crypto.getRandomValues(new Uint8Array(1))[0]%2===0?match.user_a:match.user_b;
  board=match.board;deadline=now+DUEL_TURN_MS;
 }else if(kind==='move'){
  if(match.status!=='active'||match.turn_user!==user||deadline<now)throw Error('今は着手できません。');
  const color=match.black_user===user?'B':'W';
  const after=playDuelMove(match.game,match.board,color,Number(body.cell));
  board=after.board;next_turn=after.nextColor?(after.nextColor==='B'?match.black_user:(match.black_user===match.user_a?match.user_b:match.user_a)):null;
  winner=after.winner?(after.winner==='draw'?'draw':after.winner==='B'?match.black_user:(match.black_user===match.user_a?match.user_b:match.user_a)):null;
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
  await env.DB.prepare(`INSERT INTO kp_board_duel_actions
   (id,guild,duel_id,actor,kind,version,at,board,next_turn,winner,first_user,deadline_at)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`)
   .bind(id,m.guildId,match.id,user,kind,match.version,now,board,next_turn,winner,first_user,deadline).run();
 }catch(error){
  const msg=String(error);
  if(msg.includes('stake unavailable')||msg.includes('CHECK constraint failed'))throw Error('どちらかのKPが不足しているため、対戦を開始できません。');
  if(msg.includes('duel conflict'))throw Error('相手が先に操作したため、盤面を更新してください。');
  throw error;
 }
 return present(env,m,user,match.id);
}
export async function boardDuelApi(request:Request,env:KpEnv,m:KpMapping,user:string,headers:Record<string,string>={}){
 const response=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});
 try{
  if(request.method==='GET')return response(await boardDuelList(env,m,user));
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
