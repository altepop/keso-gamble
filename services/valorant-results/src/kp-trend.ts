import {ensureDebt} from './kp-debt.ts';
import type {KpEnv} from './kp.ts';
// 資産 → メンバーのKP推移: everyone's KP at the end of each JST day (KP − 借KP, so a debt shows below 0), worked back
// from today's balances through the ledger and the debt events. Members only, read only.
const DAY=86_400_000,JST=9*3_600_000;
const trendIndexJobs=new WeakMap<object,Promise<unknown>>();
async function ensureTrendReadIndex(env:KpEnv){
 let job=trendIndexJobs.get(env.DB);
 if(!job){
  // Existing per-member history index begins (guild,user), so a *whole-guild*
  // time-window query on (guild,at) otherwise scans old transactions.
  job=env.DB.prepare('CREATE INDEX IF NOT EXISTS kp_ledger_trend_window ON kp_ledger(guild,at,user)').run();
  trendIndexJobs.set(env.DB,job);
  job.catch(()=>trendIndexJobs.delete(env.DB));
 }
 await job;
}

export const TREND_DAYS=[7,30] as const;
export interface TrendMember {id:string;name:string;balance:number;debt:number;points:number[]}
export async function kpTrend(env:KpEnv,guild:string,names:Map<string,string>,days:number,now=Date.now()){
 if(!TREND_DAYS.includes(days as 7|30))days=7;
 await ensureDebt(env);
 await ensureTrendReadIndex(env);
 const today=Math.floor((now+JST)/DAY);
 const first=today-days+1,since=(first+1)*DAY-JST; // only what came after the first day's end changes the points
 const [wallets,debts,moves,owes]=await Promise.all([
  env.DB.prepare('SELECT user,balance FROM kp_wallets WHERE guild=?').bind(guild).all<{user:string;balance:number}>(),
  env.DB.prepare('SELECT user,amount FROM kp_debts WHERE guild=? AND amount>0').bind(guild).all<{user:string;amount:number}>(),
  env.DB.prepare('SELECT user,CAST((at+?)/? AS INTEGER) AS day,SUM(delta) AS n FROM kp_ledger WHERE guild=? AND at>=? GROUP BY user,day').bind(JST,DAY,guild,since).all<{user:string;day:number;n:number}>(),
  env.DB.prepare('SELECT user,CAST((at+?)/? AS INTEGER) AS day,SUM(amount) AS n FROM kp_debt_events WHERE guild=? AND at>=? GROUP BY user,day').bind(JST,DAY,guild,since).all<{user:string;day:number;n:number}>(),
 ]);
 const people=new Map<string,{balance:number;debt:number;after:number[]}>();
 const person=(user:string)=>{let p=people.get(user);if(!p){p={balance:0,debt:0,after:Array(days).fill(0)};people.set(user,p);}return p;};
 for(const w of wallets.results)person(w.user).balance=Number(w.balance);
 for(const d of debts.results)person(d.user).debt=Number(d.amount);
 // after[i]: how much KP − 借KP changed after the end of day i (net, so ledger credits raise it and debt events lower it).
 const add=(user:string,day:number,n:number)=>{const p=person(user);for(let i=0;i<days;i++)if(day>first+i)p.after[i]+=n;};
 for(const m of moves.results)add(m.user,Number(m.day),Number(m.n));
 for(const o of owes.results)add(o.user,Number(o.day),-Number(o.n));
 const members:TrendMember[]=[...people].map(([id,p])=>({id,name:names.get(id)??'メンバー '+id.slice(-4),balance:p.balance,debt:p.debt,points:p.after.map(a=>p.balance-p.debt-a)}))
  .filter(m=>m.points.some(v=>v!==0))
  .sort((a,b)=>a.id<b.id?-1:1);
 const label=(day:number)=>{const d=new Date(day*DAY);return `${d.getUTCMonth()+1}/${d.getUTCDate()}`;};
 return {days:Array.from({length:days},(_,i)=>label(first+i)),members,at:now};
}
