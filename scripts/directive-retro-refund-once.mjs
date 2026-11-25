// User-approved one-off historical directive refunds. No schedule, no wallet UPDATE.
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {D1_B_ID} from './relic-abuse-audit.mjs';
import {VDK_DISCORD_ID} from './vdk-directive-relief-20261107.mjs';
const H=3600000;
export const CUTOFF=Date.parse('2026-11-25T13:38:25Z');
export const SNAPSHOT=`WITH candidates AS (
 SELECT d.*,a.riot,a.puuid,a.linked_at,t.since AS tracked_since,
 p.delta AS paid,p.guild AS paid_guild,p.user AS paid_user,
 r1.delta AS r1,r1.guild AS r1guild,r1.user AS r1user,r1.kind AS r1kind,
 r2.delta AS r2,r2.guild AS r2guild,r2.user AS r2user,r2.kind AS r2kind,
 c.ended_at AS exact_end,c.match_id AS exact_match,
 x.directive_id AS transferred,
 (SELECT MIN(z.at) FROM kp_directives z WHERE z.guild=d.guild AND z.target=d.target AND z.at>d.at) AS next_at
 FROM kp_directives d
 LEFT JOIN kp_accounts a ON a.guild=d.guild AND a.user=d.target
 LEFT JOIN tracked_players t ON t.riot_id=a.riot AND t.puuid=a.puuid
 LEFT JOIN kp_ledger p ON p.id='op:'||d.id
 LEFT JOIN kp_ledger r1 ON r1.id='directive-refund-1:'||d.id
 LEFT JOIN kp_ledger r2 ON r2.id='directive-refund-2:'||d.id
 LEFT JOIN kp_directive_completions c ON c.directive_id=d.id
 LEFT JOIN kp_directive_transfers x ON x.directive_id=d.id
 WHERE d.status='completed' AND d.at<? ORDER BY d.at,d.id LIMIT 201
 ), first_match AS (
 SELECT d.*,(SELECT n.match_id FROM notifications n WHERE n.riot_id=d.riot
 AND n.mode=CASE WHEN d.task IN ('competitive','solo_competitive') THEN 'competitive' ELSE 'unrated' END
 AND n.ended_at>d.at AND n.ended_at<=COALESCE(d.next_at,?)
 ORDER BY n.ended_at,n.match_id LIMIT 1) AS first_match
 FROM candidates d
 )
 SELECT d.*,n.ended_at AS first_end,e.id AS match_receipt,e.at AS receipt_at,
 q.started_at AS match_start,r.ended_at AS archive_end,r.players_json AS players,
 s.armed_at AS death_armed,
 EXISTS(SELECT 1 FROM kp_events k LEFT JOIN notifications v ON v.riot_id=d.riot AND v.match_id=k.match
 WHERE k.guild=d.guild AND k.user=d.target AND k.mode=CASE WHEN d.task IN ('competitive','solo_competitive') THEN 'competitive' ELSE 'unrated' END
 AND k.at>=d.at AND k.at<=COALESCE(d.next_at,?) AND (v.match_id IS NULL OR v.ended_at IS NULL OR v.mode!=k.mode)) AS missing_notice
 FROM first_match d LEFT JOIN notifications n ON n.riot_id=d.riot AND n.match_id=d.first_match
 LEFT JOIN kp_events e ON e.id=d.guild||':'||d.first_match||':'||d.puuid AND e.guild=d.guild AND e.user=d.target AND e.puuid=d.puuid AND e.match=d.first_match AND e.mode=n.mode
 LEFT JOIN coach_member_queue q ON q.match_id=d.first_match
 LEFT JOIN valorant_match_rosters r ON r.match_id=d.first_match
 LEFT JOIN death_unrated_sessions s ON s.riot_id=d.riot AND s.match_id=d.first_match AND s.cancelled_at IS NULL AND s.armed_at>=d.at
 AND COALESCE((SELECT value FROM monitor_state WHERE key='death_mode:'||s.session_id||':'||s.riot_id),'unrated')='unrated'`;
