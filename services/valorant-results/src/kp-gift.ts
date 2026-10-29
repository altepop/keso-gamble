import type { KpEnv } from './kp.ts';
// KPのプレゼント (/give): the giver's operation (delta −amount) and the receiver's ledger row (kind 'gift') are one
// insert, so the KP is never lost or doubled; a missing receiver wallet aborts both. Someone who owes 借KP cannot give
// (the operation is a spend), and what a receiver with 借KP gets repays it like any other income.
export const GIFT_MAX=10_000;
const ready=new WeakSet<object>();
export async function ensureGift(env:KpEnv){
 if(ready.has(env.DB))return;
 await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS kp_gift_apply AFTER INSERT ON kp_operations WHEN json_extract(NEW.response,'$.result.gift.to') IS NOT NULL BEGIN
  INSERT INTO kp_ledger(id,guild,user,delta,kind,at) VALUES('gift:'||NEW.guild||':'||NEW.user||':'||NEW.id,NEW.guild,json_extract(NEW.response,'$.result.gift.to'),json_extract(NEW.response,'$.result.gift.amount'),'gift',NEW.at);
 END`).run();
 ready.add(env.DB);
}
const clean=(s:string)=>s.replace(/[@`*_~<>|\r\n]/g,'').trim().slice(0,60);
/** Checks the request and takes the KP from the giver's state. The trigger above credits the receiver. */
export function applyGift(state:{cash:number},user:string,args:Record<string,unknown>,members:(id:string)=>boolean){
 const to=String(args.to??''),amount=Number(args.amount),message=clean(String(args.message??''));
 if(!/^\d{15,22}$/.test(to)||to===user||!members(to))throw Error('プレゼントする相手（自分以外のメンバー）を選んでください。');
 if(!Number.isSafeInteger(amount)||amount<1||amount>GIFT_MAX)throw Error(`プレゼントは1〜${GIFT_MAX.toLocaleString('ja-JP')} KPです。`);
 if(state.cash<amount)throw Error('KPが足りません。');
 state.cash-=amount;
 return {gift:{to,amount,message}};
}
export const giftPost=(from:string,g:{to:string;amount:number;message:string})=>
 `🎁 <@${from}> が <@${g.to}> に **${g.amount.toLocaleString('ja-JP')} KP** をプレゼント！${g.message?`\n💬「${g.message}」`:''}\nええやつやん。`;
