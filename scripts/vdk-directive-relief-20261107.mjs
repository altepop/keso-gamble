// One-time, owner-authorized recovery: complete VDK's active solo Death Unrated directive.
// The permission issue prevented /death start. This does not change match results or KP balances.
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {D1_B_ID} from './relic-abuse-audit.mjs';
export const VDK_DISCORD_ID='822082339776495616';
const TASK='solo_death_unrated';
const ACTIVE_SQL="SELECT id,guild,target,task,status FROM kp_directives WHERE target=? AND status='active' LIMIT 2";
const LATEST_SQL="SELECT task,status FROM kp_directives WHERE target=? ORDER BY at DESC LIMIT 1";
const UPDATE_SQL="UPDATE kp_directives SET status='completed' WHERE id=? AND guild=? AND target=? AND task=? AND status='active'";
const VERIFY_SQL="SELECT status,task,target FROM kp_directives WHERE id=? AND guild=?";
export async function completeVdkSoloDeathDirective(query) {
  const active=(await query(ACTIVE_SQL,[VDK_DISCORD_ID])).rows;
  if(!Array.isArray(active)||active.length>1)throw Error('Ambiguous active directives; refusing update');
  if(!active.length){
    const last=(await query(LATEST_SQL,[VDK_DISCORD_ID])).rows?.[0];
    if(last?.task===TASK&&last.status==='completed')return 'already_completed';
    throw Error('No matching active solo-death-unrated directive; no changes made');
  }
  const row=active[0];
  if(row.target!==VDK_DISCORD_ID||row.task!==TASK||row.status!=='active'
    ||typeof row.id!=='string'||!row.id||typeof row.guild!=='string'||!row.guild)
    throw Error('Current active directive differs from the authorized target and task');
  const changed=await query(UPDATE_SQL,[row.id,row.guild,VDK_DISCORD_ID,TASK]);
  if(changed.meta?.changes!==1)throw Error('Concurrent update: conditional completion did not affect exactly one row');
  const after=(await query(VERIFY_SQL,[row.id,row.guild])).rows;
  if(after?.length!==1||after[0].status!=='completed'||after[0].task!==TASK||after[0].target!==VDK_DISCORD_ID)
    throw Error('Completion was not verified');
  return 'completed';
}
export async function cloudflareQuery(sql,params,env=process.env,request=fetch){
  if(![ACTIVE_SQL,LATEST_SQL,UPDATE_SQL,VERIFY_SQL].includes(sql))throw Error('Unapproved SQL');
  if(!env.CLOUDFLARE_API_TOKEN||!/^[0-9a-f]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID??''))
    throw Error('Cloudflare credentials unavailable');
  const url='https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+D1_B_ID+'/query';
  const r=await request(url,{method:'POST',headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},
    body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('D1 HTTP '+r.status);
  const body=await r.json(),value=body.result?.[0];
  if(body.success!==true||value?.success!==true)throw Error('D1 query failed');
  return {rows:value.results??[],meta:value.meta??{}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const state=await completeVdkSoloDeathDirective((sql,params)=>cloudflareQuery(sql,params));
  const summary=state==='completed'?'✅ VDK solo-death-unrated directive completed (0 KP transferred).'
    :'✅ VDK solo-death-unrated directive was already complete (no changes).';
  console.log(summary);
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary+'\n');
}
