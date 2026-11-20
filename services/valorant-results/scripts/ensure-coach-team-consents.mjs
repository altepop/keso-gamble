import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function ensureCoachTeamConsents(directory,env=process.env,request=fetch){
 const c=JSON.parse(readFileSync(resolve(directory,'wrangler.jsonc'),'utf8'));
 const b=c.d1_databases?.find(x=>x.binding==='DB');
 if(c.name!=='valorant-results'||!/^[0-9a-f]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID??'')||
  !/^[0-9a-f-]{36}$/i.test(b?.database_id??'')||!env.CLOUDFLARE_API_TOKEN)
  throw Error('Invalid team consent schema configuration');
 const query=async sql=>{
  const r=await request('https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+
   '/d1/database/'+b.database_id+'/query',{method:'POST',headers:{
    Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},
   body:JSON.stringify({sql}),signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw Error('Team consent schema HTTP '+r.status);
  const p=await r.json();if(!p.success||!p.result?.length||p.result.some(x=>!x.success))
   throw Error('Team consent schema failed');return p.result;
 };
 // Additive only: no UPDATE/DELETE/INSERT of existing users or consent flags.
 await query(readFileSync(new URL('../migrations/0015_coach_team_consents.sql',import.meta.url),'utf8'));
 const expected=['guild','team_id','subject_id','owner_user','joined','share_status','share_metrics','version','updated_at'];
 const info=(await query("PRAGMA table_info('coach_team_consents')"))[0].results;
 if(JSON.stringify(info.map(x=>x.name))!==JSON.stringify(expected)||
  !['joined','share_status','share_metrics'].every(n=>info.find(x=>x.name===n)?.dflt_value==='0'))
  throw Error('Incompatible team consent columns or opt-in defaults');
 const guards=(await query("SELECT name FROM sqlite_master WHERE name IN ('coach_team_consent_roster','coach_team_consent_owner_immutable')"))[0].results;
 if(guards.length!==2)throw Error('Team consent index or owner guard missing');
 console.log('COACH_TEAM_CONSENTS_SCHEMA_READY defaults=all_off changes=ddl_only');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 ensureCoachTeamConsents(process.cwd()).catch(e=>{console.error(e.message);process.exitCode=1;});
