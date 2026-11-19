import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
export async function ensureCoachGoals(directory,env=process.env,request=fetch){
 const c=JSON.parse(readFileSync(resolve(directory,'wrangler.jsonc'),'utf8')),b=c.d1_databases?.find(x=>x.binding==='DB');
 if(c.name!=='valorant-results'||!/^[0-9a-f]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID??'')||!/^[0-9a-f-]{36}$/i.test(b?.database_id??'')||!env.CLOUDFLARE_API_TOKEN)throw Error('Invalid coaching profile configuration');
 const query=async sql=>{
  const r=await request('https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+b.database_id+'/query',{method:'POST',headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql}),signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw Error('Profile schema HTTP '+r.status);const p=await r.json();if(!p.success||!p.result?.length||p.result.some(x=>!x.success))throw Error('Profile schema failed');return p.result;
 };
 await query(readFileSync(new URL('../migrations/0011_coach_goals.sql',import.meta.url),'utf8'));
 const r=await query("PRAGMA table_info('coach_goals')");
 const expected=['guild','subject_id','goal_id','kind','action','steps_json','self_check','target_rank','target_date','status','version','create_hash','created_at','updated_at'];
 if(JSON.stringify(r[0].results.map(x=>x.name))!==JSON.stringify(expected))throw Error('Incompatible coaching goal schema');
 const indices=await query("SELECT name FROM sqlite_master WHERE type='index' AND name IN ('coach_goals_active','coach_goals_history')");
 if(indices[0].results.length!==2)throw Error('Coaching goal indices missing');
 console.log('COACH_GOALS_SCHEMA_READY tables=1 indices=2');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)ensureCoachGoals(process.cwd()).catch(e=>{console.error(e.message);process.exitCode=1;});
