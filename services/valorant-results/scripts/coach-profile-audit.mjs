import {coachProductionSmoke} from './coach-performance-audit.mjs';
import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';
export async function auditCoachProfiles(directory,env=process.env,request=fetch){
 const c=JSON.parse(readFileSync(resolve(directory,'wrangler.jsonc'),'utf8')),b=c.d1_databases?.find(x=>x.binding==='DB');
 if(c.name!=='valorant-results'||!/^[0-9a-f]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID??'')||!/^[0-9a-f-]{36}$/i.test(b?.database_id??'')||!env.CLOUDFLARE_API_TOKEN)throw Error('Invalid coaching audit configuration');
 const discord=JSON.parse(readFileSync(resolve(directory,'discord-config.json'),'utf8'));if(!/^\d{15,22}$/.test(discord.guildId??''))throw Error('Invalid coaching guild');
 const sql=`WITH scope AS (SELECT ? AS guild),targets AS (SELECT DISTINCT k.guild,k.user FROM kp_accounts k WHERE k.guild=(SELECT guild FROM scope) AND (EXISTS(SELECT 1 FROM coach_profiles p WHERE p.guild=k.guild AND p.owner_user=k.user) OR EXISTS(SELECT 1 FROM coach_member_sources s WHERE s.puuid=k.puuid) OR lower(k.riot) IN ('abema#ttv','aquatopia#toppy','dolly#sdgs','h1d3g1g4s#1037','frin#怖すぎ','mecael#2489')))
 SELECT (SELECT COUNT(*) FROM targets) AS expected,
 (SELECT COUNT(*) FROM coach_profiles WHERE guild=(SELECT guild FROM scope)) AS profiles,
 (SELECT COUNT(*) FROM coach_profile_accounts WHERE guild=(SELECT guild FROM scope)) AS accounts,
 (SELECT COUNT(*) FROM coach_profiles WHERE guild=(SELECT guild FROM scope) AND visibility='private') AS privateProfiles,
 (SELECT COUNT(*) FROM targets t JOIN coach_profiles p ON p.guild=t.guild AND p.owner_user=t.user
 WHERE EXISTS(SELECT 1 FROM coach_profile_accounts a JOIN kp_accounts k ON k.guild=a.guild AND k.puuid=a.puuid
 WHERE a.guild=p.guild AND a.subject_id=p.subject_id AND k.user=p.owner_user)) AS ready,
 (SELECT COUNT(*) FROM coach_profile_accounts a JOIN kp_accounts k ON k.guild=a.guild AND k.puuid=a.puuid
 JOIN coach_profiles p ON p.guild=a.guild AND p.subject_id=a.subject_id WHERE a.guild=(SELECT guild FROM scope) AND k.user<>p.owner_user) AS conflicts,
 (SELECT COUNT(*) FROM coach_profile_accounts a LEFT JOIN coach_profiles p ON p.guild=a.guild AND p.subject_id=a.subject_id WHERE a.guild=(SELECT guild FROM scope) AND p.subject_id IS NULL) AS orphans,
 (SELECT COUNT(*) FROM coach_profiles p JOIN coach_profile_accounts a ON a.guild=p.guild AND a.subject_id=p.subject_id
 WHERE p.guild=(SELECT guild FROM scope) AND p.person_key<>CASE lower(a.account_key)
 WHEN 'abema#ttv' THEN 'kobe' WHEN 'aquatopia#toppy' THEN 'kobe' WHEN 'dolly#sdgs' THEN 'vdk'
 WHEN 'h1d3g1g4s#1037' THEN 'ishihara' WHEN 'frin#怖すぎ' THEN 'fujimura' WHEN 'mecael#2489' THEN 'kobayashi' ELSE 'unknown' END) AS misbound`;
 const r=await request('https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+b.database_id+'/query',{method:'POST',headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql,params:[discord.guildId]}),signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('Coaching audit HTTP '+r.status);const body=await r.json(),result=body.result?.[0];if(!body.success||!result?.success)throw Error('Coaching audit failed');
 const row=result.results?.[0],out={};for(const k of ['expected','profiles','accounts','privateProfiles','ready','conflicts','orphans','misbound']){if(!Number.isSafeInteger(row?.[k])||row[k]<0)throw Error('Invalid coaching audit counts');out[k]=row[k];}
 if(Number.isSafeInteger(result.meta?.rows_read)&&result.meta.rows_read>=0)out.rowsRead=result.meta.rows_read;
 return out;
}
export async function probeCoachBoundary(request=fetch){
 for(const path of ['me','member?person=VDK','rounds','directory']){
  const r=await request('https://valorant-results.tealeaforest.workers.dev/api/kp/coach/'+path,{headers:{Origin:'https://altepop.github.io'},signal:AbortSignal.timeout(15000)});
  await r.text();if(r.status!==401)throw Error('Unauthenticated coaching probe failed');
 }
 const wrong=await request('https://valorant-results.tealeaforest.workers.dev/api/kp/coach/me',{headers:{Origin:'https://unexpected.invalid'},signal:AbortSignal.timeout(15000)});await wrong.text();if(wrong.status!==403)throw Error('Coaching origin probe failed');
 return {unauthenticated:'denied',wrongOrigin:'denied',authenticatedTwoUsers:'not-configured'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)(async()=>{
 let last;
 for(let i=0;i<7;i++){
  last=await auditCoachProfiles(process.cwd());console.log('COACH_SELF_IDENTITY_AUDIT',JSON.stringify(last));
  if(last.ready===last.expected||last.conflicts||last.orphans||last.misbound)break;
  if(i<6)await new Promise(r=>setTimeout(r,55000));
 }
 if(last.ready!==last.expected||last.expected===0||last.conflicts||last.orphans||last.misbound||last.privateProfiles>last.profiles)throw Error('Coaching identity validation incomplete');
 console.log('COACH_SELF_ACCESS_PROBE',JSON.stringify(await probeCoachBoundary()));
 console.log('COACH_SELF_PAGE_PROBE',JSON.stringify(await coachProductionSmoke(process.env.KESO_SMOKE_WALLET_TOKEN)));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
