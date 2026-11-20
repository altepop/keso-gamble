import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
export async function auditPrivateRecords(directory,env=process.env,request=fetch){
 const c=JSON.parse(readFileSync(resolve(directory,'wrangler.jsonc'),'utf8')),b=c.d1_databases?.find(x=>x.binding==='DB'),guild=JSON.parse(readFileSync(resolve(directory,'discord-config.json'),'utf8')).guildId;
 if(c.name!=='valorant-results'||!/^[0-9a-f]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID??'')||!/^[0-9a-f-]{36}$/i.test(b?.database_id??'')||!env.CLOUDFLARE_API_TOKEN||!/^\d{15,22}$/.test(guild??''))throw Error('Invalid private record audit configuration');
 const sql=`SELECT
 (SELECT COUNT(*) FROM coach_practice_records WHERE guild=?) AS records,
 (SELECT COUNT(*) FROM coach_personal_notes WHERE guild=?) AS notes,
 (SELECT COUNT(*) FROM coach_practice_records r LEFT JOIN coach_profiles p ON p.guild=r.guild AND p.subject_id=r.subject_id WHERE r.guild=? AND p.subject_id IS NULL) +
 (SELECT COUNT(*) FROM coach_personal_notes n LEFT JOIN coach_profiles p ON p.guild=n.guild AND p.subject_id=n.subject_id WHERE n.guild=? AND p.subject_id IS NULL) AS orphans,
 (SELECT COUNT(*) FROM coach_personal_notes n LEFT JOIN coach_practice_records r ON r.guild=n.guild AND r.subject_id=n.subject_id AND r.record_id=n.record_id WHERE n.guild=? AND n.record_id IS NOT NULL AND r.record_id IS NULL) AS invalidParents,
 (SELECT COUNT(*) FROM (SELECT subject_id FROM coach_practice_records WHERE guild=? AND status='planned' GROUP BY subject_id HAVING COUNT(*)>1)) AS duplicatePlans,
 (SELECT COUNT(*) FROM coach_practice_records WHERE guild=? AND status='deleted' AND (match_id IS NOT NULL OR goal_id IS NOT NULL OR goal_snapshot_json IS NOT NULL OR catalog_version IS NOT NULL OR plan_json<>'[]' OR execution_json IS NOT NULL OR reflection<>'' OR planned_at IS NOT NULL OR occurred_date_jst IS NOT NULL OR recorded_at IS NOT NULL OR deleted_at IS NULL))+
 (SELECT COUNT(*) FROM coach_personal_notes WHERE guild=? AND deleted_at IS NOT NULL AND (match_id IS NOT NULL OR title<>'' OR body<>'' OR record_id IS NOT NULL)) AS invalidDeleted`;
 const r=await request('https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+b.database_id+'/query',{method:'POST',headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql,params:Array(8).fill(guild)}),signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('Private record audit HTTP '+r.status);const payload=await r.json(),result=payload.result?.[0];if(!payload.success||!result?.success)throw Error('Private record audit failed');
 const out={};for(const key of ['records','notes','orphans','invalidParents','duplicatePlans','invalidDeleted']){const v=result.results?.[0]?.[key];if(!Number.isSafeInteger(v)||v<0)throw Error('Invalid private record counts');out[key]=v;}
 if(out.orphans||out.invalidParents||out.duplicatePlans||out.invalidDeleted)throw Error('Private record invariant audit failed');if(Number.isSafeInteger(result.meta?.rows_read))out.rowsRead=result.meta.rows_read;return out;
}
export async function probePrivateRecords(request=fetch,expected={page:readFileSync(new URL('../../../coach.html',import.meta.url)),records:readFileSync(new URL('../../../coach/records.js',import.meta.url)),prototype:readFileSync(new URL('../../../coach/prototype-view.js',import.meta.url))}){
 const routes=[];for(const path of ['practice/records','notes'])for(const method of ['GET','POST'])for(const origin of ['https://altepop.github.io','https://unexpected.invalid']){
  const r=await request('https://valorant-results.tealeaforest.workers.dev/api/kp/coach/'+path,{method,headers:{Origin:origin},...(method==='POST'?{body:'{}'}:{}),signal:AbortSignal.timeout(15000)});await r.text();routes.push({path,method,origin:origin==='https://altepop.github.io'?'allowed':'forbidden',status:r.status});if(r.status!==(origin==='https://altepop.github.io'?401:403))throw Error('Private record boundary failed');
 }
 const hash=b=>createHash('sha256').update(b).digest('hex');const page=await request('https://altepop.github.io/keso-gamble/coach.html',{signal:AbortSignal.timeout(15000),redirect:'error'});if(!page.ok)throw Error('Private record page unavailable');const bytes=Buffer.from(await page.arrayBuffer()),html=bytes.toString('utf8');if(hash(bytes)!==hash(expected.page))throw Error('Private record page source hash mismatch');const hashes={page:hash(bytes)};
 for(const [name,file,source] of [['records','records.js',expected.records],['prototype','prototype-view.js',expected.prototype]]){
  const version=html.match(new RegExp(file.replace('.','\\.')+'\\?v=(coach-[a-f0-9]{12})'))?.[1];if(!version)throw Error('Private record helper missing');const r=await request('https://altepop.github.io/keso-gamble/coach/'+file+'?v='+version,{signal:AbortSignal.timeout(15000),redirect:'error'});if(!r.ok)throw Error('Private record helper unavailable');const code=Buffer.from(await r.arrayBuffer());if(hash(code)!==hash(source)||version!=='coach-'+hash(code).slice(0,12))throw Error('Private record helper source hash mismatch');hashes[name]=hash(code);
 }
 return {sourceMatch:true,hashes,routes,authenticatedTwoUsers:'not-configured',mutations:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)(async()=>{console.log('COACH_PRIVATE_RECORDS_AUDIT',JSON.stringify(await auditPrivateRecords(process.cwd())));console.log('COACH_PRIVATE_RECORDS_PROBE',JSON.stringify(await probePrivateRecords()));})().catch(e=>{console.error(e.message);process.exitCode=1;});
