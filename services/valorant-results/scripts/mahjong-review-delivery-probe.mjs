// Explicit owner-only manual verification. One labelled artificial message,
// no real account IDs, no KP ledger/account/paipu updates, no new schema.
import {pathToFileURL} from 'node:url';
import {D1_B_ID} from '../../../scripts/relic-abuse-audit.mjs';
import {threeOpenValueScenario} from '../test/fixtures/mahjong-review-three.ts';
import {fourScenario} from '../test/fixtures/mahjong-review-four.ts';
import {createPaipuReviewer} from './mahjong-review.mjs';
import {acceptedSanmaReport} from '../src/mahjong-sanma-comment.ts';
import {acceptedC3Report} from '../src/mahjong-c3-comment.ts';
export const PROBE_INSERT='INSERT OR IGNORE INTO kp_posts(id,body,at) VALUES(?,?,?)';
export const PROBE_STATUS='SELECT sent FROM kp_posts WHERE id=?';
export async function makeProbeBody({reviewer,root=process.env.C3_ASSETS_ROOT}={}){
 const own=!reviewer;if(own)reviewer=createPaipuReviewer({root,fourEnabled:true,sanmaEnabled:true});
 try{
  const {paipuPostMessages}=await import('../src/mahjong-paipu.ts');
  const embeds=[];
  for(const [label,fixture] of [['三麻（人工牌譜・北抜き／ポン）',threeOpenValueScenario()],['四麻（人工牌譜・立直あり）',fourScenario('reach')]]){
   const {summary,actions}=fixture,report=await reviewer.review(summary,actions);
   if(!(summary.players===3?acceptedSanmaReport(summary,report):acceptedC3Report(summary,report)))throw Error('probe_review_unavailable');
   if(summary.players===3&&!report.findings.some(f=>f.basis==='tsumo-value'))throw Error('probe_value_unavailable');
   const reviewed={...summary,...summary.players===3?{review:report}:{c3:report}};
   const members=new Map(summary.seats.map(p=>[p.seat,{name:'検証席'+String.fromCharCode(65+p.seat)}]));
   const description=paipuPostMessages(reviewed,members,()=> 'mild',['🧪 表示の検証です。KP支給・残高変更はありません。']).flatMap(m=>[m.content,...(m.embeds??[]).map(e=>e.description)]).join('');
   if(description.length>4096||!description.includes('松本等しいのひと言'))throw Error('probe_body_invalid');
   embeds.push({title:label,description});
  }
  if(embeds.reduce((n,e)=>n+e.title.length+e.description.length,0)>6000)throw Error('probe_body_invalid');
  return {content:'🧪 **牌譜検討の動作確認**\n人工牌譜を使ったテストです。実際の対局結果ではなく、KP支給・残高変更はありません。',embeds,allowed_mentions:{parse:[]}};
 }finally{if(own)await reviewer.close();}
}
export async function verifyProbeDelivery({query,release,generate=makeProbeBody,wait=ms=>new Promise(r=>setTimeout(r,ms)),polls=4}={}){
 if(typeof query!=='function'||! /^[a-f0-9]{40}$/.test(release??'')||!Number.isInteger(polls)||polls<1||polls>4)throw Error('probe_configuration');
 const id='mahjong-review-probe:'+release,existing=await query(PROBE_STATUS,[id]);
 if(existing[0]?.sent===1)return {posted:true,reused:true};
 if(!existing.length)await query(PROBE_INSERT,[id,JSON.stringify(await generate()),Date.now()]);
 for(let i=0;i<polls;i++){
  if((await query(PROBE_STATUS,[id]))[0]?.sent===1)return {posted:true,reused:Boolean(existing.length)};
  if(i+1<polls)await wait(30000);
 }
 return {posted:false,status:'pending'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const env=process.env;
  if(!env.CLOUDFLARE_API_TOKEN||!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID??''))throw Error('probe_credentials');
  const query=async(sql,params)=>{
   if(![PROBE_INSERT,PROBE_STATUS].includes(sql))throw Error('probe_query_rejected');
   const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+D1_B_ID+'/query',{method:'POST',headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)});
   if(!r.ok)throw Error('probe_d1_http_'+r.status);const b=await r.json();if(!b.success||!b.result?.[0]?.success)throw Error('probe_d1_result');return b.result[0].results??[];
  };
  const result=await verifyProbeDelivery({query,release:env.MAHJONG_REVIEW_PROBE_RELEASE||env.GITHUB_SHA});console.log('Review delivery probe: '+JSON.stringify(result));if(!result.posted)process.exitCode=1;
 }catch(error){const code=/^probe_[a-z0-9_]+$/.test(error?.message??'')?error.message:error?.code==='ERR_MODULE_NOT_FOUND'?'probe_runtime_dependencies':'probe_failed';console.error('Review delivery probe: '+code+' (no credentials, records or raw errors logged)');process.exitCode=1;}
}
