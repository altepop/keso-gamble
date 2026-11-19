import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
export async function auditCoachSharing(directory,env=process.env,request=fetch){
 const c=JSON.parse(readFileSync(resolve(directory,'wrangler.jsonc'),'utf8')),b=c.d1_databases?.find(x=>x.binding==='DB'),guild=JSON.parse(readFileSync(resolve(directory,'discord-config.json'),'utf8')).guildId;
 if(c.name!=='valorant-results'||!/^[0-9a-f]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID??'')||!/^[0-9a-f-]{36}$/i.test(b?.database_id??'')||!env.CLOUDFLARE_API_TOKEN||!/^\d{15,22}$/.test(guild??''))throw Error('Invalid sharing audit configuration');
 const sql=`SELECT COUNT(*) AS profiles,
 COALESCE(SUM(visibility='private'),0) AS privateProfiles,
 COALESCE(SUM(visibility='guild-summary'),0) AS sharedProfiles,
 COALESCE(SUM(CASE WHEN policy_version<1 OR json_type(shared_fields_json)<>'array'
 OR (visibility='private' AND json_array_length(shared_fields_json)>0)
 OR (visibility='guild-summary' AND (NOT EXISTS(SELECT 1 FROM json_each(shared_fields_json) WHERE value='matches')
 OR json_array_length(shared_fields_json)>5 OR EXISTS(SELECT 1 FROM json_each(shared_fields_json) WHERE value NOT IN ('matches','winRate','kd','acs','adr'))
 OR (SELECT COUNT(DISTINCT value) FROM json_each(shared_fields_json))<>json_array_length(shared_fields_json)))
 THEN 1 ELSE 0 END),0) AS invalidPolicies FROM coach_profiles WHERE guild=?`;
 const r=await request('https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+b.database_id+'/query',{method:'POST',headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql,params:[guild]}),signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('Sharing audit HTTP '+r.status);const body=await r.json(),result=body.result?.[0];if(!body.success||!result?.success)throw Error('Sharing audit failed');
 const row=result.results?.[0],out={};for(const k of ['profiles','privateProfiles','sharedProfiles','invalidPolicies']){if(!Number.isSafeInteger(row?.[k])||row[k]<0)throw Error('Invalid sharing counts');out[k]=row[k];}
 if(out.invalidPolicies||out.profiles!==out.privateProfiles+out.sharedProfiles)throw Error('Sharing consent audit failed');if(Number.isSafeInteger(result.meta?.rows_read))out.rowsRead=result.meta.rows_read;return out;
}
export async function probeCoachSharing(request=fetch){
 const root='https://valorant-results.tealeaforest.workers.dev/api/kp/coach/';
 for(const [path,method] of [['settings','GET'],['settings','POST'],['directory','GET'],['summary?subject=11111111-1111-4111-8111-111111111111','GET'],['comparison?subjects=11111111-1111-4111-8111-111111111111','GET']])for(const origin of ['https://altepop.github.io','https://unexpected.invalid']){
  const r=await request(root+path,{method,headers:{Origin:origin},...(method==='POST'?{body:'{}'}:{}),signal:AbortSignal.timeout(15000)});await r.text();if(r.status!==(origin==='https://altepop.github.io'?401:403))throw Error('Sharing boundary probe failed');
 }
 const page=await request('https://altepop.github.io/keso-gamble/coach.html',{signal:AbortSignal.timeout(15000),redirect:'error'});if(!page.ok)throw Error('Sharing page unavailable');const html=await page.text(),version=html.match(/sharing\.js\?v=(coach-[a-f0-9]{12})/)?.[1];if(!version||!html.includes('coachSharing.setData(data.settings)'))throw Error('Sharing page stale');
 const asset=await request('https://altepop.github.io/keso-gamble/coach/sharing.js?v='+version,{signal:AbortSignal.timeout(15000),redirect:'error'});if(!asset.ok)throw Error('Sharing helper unavailable');const code=await asset.text();if(version!=='coach-'+createHash('sha256').update(code).digest('hex').slice(0,12)||!code.includes('KesoCoachSharing'))throw Error('Sharing helper stale');
 return {unauthenticated:'denied',wrongOrigin:'denied',page:'verified',helper:'verified',authenticatedTwoUsers:'not-configured',sharingMutations:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)(async()=>{console.log('COACH_SHARING_AUDIT',JSON.stringify(await auditCoachSharing(process.cwd())));console.log('COACH_SHARING_PROBE',JSON.stringify(await probeCoachSharing()));})().catch(e=>{console.error(e.message);process.exitCode=1;});
