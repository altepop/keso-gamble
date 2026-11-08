// Trusted owner-only CI diagnostic. One bounded SELECT; re-fetch <=2 existing
// successful games, at most two record requests per size. No ingestion, Discord, KP, D1 writes, artifacts, names or game IDs.
import {pathToFileURL} from 'node:url';
import {safeRecordRpcDiagnostic} from './mahjong-rpc-diagnostics.mjs';
import {D1_B_ID} from '../../../scripts/relic-abuse-audit.mjs';
import {login,fetchDecodedRecord} from './mahjong-paipu.mjs';
import {summarizePaipu} from '../src/mahjong-summary.ts';
import {supportsReviewRules,confirmedStandardReviewRules} from '../src/mahjong-review-rules.ts';
import {calibrateSanmaPayments} from '../src/mahjong-sanma-calibration.ts';
import {reviewDecisions,tileKind} from '../src/mahjong-review-state.ts';
import {sanmaValueCase} from '../src/mahjong-sanma-value.ts';
import {buildC3Cases} from '../src/mahjong-c3-cases.ts';
import {acceptedC3Report} from '../src/mahjong-c3-comment.ts';
import {acceptedSanmaReport} from '../src/mahjong-sanma-comment.ts';
import {auditCompletedSanmaHands} from './mahjong-sanma-hand-audit.mjs';
import {reviewSanmaValues} from './mahjong-sanma-value.mjs';
import {createPaipuReviewer} from './mahjong-review.mjs';
export const RECENT_REVIEW_SQL=`SELECT p.paipu,p.summary,
 (SELECT json_object('queued',COUNT(*),'sent',COALESCE(SUM(q.sent=1),0),'reviewSent',COALESCE(SUM(q.sent=1 AND instr(q.body,'松本等しいのひと言')>0),0))
  FROM kp_posts q WHERE q.id>=('paipu:'||p.paipu) AND q.id<('paipu:'||p.paipu||';')) delivery
 FROM kp_mahjong_paipu p WHERE p.rowid>(SELECT COALESCE(MAX(rowid),0) FROM kp_mahjong_paipu)-64 AND p.summary IS NOT NULL ORDER BY p.rowid DESC LIMIT 12`;
export function persistedReviewStatus(saved,rawDelivery){
 const accepted=saved.players===3?acceptedSanmaReport(saved,saved.review):acceptedC3Report(saved,saved.c3);
 let d;try{d=typeof rawDelivery==='string'?JSON.parse(rawDelivery):rawDelivery;}catch{}
 const count=k=>Number.isSafeInteger(d?.[k])&&d[k]>=0&&d[k]<=100?d[k]:0;
 const queued=count('queued'),sent=count('sent'),reviewSent=count('reviewSent');
 return {persistedReview:accepted?{version:accepted.version,findings:accepted.findings.length}:null,delivery:{queued,sent,reviewSent,allDelivered:queued>0&&sent===queued&&reviewSent<=sent}};
}

