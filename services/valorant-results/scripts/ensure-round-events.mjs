import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const ROUND_EVENT_COLUMNS=['match_id','rounds_json','kills_json','recorded_at'];
const CREATE=`CREATE TABLE IF NOT EXISTS valorant_match_round_events (
  match_id TEXT PRIMARY KEY,
  rounds_json TEXT,
  kills_json TEXT,
  recorded_at INTEGER NOT NULL,
  CHECK(rounds_json IS NOT NULL OR kills_json IS NOT NULL)
)`;

// No historical migration is replayed against the production database.
export async function ensureRoundEventTable(directory,env=process.env,request=fetch){
 const config=JSON.parse(readFileSync(resolve(directory,'wrangler.jsonc'),'utf8'));
 const binding=config.d1_databases?.find(b=>b.binding==='DB');
 const account=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_API_TOKEN;
 if(!token||!/^[0-9a-f]{32}$/i.test(account??'')||
   !/^[0-9a-f-]{36}$/i.test(binding?.database_id??'')||
   config.name!=='valorant-results')throw Error('Invalid D1 or Worker deployment settings');
 const url='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+binding.database_id+'/query';
 const run=async sql=>{
  const res=await request(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sql}),signal:AbortSignal.timeout(30000)});
  if(!res.ok)throw Error('D1 round event setup HTTP '+res.status);
  const payload=await res.json();
  if(!payload.success||!payload.result?.[0]?.success)throw Error('D1 round event setup failed');
  return payload.result[0].results??[];
 };
 await run(CREATE);
 const columns=(await run("PRAGMA table_info('valorant_match_round_events')")).map(x=>x.name);
 if(JSON.stringify(columns)!==JSON.stringify(ROUND_EVENT_COLUMNS))
  throw Error('Existing round event schema incompatible; refusing to deploy');
 console.log('COACH_ROUND_SCHEMA_READY table=valorant_match_round_events');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 ensureRoundEventTable(process.cwd()).catch(e=>{console.error(e.message);process.exitCode=1;});
