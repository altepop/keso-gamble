import policy from '../kp-policy.json' with { type: 'json' };
import type { KpEnv } from './kp.ts';
// 借KP: a minus the wallet cannot cover is not forgiven. Wallets still stop at 0, and the rest becomes a debt that
// grows by interest every hour (from the first full hour after it started) and is repaid from KP that comes in.
// While any is owed, nothing can be bought (stocks, horses, bets, luxury, directives), so hiding KP before a
// likely loss no longer dodges it. Every change is a row in kp_debt_events (borrow / interest / repay).
export const DEBT_INTEREST_PERCENT:number=policy.debt.interestPercentPerHour;
export const DEBT_BLOCKED='借KPを返すまでKPは使えません（株・馬・馬券・高級品・指名）。入ったKPから自動で返済されます。';
const HOUR=3600_000;
const ready=new WeakSet<object>();
export async function ensureDebt(env:KpEnv){
 if(ready.has(env.DB))return;
 await env.DB.batch([
  `CREATE TABLE IF NOT EXISTS kp_debts(guild TEXT NOT NULL,user TEXT NOT NULL,amount INTEGER NOT NULL DEFAULT 0 CHECK(typeof(amount)='integer' AND amount>=0),since INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild,user))`,
  `CREATE TABLE IF NOT EXISTS kp_debt_events(id TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount!=0),kind TEXT NOT NULL CHECK(kind IN ('borrow','interest','repay')),at INTEGER NOT NULL)`,
  // since: when the current debt started (interest waits a full hour from then).
  `CREATE TRIGGER IF NOT EXISTS kp_debt_apply AFTER INSERT ON kp_debt_events BEGIN
   INSERT OR IGNORE INTO kp_debts(guild,user) VALUES(NEW.guild,NEW.user);
   UPDATE kp_debts SET since=CASE WHEN amount=0 THEN NEW.at ELSE since END,amount=amount+NEW.amount WHERE guild=NEW.guild AND user=NEW.user;
  END`,
  // A repayment is a wallet debit (kind 'debt') and the matching debt event, in one statement.
  `CREATE TRIGGER IF NOT EXISTS kp_debt_repay AFTER INSERT ON kp_ledger WHEN NEW.kind='debt' BEGIN INSERT INTO kp_debt_events(id,guild,user,amount,kind,at) VALUES('repay:'||NEW.id,NEW.guild,NEW.user,NEW.delta,'repay',NEW.at); END`,
  `CREATE TRIGGER IF NOT EXISTS kp_debt_blocks_spending BEFORE INSERT ON kp_operations WHEN NEW.delta<0 AND EXISTS(SELECT 1 FROM kp_debts WHERE guild=NEW.guild AND user=NEW.user AND amount>0) BEGIN SELECT RAISE(ABORT,'${DEBT_BLOCKED}'); END`,
 ].map(sql=>env.DB.prepare(sql)));
 ready.add(env.DB);
}
/** After a minus capped at the balance (ledger row `ledgerId`, asked for `requested` KP), owe what it could not take.
 * Idempotent: a retried delivery finds the same ledger row and the same debt event. */
export function borrowShortfall(env:KpEnv,ledgerId:string,requested:number){
 return env.DB.prepare(`INSERT OR IGNORE INTO kp_debt_events(id,guild,user,amount,kind,at) SELECT 'borrow:'||id,guild,user,CAST(? AS INTEGER)+delta,'borrow',at FROM kp_ledger WHERE id=? AND CAST(? AS INTEGER)+delta>0`).bind(requested,ledgerId,requested);
}
export async function borrowedBy(env:KpEnv,ledgerId:string){
 return Number((await env.DB.prepare("SELECT amount FROM kp_debt_events WHERE id='borrow:'||?").bind(ledgerId).first<{amount:number}>())?.amount??0);
}
export async function debtOf(env:KpEnv,guild:string,user:string){
 await ensureDebt(env);
 return Number((await env.DB.prepare('SELECT amount FROM kp_debts WHERE guild=? AND user=?').bind(guild,user).first<{amount:number}>())?.amount??0);
}
export const debtNote=(borrowed:number)=>borrowed>0?`（💸 払えない分は借KP +${borrowed.toLocaleString('ja-JP')}）`:'';
/** Every cron run: first repay from whatever came in, then charge this hour's interest (once per hour, rounded up). */
export async function settleDebts(env:KpEnv,guild:string,now=Date.now()){
 await ensureDebt(env);
 const hour=Math.floor(now/HOUR);
 await env.DB.batch([
  env.DB.prepare(`INSERT OR IGNORE INTO kp_ledger(id,guild,user,delta,kind,at) SELECT 'debt-repay:'||w.guild||':'||w.user||':'||w.version,w.guild,w.user,-MIN(d.amount,w.balance),'debt',? FROM kp_wallets w JOIN kp_debts d ON d.guild=w.guild AND d.user=w.user WHERE w.guild=? AND d.amount>0 AND w.balance>0`).bind(now,guild),
  env.DB.prepare(`INSERT OR IGNORE INTO kp_debt_events(id,guild,user,amount,kind,at) SELECT 'interest:'||guild||':'||user||':'||?,guild,user,(amount*CAST(? AS INTEGER)+99)/100,'interest',? FROM kp_debts WHERE guild=? AND amount>0 AND since<=?`).bind(hour,DEBT_INTEREST_PERCENT,now,guild,now-HOUR),
 ]);
}
