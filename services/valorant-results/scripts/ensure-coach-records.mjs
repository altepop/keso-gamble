import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
export async function ensureCoachRecords(directory,env=process.env,request=fetch){
 const c=JSON.parse(readFileSync(resolve(directory,'wrangler.jsonc'),'utf8')),b=c.d1_databases?.find(x=>x.binding==='DB');
 if(c.name!=='valorant-results'||!/^[0-9a-f]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID??'')||!/^[0-9a-f-]{36}$/i.test(b?.database_id??'')||!env.CLOUDFLARE_API_TOKEN)throw Error('Invalid coaching profile configuration');
 const query=async sql=>{
  const r=await request('https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+b.database_id+'/query',{method:'POST',headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql}),signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw Error('Profile schema HTTP '+r.status);const p=await r.json();if(!p.success||!p.result?.length||p.result.some(x=>!x.success))throw Error('Profile schema failed');return p.result;
 };
 await query(readFileSync(new URL('../migrations/0013_coach_private_records.sql',import.meta.url),'utf8'));
 const expected={coach_practice_records:['guild','subject_id','record_id','goal_id','goal_version','goal_snapshot_json','catalog_version','plan_json','execution_json','reflection','planned_at','occurred_date_jst','recorded_at','status','version','create_hash','mutation_hash','created_at','updated_at','deleted_at'],coach_personal_notes:['guild','subject_id','note_id','title','body','record_id','version','create_hash','mutation_hash','created_at','updated_at','deleted_at']};
 for(const [name,columns] of Object.entries(expected)){const r=await query("PRAGMA table_info('"+name+"')");if(JSON.stringify(r[0].results.slice(0,columns.length).map(c=>c.name))!==JSON.stringify(columns))throw Error('Incompatible private record schema');}
 const guards=await query("SELECT name FROM sqlite_master WHERE (type='index' AND name IN ('coach_practice_one_plan','coach_practice_history','coach_notes_history')) OR (type='trigger' AND name IN ('coach_record_owner_immutable','coach_note_owner_immutable'))");
 if(guards[0].results.length!==5)throw Error('Private record guards missing');
 console.log('COACH_PRIVATE_RECORDS_SCHEMA_READY tables=2 indices=3 ownershipGuards=2');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)ensureCoachRecords(process.cwd()).catch(e=>{console.error(e.message);process.exitCode=1;});
