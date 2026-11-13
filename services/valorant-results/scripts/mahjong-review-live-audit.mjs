// Trusted owner-only CI diagnostic. One bounded SELECT; re-fetch <=2 existing
// successful games, at most two record requests per size. No ingestion, Discord, KP, D1 writes, artifacts, names or game IDs.
import {pathToFileURL} from 'node:url';
import {safeRecordRpcDiagnostic,recordSessionContext} from './mahjong-rpc-diagnostics.mjs';
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
export const RECORD_CHECK_SQL='SELECT paipu,summary FROM kp_mahjong_paipu WHERE rowid>(SELECT COALESCE(MAX(rowid),0) FROM kp_mahjong_paipu)-64 AND summary IS NOT NULL ORDER BY rowid DESC LIMIT 1';
export const OWN_RECORD_CHECK_SQL="SELECT p.paipu,p.summary FROM kp_mahjong_paipu p WHERE p.rowid>(SELECT COALESCE(MAX(rowid),0) FROM kp_mahjong_paipu)-64 AND p.summary IS NOT NULL AND EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(p.summary) THEN p.summary ELSE '{}' END,'$.seats') seat WHERE json_extract(seat.value,'$.accountId')=?) ORDER BY p.rowid DESC LIMIT 1";
/** One saved ID, one read attempt, no fallback, inference, ingestion or writes. */
export async function recordCheck(env=process.env,{query,connect=login,decode=fetchDecodedRecord,ownRecord=false}={}){
 let session,phase='history',recordRequests=0,sessionContext;
 try{
  if(typeof query!=='function')throw Error('audit_query_missing');
  if(ownRecord){
   phase='login';session=await connect(env);
   if(!Number.isSafeInteger(session.viewerAccountId)||session.viewerAccountId<=0||session.viewerAccountId>4294967295)return {ok:false,status:'viewer-unknown',recordRequests};
  }
  phase='history';
  const rows=await query(ownRecord?OWN_RECORD_CHECK_SQL:RECORD_CHECK_SQL,ownRecord?[session.viewerAccountId]:[]),id=rows[0]?.paipu;
  if(!rows.length)return {ok:false,status:ownRecord?'no-own-record':'no-record',recordRequests};
  if(typeof id!=='string'||!/^\d{6}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))return {ok:false,status:'invalid-record-id',recordRequests};
  if(!session){phase='login';session=await connect(env);}
  sessionContext=recordSessionContext(session,rows[0].summary);
  if(ownRecord&&sessionContext.viewerParticipated!==true)return {ok:false,status:'own-record-unverified',recordRequests,sessionContext};
  phase='record';recordRequests++;const {head,actions}=await decode(session,id);
  const headUuidMatches=head?.uuid===id,actionCount=Array.isArray(actions)?Math.min(actions.length,100000):0;
  const ok=headUuidMatches&&actionCount>0;
  return {ok,status:ok?'record-read':'record-unverified',recordRequests,headUuidMatches,actionCount,sessionContext};
 }catch(error){return {ok:false,status:'failed',recordRequests,...sessionContext?{sessionContext}:{},diagnostic:auditFailure(error,phase)};}
 finally{session?.close();}
}

/** Authenticated viewer history: one V2 iterator + one page, at most one completed replay. */
export async function viewerHistoryCheck(env=process.env,{connect=login,decode=fetchDecodedRecord,nowMs=Date.now()}={}){
 let session,phase='login',historyRequests=0,recordRequests=0,sessionContext;
 try{
  session=await connect(env);sessionContext=recordSessionContext(session,null);
  if(!Number.isSafeInteger(session.viewerAccountId)||session.viewerAccountId<=0||session.viewerAccountId>4294967295)return {ok:false,status:'viewer-unknown',historyRequests,recordRequests,sessionContext};
  const endTime=Math.floor(nowMs/1000),beginTime=Math.max(0,endTime-30*86400);
  if(!Number.isSafeInteger(endTime)||endTime<=0||endTime>4294967295)throw Error('audit_clock_invalid');
  // Official declared public client: ALL tag=0, V2 iterator followed by NextGameRecordList.
  // Deliberately bound this diagnostic to 30 days and a single entry; never continue paging.
  phase='history';historyRequests++;
  const cursor=await session.call('fetchGameRecordListV2',{tag:0,begin_time:beginTime,end_time:endTime,ranks:[],modes:[],max_hu_type:0,level_mode:[]});
  if(typeof cursor?.iterator!=='string'||!cursor.iterator.length||cursor.iterator.length>4096||!Number.isSafeInteger(cursor.iterator_expire)||cursor.iterator_expire<=endTime)return {ok:false,status:'history-iterator-unverified',historyRequests,recordRequests,sessionContext};
  historyRequests++;const history=await session.call('fetchNextGameRecordList',{iterator:cursor.iterator,count:1});
  const entry=Array.isArray(history?.entries)?history.entries[0]:undefined;
  if(!entry)return {ok:false,status:'history-empty-response',historyRequests,recordRequests,hasNext:history?.next===true,sessionContext};
  const seats=Array.isArray(entry.players)?entry.players.map(p=>({accountId:p?.account_id})):null;
  sessionContext=recordSessionContext(session,{seats});
  const validId=typeof entry.uuid==='string'&&/^\d{6}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(entry.uuid);
  const completed=Number.isSafeInteger(entry.start_time)&&entry.start_time>=beginTime&&entry.start_time>0&&Number.isSafeInteger(entry.end_time)&&entry.end_time>entry.start_time&&entry.end_time<=Math.floor(nowMs/1000)+60;
  if(!validId||!completed||sessionContext.viewerParticipated!==true)return {ok:false,status:'history-record-unverified',historyRequests,recordRequests,sessionContext};
  phase='record';recordRequests++;const {head,actions}=await decode(session,entry.uuid);
  const headUuidMatches=head?.uuid===entry.uuid,actionCount=Array.isArray(actions)?Math.min(actions.length,100000):0,ok=headUuidMatches&&actionCount>0;
  return {ok,status:ok?'record-read':'record-unverified',historyRequests,recordRequests,headUuidMatches,actionCount,sessionContext};
 }catch(error){return {ok:false,status:'failed',historyRequests,recordRequests,...sessionContext?{sessionContext}:{},diagnostic:auditFailure(error,phase)};}
 finally{session?.close();}
}

