// Read-only check of one member's VALORANT / KP link in the production D1 (SELECT only; no writes).
// Prints only yes/no, counts and times to the job summary: no Riot IDs, PUUIDs or other members' data,
// because Actions logs of this repository are public.
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export const D1_B_ID='bf23ab40-814f-4626-9e0b-36739ac41750';
const norm=s=>String(s).normalize('NFKC').toLowerCase();
const at=t=>t?new Date(Number(t)).toISOString().replace('.000Z','Z'):'—';
const mask=riot=>{const [name,tag='']=String(riot).split('#');const m=s=>[...s].length<=1?'*':[...s][0]+'*'.repeat([...s].length-1);return m(name)+'#'+m(tag);};
export async function diagnose({discordId,query,now=Date.now()}){
 if(!/^\d{15,22}$/.test(discordId??''))throw Error('discord_id must be a Discord user ID');
 const one=async(sql,params=[])=>{const rows=await query(sql,params);if(!Array.isArray(rows))throw Error('D1 query failed');return rows;};
 const tracked=await one('SELECT riot_id,since FROM tracked_players');
 const linked=await one('SELECT guild,puuid,user,riot,linked_at FROM kp_accounts');
 const mine=linked.filter(r=>r.user===discordId);
 const out={trackedCount:tracked.length,linked:mine.length>0,
  trackedUnlinked:tracked.filter(t=>!linked.some(l=>norm(l.riot)===norm(t.riot_id))).map(t=>({riot:mask(t.riot_id),since:at(t.since),nonAscii:/[^\x20-\x7e]/.test(t.riot_id)})),
  accounts:[]};
 for(const l of mine){
  const exact=tracked.find(t=>t.riot_id===l.riot),loose=tracked.find(t=>norm(t.riot_id)===norm(l.riot));
  const since=now-14*86400000;
  const n=await one('SELECT count(*) AS n,max(ended_at) AS last,sum(sent=0) AS unsent FROM notifications WHERE riot_id=? AND ended_at>=?',[exact?.riot_id??loose?.riot_id??l.riot,since]);
  const e=await one('SELECT count(*) AS n,max(at) AS last,sum(amount) AS kp FROM kp_events WHERE guild=? AND user=? AND at>=?',[l.guild,discordId,since]);
  out.accounts.push({riot:mask(l.riot),linkedAt:at(l.linked_at),tracked:Boolean(exact),trackedOnlyAfterNormalizing:!exact&&Boolean(loose),
   trackedSince:at((exact??loose)?.since),notices14d:Number(n[0]?.n??0),lastMatch:at(n[0]?.last),unsent:Number(n[0]?.unsent??0),
   kpEvents14d:Number(e[0]?.n??0),lastKp:at(e[0]?.last),kp14d:Number(e[0]?.kp??0)});
 }
 const state=await one("SELECT key,value FROM monitor_state WHERE key IN ('api_after','cursor')");
 const apiAfter=Number(state.find(s=>s.key==='api_after')?.value??0);
 out.henrikWaitUntil=apiAfter>now?at(apiAfter):'none';
 return out;
}
export function summary(r){
 const lines=['## Member link check (read-only)','',
  '| Item | Value |','|:--|:--|',
  '| Monitored players (tracked) | '+r.trackedCount+' / 5 |',
  '| This Discord ID linked to a Riot account (KP) | '+(r.linked?'yes':'**no**')+' |',
  '| Henrik API wait | '+r.henrikWaitUntil+' |',''];
 for(const a of r.accounts)lines.push('### Linked account '+a.riot,'','| Item | Value |','|:--|:--|',
  '| Linked at | '+a.linkedAt+' |',
  '| In monitored players | '+(a.tracked?'yes':a.trackedOnlyAfterNormalizing?'**only after Unicode/case normalizing**':'**no**')+' |',
  '| Tracked since | '+a.trackedSince+' |',
  '| Match notices (14 days) | '+a.notices14d+' (unsent '+a.unsent+') |',
  '| Last match noticed | '+a.lastMatch+' |',
  '| KP match events (14 days) | '+a.kpEvents14d+' / '+a.kp14d.toLocaleString('en-US')+' KP |',
  '| Last KP event | '+a.lastKp+' |','');
 if(r.trackedUnlinked.length){lines.push('### Monitored but not linked to any Discord ID','','| Riot (masked) | Tracked since | Non-ASCII |','|:--|:--|:--|');
  for(const t of r.trackedUnlinked)lines.push('| '+t.riot+' | '+t.since+' | '+(t.nonAscii?'yes':'no')+' |');lines.push('');}
 return lines.join('\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const {CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:account,DISCORD_ID:discordId,GITHUB_STEP_SUMMARY:file}=process.env;
 if(!token||!account)throw Error('Cloudflare credentials are missing');
 const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+D1_B_ID+'/query';
 const query=async(sql,params)=>{
  if(!/^\s*SELECT\b/i.test(sql))throw Error('read-only');
  const res=await fetch(api,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)});
  if(!res.ok)throw Error('D1 HTTP '+res.status);
  const body=await res.json();
  if(body.success!==true||!body.result?.[0]?.success)throw Error('D1 query failed');
  return body.result[0].results;
 };
 const text=summary(await diagnose({discordId,query}));
 console.log(text);
 if(file)appendFileSync(file,text+'\n');
}
