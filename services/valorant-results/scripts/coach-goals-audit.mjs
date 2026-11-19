import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
export async function auditCoachGoals(directory,env=process.env,request=fetch){
 const c=JSON.parse(readFileSync(resolve(directory,'wrangler.jsonc'),'utf8')),b=c.d1_databases?.find(x=>x.binding==='DB');
 const guild=JSON.parse(readFileSync(resolve(directory,'discord-config.json'),'utf8')).guildId;
 if(c.name!=='valorant-results'||!/^[0-9a-f]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID??'')||!/^[0-9a-f-]{36}$/i.test(b?.database_id??'')||!env.CLOUDFLARE_API_TOKEN||!/^\d{15,22}$/.test(guild??''))throw Error('Invalid goal audit configuration');
 const sql=`SELECT COUNT(*) AS goals,
 COALESCE(SUM(CASE WHEN p.subject_id IS NULL THEN 1 ELSE 0 END),0) AS orphans,
 COALESCE(SUM(CASE WHEN g.status NOT IN ('active','self-achieved','archived') OR g.kind NOT IN ('rank','process') OR g.version<1 THEN 1 ELSE 0 END),0) AS invalid,
 (SELECT COUNT(*) FROM (SELECT kind FROM coach_goals WHERE guild=? AND status='active' GROUP BY subject_id,kind HAVING COUNT(*)>1)) AS duplicateActive
 FROM coach_goals g LEFT JOIN coach_profiles p ON p.guild=g.guild AND p.subject_id=g.subject_id WHERE g.guild=?`;
 const r=await request('https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+b.database_id+'/query',{method:'POST',headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql,params:[guild,guild]}),signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('Goal audit HTTP '+r.status);const body=await r.json(),result=body.result?.[0];if(!body.success||!result?.success)throw Error('Goal audit failed');
 const row=result.results?.[0],out={};for(const k of ['goals','orphans','invalid','duplicateActive']){if(!Number.isSafeInteger(row?.[k])||row[k]<0)throw Error('Invalid goal audit counts');out[k]=row[k];}
 if(out.orphans||out.invalid||out.duplicateActive)throw Error('Goal ownership/status audit failed');if(Number.isSafeInteger(result.meta?.rows_read))out.rowsRead=result.meta.rows_read;return out;
}
export async function probeCoachGoals(request=fetch){
 const url='https://valorant-results.tealeaforest.workers.dev/api/kp/coach/goals';
 for(const method of ['GET','POST'])for(const origin of ['https://altepop.github.io','https://unexpected.invalid']){
  const r=await request(url,{method,headers:{Origin:origin},...(method==='POST'?{body:'{}'}:{}),signal:AbortSignal.timeout(15000)});await r.text();if(r.status!==(origin==='https://altepop.github.io'?401:403))throw Error('Goal access boundary probe failed');
 }
 const r=await request('https://altepop.github.io/keso-gamble/coach.html',{signal:AbortSignal.timeout(15000),redirect:'error'});if(!r.ok)throw Error('Goal page unavailable');const html=await r.text(),version=html.match(/goals\.js\?v=(coach-[a-f0-9]{12})/)?.[1];if(!version||!html.includes('coachGoals.setData(data.goals)'))throw Error('Goal page stale');
 const asset=await request('https://altepop.github.io/keso-gamble/coach/goals.js?v='+version,{signal:AbortSignal.timeout(15000),redirect:'error'});if(!asset.ok)throw Error('Goal helper unavailable');const code=await asset.text();if(version!=='coach-'+createHash('sha256').update(code).digest('hex').slice(0,12)||!code.includes('KesoCoachGoals'))throw Error('Goal helper stale');
 return {unauthenticated:'denied',wrongOrigin:'denied',page:'verified',helper:'verified',authenticatedTwoUsers:'not-configured',goalMutations:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)(async()=>{
 console.log('COACH_GOALS_AUDIT',JSON.stringify(await auditCoachGoals(process.cwd())));
 console.log('COACH_GOALS_PROBE',JSON.stringify(await probeCoachGoals()));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
