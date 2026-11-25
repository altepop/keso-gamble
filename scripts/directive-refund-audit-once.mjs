// One-shot, bounded, SELECT-only historical directive refund evidence.
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {D1_B_ID} from './relic-abuse-audit.mjs';
const H=3600000, LIMIT=200;
export const DIRECTIVES_SQL=`SELECT d.id,d.guild,d.issuer,d.target,d.task,d.cost,d.status,d.at,a.riot,
 p.delta AS paid,p.guild AS paid_guild,p.user AS paid_user,
 r1.delta AS refund1,r2.delta AS refund2
 FROM kp_directives d
 LEFT JOIN kp_accounts a ON a.guild=d.guild AND a.user=d.target
 LEFT JOIN kp_ledger p ON p.id='op:'||d.id
 LEFT JOIN kp_ledger r1 ON r1.id='directive-refund-1:'||d.id
 LEFT JOIN kp_ledger r2 ON r2.id='directive-refund-2:'||d.id
 ORDER BY d.at,d.id LIMIT 201`;
export const MATCH_SQL=`SELECT n.ended_at,n.match_id,e.id AS receipt
 FROM notifications n LEFT JOIN kp_events e ON e.guild=? AND e.user=? AND e.match=n.match_id AND e.mode=n.mode
 WHERE n.riot_id=? AND n.mode=? AND n.ended_at>? AND n.ended_at<=?
 ORDER BY n.ended_at,n.match_id LIMIT 1`;
const due=(cost,elapsed)=>elapsed>=48*H?cost:elapsed>=24*H?Math.floor(cost/2):0;
export async function auditDirectives(query,now=Date.now()){
 const rows=await query(DIRECTIVES_SQL,[]);
 if(rows.length>LIMIT)throw Error('Directive count exceeds bounded one-shot audit; no partial total');
 const report={total:rows.length,active:0,activeEligible:0,activePendingKP:0,completed:0,completedCandidateKP:0,completedCandidates:0,completedUnder24h:0,held:0,alreadyRefundedKP:0,byIssuer:{}};
 const reasons={};
 const hold=reason=>{report.held++;reasons[reason]=(reasons[reason]??0)+1;};
 for(const [i,d] of rows.entries()){
  const active=d.status==='active',completed=d.status==='completed';
  if(active)report.active++;else if(completed)report.completed++;
  if(!Number.isSafeInteger(d.cost)||d.cost<=0||!Number.isSafeInteger(d.at)||d.at<=0||d.at>now||d.paid!==-d.cost||d.paid_guild!==d.guild||d.paid_user!==d.issuer){hold('payment-or-time-unverified');continue;}
  const half=Math.floor(d.cost/2),a=d.refund1??0,b=d.refund2??0;
  if((d.refund1!==null&&d.refund1!==half)||(d.refund2!==null&&d.refund2!==d.cost-half)){hold('refund-receipt-conflict');continue;}
  const paid=a+b;report.alreadyRefundedKP+=paid;
  const issuer='…'+String(d.issuer).slice(-4);
  const totals=report.byIssuer[issuer]??={activePendingKP:0,completedCandidateKP:0};
  if(active){const amount=Math.max(0,due(d.cost,now-d.at)-paid);if(amount){report.activeEligible++;report.activePendingKP+=amount;totals.activePendingKP+=amount;}continue;}
  if(!completed){hold('unknown-status');continue;}
  if(!d.riot||!['competitive','unrated','solo_competitive','solo_death_unrated'].includes(d.task)){hold('missing-account-or-task');continue;}
  const mode=d.task==='solo_competitive'?'competitive':d.task==='solo_death_unrated'?'unrated':d.task;
  const next=rows.slice(i+1).find(r=>r.guild===d.guild&&r.target===d.target);
  if(next&&next.at<=d.at){hold('ambiguous-order');continue;}
  const [match]=await query(MATCH_SQL,[d.guild,d.target,d.riot,mode,d.at,next?.at??now]);
  if(!match||!match.receipt||!Number.isSafeInteger(match.ended_at)){hold('no-verified-match-candidate');continue;}
  // A notification/receipt proves a match ended, NOT the legacy directive completion.
  // No historic start/party/reservation proof is inferred and no KP is paid here.
  const amount=Math.max(0,due(d.cost,match.ended_at-d.at)-paid);
  if(amount){report.completedCandidates++;report.completedCandidateKP+=amount;totals.completedCandidateKP+=amount;}
  else report.completedUnder24h++;
  hold(d.task.startsWith('solo_')?'solo-or-death-proof-required':'legacy-completion-proof-required');
 }
 return {...report,heldReasons:reasons};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const e=process.env;if(!e.CLOUDFLARE_API_TOKEN||!/^[0-9a-f]{32}$/i.test(e.CLOUDFLARE_ACCOUNT_ID??''))throw Error('Cloudflare credentials unavailable');
 let reads=0,calls=0;
 const query=async(sql,params)=>{
  if(![DIRECTIVES_SQL,MATCH_SQL].includes(sql))throw Error('read-only SQL allowlist');
  const res=await fetch('https://api.cloudflare.com/client/v4/accounts/'+e.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+D1_B_ID+'/query',{method:'POST',headers:{Authorization:'Bearer '+e.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)});
  const body=await res.json();const result=body.result?.[0];if(!res.ok||body.success!==true||result?.success!==true)throw Error('D1 audit failed HTTP '+res.status);
  if(!Number.isFinite(result.meta?.rows_read))throw Error('Missing read metric');
  reads+=result.meta.rows_read;calls++;if(reads>20000)throw Error('One-shot read budget exceeded; stop');
  return result.results??[];
 };
 const report=await auditDirectives(query);const summary=JSON.stringify({...report,rowsRead:reads,queries:calls});
 console.log('DIRECTIVE_REFUND_AUDIT '+summary);
 if(e.GITHUB_STEP_SUMMARY)appendFileSync(e.GITHUB_STEP_SUMMARY,'# One-shot directive refund audit (no writes)\n\n```json\n'+summary+'\n```\n');
}
