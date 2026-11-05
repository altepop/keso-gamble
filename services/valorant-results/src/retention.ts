import type {KpEnv} from './kp.ts';

// Short-lived OAuth data only. Never touch KP ledger, operations, bets, shares or reward receipts.
const DAY=86_400_000;
export const RETAIN_EXPIRED_DAYS=7;
export const MAX_DELETE_PER_TABLE=200;
export function shouldRunRetention(now:number){
 if(!Number.isSafeInteger(now)||now<0)return false;
 const japan=new Date(now+9*3_600_000);
 return japan.getUTCHours()===3&&japan.getUTCMinutes()===3;
}
const ready=new WeakMap<object,Promise<void>>();
async function ensureIndexes(env:KpEnv){
 const existing=ready.get(env.DB);if(existing)return existing;
 const work=env.DB.batch([
  env.DB.prepare('CREATE INDEX IF NOT EXISTS kp_codes_expiry ON kp_codes(expires,hash)'),
  env.DB.prepare('CREATE INDEX IF NOT EXISTS kp_sessions_expiry ON kp_sessions(expires,hash)')
 ]).then(()=>{});
 ready.set(env.DB,work);try{await work;}catch(e){ready.delete(env.DB);throw e;}
}
export async function cleanupExpiredCredentials(env:KpEnv,now=Date.now()){
 if(!Number.isSafeInteger(now)||now<7*DAY)throw Error('Invalid retention clock');
 await ensureIndexes(env);
 const cutoff=now-RETAIN_EXPIRED_DAYS*DAY;
 const results=await env.DB.batch([
  env.DB.prepare(`DELETE FROM kp_codes WHERE hash IN (SELECT hash FROM kp_codes WHERE expires<? ORDER BY expires,hash LIMIT ${MAX_DELETE_PER_TABLE})`).bind(cutoff),
  env.DB.prepare(`DELETE FROM kp_sessions WHERE hash IN (SELECT hash FROM kp_sessions WHERE expires<? ORDER BY expires,hash LIMIT ${MAX_DELETE_PER_TABLE})`).bind(cutoff),
 ]);
 return {codes:results[0].meta.changes,sessions:results[1].meta.changes};
}
