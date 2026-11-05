// One-off owner-approved correction: a Spike Rush Controller win that the monitor missed (the match data never
// arrived from the match API) is put back at the START of the member's current Controller streak.
// Only the streak bookkeeping in spike_profiles changes; no KP, ledger or reward rows are touched.
// Compare-and-set on spike_profiles.version, so a settlement running at the same moment cannot be overwritten.
import {readFileSync,appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export const D1_B_ID='bf23ab40-814f-4626-9e0b-36739ac41750';
const roster=JSON.parse(readFileSync(new URL('../services/valorant-results/spikerush-roster.json',import.meta.url),'utf8'));
const REQUIRED=7;
export function corrected(data,agentId){
 const p=JSON.parse(data),t=p.trials??{};
 const streak=Array.isArray(t.controllerStreak)?t.controllerStreak:[];
 if(t.controllerGrandfathered===true||streak.length>=REQUIRED)throw Error('The Controller trial is already complete');
 if(streak.includes(agentId))throw Error('That Controller is already in the current streak');
 const next={...t,controllerStreak:[agentId,...streak].slice(0,REQUIRED)};
 next.controllerKdAgents=[...new Set([...(t.controllerKdAgents??[]),agentId])];
 next.controllerWinCounts={...(t.controllerWinCounts??{}),[agentId]:Math.min(3,(t.controllerWinCounts?.[agentId]??0)+1)};
 next.controllerWins=[...new Set([...(t.controllerWins??[]),agentId])];
 return {data:JSON.stringify({...p,trials:next}),before:streak.length,after:next.controllerStreak.length};
}
export async function run({discordId,agent,query}){
 if(!/^\d{15,22}$/.test(discordId??''))throw Error('discord_id must be a Discord user ID');
 const a=roster.agents.find(x=>x.name.toLowerCase()===String(agent).toLowerCase()&&x.role==='Controller');
 if(!a)throw Error('agent must be a Controller in the roster');
 const links=await query('SELECT guild,puuid FROM kp_accounts WHERE user=?',[discordId]);
 if(links.length!==1)throw Error('Expected exactly one linked Riot account');
 const {guild,puuid}=links[0];
 const rows=await query('SELECT data,version FROM spike_profiles WHERE guild=? AND puuid=?',[guild,puuid]);
 if(rows.length!==1)throw Error('No Spike Rush profile');
 const c=corrected(rows[0].data,a.id);
 const changed=await query('UPDATE spike_profiles SET data=?,version=version+1 WHERE guild=? AND puuid=? AND version=? RETURNING version',[c.data,guild,puuid,rows[0].version]);
 if(changed.length!==1)throw Error('The profile changed meanwhile; run again');
 const check=await query("SELECT json_extract(data,'$.trials.controllerStreak') AS s FROM spike_profiles WHERE guild=? AND puuid=?",[guild,puuid]);
 const names=JSON.parse(check[0].s).map(id=>roster.agents.find(x=>x.id===id)?.name??'?');
 return {agent:a.name,before:c.before,after:names.length,streak:names};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const {CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:account,DISCORD_ID:discordId,AGENT:agent,GITHUB_STEP_SUMMARY:file}=process.env;
 if(!token||!account)throw Error('Cloudflare credentials are missing');
 const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+D1_B_ID+'/query';
 const query=async(sql,params)=>{
  if(!/^\s*(SELECT|UPDATE spike_profiles )/i.test(sql))throw Error('Only reads and the spike_profiles correction are allowed');
  const res=await fetch(api,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)});
  if(!res.ok)throw Error('D1 HTTP '+res.status);
  const body=await res.json();
  if(body.success!==true||!body.result?.[0]?.success)throw Error('D1 query failed');
  return body.result[0].results;
 };
 const r=await run({discordId,agent,query});
 const text='## Spike Rush Controller correction\n\nAdded '+r.agent+' to the start of the streak: '+r.before+'/7 → '+r.after+'/7 ('+r.streak.join(' → ')+'). No KP or ledger rows changed.\n';
 console.log(text);if(file)appendFileSync(file,text);
}