const validTime=v=>Number.isSafeInteger(v)&&v>0;
const stages=d=>[{stage:1,amount:Math.floor(d.cost/2),existing:d.r1},{stage:2,amount:d.cost-Math.floor(d.cost/2),existing:d.r2}];
function soloProof(d){
 try{const players=JSON.parse(d.players);if(!Array.isArray(players)||players.length!==10)return false;
 const p=players.find(x=>x.puuid===d.puuid);
 return !!p?.party_id&&players.filter(x=>x.team_id===p.team_id).length===5&&players.filter(x=>x.team_id===p.team_id).every(x=>typeof x.party_id==='string'&&x.party_id.length>0)&&players.filter(x=>x.party_id===p.party_id).length===1;
 }catch{return false;}
}
export function planRefunds(rows,now){
 if(!Array.isArray(rows)||rows.length>200)throw Error('Historical audit exceeds bounded scope');
 const plan=[],report={completed:rows.length,eligible:0,held:0,under24h:0,alreadyPaidKP:0,plannedKP:0,byIssuer:{},heldReasons:{},evidence:{exact:0,legacy:0}};
 const hold=r=>{report.held++;report.heldReasons[r]=(report.heldReasons[r]??0)+1;};
 for(const d of rows){
  if(d.status!=='completed'||!validTime(d.at)||d.at>=CUTOFF||!Number.isSafeInteger(d.cost)||d.cost<=0||d.paid!==-d.cost||d.paid_guild!==d.guild||d.paid_user!==d.issuer){hold('payment-or-status');continue;}
  if(stages(d).some(s=>s.existing!==null&&(s.existing!==s.amount||d['r'+s.stage+'guild']!==d.guild||d['r'+s.stage+'user']!==d.issuer||d['r'+s.stage+'kind']!=='directive-refund'))){hold('receipt-conflict');continue;}
  report.alreadyPaidKP+=(d.r1??0)+(d.r2??0);
  let end,kind;
  if(validTime(d.exact_end)&&d.exact_match&&d.exact_end>=d.at&&d.exact_end<=now){end=d.exact_end;kind='exact';}
  else{
   // Known one-time manual completion has no trustworthy match completion time.
   if(d.transferred||d.task==='solo_death_unrated'&&d.target===VDK_DISCORD_ID){hold('manual-or-transferred');continue;}
   if(!['competitive','unrated','solo_competitive','solo_death_unrated'].includes(d.task)||!d.riot||!d.puuid||!validTime(d.linked_at)||d.linked_at>d.at||!validTime(d.tracked_since)||d.tracked_since>d.at||d.missing_notice!==0){hold('history-coverage');continue;}
   if(!validTime(d.first_end)||d.first_end<=d.at||d.first_end>Math.min(now,d.next_at??now)||!d.match_receipt||!validTime(d.receipt_at)||d.receipt_at<d.first_end-60000){hold('missing-match-evidence');continue;}
   // The earliest recorded matching-mode finish is a conservative lower bound,
   // not a fabricated legacy completion timestamp. Confirm start and party when available.
   if(d.task==='competitive'||d.task==='solo_competitive'){
    if(!validTime(d.match_start)||d.match_start<d.at||d.match_start>=d.first_end||d.archive_end!==d.first_end){hold('competitive-start-proof');continue;}
    if(d.task==='solo_competitive'&&!soloProof(d)){hold('solo-proof');continue;}
   }else if(d.task==='solo_death_unrated'){
    // Unrated party data is not retained in this archive. Never infer solo.
    hold('unrated-solo-proof-unavailable');continue;
   }else{
    // Standard unrated start is not stored; only a bound of zero can be safely established.
    hold('unrated-start-proof-unavailable');continue;
   }
   end=d.first_end;kind='legacy';
  }
  const elapsed=end-d.at;
  if(elapsed<24*H){report.under24h++;continue;}
  const pending=stages(d).filter(s=>s.existing===null&&s.amount>0&&elapsed>=s.stage*24*H);
  if(!pending.length)continue;
  report.eligible++;report.evidence[kind]++;
  for(const s of pending){plan.push({id:d.id,guild:d.guild,issuer:d.issuer,target:d.target,task:d.task,at:d.at,cost:d.cost,stage:s.stage,amount:s.amount,kind,end});report.plannedKP+=s.amount;const who='…'+String(d.issuer).slice(-4);report.byIssuer[who]=(report.byIssuer[who]??0)+s.amount;}
 }
 return {plan,report};
}
// One atomic statement rechecks the exact original debit and immutable directive snapshot.
export const APPLY=`WITH proposed AS (SELECT value AS p FROM json_each(?))
 INSERT OR IGNORE INTO kp_ledger(id,guild,user,delta,kind,at)
 SELECT 'directive-refund-'||json_extract(p,'$.stage')||':'||d.id,d.guild,d.issuer,
 CASE json_extract(p,'$.stage') WHEN 1 THEN CAST(d.cost/2 AS INTEGER) ELSE d.cost-CAST(d.cost/2 AS INTEGER) END,'directive-refund',?
 FROM proposed JOIN kp_directives d ON d.id=json_extract(p,'$.id')
 JOIN kp_ledger paid ON paid.id='op:'||d.id AND paid.guild=d.guild AND paid.user=d.issuer AND paid.delta=-d.cost
 WHERE d.status='completed' AND d.guild=json_extract(p,'$.guild') AND d.issuer=json_extract(p,'$.issuer')
 AND d.target=json_extract(p,'$.target') AND d.task=json_extract(p,'$.task') AND d.at=json_extract(p,'$.at') AND d.cost=json_extract(p,'$.cost')
 AND d.at<? AND json_extract(p,'$.stage') IN (1,2) AND json_extract(p,'$.end')-d.at>=86400000*json_extract(p,'$.stage')
 AND (json_extract(p,'$.kind')='exact' AND EXISTS(SELECT 1 FROM kp_directive_completions c WHERE c.directive_id=d.id AND c.ended_at=json_extract(p,'$.end'))
 OR json_extract(p,'$.kind')='legacy' AND NOT EXISTS(SELECT 1 FROM kp_directive_transfers x WHERE x.directive_id=d.id))
 AND NOT EXISTS(SELECT 1 FROM kp_ledger z WHERE z.id='directive-refund-'||json_extract(p,'$.stage')||':'||d.id)
 RETURNING id,guild,user,delta,kind`;
