import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
export async function ensureCoachSharing(directory,env=process.env,request=fetch){
 const c=JSON.parse(readFileSync(resolve(directory,'wrangler.jsonc'),'utf8')),b=c.d1_databases?.find(x=>x.binding==='DB');
 if(c.name!=='valorant-results'||!/^[0-9a-f]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID??'')||!/^[0-9a-f-]{36}$/i.test(b?.database_id??'')||!env.CLOUDFLARE_API_TOKEN)throw Error('Invalid coaching profile configuration');
 const query=async sql=>{
  const r=await request('https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+b.database_id+'/query',{method:'POST',headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql}),signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw Error('Profile schema HTTP '+r.status);const p=await r.json();if(!p.success||!p.result?.length||p.result.some(x=>!x.success))throw Error('Profile schema failed');return p.result;
 };
 const info=await query("PRAGMA table_info('coach_profiles')");
 const migration=readFileSync(new URL('../migrations/0012_coach_summary_sharing.sql',import.meta.url),'utf8');
 if(!info[0].results.some(c=>c.name==='shared_fields_json'))await query(migration);
 else await query("CREATE INDEX IF NOT EXISTS coach_profiles_shared ON coach_profiles(guild,visibility,subject_id)");
 const column=(await query("PRAGMA table_info('coach_profiles')"))[0].results.find(c=>c.name==='shared_fields_json');
 if(!column||column.type!=='TEXT'||column.notnull!==1||column.dflt_value!=="'[]'")throw Error('Incompatible summary sharing schema');
 const index=await query("SELECT name FROM sqlite_master WHERE type='index' AND name='coach_profiles_shared'");if(index[0].results.length!==1)throw Error('Sharing index missing');
 console.log('COACH_SHARING_SCHEMA_READY default=private selectedFields=none');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)ensureCoachSharing(process.cwd()).catch(e=>{console.error(e.message);process.exitCode=1;});
