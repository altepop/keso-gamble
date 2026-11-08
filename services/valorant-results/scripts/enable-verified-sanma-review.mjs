// One explicit owner-controlled rollout, after the probe step succeeded.
// Uses the existing workflow-dispatch credential on the same repository only.
import {pathToFileURL} from 'node:url';
export async function enableVerifiedSanma(env=process.env,request=fetch){
 if(env.SANMA_PROBE_VERIFIED!=='true')return {enabled:false,status:'probe-not-verified'};
 if(!env.PAIPU_DISPATCH_TOKEN)return {enabled:false,status:'unavailable-token'};
 const base='https://api.github.com/repos/altepop/keso-gamble/actions/variables',name='MAHJONG_SANMA_REVIEW_ENABLED';
 const headers={Authorization:'Bearer '+env.PAIPU_DISPATCH_TOKEN,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'};
 try{
  const r=await request(base+'/'+name,{headers,signal:AbortSignal.timeout(15000)});
  if(r.status!==200&&r.status!==404)return {enabled:false,status:'read-http-'+r.status};
  if(r.status===200&&(await r.json()).value==='true')return {enabled:true,status:'already-enabled'};
  const response=await request(r.status===404?base:base+'/'+name,{method:r.status===404?'POST':'PATCH',headers,body:JSON.stringify({name,value:'true'}),signal:AbortSignal.timeout(15000)});
  if(response.status!==201&&response.status!==204)return {enabled:false,status:'write-http-'+response.status};
  return {enabled:true,status:'enabled'};
 }catch{return {enabled:false,status:'request-failed'};}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await enableVerifiedSanma();console.log('Sanma review activation: '+JSON.stringify(result));if(!result.enabled)process.exitCode=1;
}
