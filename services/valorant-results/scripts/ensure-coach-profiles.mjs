import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
export const PROFILE_COLUMNS=['guild','subject_id','owner_user','person_key','display_name','visibility','policy_version','updated_at'];
export const ACCOUNT_COLUMNS=['guild','subject_id','puuid','account_key','verified_at'];
export async function ensureCoachProfiles(directory,env=process.env,request=fetch){
 const c=JSON.parse(readFileSync(resolve(directory,'wrangler.jsonc'),'utf8')),b=c.d1_databases?.find(x=>x.binding==='DB');
 if(c.name!=='valorant-results'||!/^[0-9a-f]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID??'')||!/^[0-9a-f-]{36}$/i.test(b?.database_id??'')||!env.CLOUDFLARE_API_TOKEN)throw Error('Invalid coaching profile configuration');
 const query=async sql=>{
  const r=await request('https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+b.database_id+'/query',{method:'POST',headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql}),signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw Error('Profile schema HTTP '+r.status);const p=await r.json();if(!p.success||!p.result?.length||p.result.some(x=>!x.success))throw Error('Profile schema failed');return p.result;
 };
 await query(readFileSync(new URL('../migrations/0010_coach_profiles.sql',import.meta.url),'utf8'));
 for(const [name,expected] of [['coach_profiles',PROFILE_COLUMNS],['coach_profile_accounts',ACCOUNT_COLUMNS]]){
  const r=await query("PRAGMA table_info('"+name+"')");if(JSON.stringify(r[0].results.map(x=>x.name).slice(0,expected.length))!==JSON.stringify(expected))throw Error('Incompatible coaching profile schema');
 }
 const triggers=await query("SELECT name FROM sqlite_master WHERE type='trigger' AND name IN ('coach_profile_owner_immutable','coach_account_owner_immutable')");
 if(triggers[0].results.length!==2)throw Error('Coaching ownership guards missing');
 console.log('COACH_PROFILE_SCHEMA_READY tables=2 ownershipGuards=2');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)ensureCoachProfiles(process.cwd()).catch(e=>{console.error(e.message);process.exitCode=1;});
