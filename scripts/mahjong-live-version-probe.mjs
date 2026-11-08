// Temporary owner-only read-only compatibility test. No ingestion or posting.
import {liveAudit,RECENT_REVIEW_SQL,auditFailure} from '../services/valorant-results/scripts/mahjong-review-live-audit.mjs';
import {fetchDecodedRecord} from '../services/valorant-results/scripts/mahjong-paipu.mjs';
import {D1_B_ID} from './relic-abuse-audit.mjs';
const env=process.env,profileResults=[];
try{
 const query=async(sql,params)=>{
  if(sql!==RECENT_REVIEW_SQL||params.length)throw Error('audit_query_rejected');
  const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+D1_B_ID+'/query',{method:'POST',headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('audit_d1_http');const b=await r.json();if(!b.success||!b.result?.[0]?.success)throw Error('audit_d1_read');return b.result[0].results;
 };
 const decode=async(session,uuid)=>{
  let last;
  const profiles=(session.recordProfiles??[]).filter(v=>v!==session.versionString&&/^(?:web|WebGL_2022)-[0-9.()]+$/.test(v)).slice(0,3);
  for(const profile of profiles)try{const result=await fetchDecodedRecord({...session,versionString:profile},uuid);profileResults.push({profile,ok:true});return result;}catch(error){last=error;profileResults.push({profile,ok:false,...auditFailure(error,'record')});}
  throw last??Error('audit_no_public_profiles');
 };
 const result=await liveAudit(env,{query,decode});console.log('Public-profile real record comparison: '+JSON.stringify({profileResults,...result}));if(!result.standardProfilesVerified||!result.standardSanmaProfileVerified)process.exitCode=1;
}catch(error){console.error('Public-profile comparison failed: '+JSON.stringify(auditFailure(error,'startup')));process.exitCode=1;}
