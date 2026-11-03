import {ensureDebt} from './kp-debt.ts';
import type {KpEnv} from './kp.ts';
// 資産 → メンバーのKP推移: everyone's KP at the end of each JST day (KP − 借KP, so a debt shows below 0), worked back
// from today's balances through the ledger and the debt events. Members only, read only.
const DAY=86_400_000,JST=9*3_600_000;
// Reading 30 days of the ledger on every open cost ~10,000 rows (the top D1 reader on 2026-11-03), so each member's
// KP − 借KP change per JST day is kept in kp_trend_days by triggers and the chart reads only the days it shows
// (members × days rows). Built once from the full history; rebuilding again is harmless (it recomputes, never adds).
const TREND_READY='kp_trend_days_v1';
const ready=new WeakSet<object>();
const dayOf=(at:string)=>`CAST((${at}+${JST})/${DAY} AS INTEGER)`;
const upsert=(row:'NEW'|'OLD',net:string)=>`INSERT INTO kp_trend_days(guild,day,user,net) VALUES(${row}.guild,${dayOf(row+'.at')},${row}.user,${net}) ON CONFLICT(guild,day,user) DO UPDATE SET net=net+excluded.net`;
export async function ensureTrendDays(env:KpEnv){
 if(ready.has(env.DB))return;
 if(!await env.DB.prepare('SELECT 1 FROM kp_settings WHERE key=?').bind(TREND_READY).first()){
  await env.DB.batch([
   'CREATE TABLE IF NOT EXISTS kp_trend_days(guild TEXT NOT NULL,day INTEGER NOT NULL,user TEXT NOT NULL,net INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild,day,user)) WITHOUT ROWID',
   'DELETE FROM kp_trend_days',
   `INSERT INTO kp_trend_days(guild,day,user,net) SELECT guild,${dayOf('at')},user,SUM(delta) FROM kp_ledger GROUP BY 1,2,3`,
   `INSERT INTO kp_trend_days(guild,day,user,net) SELECT guild,${dayOf('at')},user,-SUM(amount) FROM kp_debt_events GROUP BY 1,2,3 ON CONFLICT(guild,day,user) DO UPDATE SET net=net+excluded.net`,
   // Ledger rows are only ever inserted. A debt event may be shrunk or removed by the cap trigger right after it is
   // inserted; whatever order the triggers run in, insert + update + delete add up to what the event finally says.
   `CREATE TRIGGER IF NOT EXISTS kp_trend_ledger AFTER INSERT ON kp_ledger BEGIN ${upsert('NEW','NEW.delta')}; END`,
   `CREATE TRIGGER IF NOT EXISTS kp_trend_debt_insert AFTER INSERT ON kp_debt_events BEGIN ${upsert('NEW','-NEW.amount')}; END`,
   `CREATE TRIGGER IF NOT EXISTS kp_trend_debt_update AFTER UPDATE OF amount ON kp_debt_events BEGIN ${upsert('NEW','OLD.amount-NEW.amount')}; END`,
   `CREATE TRIGGER IF NOT EXISTS kp_trend_debt_delete AFTER DELETE ON kp_debt_events BEGIN ${upsert('OLD','OLD.amount')}; END`,
   'DROP INDEX IF EXISTS kp_ledger_trend_window',
   `INSERT INTO kp_settings(key,value) VALUES('${TREND_READY}','1') ON CONFLICT(key) DO NOTHING`,
  ].map(sql=>env.DB.prepare(sql)));
 }
 ready.add(env.DB);
}

export const TREND_DAYS=[7,30] as const;
export interface TrendMember {id:string;name:string;balance:number;debt:number;points:number[]}
export async function kpTrend(env:KpEnv,guild:string,names:Map<string,string>,days:number,now=Date.now()){
 if(!TREND_DAYS.includes(days as 7|30))days=7;
 await ensureDebt(env);
 await ensureTrendDays(env);
 const today=Math.floor((now+JST)/DAY);
 const first=today-days+1; // only what came after the first day's end changes the points
 const [wallets,debts,moves]=await Promise.all([
  env.DB.prepare('SELECT user,balance FROM kp_wallets WHERE guild=?').bind(guild).all<{user:string;balance:number}>(),
  env.DB.prepare('SELECT user,amount FROM kp_debts WHERE guild=? AND amount>0').bind(guild).all<{user:string;amount:number}>(),
  env.DB.prepare('SELECT user,day,net FROM kp_trend_days WHERE guild=? AND day>?').bind(guild,first).all<{user:string;day:number;net:number}>(),
 ]);
 const people=new Map<string,{balance:number;debt:number;after:number[]}>();
 const person=(user:string)=>{let p=people.get(user);if(!p){p={balance:0,debt:0,after:Array(days).fill(0)};people.set(user,p);}return p;};
 for(const w of wallets.results)person(w.user).balance=Number(w.balance);
 for(const d of debts.results)person(d.user).debt=Number(d.amount);
 // after[i]: how much KP − 借KP changed after the end of day i (net, so ledger credits raise it and debt events lower it).
 const add=(user:string,day:number,n:number)=>{const p=person(user);for(let i=0;i<days;i++)if(day>first+i)p.after[i]+=n;};
 for(const m of moves.results)add(m.user,Number(m.day),Number(m.net));
 const members:TrendMember[]=[...people].map(([id,p])=>({id,name:names.get(id)??'メンバー '+id.slice(-4),balance:p.balance,debt:p.debt,points:p.after.map(a=>p.balance-p.debt-a)}))
  .filter(m=>m.points.some(v=>v!==0))
  .sort((a,b)=>a.id<b.id?-1:1);
 const label=(day:number)=>{const d=new Date(day*DAY);return `${d.getUTCMonth()+1}/${d.getUTCDate()}`;};
 return {days:Array.from({length:days},(_,i)=>label(first+i)),members,at:now};
}
