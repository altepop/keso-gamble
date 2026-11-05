// Read-only audit: who received how much relic bonus from which source, and whether stock bonuses came from
// "buy then sell within the hour" cycles. SELECT only. Users are shown as the last 4 digits of their Discord ID.
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export const D1_B_ID='bf23ab40-814f-4626-9e0b-36739ac41750';
const who=u=>'…'+String(u).slice(-4);
const n=v=>Number(v??0).toLocaleString('en-US');
const t=v=>v?new Date(Number(v)+9*3600000).toISOString().slice(5,16).replace('T',' ')+' JST':'—';
// kp_operations ids/response shapes: stock trades carry stockTrade, racing 'race-settle:', M.League 'ml-settle:', otherwise casino.
const CATEGORY=`CASE WHEN json_extract(response,'$.stockTrade.symbol') IS NOT NULL THEN 'stock'
 WHEN id LIKE 'race-settle:%' THEN 'racing' WHEN id LIKE 'ml-settle:%' THEN 'mleague' ELSE 'casino' END`;
export async function audit(query,since){
 const out=['# Relic bonus abuse audit (read-only)','','Users are the last 4 digits of their Discord ID. Times are JST.',''];
 const ops=await query(`SELECT user,${CATEGORY} AS cat,CAST(json_extract(response,'$.result.relicBonus') AS INTEGER) AS bonus,at,
   json_extract(response,'$.stockTrade.symbol') AS symbol,json_extract(response,'$.stockTrade.side') AS side,
   CAST(json_extract(response,'$.stockTrade.gross') AS INTEGER) AS gross,CAST(json_extract(response,'$.stockTrade.fee') AS INTEGER) AS fee
   FROM kp_operations WHERE at>=? AND instr(response,'"relicBonus":')>0 AND CAST(json_extract(response,'$.result.relicBonus') AS INTEGER)>0`,[since]);
 const cats={};
 for(const o of ops){const c=cats[o.cat]??={count:0,total:0,max:0,users:{}};c.count++;c.total+=o.bonus;c.max=Math.max(c.max,o.bonus);
  const u=c.users[o.user]??={count:0,total:0,max:0,last:0};u.count++;u.total+=o.bonus;u.max=Math.max(u.max,o.bonus);u.last=Math.max(u.last,o.at);}
 out.push('## Native relic bonuses (casino / stock / racing / M.League)','','| Source | Payouts | Total KP | Largest |','|:--|--:|--:|--:|');
 for(const [k,c] of Object.entries(cats))out.push(`| ${k} | ${n(c.count)} | ${n(c.total)} | ${n(c.max)} |`);
 if(!ops.length)out.push('| — | 0 | 0 | 0 |');
 for(const [k,c] of Object.entries(cats)){
  out.push('',`### ${k}: by member (top 10)`,'','| Member | Payouts | Total KP | Largest | Last |','|:--|--:|--:|--:|:--|');
  for(const [u,s] of Object.entries(c.users).sort((a,b)=>b[1].total-a[1].total).slice(0,10))out.push(`| ${who(u)} | ${n(s.count)} | ${n(s.total)} | ${n(s.max)} | ${t(s.last)} |`);
 }
 // Stock: a bonus-earning sale with a buy of the same symbol by the same member within the previous hour.
 const sells=ops.filter(o=>o.cat==='stock'&&o.side==='sell');
 const buys=await query(`SELECT user,symbol,quantity,price,at FROM stock_trades WHERE side='buy' AND at>=?`,[since-3600000]);
 let flagged=0,flaggedBonus=0;const byUser={};
 for(const s of sells){
  const recent=buys.filter(b=>b.user===s.user&&b.symbol===s.symbol&&b.at<=s.at&&b.at>=s.at-3600000);
  if(!recent.length)continue;
  flagged++;flaggedBonus+=s.bonus;const u=byUser[s.user]??={sales:0,bonus:0,fees:0,bought:0};u.sales++;u.bonus+=s.bonus;u.fees+=s.fee??0;
  u.bought+=recent.reduce((a,b)=>a+b.quantity*b.price,0);
 }
 out.push('','## Stock: bonus sales within 1 hour after buying the same stock','',`${n(flagged)} sales, ${n(flaggedBonus)} KP of relic bonus.`,'');
 if(flagged){out.push('| Member | Sales | Relic bonus | Sell fees | Bought within the hour (KP) |','|:--|--:|--:|--:|--:|');
  for(const [u,s] of Object.entries(byUser).sort((a,b)=>b[1].bonus-a[1].bonus))out.push(`| ${who(u)} | ${n(s.sales)} | ${n(s.bonus)} | ${n(s.fees)} | ${n(Math.round(s.bought))} |`);}
 // Verified-receipt bonuses (VALORANT, Steam, voice, LOOP, ...): the ledger rows 'relic:<receipt>'; the receipt
 // prefix names the source (match:, voice:, loop:, mahjong:, sk-...).
 const src=`CASE WHEN instr(substr(id,7),':')>0 THEN substr(substr(id,7),1,instr(substr(id,7),':')-1) ELSE substr(id,7) END`;
 const logs=await query(`SELECT ${src} AS mode,count(*) AS count,sum(delta) AS bonus,max(delta) AS max FROM kp_ledger WHERE kind='relic' AND at>=? GROUP BY mode ORDER BY bonus DESC`,[since]);
 out.push('','## Verified-receipt relic bonuses (ledger kind=relic, by receipt source)','','| Source | Payouts | Bonus KP | Largest |','|:--|--:|--:|--:|');
 for(const l of logs)out.push(`| ${l.mode} | ${n(l.count)} | ${n(l.bonus)} | ${n(l.max)} |`);
 const top=await query(`SELECT user,${src} AS mode,count(*) AS count,sum(delta) AS bonus FROM kp_ledger WHERE kind='relic' AND at>=? GROUP BY user,mode ORDER BY bonus DESC LIMIT 10`,[since]);
 out.push('','### Verified-receipt bonuses by member and source (top 10)','','| Member | Source | Payouts | Bonus KP |','|:--|:--|--:|--:|');
 for(const r of top)out.push(`| ${who(r.user)} | ${r.mode} | ${n(r.count)} | ${n(r.bonus)} |`);
 // Lifetime native totals kept in each member's state.
 const life=await query(`SELECT user,CAST(json_extract(data,'$.relics.nativeEarned') AS INTEGER) AS earned,CAST(json_extract(data,'$.relics.nativeCount') AS INTEGER) AS count FROM kp_state WHERE json_extract(data,'$.relics.nativeEarned')>0 ORDER BY earned DESC LIMIT 10`,[]);
 out.push('','## Lifetime native relic bonus per member (top 10)','','| Member | Payouts | Total KP |','|:--|--:|--:|');
 for(const r of life)out.push(`| ${who(r.user)} | ${n(r.count)} | ${n(r.earned)} |`);
 return out.join('\n')+'\n';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const e=process.env;
 if(!e.CLOUDFLARE_API_TOKEN||!e.CLOUDFLARE_ACCOUNT_ID)throw Error('Cloudflare credentials are missing');
 const api='https://api.cloudflare.com/client/v4/accounts/'+e.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+D1_B_ID+'/query';
 const query=async(sql,params)=>{
  if(!/^\s*SELECT\b/i.test(sql))throw Error('read-only');
  const res=await fetch(api,{method:'POST',headers:{Authorization:'Bearer '+e.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(30000)});
  const body=await res.json().catch(()=>({}));
  // D1 error messages describe the SQL problem only (no data or credentials).
  if(!res.ok||body.success!==true||!body.result?.[0]?.success)throw Error('D1 query failed ('+res.status+'): '+String(body.errors?.[0]?.message??'').slice(0,200));
  return body.result[0].results;
 };
 const since=Date.now()-Number(e.DAYS||14)*86400000;
 const text=await audit(query,since);
 console.log(text);if(e.GITHUB_STEP_SUMMARY)appendFileSync(e.GITHUB_STEP_SUMMARY,text);
}
