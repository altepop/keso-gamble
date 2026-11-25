import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const COACH_ARCHIVE_SCHEMA=[
  `CREATE TABLE IF NOT EXISTS coach_member_sources(
    riot_id TEXT PRIMARY KEY,puuid TEXT,region TEXT,next_page INTEGER NOT NULL DEFAULT 1,
    done INTEGER NOT NULL DEFAULT 0,truncated INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS coach_member_queue(
    match_id TEXT PRIMARY KEY,region TEXT NOT NULL,source_riot_id TEXT NOT NULL,
    source_puuid TEXT NOT NULL,started_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,
    next_at INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS coach_member_queue_work
     ON coach_member_queue(status,next_at,started_at DESC)`,
  `CREATE TABLE IF NOT EXISTS coach_member_links(
    riot_id TEXT NOT NULL,match_id TEXT NOT NULL,PRIMARY KEY(riot_id,match_id))`
];
const SCHEMA={coach_member_sources:['riot_id','puuid','region','next_page','done','truncated','next_at'],
 coach_member_queue:['match_id','region','source_riot_id','source_puuid','started_at','status','attempts','next_at'],
 coach_member_links:['riot_id','match_id']};
export async function ensureCoachMemberArchive(directory,env=process.env,request=fetch){
 const config=JSON.parse(readFileSync(resolve(directory,'wrangler.jsonc'),'utf8'));
 const binding=config.d1_databases?.find(b=>b.binding==='DB');
 const account=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_API_TOKEN;
 if(!token||!/^[0-9a-f]{32}$/i.test(account??'')||
  !/^[0-9a-f-]{36}$/i.test(binding?.database_id??'')||
  config.name!=='valorant-results')throw Error('Invalid D1 or Worker settings');
 const url='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+binding.database_id+'/query';
 const run=async sql=>{
  const res=await request(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({sql}),signal:AbortSignal.timeout(30000)});
  if(!res.ok)throw Error('D1 coach member schema HTTP '+res.status);
  const payload=await res.json();
  if(!payload.success||!payload.result?.[0]?.success)throw Error('D1 coach member schema validation failed');
  return payload.result[0].results??[];
 };
 for(const sql of COACH_ARCHIVE_SCHEMA)await run(sql);
 for(const [name,expected] of Object.entries(SCHEMA)){
  const actual=(await run("PRAGMA table_info('"+name+"')")).map(x=>x.name);
  if(JSON.stringify(actual)!==JSON.stringify(expected))
   throw Error('Incompatible coach member schema '+name+'; refusing to deploy');
 }
 console.log('COACH_MEMBER_ARCHIVE_SCHEMA_READY sources queue links');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 ensureCoachMemberArchive(process.cwd()).catch(e=>{console.error(e.message);process.exitCode=1;});
