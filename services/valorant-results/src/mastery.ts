// Agent mastery: count each member's games per agent from recorded matches and give rude titles
// (docs/RACING_PLAN.md §12). Counting starts when this table is first created; no backfill.
import type { KpEnv, KpMapping } from './kp.ts';
import type { RoastLevel } from './racing-crowns.ts';
import { enqueue, ensurePosts } from './racing-posts.ts';
export const COUNT_TITLES:Array<[number,(a:string)=>string]>=[[100,a=>`まるで${a}`],[60,a=>`${a}の付属品`],[30,a=>`${a}しか友達がいない`],[15,a=>`${a}にすがる人`],[5,a=>`${a}をかじった人`]];
export const WIN_TITLES:Array<[number,(a:string)=>string]>=[[.65,a=>`${a}以外は使うな`],[.55,a=>`${a}だけはまとも`],[.45,a=>`${a}でも可もなく不可もない人`],[.35,a=>`${a}を使うと負ける人`],[0,a=>`${a}の面汚し`]];
export const MILESTONES=COUNT_TITLES.map(([n])=>n);
const clean=(text:string)=>text.replace(/[@`*_~<>|\[\]()]/g,'').slice(0,24);
export function countTitle(agent:string,games:number){return COUNT_TITLES.find(([n])=>games>=n)?.[1](clean(agent))??null;}
/** Win-rate titles need 10 games, so one bad night does not label anyone. */
export function winTitle(agent:string,games:number,wins:number){return games<10?null:WIN_TITLES.find(([r])=>wins/games>=r)![1](clean(agent));}
/** Titles shown follow the person's roast level: none at "mild", count titles at "normal", both at "full". */
export function titlesFor(level:RoastLevel,agent:string,games:number,wins:number){
 if(level==='mild')return [];
 return [countTitle(agent,games),level==='full'?winTitle(agent,games,wins):null].filter((t):t is string=>Boolean(t));
}
// A newly seen agent match updates a small per-agent summary exactly once.
// Previously the Activity grouped all historic agent_plays every full-state
// refresh: 143,706 D1 rows/day in 2026-11-01 Insights.
// The migration/backfill and trigger installation are in one D1 transaction.
// The marker prevents an expensive full backfill on every isolate restart.
const initialized=new WeakMap<object,Promise<void>>();
export async function ensureMastery(env:KpEnv){
 const existing=initialized.get(env.DB);if(existing)return existing;
 const job=(async()=>{
  await env.DB.batch([
   env.DB.prepare('CREATE TABLE IF NOT EXISTS agent_plays(riot_id TEXT NOT NULL,match_id TEXT NOT NULL,agent TEXT NOT NULL,outcome TEXT,ended_at INTEGER NOT NULL,PRIMARY KEY(riot_id,match_id))'),
   env.DB.prepare('CREATE TABLE IF NOT EXISTS agent_mastery_totals(riot_id TEXT NOT NULL,agent TEXT NOT NULL,games INTEGER NOT NULL,wins INTEGER NOT NULL,PRIMARY KEY(riot_id,agent))'),
   env.DB.prepare('CREATE TABLE IF NOT EXISTS agent_mastery_meta(key TEXT PRIMARY KEY)'),
   // One-time legacy backfill. The NOT EXISTS guard skips all source rows on
   // subsequent cold starts; use INSERT OR REPLACE so concurrent first starts
   // cannot double-count history when D1 serializes the transactions.
   env.DB.prepare("INSERT OR REPLACE INTO agent_mastery_totals(riot_id,agent,games,wins) SELECT riot_id,agent,COUNT(*),COALESCE(SUM(outcome='win'),0) FROM agent_plays WHERE NOT EXISTS(SELECT 1 FROM agent_mastery_meta WHERE key='v1') GROUP BY riot_id,agent"),
   env.DB.prepare("INSERT OR IGNORE INTO agent_mastery_meta(key) VALUES('v1')"),
   env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS agent_plays_summary_insert AFTER INSERT ON agent_plays BEGIN
     INSERT INTO agent_mastery_totals(riot_id,agent,games,wins)
     VALUES(NEW.riot_id,NEW.agent,1,CASE WHEN NEW.outcome='win' THEN 1 ELSE 0 END)
     ON CONFLICT(riot_id,agent) DO UPDATE SET games=games+1,wins=wins+excluded.wins;
   END`),
  ]);
 })();
 initialized.set(env.DB,job);
 try{await job;}catch(e){if(initialized.get(env.DB)===job)initialized.delete(env.DB);throw e;}
}
/** Records one finished match. Returns the agent's game count when this call added the match. */
export async function recordAgentPlay(env:KpEnv,riotId:string,matchId:string,agent:string|undefined|null,outcome:string|null,endedAt:number){
 const name=typeof agent==='string'?agent.trim():'';
 if(!name||name.length>40)return null;
 await ensureMastery(env);
 const r=await env.DB.prepare('INSERT OR IGNORE INTO agent_plays(riot_id,match_id,agent,outcome,ended_at) VALUES(?,?,?,?,?)').bind(riotId,matchId,name,outcome,endedAt).run();
 if(!r.meta.changes)return null;
 return Number((await env.DB.prepare('SELECT games FROM agent_mastery_totals WHERE riot_id=? AND agent=?').bind(riotId,name).first<{games:number}>())?.games??0);
}
export async function masteryOf(env:KpEnv,riotId:string,level:RoastLevel){
 await ensureMastery(env);
 const rows=(await env.DB.prepare("SELECT agent,games,wins FROM agent_mastery_totals WHERE riot_id=? ORDER BY games DESC,agent LIMIT 8").bind(riotId).all<{agent:string;games:number;wins:number}>()).results;
 return rows.map(r=>({agent:r.agent,games:r.games,wins:r.wins??0,titles:titlesFor(level,r.agent,r.games,r.wins??0)}));
}
export function riotIdOf(mapping:KpMapping,user:string){return mapping.accounts.find(a=>a.discordUserId===user)?.riotId??null;}
/** Records a newly saved match. When it reaches a count milestone, the title is announced in the
 * earnings channel (never at roast level "mild"). Already recorded matches cost one query. */
export async function recordMastery(env:KpEnv&{KP_EARNINGS_WEBHOOK_URL?:string},mapping:KpMapping,riotId:string,matchId:string,agent:string|undefined|null,outcome:string|null,endedAt:number,levelOf:()=>Promise<(user:string)=>RoastLevel>){
 const user=mapping.accounts.find(a=>a.riotId===riotId)?.discordUserId;
 if(!user)return null;
 const games=await recordAgentPlay(env,riotId,matchId,agent,outcome,endedAt);
 if(games===null||!MILESTONES.includes(games)||!env.KP_EARNINGS_WEBHOOK_URL||(await levelOf())(user)==='mild')return games;
 const name=String(agent).trim();
 await ensurePosts(env);
 await enqueue(env,`mastery:${riotId}:${name}:${games}`,`🏅 <@${user}> ${clean(name)} ${games}試合目。称号『${countTitle(name,games)}』を獲得`,Date.now());
 return games;
}
