// Agent mastery: count each member's games per agent from recorded matches and give rude titles
// (docs/RACING_PLAN.md §12). Counting starts when this table is first created; no backfill.
import type { KpEnv, KpMapping } from './kp.ts';
import type { RoastLevel } from './racing-crowns.ts';
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
const initialized=new WeakSet<object>();
export async function ensureMastery(env:KpEnv){
 if(initialized.has(env.DB))return;
 await env.DB.prepare('CREATE TABLE IF NOT EXISTS agent_plays(riot_id TEXT NOT NULL,match_id TEXT NOT NULL,agent TEXT NOT NULL,outcome TEXT,ended_at INTEGER NOT NULL,PRIMARY KEY(riot_id,match_id))').run();
 initialized.add(env.DB);
}
/** Records one finished match. Returns the agent's game count when this call added the match. */
export async function recordAgentPlay(env:KpEnv,riotId:string,matchId:string,agent:string|undefined|null,outcome:string|null,endedAt:number){
 const name=typeof agent==='string'?agent.trim():'';
 if(!name||name.length>40)return null;
 await ensureMastery(env);
 const r=await env.DB.prepare('INSERT OR IGNORE INTO agent_plays(riot_id,match_id,agent,outcome,ended_at) VALUES(?,?,?,?,?)').bind(riotId,matchId,name,outcome,endedAt).run();
 if(!r.meta.changes)return null;
 return Number((await env.DB.prepare('SELECT COUNT(*) AS n FROM agent_plays WHERE riot_id=? AND agent=?').bind(riotId,name).first<{n:number}>())?.n??0);
}
export async function masteryOf(env:KpEnv,riotId:string,level:RoastLevel){
 await ensureMastery(env);
 const rows=(await env.DB.prepare("SELECT agent,COUNT(*) AS games,SUM(outcome='win') AS wins FROM agent_plays WHERE riot_id=? GROUP BY agent ORDER BY games DESC,agent LIMIT 8").bind(riotId).all<{agent:string;games:number;wins:number}>()).results;
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
 const name=String(agent).trim(),{enqueue,ensurePosts}=await import('./racing-posts.ts');
 await ensurePosts(env);
 await enqueue(env,`mastery:${riotId}:${name}:${games}`,`🏅 <@${user}> ${clean(name)} ${games}試合目。称号『${countTitle(name,games)}』を獲得`,Date.now());
 return games;
}
