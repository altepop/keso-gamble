import type {KpEnv} from './kp.ts';

// The Analytics API is sampled: never use this flag to block money, the
// Discord /kp ranking, settled wagers, cron or wallet state. It only softens
// optional historical read endpoints for the current UTC billing day.
// Stored UTC-day flags expire automatically at 09:00 JST without a cleanup job.
const cache=new WeakMap<object,{at:number,job:Promise<string|null>}>();
const TTL=60_000;
export const D1_OPTIONAL_DAY_KEY='d1_optional_conserve_utc_day';
export function d1OptionalModeActive(saved:string|null|undefined,now=Date.now()):boolean{
 return /^\d{4}-\d{2}-\d{2}$/.test(saved??'')&&saved===new Date(now).toISOString().slice(0,10);
}
export async function d1OptionalMode(env:KpEnv,now=Date.now()):Promise<boolean>{
 const cached=cache.get(env.DB);
 let job=cached?.job;
 if(!cached||now-cached.at<0||now-cached.at>=TTL){
  job=(async()=>{const row=await env.DB.prepare('SELECT value FROM kp_settings WHERE key=?').bind(D1_OPTIONAL_DAY_KEY).first<{value:string}>();return row?.value??null;})();
  cache.set(env.DB,{at:now,job});
 }
 try{return d1OptionalModeActive(await job!,now);}
 catch(error){if(cache.get(env.DB)?.job===job)cache.delete(env.DB);console.warn('optional_d1_mode_unavailable');return false;}
}
