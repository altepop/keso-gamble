import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
export async function ensureCoachReview(directory,env=process.env,request=fetch){
 const c=JSON.parse(readFileSync(resolve(directory,'wrangler.jsonc'),'utf8')),b=c.d1_databases?.find(x=>x.binding==='DB');
 if(c.name!=='valorant-results'||!/^[0-9a-f]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID??'')||!/^[0-9a-f-]{36}$/i.test(b?.database_id??'')||!env.CLOUDFLARE_API_TOKEN)throw Error('Invalid coaching review configuration');
 const query=async sql=>{const r=await request('https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+b.database_id+'/query',{method:'POST',headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql}),signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Review schema HTTP '+r.status);const p=await r.json();if(!p.success||!p.result?.length||p.result.some(x=>!x.success))throw Error('Review schema failed');return p.result;};
 const additions={coach_practice_records:{match_id:'TEXT',primary_metric:"TEXT DEFAULT 'dpr'",supporting_metrics_json:'TEXT NOT NULL DEFAULT \'["kpr","kd"]\''},coach_personal_notes:{match_id:'TEXT'}};
 for(const [table,fields] of Object.entries(additions)){const old=await query('PRAGMA table_info('+table+')');for(const [col,type] of Object.entries(fields)){if(!old[0].results.some(c=>c.name===col))await query('ALTER TABLE '+table+' ADD COLUMN '+col+' '+type);}const verified=await query('PRAGMA table_info('+table+')');if(Object.keys(fields).some(col=>!verified[0].results.some(c=>c.name===col)))throw Error('Missing review field');}
 await query("UPDATE coach_practice_records SET primary_metric=NULL,supporting_metrics_json='[]',match_id=NULL WHERE status='deleted' AND (primary_metric IS NOT NULL OR supporting_metrics_json<>'[]' OR match_id IS NOT NULL)");
 await query('CREATE INDEX IF NOT EXISTS coach_practice_observation ON coach_practice_records(guild,subject_id,planned_at) WHERE planned_at IS NOT NULL');
 const check=await query("SELECT sql FROM sqlite_master WHERE name='coach_practice_observation'");if(!check[0].results[0]?.sql.includes('guild,subject_id,planned_at'))throw Error('Missing review index');
 console.log('COACH_REVIEW_SCHEMA_READY columns=4 observationIndex=1');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)ensureCoachReview(process.cwd()).catch(e=>{console.error(e.message);process.exitCode=1;});
