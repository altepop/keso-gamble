import type {KpMapping} from './kp.ts';
import {postCoachPersonalFeedback} from './coach-personal-feedback.ts';
// Saved matches are not passed through the original new-results branch again.
// Replay only recent competitive matches with NO receipt, never claimed/unknown.
export const COACH_FEEDBACK_REPLAY_WINDOW_MS=24*60*60_000;
export const COACH_FEEDBACK_REPLAY_LIMIT=3;
type ReplayEnv=Parameters<typeof postCoachPersonalFeedback>[0];
type Candidate={riot_id:string;match_id:string;ended_at:number;puuid:string};
type Sender=typeof postCoachPersonalFeedback;
export async function replaySavedCoachFeedback(env:ReplayEnv,mapping:KpMapping,
 now=Date.now(),send:Sender=postCoachPersonalFeedback
):Promise<{scanned:number;attempted:number;posted:number;statuses:Record<string,number>}>{
 const empty=()=>({scanned:0,attempted:0,posted:0,statuses:{} as Record<string,number>});
 if(!env.KESO_COACH_WEBHOOK_URL||!Number.isSafeInteger(now)||now<COACH_FEEDBACK_REPLAY_WINDOW_MS||
    !Array.isArray(mapping.accounts)||!mapping.accounts.length)return empty();
 const allowed=new Set(mapping.accounts.map(a=>a.riotId.toLowerCase()));
 const ids=[...allowed].sort();
 const candidates=await env.DB.prepare(
   'SELECT n.riot_id,n.match_id,n.ended_at,t.puuid FROM notifications n '+
   'JOIN tracked_players t ON lower(t.riot_id)=lower(n.riot_id) '+
   'JOIN coach_profile_accounts a ON a.puuid=t.puuid AND a.guild=? '+
   'WHERE lower(n.riot_id) IN ('+ids.map(()=>'?').join(',')+') '+
   "AND n.mode='competitive' AND n.ended_at BETWEEN ? AND ? "+
   "AND NOT EXISTS (SELECT 1 FROM monitor_state s WHERE s.key='coach_personal_feedback:v1:'||a.subject_id||':'||n.match_id) "+
   'ORDER BY n.ended_at DESC LIMIT 24'
 ).bind(mapping.guildId,...ids,now-COACH_FEEDBACK_REPLAY_WINDOW_MS,now).all<Candidate>();
 const result=empty();result.scanned=candidates.results.length;
 // Each scheduled five-minute slot advances to a different bounded page.
 // Without rotation a permanently incomplete newest match starves older
 // missing-receipt results forever.
 const pages=Math.max(1,Math.ceil(candidates.results.length/COACH_FEEDBACK_REPLAY_LIMIT));
 const page=Math.floor(now/(5*60_000))%pages;
 const selected=candidates.results.slice(
   page*COACH_FEEDBACK_REPLAY_LIMIT,(page+1)*COACH_FEEDBACK_REPLAY_LIMIT);
 if(pages>1)console.info('coach_feedback_replay_rotation',{page,pages,candidates:result.scanned});
 for(const row of selected){
   if(result.attempted>=COACH_FEEDBACK_REPLAY_LIMIT)break;
   if(!allowed.has(row.riot_id.toLowerCase())||
      typeof row.match_id!=='string'||!row.match_id||
      typeof row.puuid!=='string'||!row.puuid||
      !Number.isSafeInteger(row.ended_at)||row.ended_at<now-COACH_FEEDBACK_REPLAY_WINDOW_MS||
      row.ended_at>now)continue;
   result.attempted++;
   let status:string;
   try{status=await send(env,mapping,row.match_id,row.puuid,row.ended_at);}
   catch{status='error';}
   result.statuses[status]=(result.statuses[status]??0)+1;
   if(status==='posted')result.posted++;
 }
 return result;
}
