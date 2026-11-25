/** P12 #833 read-only counterfactual: legacy OR receipt filters vs indexed equality.
 * Isolates predicates only: identical owner, PvP-only projection, ordering and limit.
 * Explicit operator invocation; CI uses a stub and never queries production D1.
 */
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const projection=`SELECT r.match_id,r.mode,r.game,r.outcome,r.occurred_at,
 NULL AS daily_day FROM kp_duel_progress_receipts r
 WHERE r.guild=? AND r.user=? AND r.applied_at IS NOT NULL`;
const order=' ORDER BY r.occurred_at DESC,r.match_id DESC LIMIT ?';
export const oldSql=projection+`
 AND (?='all' OR r.mode=?) AND (?='all' OR r.game=?)`+order;
export const newSql=projection+`
 AND r.mode=? AND r.game=?`+order;

export async function compareReceiptFilters(env=process.env,request=fetch){
 const {CLOUDFLARE_ACCOUNT_ID:account,CLOUDFLARE_API_TOKEN:token,D1_DATABASE_ID:database,
 DUEL_EVIDENCE_GUILD:guild,DUEL_EVIDENCE_USER:user}=env;
 if(!/^[0-9a-f]{32}$/i.test(account??'')||!/^[0-9a-f-]{36}$/i.test(database??'')||
 !token||!/^[0-9]{15,22}$/.test(guild??'')||!/^[0-9]{15,22}$/.test(user??''))
  throw Error('Invalid read-only D1 evidence configuration');
 const mode='pvp',game='trio',limit=20;
 async function query(sql,params){
  const response=await request(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`,{
   method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('D1 evidence request unavailable');
  const data=await response.json(),result=data.result?.[0];
  if(data.success!==true||result?.success!==true||!Array.isArray(result.results)||
   !Number.isSafeInteger(result.meta?.rows_read)||result.meta.rows_read<0)
   throw Error('D1 Rows read evidence is incomplete');
  return {rows:result.results,rowsRead:result.meta.rows_read};
 }
 const before=await query(oldSql,[guild,user,mode,mode,game,game,limit]);
 const after=await query(newSql,[guild,user,mode,game,limit]);
 // Never emit match IDs, user IDs, SQL result rows or authorization headers.
 if(JSON.stringify(before.rows)!==JSON.stringify(after.rows))
  throw Error('Different receipt results; evidence rejected');
 return {slice:'#833',mode,game,limit,rowsCompared:before.rows.length,
  legacyRowsRead:before.rowsRead,indexableRowsRead:after.rowsRead,
  sameResults:true,productionTrafficRowsSaved:'unmeasured',
  note:'Same-owner two SELECT counterfactual only; live workload/call frequency and savings unmeasured'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 compareReceiptFilters().then(r=>console.log('DUEL_P12_833_FILTER_EVIDENCE',JSON.stringify(r)))
 .catch(e=>{console.error('DUEL_P12_833_FILTER_EVIDENCE_ERROR: '+e.message);process.exitCode=1;});
