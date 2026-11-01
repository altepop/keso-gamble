import type {KpEnv} from './kp.ts';
import {ensureKpMatchRewardIndex} from './kp.ts';
import {ensureQuizKp} from './quiz-kp.ts';
import {ledgerHistory} from './kp-history.ts';
import type {HistoryEntry} from './kp-history.ts';

/** Historical rewards are immutable after they are entered in the KP ledger.
 * Inserting ANY ledger item increments kp_wallets.version via the existing
 * kp_ledger_apply trigger. Use that durable version as the invalidation key,
 * plus 60s TTL in case legacy imports update reward details out of band.
 * This avoids re-reading 100 match, 100 quiz and 100 ledger records on every
 * full Activity state refresh, while preserving all historical records.
 */
interface MatchReward {id:string;match:string;mode:string;amount:number;at:number}
interface QuizReward {id:string;mode:string;day:string;game:string;amount:number;completed_at:number}
export interface RewardHistorySnapshot {
 rewards:MatchReward[];
 quiz:QuizReward[];
 ledger:HistoryEntry[];
}
const cache=new WeakMap<object,Map<string,{version:number;at:number;job:Promise<RewardHistorySnapshot>}>>();
const TTL_MS=60_000,MAX_USERS=20;
export async function kpRewardHistory(env:KpEnv,guild:string,user:string,version:number,now=Date.now()):Promise<RewardHistorySnapshot>{
 let group=cache.get(env.DB);
 if(!group){group=new Map();cache.set(env.DB,group);}
 const key=guild+':'+user;
 const found=group.get(key);
 if(found&&found.version===version&&now>=found.at&&now-found.at<TTL_MS)return found.job;
 const job=(async()=>{
  await Promise.all([ensureKpMatchRewardIndex(env),ensureQuizKp(env)]);
  const [matches,quizzes,ledger]=await Promise.all([
   env.DB.prepare("SELECT e.id,e.match,e.mode,e.amount+COALESCE((SELECT delta FROM kp_ledger WHERE id='penalty:'||e.id),0)+COALESCE((SELECT delta FROM kp_ledger WHERE id='esc-extra:'||e.id),0) AS amount,e.at FROM kp_events e WHERE e.guild=? AND e.user=? ORDER BY e.at DESC,e.id LIMIT 100").bind(guild,user).all<MatchReward>(),
   env.DB.prepare('SELECT id,mode,day,game,amount,completed_at FROM kp_quiz_events WHERE guild=? AND user=? UNION ALL SELECT id,mode,day,game,amount,completed_at FROM kp_quiz_ranked_extra WHERE guild=? AND user=? ORDER BY completed_at DESC LIMIT 100').bind(guild,user,guild,user).all<QuizReward>(),
   ledgerHistory(env,guild,user),
  ]);
  return {rewards:matches.results,quiz:quizzes.results,ledger};
 })();
 group.set(key,{version,at:now,job});
 if(group.size>MAX_USERS)group.delete(group.keys().next().value!);
 try{return await job;}catch(err){if(group.get(key)?.job===job)group.delete(key);throw err;}
}