export const VERIFY=`SELECT p.value AS proposal,l.delta,l.guild,l.user,l.kind FROM json_each(?) p
 LEFT JOIN kp_ledger l ON l.id='directive-refund-'||json_extract(p.value,'$.stage')||':'||json_extract(p.value,'$.id')`;
export async function runOnce(query,now=Date.now(),apply=false){
 const rows=await query(SNAPSHOT,[CUTOFF,now,now]);const {plan,report}=planRefunds(rows,now);
 if(!apply||!plan.length)return {...report,appliedKP:0,verifiedKP:0,mode:apply?'apply':'dry-run'};
 if(plan.length>400)throw Error('Refund row bound exceeded');
 const payload=JSON.stringify(plan),inserted=await query(APPLY,[payload,now,CUTOFF]),checked=await query(VERIFY,[payload]);
 if(checked.length!==plan.length||checked.some(r=>{const p=JSON.parse(r.proposal);return r.delta!==p.amount||r.guild!==p.guild||r.user!==p.issuer||r.kind!=='directive-refund';}))throw Error('Refund ledger verification failed; inspect receipts before retry');
 return {...report,mode:'apply',appliedKP:inserted.reduce((s,r)=>s+r.delta,0),verifiedKP:checked.reduce((s,r)=>s+r.delta,0),insertedRows:inserted.length,verifiedRows:checked.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const env=process.env;if(!env.CLOUDFLARE_API_TOKEN||!/^[0-9a-f]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID??''))throw Error('Cloudflare credentials unavailable');
 let reads=0,calls=0;
 const apply=env.APPLY_RETRO_REFUNDS==='2026-11-25-owner-approved';
 const query=async(sql,params)=>{
  if(![SNAPSHOT,VERIFY,...(apply?[APPLY]:[])].includes(sql))throw Error('SQL not authorized');
  const res=await fetch('https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+D1_B_ID+'/query',{method:'POST',headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(30000)});
  const b=await res.json(),v=b.result?.[0];if(!res.ok||b.success!==true||v?.success!==true)throw Error('D1 refund request failed HTTP '+res.status);
  calls++;reads+=Number(v.meta?.rows_read??0);
  if(sql===SNAPSHOT&&(!Number.isFinite(v.meta?.rows_read)||reads>20000))throw Error('Read budget exceeded before any payout');
  return v.results??[];
 };
 const report=await runOnce(query,Date.now(),apply);
 const summary=JSON.stringify({...report,rowsRead:reads,queries:calls});
 console.log('DIRECTIVE_RETRO_REFUND '+summary);
 if(env.GITHUB_STEP_SUMMARY)appendFileSync(env.GITHUB_STEP_SUMMARY,'# Historical directive refund\n\n```json\n'+summary+'\n```\n');
}
