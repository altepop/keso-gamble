/** #832: read-only counterfactual of the public-board list JOIN condition.
 * Identical projection, guild/user filter, sort and LIMIT. Only ON predicate differs.
 * Explicit authenticated operator execution; no production D1 in CI.
 */
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const select=`SELECT d.*,
 CASE WHEN d.black_user=? THEN json_extract(s.data,'$.privateA')
 ELSE json_extract(s.data,'$.privateB') END AS private_hand
 FROM kp_board_duels d LEFT JOIN kp_board_duel_secrets s
 ON s.guild=d.guild AND s.id=d.id`;
const suffix=` WHERE d.guild=? AND (d.user_a=? OR d.user_b=?)
 AND d.game IN ('othello','gomoku','connect4','trio')
 ORDER BY d.updated_at DESC,d.id DESC LIMIT 20`;
export const legacySql=select+suffix;
export const guardedSql=select+` AND d.game IN ('hitblow','bluffdice','poker')`+suffix;
export async function collectPublicListEvidence(env=process.env,request=fetch){
 const {CLOUDFLARE_ACCOUNT_ID:account,CLOUDFLARE_API_TOKEN:token,D1_DATABASE_ID:db,
 DUEL_EVIDENCE_GUILD:guild,DUEL_EVIDENCE_USER:user}=env;
 if(!/^[a-f0-9]{32}$/i.test(account??'')||!/^[a-f0-9-]{36}$/i.test(db??'')||
 !token||!/^[0-9]{15,22}$/.test(guild??'')||!/^[0-9]{15,22}$/.test(user??''))
 throw Error('Invalid read-only evidence configuration');
 const params=[user,guild,user,user];
 async function query(sql){
  const response=await request(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${db}/query`,{
   method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('Read-only D1 request failed');
  const payload=await response.json(),r=payload.result?.[0];
  if(!payload.success||!r?.success||!Array.isArray(r.results)||
   !Number.isSafeInteger(r.meta?.rows_read)||r.meta.rows_read<0)
   throw Error('Invalid D1 rows-read evidence');
  return {rows:r.results,read:r.meta.rows_read};
 }
 const old=await query(legacySql),guarded=await query(guardedSql);
 if(JSON.stringify(old.rows)!==JSON.stringify(guarded.rows))
  throw Error('Public list results differ; reject evidence');
 return {slice:'#832',scope:'public board games only',limit:20,comparedRows:old.rows.length,
  legacyRowsRead:old.read,guardedRowsRead:guarded.read,sameResults:true,
  productionTrafficRowsSaved:'unmeasured',
  note:'Manual read-only two-query counterfactual, not observed production savings; game filter isolates public rows'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 collectPublicListEvidence().then(x=>console.log('DUEL_P12_832_PUBLIC_JOIN_EVIDENCE',JSON.stringify(x)))
 .catch(e=>{console.error('DUEL_P12_832_EVIDENCE_ERROR',e.message);process.exitCode=1;});
