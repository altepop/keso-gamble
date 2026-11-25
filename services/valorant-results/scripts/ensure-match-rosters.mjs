import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

// Dedicated, idempotent deployment-time creation, since the existing live bot
// intentionally does not apply historical migrations on each deployment.
export const MATCH_ROSTER_COLUMNS=['match_id','ended_at','map','act_name','teams_json','players_json','recorded_at'];
const CREATE_ROSTERS=`CREATE TABLE IF NOT EXISTS valorant_match_rosters (
  match_id TEXT PRIMARY KEY,
  ended_at INTEGER NOT NULL,
  map TEXT,
  act_name TEXT,
  teams_json TEXT NOT NULL,
  players_json TEXT NOT NULL,
  recorded_at INTEGER NOT NULL
)`;
const CREATE_INDEX='CREATE INDEX IF NOT EXISTS valorant_match_rosters_recent ON valorant_match_rosters(ended_at DESC)';

export async function ensureMatchRosterTable(directory,env=process.env,request=fetch){
 const config=JSON.parse(readFileSync(resolve(directory,'wrangler.jsonc'),'utf8'));
 const binding=config.d1_databases?.find(b=>b.binding==='DB');
 const account=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_API_TOKEN;
 if(!token||!/^[0-9a-f]{32}$/i.test(account??'')||!/^[0-9a-f-]{36}$/i.test(binding?.database_id??'')||config.name!=='valorant-results')
   throw Error('Invalid D1 or Worker deployment settings');
 const endpoint='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+binding.database_id+'/query';
 const run=async sql=>{
  const res=await request(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sql}),signal:AbortSignal.timeout(30000)});
  if(!res.ok)throw Error('D1 roster setup HTTP '+res.status);
  const data=await res.json();
  if(!data.success||!data.result?.[0]?.success)throw Error('D1 roster setup failed');
  return data.result[0].results??[];
 };
 await run(CREATE_ROSTERS);
 const columns=(await run("PRAGMA table_info('valorant_match_rosters')")).map(c=>c.name);
 if(JSON.stringify(columns)!==JSON.stringify(MATCH_ROSTER_COLUMNS))
  throw Error('Existing match roster schema incompatible; refusing to deploy');
 await run(CREATE_INDEX);
 console.log('MATCH_ROSTER_SCHEMA_READY table=valorant_match_rosters');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 ensureMatchRosterTable(process.cwd()).catch(e=>{console.error(e.message);process.exitCode=1;});
