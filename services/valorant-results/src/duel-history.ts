/** P11 readonly, self-only history; no claim, reward, KP or artificial completion.
 * Daily-start provenance is stored transactionally at start, never inferred
 * from matching game/level for historical custom sessions.
 */
import type {KpEnv} from './kp.ts';
import {ensureServerPveTables} from './duel-pve-sessions.ts';
import {ensureDuelRewards} from './duel-rewards.ts';
import {duelDailyChallenge} from './duel-daily-challenge.ts';
import {DUEL_PROGRESSION_GAMES} from './duel-progression.ts';

export const DUEL_DAILY_HISTORY_DDL = `CREATE TABLE IF NOT EXISTS kp_duel_pve_daily_entries (
 guild TEXT NOT NULL, user TEXT NOT NULL, session_id TEXT NOT NULL,
 jst_day TEXT NOT NULL CHECK(length(jst_day)=8),
 game TEXT NOT NULL, difficulty TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(guild,user,session_id)
)`;
export const DUEL_DAILY_HISTORY_INDEX =
 'CREATE INDEX IF NOT EXISTS kp_duel_daily_member ON kp_duel_pve_daily_entries(guild,user,jst_day,created_at DESC)';
const initialized=new WeakMap<object,Promise<void>>();
export async function ensureDuelDailyHistory(env:Pick<KpEnv,'DB'>){
 const before=initialized.get(env.DB);if(before)return before;
 const promise=(async()=>{
  await env.DB.prepare(DUEL_DAILY_HISTORY_DDL).run();
  await env.DB.prepare(DUEL_DAILY_HISTORY_INDEX).run();
 })();
 initialized.set(env.DB,promise);
 try{await promise;}catch(e){initialized.delete(env.DB);throw e;}
}
const games=new Set<string>(DUEL_PROGRESSION_GAMES);
const modes=new Set(['pve','pvp']);
const limit=20;
export type DuelHistoryFilter={mode?:string;game?:string};
export async function duelHistoryRead(env:KpEnv,guild:string,user:string,filter:DuelHistoryFilter={}){
 const mode=filter.mode||'all',game=filter.game||'all';
 if(mode!=='all'&&!modes.has(mode))throw Error('履歴の種目区分が不正です。');
 if(game!=='all'&&!games.has(game))throw Error('履歴の種目が不正です。');
 await ensureServerPveTables(env);
 await ensureDuelRewards(env);
 await ensureDuelDailyHistory(env);
 const now=Date.now(),today=duelDailyChallenge(now);
 const filters={mode,game};
 // Every SQL query is guild+authenticated-user constrained. Never expose opponent IDs.
 const responses=await env.DB.batch([
  env.DB.prepare(`SELECT mode,game,points,peak_points,verified_games,wins,losses,draws,updated_at
   FROM kp_duel_mode_skill WHERE guild=? AND user=? ORDER BY mode,game`).bind(guild,user),
  env.DB.prepare(`SELECT r.match_id,r.mode,r.game,r.outcome,r.occurred_at,
   CASE WHEN d.session_id IS NOT NULL THEN d.jst_day ELSE NULL END AS daily_day
   FROM kp_duel_progress_receipts r
   LEFT JOIN kp_duel_pve_daily_entries d ON d.guild=r.guild AND d.user=r.user AND d.session_id=r.match_id
   WHERE r.guild=? AND r.user=? AND r.applied_at IS NOT NULL
     AND (?='all' OR r.mode=?) AND (?='all' OR r.game=?)
   ORDER BY r.occurred_at DESC,r.match_id DESC LIMIT ?`).bind(guild,user,mode,mode,game,game,limit),
  // A PvP-only history must not issue an unused PvE session scan.
  ...(mode==='pvp'?[]:[env.DB.prepare(`SELECT s.id,s.game,s.difficulty,s.turn,s.winner,s.version,s.human_moves,s.cpu_moves,
   s.created_at,s.updated_at,d.jst_day AS daily_day
   FROM kp_duel_pve_sessions s
   LEFT JOIN kp_duel_pve_daily_entries d ON d.guild=s.guild AND d.user=s.user AND d.session_id=s.id
   WHERE s.guild=? AND s.user=? AND (?='all' OR ?='pve')
     AND (?='all' OR s.game=?)
   ORDER BY s.updated_at DESC,s.id DESC LIMIT ?`).bind(guild,user,mode,mode,game,game,limit)]),
  env.DB.prepare(`SELECT COUNT(*) AS started,
    COALESCE(SUM(CASE WHEN s.turn='finished' THEN 1 ELSE 0 END),0) AS finished,
    COALESCE(SUM(CASE WHEN s.turn='finished' AND s.winner='human' THEN 1 ELSE 0 END),0) AS wins
   FROM kp_duel_pve_daily_entries d JOIN kp_duel_pve_sessions s
   ON s.id=d.session_id AND s.guild=d.guild AND s.user=d.user
   WHERE d.guild=? AND d.user=? AND d.jst_day=?`)
   .bind(guild,user,today.day),
  env.DB.prepare('SELECT mode,game FROM kp_duel_reward_collection WHERE guild=? AND user=?').bind(guild,user)
 ]);
 const [skills,receipts]=responses;
 const [pve,daily,collection]=mode==='pvp'
  ?[{results:[]},responses[2],responses[3]]
  :[responses[2],responses[3],responses[4]];
 const entries=(receipts.results as Array<{match_id:string;mode:string;game:string;outcome:string;occurred_at:number;daily_day:string|null}>)
  .map(r=>({id:r.match_id,mode:r.mode,game:r.game,outcome:r.outcome,at:r.occurred_at,dailyDay:r.daily_day}));
 const sessions=mode==='pvp'?[]:(pve.results as Array<{id:string;game:string;difficulty:string;turn:string;winner:string|null;version:number;human_moves:number;cpu_moves:number;created_at:number;updated_at:number;daily_day:string|null}>)
  .map(row=>({id:row.id,game:row.game,level:row.difficulty,status:row.turn==='finished'?'finished':'active',
   winner:row.winner,version:row.version,humanMoves:row.human_moves,cpuMoves:row.cpu_moves,
   createdAt:row.created_at,updatedAt:row.updated_at,dailyDay:row.daily_day}));
 const todayCount=(daily.results as Array<{started:number;finished:number;wins:number}>)[0]??{started:0,finished:0,wins:0};
 return {asOf:now,filter:filters,today:{...today,started:todayCount.started,finished:todayCount.finished,
  wins:todayCount.wins},
  skills:skills.results as Array<{mode:string;game:string;points:number;peak_points:number;verified_games:number;wins:number;losses:number;draws:number;updated_at:number}>,history:entries,sessions,collection:collection.results,
  limit,historyHasMore:entries.length===limit,sessionsHasMore:sessions.length===limit,
  note:'履歴は各最新20件まで。初回の記録開始前の試合を日替わりと推定しません。認証済み本人だけが閲覧できます。'};
}
