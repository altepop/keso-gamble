import type {KpEnv} from './kp.ts';

/** Server-side per-user budget. Never trust IP, UI or a client-supplied user id.
 * 120 wallet operations/minute is a safety tripwire, not an assertion that
 * Cloudflare WAF/DDoS protections are unnecessary. */
export const MAX_KP_OPERATIONS_PER_MINUTE=120;
const ready=new WeakMap<object,Promise<void>>();
async function ensureOperationBudget(env:KpEnv){
 if(ready.has(env.DB))return ready.get(env.DB)!;
 const job=env.DB.prepare('CREATE TABLE IF NOT EXISTS kp_operation_limits(guild TEXT NOT NULL,user TEXT NOT NULL,minute INTEGER NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(guild,user,minute))').run();
 const readyJob=Promise.resolve(job).then(()=>{});
 ready.set(env.DB,readyJob);
 try{await readyJob;}catch(error){ready.delete(env.DB);throw error;}
}
export async function allowedKpOperation(env:KpEnv,guild:string,user:string,now=Date.now()):Promise<boolean>{
 await ensureOperationBudget(env);
 const minute=Math.floor(now/60000);
 const record=await env.DB.prepare(
  'INSERT INTO kp_operation_limits(guild,user,minute,count) VALUES(?,?,?,1) '+
  'ON CONFLICT(guild,user,minute) DO UPDATE SET count=MIN(count+1,?) RETURNING count'
 ).bind(guild,user,minute,MAX_KP_OPERATIONS_PER_MINUTE+1).first<{count:number}>();
 if(record?.count===1&&minute%10===0){
  // The scope is a single member's primary-key range, not a table sweep.
  await env.DB.prepare('DELETE FROM kp_operation_limits WHERE guild=? AND user=? AND minute<?')
   .bind(guild,user,minute-1440).run();
 }
 return Boolean(record&&record.count<=MAX_KP_OPERATIONS_PER_MINUTE);
}
