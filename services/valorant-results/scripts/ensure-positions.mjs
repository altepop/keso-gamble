import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const POSITION_COLUMNS=['match_id','positions_json','recorded_at','has_coordinates'];
const CREATE=`CREATE TABLE IF NOT EXISTS valorant_match_positions (
  match_id TEXT PRIMARY KEY,
  positions_json TEXT NOT NULL CHECK(json_valid(positions_json)),
  recorded_at INTEGER NOT NULL,
 has_coordinates INTEGER NOT NULL CHECK(has_coordinates IN (0,1))
)`;

// No historical migration is replayed against the production database.
export async function ensurePositionTable(directory,env=process.env,request=fetch){
 const config=JSON.parse(readFileSync(resolve(directory,'wrangler.jsonc'),'utf8'));
 const binding=config.d1_databases?.find(b=>b.binding==='DB');
 const account=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_API_TOKEN;
 if(!token||!/^[0-9a-f]{32}$/i.test(account??'')||
   !/^[0-9a-f-]{36}$/i.test(binding?.database_id??'')||
   config.name!=='valorant-results')throw Error('Invalid D1 or Worker deployment settings');
 const url='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+binding.database_id+'/query';
 const run=async sql=>{
  const res=await request(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sql}),signal:AbortSignal.timeout(30000)});
  if(!res.ok)throw Error('D1 position setup HTTP '+res.status);
  const payload=await res.json();
  if(!payload.success||!payload.result?.[0]?.success)throw Error('D1 position setup failed');
  return payload.result[0].results??[];
 };
 await run(CREATE);
 const columns=(await run("PRAGMA table_info('valorant_match_positions')")).map(x=>x.name);
 if(JSON.stringify(columns)!==JSON.stringify(POSITION_COLUMNS))
  throw Error('Existing position schema incompatible; refusing to deploy');
 console.log('COACH_POSITION_SCHEMA_READY table=valorant_match_positions');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 ensurePositionTable(process.cwd()).catch(e=>{console.error(e.message);process.exitCode=1;});
