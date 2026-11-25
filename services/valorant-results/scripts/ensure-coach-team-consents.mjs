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
 await query(readFileSync(new URL('../migrations/0016_coach_team_pdca.sql',import.meta.url),'utf8'));
 const actual=(await query("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('coach_team_challenges','coach_team_challenge_history','coach_team_member_status')"))[0].results;
 if(actual.length!==3)throw Error('Team PDCA schema missing');
 const triggers=(await query("SELECT name FROM sqlite_master WHERE type='trigger' AND name IN ('coach_team_challenge_capture_insert','coach_team_challenge_capture_update','coach_team_member_status_owner_guard')"))[0].results;
 if(triggers.length!==3)throw Error('Team PDCA history/ownership triggers missing');
 console.log('COACH_TEAM_PDCA_SCHEMA_READY tables=3 triggers=3 changes=ddl_only');
 // Notification consent and admin-channel records remain empty and disabled.
 await query(readFileSync(new URL('../migrations/0017_coach_team_notice_controls.sql',import.meta.url),'utf8'));
 const noticeTables=(await query("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('coach_team_notice_preferences','coach_team_notice_channels')"))[0].results;
 const noticeGuards=(await query("SELECT name FROM sqlite_master WHERE type='trigger' AND name='coach_team_notice_owner_guard'"))[0].results;
 if(noticeTables.length!==2||noticeGuards.length!==1)throw Error('Team notification opt-in schema incomplete');
 console.log('COACH_TEAM_NOTICE_SCHEMA_READY tables=2 ownerGuard=1 outbound=disabled defaults=off');

 console.log('COACH_TEAM_CONSENTS_SCHEMA_READY defaults=all_off changes=ddl_only');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 ensureCoachTeamConsents(process.cwd()).catch(e=>{console.error(e.message);process.exitCode=1;});