export function persistedReviewStatus(saved,rawDelivery){
 const accepted=saved.players===3?acceptedSanmaReport(saved,saved.review):acceptedC3Report(saved,saved.c3);
 let d;try{d=typeof rawDelivery==='string'?JSON.parse(rawDelivery):rawDelivery;}catch{}
 const count=k=>Number.isSafeInteger(d?.[k])&&d[k]>=0&&d[k]<=100?d[k]:0;
 const queued=count('queued'),sent=count('sent'),reviewSent=count('reviewSent');
 return {persistedReview:accepted?{version:accepted.version,findings:accepted.findings.length}:null,delivery:{queued,sent,reviewSent,allDelivered:queued>0&&sent===queued&&reviewSent<=sent}};
}

export function auditSample(head,actions,saved,report){
 const summary=summarizePaipu(head,actions),diagnostics={acceptedRounds:0,blocked:{}},frames=reviewDecisions(actions,summary,256,diagnostics,undefined,true);
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
  if(f.basis==='tsumo-value'||f.basis==='placement'){
   const value=sanmaValueCase(c,summary.game);
   for(const m of [f.actualValue,f.recommendedValue]){
    const candidate=value?.candidates.find(x=>x.tile===m.tile);
    if(!value||f.basis==='tsumo-value'&&(value.riichi!==f.riichi||value.doubleRiichi!==f.doubleRiichi||value.melds.every(m=>m.kind==='ankan')!==f.menzen)||f.basis==='placement'&&(JSON.stringify(c.scores)!==JSON.stringify(f.scores)||c.dealer!==f.dealer||c.honba!==0||c.sticks!==0||c.declaringReach)||!candidate||candidate.waits.reduce((sum,w)=>sum+w.left,0)!==m.live)throw Error('audit_value_unverified');
   }
  }
  if(f.basis==='genbutsu'){
   const river=c.rivers?.[f.against]?.map(tileKind)??[];
   if(f.river&&(JSON.stringify(f.river.tiles)!==JSON.stringify(c.rivers[f.against])||f.river.dealer!==(c.dealer===f.against)||f.river.held.some(t=>!c.hand.includes(t))))throw Error('audit_defense_unverified');
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
 const protocol=message.match(/^(fetchGameRecord|fetchGameRecordList|fetchGameRecordListV2|fetchNextGameRecordList|oauth2Auth|oauth2Check|oauth2Login)_([0-9]{1,6})$/);
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
  const deliveryOnly=process.argv.includes('--delivery'),ownOnly=process.argv.includes('--own-record-check'),historyOnly=process.argv.includes('--viewer-history-check'),recordRequested=process.argv.includes('--record-check'),recordOnly=recordRequested||ownOnly;
  if([deliveryOnly,ownOnly,historyOnly,recordRequested].filter(Boolean).length>1)throw Error('audit_mode_conflict');
  if((historyOnly?['YOSTAR_UID','YOSTAR_TOKEN','YOSTAR_DEVICE_ID']:deliveryOnly?['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID']:['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','YOSTAR_UID','YOSTAR_TOKEN','YOSTAR_DEVICE_ID']).some(k=>!env[k])){
   console.log('Live review audit: unavailable_credentials; no access attempted');
   if(historyOnly||recordOnly||env.MAHJONG_REQUIRE_STANDARD_PROFILE==='true')process.exitCode=1;
  }else if(historyOnly){
   const result=await viewerHistoryCheck(env);console.log('Live viewer history check: '+JSON.stringify(result));if(!result.ok)process.exitCode=1;
  }else{
   const query=async(sql,params)=>{
    if(sql!==(ownOnly?OWN_RECORD_CHECK_SQL:recordOnly?RECORD_CHECK_SQL:RECENT_REVIEW_SQL)||params.length!==(ownOnly?1:0)||ownOnly&&(!Number.isSafeInteger(params[0])||params[0]<=0||params[0]>4294967295))throw Error('audit_query_rejected');
    const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+D1_B_ID+'/query',{method:'POST',headers:{Authorization:'Bearer '+env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)});
    if(!r.ok)throw Error('audit_d1_http');const body=await r.json();if(body.success!==true||!body.result?.[0]?.success)throw Error('audit_d1_read');return body.result[0].results;
   };
   if(recordOnly){const result=await recordCheck(env,{query,ownRecord:ownOnly});console.log('Live replay one-record check: '+JSON.stringify(result));if(!result.ok)process.exitCode=1;}
   else if(deliveryOnly)console.log('Live review delivery audit: '+JSON.stringify(await deliveryAudit({query})));
   else{const result=await liveAudit(env,{query,onPhase:p=>{phase=p;}});console.log('Live review read-only audit: '+JSON.stringify(result));if(env.MAHJONG_REQUIRE_STANDARD_PROFILE==='true'&&(!result.standardProfilesVerified||!result.standardSanmaProfileVerified))process.exitCode=1;}
  }
 }catch(error){
  console.error('Live review audit: '+JSON.stringify(auditFailure(error,phase))+' (no raw errors or records logged)');process.exitCode=1;
 }
}
