/** Phase 12: read-only 7-day JST duel seasons and event calendar.
 * Existing PvP results are retained on a separate 30-day cleanup policy.
 * Do not invent lifetime rankings or pay seasonal rewards.
 */
import type {KpEnv} from './kp.ts';
const DAY=86_400_000, WEEK=7*DAY, JST=9*3_600_000;
const GAMES=['othello','gomoku','connect4','hitblow','bluffdice','poker'] as const;
const snowflake=/^\d{15,22}$/;
export const DUEL_SEASON_ROW_CAP=500;
export function duelSeasonWindow(now=Date.now()){
 if(!Number.isSafeInteger(now)||now<0||now>8_640_000_000_000_000)throw Error('Invalid duel season clock');
 const jstDay=Math.floor((now+JST)/DAY);
 // Thursday 1970-01-01 (4), Monday is 1.
 const weekStart=jstDay-((jstDay+3)%7);
 const start=weekStart*DAY-JST,end=start+WEEK;
 const id=new Date(start+JST).toISOString().slice(0,10);
 return {id,startAt:start,endAt:end,endsInMs:Math.max(0,end-now)};
}
export function duelSeasonEvent(now=Date.now()){
 const season=duelSeasonWindow(now);
 const week=Math.floor((season.startAt+JST)/WEEK);
 const game=GAMES[((week%GAMES.length)+GAMES.length)%GAMES.length];
 return {id:season.id,game,kind:'weekly-focus' as const,
  title:'週間ピックアップ：'+({othello:'オセロ',gomoku:'五目並べ',connect4:'四目並べ',hitblow:'ヒット＆ブロー',bluffdice:'ブラフダイス',poker:'ポーカー'} as Record<string,string>)[game],
  startAt:season.startAt,endAt:season.endAt,
  extraKp:0,autoEntry:false,
  description:'既存の決闘を楽しむ週間テーマ。自動参加・勝率補正・追加KPはありません。'};
}
type RecordRow={user_a:string;user_b:string;winner:string|null;updated_at:number};
export async function duelSeasonRead(env:Pick<KpEnv,'DB'>,guild:string,now=Date.now()){
 if(!snowflake.test(guild))throw Error('Invalid duel ranking guild');
 const season=duelSeasonWindow(now);
 const rows=await env.DB.prepare(`SELECT user_a,user_b,winner,updated_at FROM kp_board_duels
   WHERE guild=? AND status='finished' AND updated_at>=? AND updated_at<?
   ORDER BY updated_at DESC,id DESC LIMIT ?`)
  .bind(guild,season.startAt,Math.min(now+1,season.endAt),DUEL_SEASON_ROW_CAP)
  .all<RecordRow>();
 const result=new Map<string,{user:string;wins:number;losses:number;draws:number;played:number}>();
 function touch(id:string){
  let v=result.get(id);
  if(!v){v={user:id,wins:0,losses:0,draws:0,played:0};result.set(id,v);}
  return v;
 }
 const seen=rows.results??[];
 for(const row of seen){
  if(!snowflake.test(row.user_a)||!snowflake.test(row.user_b)||row.user_a===row.user_b)continue;
  if(row.winner!=='draw'&&row.winner!==row.user_a&&row.winner!==row.user_b)continue;
  for(const who of [row.user_a,row.user_b]){
   const entry=touch(who);entry.played++;
   if(row.winner==='draw')entry.draws++;
   else if(row.winner===who)entry.wins++;
   else entry.losses++;
  }
 }
 const rankings=[...result.values()].sort((a,b)=>b.wins-a.wins||a.losses-b.losses||
  b.draws-a.draws||a.user.localeCompare(b.user)).map((x,i)=>({rank:i+1,...x}));
 return {season,event:duelSeasonEvent(now),rankings,
  sampledMatches:seen.length,partial:seen.length===DUEL_SEASON_ROW_CAP,
  rankingScope:'owner-only-existing-pvp-results' as const,
  rewardGranted:false,notAnAllTimeRanking:true};
}

/** Existing minute Cron only; run one bounded read-only review daily at 03:17 JST.
 * Not an alarm service, and no data mutation or reward adjustments occur.
 */
export function shouldRunDuelDailyAudit(scheduledTime:number){
 if(!Number.isSafeInteger(scheduledTime)||scheduledTime<0)return false;
 const localMinute=Math.floor((scheduledTime+JST)/60_000)%1440;
 return localMinute===197;
}
