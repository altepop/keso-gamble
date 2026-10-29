// Deployment-only read of public queue identifiers. Never log accounts, matches, settings or response bodies.
import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
const id=config.d1_databases?.find(d=>d.binding==='DB')?.database_id;
if(!/^[a-f0-9-]{36}$/i.test(id??'')||!process.env.CLOUDFLARE_ACCOUNT_ID||!process.env.CLOUDFLARE_API_TOKEN)throw Error('Missing mode inspection configuration');
const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${id}/query`,{
 method:'POST',headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},
 body:JSON.stringify({sql:"SELECT DISTINCT mode FROM notifications WHERE mode NOT IN ('competitive','unrated','unrated_normal','swiftplay','death_swiftplay','deathmatch','spikerush','hurm','teamdeathmatch','escalation','ggteam','onefa','replication','custom') ORDER BY mode LIMIT 30"}),signal:AbortSignal.timeout(15000),
});
if(!response.ok)throw Error('Mode inspection request failed ('+response.status+')');
const body=await response.json();if(body.success!==true)throw Error('Mode inspection unavailable');
const identifiers=body.result.flatMap(r=>r.results??[]).map(r=>r.mode).filter(v=>typeof v==='string'&&/^[a-z0-9_-]{1,64}$/.test(v));
console.log(JSON.stringify({unclassifiedQueueIdentifiers:identifiers}));
