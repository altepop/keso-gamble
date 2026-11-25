// Production smoke: no writes, no token printing, no dependency on the Discord user session UI.
import {pathToFileURL} from 'node:url';

const origin='https://altepop.github.io';
const app=origin+'/keso-gamble/';
const worker='https://valorant-results.tealeaforest.workers.dev';
const json=r=>r.json();
function check(condition,message){if(!condition)throw Error(message);}
async function getWithRetry(url,init={},fetchImpl=fetch){
 let last;
 for(let i=0;i<4;i++){
  try{
   const response=await fetchImpl(url,{...init,signal:AbortSignal.timeout(12_000)});
   if(response.status<500&&response.status!==429)return response;
   last=Error('HTTP '+response.status);
  }catch(e){last=e;}
  if(i<3)await new Promise(r=>setTimeout(r,1000*(i+1)));
 }
 throw Error('Endpoint unavailable: '+new URL(url).pathname+' ('+String(last?.message??last)+')');
}
export async function smoke({fetchImpl=fetch,walletToken='',activityUrl=app,workerUrl=worker}={}){
 const activity=new URL(activityUrl);
 check(activity.protocol==='https:','Activity must use HTTPS');
 const entry=await getWithRetry(activity.toString(),{},fetchImpl);
 check(entry.ok,'Activity HTML failed: HTTP '+entry.status);
 const body=await entry.text();
 check(body.includes('keso-release')&&body.includes('bootstrap.js'),'Activity entry is incomplete');
 const bootstrap=await getWithRetry(new URL('js/bootstrap.js',activity).toString(),{},fetchImpl);
 check(bootstrap.ok,'Activity bootstrap failed: HTTP '+bootstrap.status);
 check((await bootstrap.text()).length>20,'Activity bootstrap is empty');
 // The Worker health check cannot detect a broken Discord iOS Activity route.
 // Verify actual Pages assets used by the entry, not only a successful HTTP 200.
 const release=body.match(/<meta name="keso-release" content="([^"]+)"/)?.[1];
 check(/^web-[a-f0-9]{16}$/.test(release??''),'Activity content-derived release is missing');
 const qualityVersion=body.match(/src="\.\/duel-quality\/duel-quality\.js\?v=(duel-[a-f0-9]{16})"/)?.[1];
 check(Boolean(qualityVersion),'Duel entry does not have a content-derived enhancement cache key');
 const qualityResponse=await getWithRetry(new URL('duel-quality/duel-quality.js?v='+qualityVersion,activity).toString(),{},fetchImpl);
 check(qualityResponse.ok,'Duel enhancement asset is missing');
 const qualityCode=await qualityResponse.text();
 check(qualityCode.includes("link.dataset.duelPveLink='1'")&&
       qualityCode.includes("rewards.dataset.duelPveRewards='1'")&&
       !qualityCode.includes("link.href='./duel-pve.html'"),
       'Duel PvE is still navigating out of the Discord Activity');
 const appResponse=await getWithRetry(new URL('js/app.js?v='+release,activity).toString(),{},fetchImpl);
 check(appResponse.ok,'Activity game module is missing');
 const appCode=await appResponse.text();
 check(appCode.includes('tabs:subTabs()')&&appCode.includes('duelPveUi.open=true')&&
       appCode.includes('duelPveCustomStart'),
       'Duel Play category or in-place PvE handler is missing');
 const viewResponse=await getWithRetry(new URL('js/duel-view.js?v='+release,activity).toString(),{},fetchImpl);
 check(viewResponse.ok,'Duel view module is missing');
 const viewCode=await viewResponse.text();
 check(viewCode.includes('trioUi=null,seasonUi=null,eventUi=null,tabs=')&&
       viewCode.includes('${tabs}')&&viewCode.includes('duelPvePanel'),
       'Duel categories/PvE rendering are missing in deployed view');

 const statusResponse=await getWithRetry(workerUrl+'/api/kp/status',{},fetchImpl);
 check(statusResponse.ok,'Worker KP status failed: HTTP '+statusResponse.status);
 const status=await json(statusResponse);
 check(status?.enabled===true&&status?.currency==='KP'&&Number.isSafeInteger(status.registered),'KP backend is not ready');
 let wallet='not-configured';
 if(walletToken){
  check(/^[a-f0-9]{48}$/.test(walletToken),'Smoke wallet token is malformed');
  const walletResponse=await getWithRetry(workerUrl+'/api/kp/state',{headers:{Authorization:'Bearer '+walletToken}},fetchImpl);
  check(walletResponse.ok,'Authenticated KP wallet read failed: HTTP '+walletResponse.status);
  const state=await json(walletResponse);
  check(typeof state?.cash==='number'&&Number.isSafeInteger(state.cash),'KP balance missing from state');
  wallet='verified';
 }
 return {activity:'ok',bootstrap:'ok',duelNavigation:'ok',status:'ok',wallet};
}
export async function notifyFailure({fetchImpl=fetch,webhookUrl='',runLink=''}={}){
 if(!webhookUrl){console.warn('Discord alert webhook not set; GitHub Actions failure is the alert');return false;}
 check(/^https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[-\w]+$/.test(webhookUrl),'Invalid Discord webhook URL');
 const res=await fetchImpl(webhookUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:'🚨 KESO PLAY 本番デプロイ後の確認に失敗しました。詳細: '+runLink,allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(10_000)});
 check(res.ok,'Discord failure alert was not delivered');
 return true;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.includes('--notify-failure'))notifyFailure({webhookUrl:process.env.KESO_SMOKE_ALERT_WEBHOOK_URL??'',runLink:process.env.RUN_LINK??''})
  .catch(e=>{console.error('Smoke alert failed: '+e.message);process.exitCode=1;});
 else smoke({walletToken:process.env.KESO_SMOKE_WALLET_TOKEN??''}).then(r=>{
  console.log('POST_DEPLOY_SMOKE '+JSON.stringify(r));
  if(r.wallet==='not-configured')console.warn('KP wallet probe needs the optional KESO_SMOKE_WALLET_TOKEN repository secret');
 }).catch(e=>{console.error('POST_DEPLOY_SMOKE_FAILED: '+e.message);process.exitCode=1;});
}
