// One-time owner-approved half-price relief for the four unresolved historical directives.
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {D1_B_ID} from './relic-abuse-audit.mjs';
import {CUTOFF,SNAPSHOT,VERIFY,planRefunds} from './directive-retro-refund-once.mjs';
export const AUDIT_TIME=Date.parse('2026-11-25T13:52:06.471Z');
const caps={'manual-or-transferred':2,'history-coverage':1,'competitive-start-proof':1};
export function planRelief(rows){
 if(!Array.isArray(rows)||rows.length>200)throw Error('Historical scope bound');
 const plan=[],counts={},report={eligible:0,alreadyRelieved:0,plannedKP:0,byIssuer:{},reasons:counts};
 for(const d of rows){
  const {report:r}=planRefunds([d],AUDIT_TIME);
  const reason=Object.keys(r.heldReasons)[0];
  if(!Object.hasOwn(caps,reason))continue;
  // No fictitious completion timestamps. Existing valid stage receipts are sufficient relief.
  counts[reason]=(counts[reason]??0)+1;
  if(counts[reason]>caps[reason])throw Error('Historical scope changed; no payout');
  if(d.r1!==null||d.r2!==null){report.alreadyRelieved++;continue;}
  const amount=Math.floor(d.cost/2);if(amount<=0)continue;
  plan.push({id:d.id,guild:d.guild,issuer:d.issuer,target:d.target,task:d.task,at:d.at,cost:d.cost,stage:1,amount});
  report.eligible++;report.plannedKP+=amount;
  const who='…'+String(d.issuer).slice(-4);report.byIssuer[who]=(report.byIssuer[who]??0)+amount;
 }
 if(Object.keys(caps).some(k=>counts[k]!==caps[k]))throw Error('Historical four-row scope mismatch; no payout');
 return {plan,report};
}
export const APPLY_RELIEF=`WITH proposed AS (SELECT value AS p FROM json_each(?))
 INSERT OR IGNORE INTO kp_ledger(id,guild,user,delta,kind,at)
 SELECT 'directive-refund-1:'||d.id,d.guild,d.issuer,CAST(d.cost/2 AS INTEGER),'directive-refund',?
 FROM proposed JOIN kp_directives d ON d.id=json_extract(p,'$.id')
 JOIN kp_ledger paid ON paid.id='op:'||d.id AND paid.guild=d.guild AND paid.user=d.issuer AND paid.delta=-d.cost
 WHERE d.status='completed' AND d.guild=json_extract(p,'$.guild') AND d.issuer=json_extract(p,'$.issuer')
 AND d.target=json_extract(p,'$.target') AND d.task=json_extract(p,'$.task') AND d.at=json_extract(p,'$.at')
 AND d.cost=json_extract(p,'$.cost') AND d.at<? AND d.cost>=2
 AND NOT EXISTS(SELECT 1 FROM kp_ledger z WHERE z.id IN ('directive-refund-1:'||d.id,'directive-refund-2:'||d.id))
 RETURNING id,guild,user,delta,kind`;
export async function runRelief(query,now=Date.now(),apply=false){
 const {plan,report}=planRelief(await query(SNAPSHOT,[CUTOFF,AUDIT_TIME,AUDIT_TIME]));
 if(!apply||!plan.length)return {...report,appliedKP:0,verifiedKP:0,mode:apply?'apply':'dry-run'};
 const payload=JSON.stringify(plan);
 const inserted=await query(APPLY_RELIEF,[payload,now,CUTOFF]),checked=await query(VERIFY,[payload]);
 if(checked.length!==plan.length||checked.some(r=>{const p=JSON.parse(r.proposal);return r.delta!==p.amount||r.guild!==p.guild||r.user!==p.issuer||r.kind!=='directive-refund';}))throw Error('Relief verification failed; check receipts before retry');
 return {...report,mode:'apply',appliedKP:inserted.reduce((s,r)=>s+r.delta,0),verifiedKP:checked.reduce((s,r)=>s+r.delta,0),insertedRows:inserted.length,verifiedRows:checked.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const env=process.env;if(!env.CLOUDFLARE_API_TOKEN||!/^[0-9a-f]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID??''))throw Error('Cloudflare credentials unavailable');
 const apply=env.APPLY_HALF_RELIEF==='2026-11-25-owner-approved';let reads=0,calls=0;
 const query=async(sql,params)=>{
  if(![SNAPSHOT,VERIFY,...(apply?[APPLY_RELIEF]:[])].includes(sql))throw Error('SQL not authorized');
  const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+D1_B_ID+'/query',{method:'POST',headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(30000)});
  const b=await response.json(),v=b.result?.[0];if(!response.ok||b.success!==true||v?.success!==true)throw Error('D1 relief request failed HTTP '+response.status);
  reads+=Number(v.meta?.rows_read??0);calls++;
  if(sql===SNAPSHOT&&(!Number.isFinite(v.meta?.rows_read)||reads>20000))throw Error('Read budget exceeded before payout');
  return v.results??[];
 };
 const result=await runRelief(query,Date.now(),apply),summary=JSON.stringify({...result,rowsRead:reads,queries:calls});
 console.log('DIRECTIVE_HALF_RELIEF '+summary);
 if(env.GITHUB_STEP_SUMMARY)appendFileSync(env.GITHUB_STEP_SUMMARY,'# One-time half relief\n\n```json\n'+summary+'\n```\n');
}
