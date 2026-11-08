// Uses the existing dispatch credential for its intended repository only.
// No secret value, HTTP body, identifiers or raw error is printed.
import {pathToFileURL} from 'node:url';
export async function dispatchDeliveryAudit(env=process.env,request=fetch){
 const token=env.PAIPU_DISPATCH_TOKEN;
 if(!token)return {started:false,status:'unavailable-token'};
 try{
  const response=await request('https://api.github.com/repos/altepop/keso-gamble/actions/workflows/mahjong-paipu.yml/dispatches',{
   method:'POST',headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},
   body:JSON.stringify({ref:'main',inputs:env.REVIEW_DELIVERY_PROBE==='true'?{delivery_probe:true}:{delivery_audit:true}}),signal:AbortSignal.timeout(15000),
  });
  return response.status===204?{started:true,status:'started'}:{started:false,status:'http-'+response.status};
 }catch{return {started:false,status:'request-failed'};}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await dispatchDeliveryAudit();console.log('Review delivery verification: '+JSON.stringify(result));
 if(!result.started&&result.status!=='unavailable-token')process.exitCode=1;
}
