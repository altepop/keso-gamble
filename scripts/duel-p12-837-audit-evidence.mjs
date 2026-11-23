/** #837 P12 readonly same-guild PvP retention audit counterfactual.
 * Fixed time boundary; compare the original SUM(CASE) aggregate with indexed
 * scalar COUNT subqueries. Never run automatically against production D1.
 */
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
export const legacySql=`SELECT
 COALESCE(SUM(CASE WHEN status IN ('finished','cancelled') AND updated_at<? THEN 1 ELSE 0 END),0) AS stale,
 COALESCE(SUM(CASE WHEN status IN ('active','pending') THEN 1 ELSE 0 END),0) AS active
 FROM kp_board_duels WHERE guild=?`;
export const indexedSql=`SELECT
 (SELECT COUNT(*) FROM kp_board_duels
  WHERE guild=? AND status IN ('finished','cancelled') AND updated_at<?) AS stale,
 (SELECT COUNT(*) FROM kp_board_duels
  WHERE guild=? AND status IN ('active','pending')) AS active`;
const fullDay=86_400_000;
export async function comparePvpAuditCounts(env=process.env,request=fetch){
 const {CLOUDFLARE_ACCOUNT_ID:account,CLOUDFLARE_API_TOKEN:token,D1_DATABASE_ID:database,
 DUEL_EVIDENCE_GUILD:guild,DUEL_EVIDENCE_NOW_MS:clock}=env;
 const now=Number(clock),threshold=now-30*fullDay;
 if(!/^[a-f0-9]{32}$/i.test(account??'')||!/^[a-f0-9-]{36}$/i.test(database??'')||
  !token||!/^[0-9]{15,22}$/.test(guild??'')||
  !Number.isSafeInteger(now)||now<30*fullDay||!Number.isSafeInteger(threshold))
  throw Error('Invalid read-only evidence configuration');
 async function query(sql,params){
  const res=await request(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`,{
   method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)});
  if(!res.ok)throw Error('Read-only D1 query unavailable');
  const data=await res.json(),r=data.result?.[0];
  if(data.success!==true||r?.success!==true||!Array.isArray(r.results)||
   r.results.length!==1||!Number.isSafeInteger(r.meta?.rows_read)||r.meta.rows_read<0)
   throw Error('Incomplete D1 read-only evidence');
  const row=r.results[0];
  if(!Number.isSafeInteger(row?.stale)||row.stale<0||!Number.isSafeInteger(row?.active)||row.active<0)
   throw Error('Invalid aggregate counters');
  return {row:{stale:row.stale,active:row.active},rowsRead:r.meta.rows_read};
 }
 const old=await query(legacySql,[threshold,guild]);
 const current=await query(indexedSql,[guild,threshold,guild]);
 if(old.row.stale!==current.row.stale||old.row.active!==current.row.active)
  throw Error('PvP audit count mismatch; evidence rejected');
 return {slice:'#837',retentionDays:30,matchingCounters:true,
  legacyRowsRead:old.rowsRead,indexedRowsRead:current.rowsRead,
  productionTrafficRowsSaved:'unmeasured',
  note:'Read-only same-guild same-cutoff pair, not a measurement of production workload or savings'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 comparePvpAuditCounts().then(r=>console.log('DUEL_P12_837_AUDIT_EVIDENCE',JSON.stringify(r)))
 .catch(e=>{console.error('DUEL_P12_837_AUDIT_EVIDENCE_ERROR: '+e.message);process.exitCode=1;});