export function auditSample(head,actions,saved,report){
 const summary=summarizePaipu(head,actions),diagnostics={acceptedRounds:0,blocked:{}},frames=reviewDecisions(actions,summary,256,diagnostics);
 const kinds={};for(const a of actions)if(/^Record(?:NewRound|DealTile|DiscardTile|ChiPengGang|AnGangAddGang|BaBei|Hule|NoTile|LiuJu|LiqiSuccess)$/.test(a.name))kinds[a.name]=(kinds[a.name]??0)+1;
 const roundShapes=actions.filter(a=>a.name==='RecordNewRound').map(a=>{
  const d=a.data;
  return {openEntries:Array.isArray(d.opens)?d.opens.length:0,openTiles:(d.opens??[]).reduce((n,o)=>n+(o.tiles?.length??0),0),openPositiveCounts:(d.opens??[]).reduce((n,o)=>n+(o.count??[]).filter(c=>c>0).length,0),muyuPresent:Boolean(d.muyu),muyuActive:Boolean(d.muyu&&['count','count_max','id'].some(k=>d.muyu[k]>0)),yongchangPresent:Boolean(d.yongchang),yongchangActive:Boolean(d.yongchang&&['moqie_count','moqie_bonus','shouqie_count','shouqie_bonus'].some(k=>d.yongchang[k]>0)),fieldSpell:Boolean(d.field_spell)};
 });
 const flags=['begin_open_mode','open_hand','reveal_discard','muyu_mode','yongchang_mode','field_spell_mode','guyi_mode','dora3_mode','xuezhandaodi','huansanzhang','chuanma','zhanxing','tianming_mode','jiuchao_mode','hunzhiyiji_mode','wanxiangxiuluo_mode','beishuizhizhan_mode'];
 const activeRuleFlags=flags.filter(k=>head.config?.mode?.detail_rule?.[k]);
 const confirmed=confirmedStandardReviewRules(head);
 const conditionalValueAudit={status:confirmed?'not-run':'rule-profile-unverified'};if(summary.players===3&&confirmed)reviewSanmaValues(frames,summary.game,{diagnostics:conditionalValueAudit});
 const findings=report?.findings??[];
 if(report&&!(summary.players===3?acceptedSanmaReport(summary,report):acceptedC3Report(summary,report)))throw Error('audit_report_invalid');
 const cases=summary.players===4?buildC3Cases(actions,summary):frames;
 for(const f of findings){
  const c=cases.find(c=>c.seat===f.seat&&c.round===f.round&&c.turn===f.turn&&c.actual===f.actual);
  if(!c||!(c.legal??c.hand)?.includes(f.recommended))throw Error('audit_discard_invalid');
  if(f.basis==='tsumo-value'){
   const value=sanmaValueCase(c,summary.game);
   for(const m of [f.actualValue,f.recommendedValue]){
    const candidate=value?.candidates.find(x=>x.tile===m.tile);
    if(value.riichi!==f.riichi||value.doubleRiichi!==f.doubleRiichi||value.melds.every(m=>m.kind==='ankan')!==f.menzen||!candidate||candidate.waits.reduce((sum,w)=>sum+w.left,0)!==m.live)throw Error('audit_value_unverified');
   }
  }
  if(f.basis==='genbutsu'){
   const river=c.rivers?.[f.against]?.map(tileKind)??[];
   if(c.riichi?.[f.against]!==true||!river.includes(tileKind(f.recommended))||river.includes(tileKind(f.actual))!==f.actualOnRiver)throw Error('audit_defense_unverified');
  }
 }
 // Existing, previously saved result metadata must remain the same; don't log it.
 const facts=s=>JSON.stringify({players:s.players,game:s.game,start:s.start,end:s.end,seats:s.seats,rounds:s.rounds});
 if(facts(summary)!==facts(saved))throw Error('audit_saved_result_mismatch');
 return {players:summary.players,rounds:summary.rounds.length,records:actions.length,kinds,diagnostics,roundShapes:[...new Map(roundShapes.map(s=>[JSON.stringify(s),s])).values()],activeRuleFlags,supportedRules:supportsReviewRules(head),confirmedStandardRules:confirmed,standardMetadata:{hasMeta:Boolean(head.config?.meta),modeId:Number.isInteger(head.config?.meta?.mode_id)&&head.config.meta.mode_id>0&&head.config.meta.mode_id<=100?head.config.meta.mode_id:null,hasCustomRoom:Boolean(head.config?.meta?.room_id),hasContest:Boolean(head.config?.meta?.contest_uid)},paymentCalibration:calibrateSanmaPayments(head,actions),conditionalValueAudit,completedHandAudit:summary.players===3&&confirmed?auditCompletedSanmaHands(actions,summary):{},replayedDecisions:frames.length,postInterruptionDecisions:frames.filter(f=>f.interrupted).length,modelCases:cases.length,verifiedFindings:findings.length,findingBases:Object.fromEntries([...new Set(findings.map(f=>f.basis??'model'))].map(b=>[b,findings.filter(f=>(f.basis??'model')===b).length])),savedResultMatches:true};
}
/** One bounded SELECT only. No Mahjong login, model load, writes or posts. */
export async function deliveryAudit({query}={}){
 if(!query)throw Error('audit_query_missing');
 const rows=await query(RECENT_REVIEW_SQL,[]),samples=[];
 for(const row of rows){
  let saved;try{saved=JSON.parse(row.summary);}catch{continue;}
  if(![3,4].includes(saved.players))continue;
  samples.push({players:saved.players,...persistedReviewStatus(saved,row.delivery)});
 }
 return {samples,sanmaDelivered:samples.filter(s=>s.players===3&&s.persistedReview&&s.delivery.allDelivered&&s.delivery.reviewSent>0).length,yonmaV2Delivered:samples.filter(s=>s.players===4&&s.persistedReview?.version===2&&s.delivery.allDelivered&&s.delivery.reviewSent>0).length};
}
export async function liveAudit(env=process.env,{query,connect=login,decode=fetchDecodedRecord,reviewerFactory=createPaipuReviewer,onPhase=()=>{}}={}){
 if(!query)throw Error('audit_query_missing');
 onPhase('history');const rows=await query(RECENT_REVIEW_SQL,[]),selected=[];
 for(const players of [3,4]){const candidates=rows.filter(row=>{try{return JSON.parse(row.summary).players===players;}catch{return false;}}).slice(0,2);if(candidates.length)selected.push({players,candidates});}
 if(!selected.length)return {selected:0,samples:[]};
 onPhase('login');const session=await connect(env);onPhase('reviewer');const reviewer=reviewerFactory({root:env.C3_ASSETS_ROOT,fourEnabled:true,sanmaEnabled:true,timeoutMs:45000,budgetMs:90000});
 try{
  const samples=[],unavailableRecords=[],recordMetadata=[];let recordRequests=0;
  for(const {players,candidates} of selected)for(const row of candidates){onPhase('record');let decoded;recordMetadata.push(auditRecordMetadata(row));recordRequests++;try{decoded=await decode(session,row.paipu);}catch(error){unavailableRecords.push({players,...auditFailure(error,'record')});continue;}const {head,actions}=decoded;onPhase('summary');const summary=summarizePaipu(head,actions);onPhase('review');const report=confirmedStandardReviewRules(head)?await reviewer.review(summary,actions):null;onPhase('verify');samples.push({...auditSample(head,actions,JSON.parse(row.summary),report),...persistedReviewStatus(JSON.parse(row.summary),row.delivery)});break;}
  return {selected:samples.length,recordRequests,unavailableRecords,recordMetadata,handValueBackendConfigured:Boolean(env.SANMA_PYTHON),standardProfilesVerified:samples.length>0&&samples.every(s=>s.confirmedStandardRules),standardSanmaProfileVerified:samples.some(s=>s.players===3&&s.confirmedStandardRules),samples};
 }finally{await reviewer.close();session.close();}
}
export function auditRecordMetadata(row){
 let saved;try{saved=JSON.parse(row.summary);}catch{return {validStoredJSON:false};}
 const validId=typeof row.paipu==='string'&&/^\d{6}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(row.paipu);
 let startDateMatches=false;try{startDateMatches=new Date(saved.start).toISOString().slice(2,10).replaceAll('-','')===row.paipu?.slice(0,6);}catch{}
 return {validStoredJSON:true,idShape:validId,storedIdMatches:row.paipu===saved.uuid,startDateMatches,plausibleAccounts:Array.isArray(saved.seats)&&saved.seats.every(p=>Number.isSafeInteger(p.accountId)&&p.accountId>1000),rounds:Array.isArray(saved.rounds)?saved.rounds.length:0};
}
export function auditFailure(error,phase){
 const message=error?.message??'';
 const protocol=message.match(/^(fetchGameRecord|oauth2Auth|oauth2Check|oauth2Login)_([0-9]{1,6})$/);
 const code=protocol?'audit_rpc_'+protocol[1]+'_'+protocol[2]:/^audit_[a-z_]+$/.test(message)?message:/^http_\d{3}$/.test(message)?'audit_'+message:/^yostar_login_\d+$/.test(message)?'audit_'+message:message.startsWith('login_failed:')?'audit_login_failed':'audit_failed';
 const kind=['Error','TypeError','SyntaxError','TimeoutError','AbortError'].includes(error?.name)?error.name:'unknown';
 const at=String(error?.stack??'').match(/\/(mahjong-review-live-audit|mahjong-paipu)\.mjs:(\d+):\d+/);
 const rpc=safeRecordRpcDiagnostic(error?.rpcDiagnostic);
 return {...rpc?{rpc}:{},code,phase:['history','login','reviewer','record','summary','review','verify'].includes(phase)?phase:'startup',kind,...at?{module:at[1],line:Number(at[2])}:{}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let phase='startup';
 try{
  const env=process.env;
  const deliveryOnly=process.argv.includes('--delivery');
  if((deliveryOnly?['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID']:['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','YOSTAR_UID','YOSTAR_TOKEN','YOSTAR_DEVICE_ID']).some(k=>!env[k])){
   console.log('Live review audit: unavailable_credentials; no access attempted');
   if(env.MAHJONG_REQUIRE_STANDARD_PROFILE==='true')process.exitCode=1;
  }else{
   const query=async(sql,params)=>{
    if(sql!==RECENT_REVIEW_SQL||params.length)throw Error('audit_query_rejected');
    const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+D1_B_ID+'/query',{method:'POST',headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)});
    if(!r.ok)throw Error('audit_d1_http');const body=await r.json();if(body.success!==true||!body.result?.[0]?.success)throw Error('audit_d1_read');return body.result[0].results;
   };
   if(deliveryOnly)console.log('Live review delivery audit: '+JSON.stringify(await deliveryAudit({query})));
   else{const result=await liveAudit(env,{query,onPhase:p=>{phase=p;}});console.log('Live review read-only audit: '+JSON.stringify(result));if(env.MAHJONG_REQUIRE_STANDARD_PROFILE==='true'&&(!result.standardProfilesVerified||!result.standardSanmaProfileVerified))process.exitCode=1;}
  }
 }catch(error){
  console.error('Live review audit: '+JSON.stringify(auditFailure(error,phase))+' (no raw errors or records logged)');process.exitCode=1;
 }
}
