/** #827 isolated read-only counterfactual: original PvP receipt daily JOIN vs JOIN omitted.
 * Uses the same owner, mode, game, ORDER BY and LIMIT. This tests the JOIN only;
 * it intentionally does NOT adopt #833's later equality-filter optimization.
 * Explicit invocation only; never run on CI against production D1.
 */
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const projection='SELECT r.match_id,r.mode,r.game,r.outcome,r.occurred_at,';
const where=` WHERE r.guild=? AND r.user=? AND r.applied_at IS NOT NULL
     AND (?='all' OR r.mode=?) AND (?='all' OR r.game=?)
   ORDER BY r.occurred_at DESC,r.match_id DESC LIMIT ?`;
export const legacySql=`${projection}
   CASE WHEN d.session_id IS NOT NULL THEN d.jst_day ELSE NULL END AS daily_day
   FROM kp_duel_progress_receipts r
   LEFT JOIN kp_duel_pve_daily_entries d ON d.guild=r.guild AND d.user=r.user AND d.session_id=r.match_id
   ${where}`;
export const noJoinSql=`${projection}
   NULL AS daily_day
   FROM kp_duel_progress_receipts r
   ${where}`;

export async function measureJoinEvidence(env=process.env,request=fetch){
 const {CLOUDFLARE_ACCOUNT_ID:account,CLOUDFLARE_API_TOKEN:token,D1_DATABASE_ID:db,
  DUEL_EVIDENCE_GUILD:guild,DUEL_EVIDENCE_USER:user}=env;
 if(!/^[a-f0-9]{32}$/i.test(account??'')||!/^[a-f0-9-]{36}$/i.test(db??'')||
    !token||!/^[0-9]{15,22}$/.test(guild??'')||!/^[0-9]{15,22}$/.test(user??''))
  throw Error('Invalid read-only evidence configuration');
 const params=[guild,user,'pvp','pvp','all','all',20];
 async function query(sql){
  const res=await request(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${db}/query`,{
   method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)
  });
  if(!res.ok)throw Error('D1 read-only evidence request failed');
  const json=await res.json(),r=json.result?.[0];
  if(!json.success||!r?.success||!Array.isArray(r.results)||
      !Number.isSafeInteger(r.meta?.rows_read)||r.meta.rows_read<0)
   throw Error('Missing valid D1 rows-read evidence');
  return {rows:r.results,rowsRead:r.meta.rows_read};
 }
 const old=await query(legacySql),omitted=await query(noJoinSql);
 // No private IDs or returned records are included in output.
 const parity=JSON.stringify(old.rows)===JSON.stringify(omitted.rows);
 if(!parity)throw Error('PvP receipt results mismatch; evidence rejected');
 return {slice:'#827',mode:'pvp',game:'all',limit:20,rowsCompared:old.rows.length,
  legacyJoinRowsRead:old.rowsRead,omittedJoinRowsRead:omitted.rowsRead,
  sameResults:true,productionTrafficRowsSaved:'unmeasured',
  note:'Two explicit read-only counterfactual SELECTs, not a measured before/after production workload; #833 filter optimization excluded'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 measureJoinEvidence().then(x=>console.log('DUEL_P12_827_JOIN_EVIDENCE',JSON.stringify(x)))
 .catch(e=>{console.error('DUEL_P12_827_JOIN_EVIDENCE_ERROR',e.message);process.exitCode=1;});
