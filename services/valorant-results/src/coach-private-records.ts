import '../../../coach/practice.js';
const rawCatalogue=structuredClone((globalThis as unknown as {KesoCoachPractice:{entries:{id:string;title:string;action:string;check:string;minutes:number}[]}}).KesoCoachPractice.entries);
const catalogue=rawCatalogue.map(e=>({...e,action:e.action.replaceAll('静止ボット','移動するボット').replaceAll('イージー','ミディアム'),guidance:/射撃場|ボット/.test(e.action)?['射撃テストはミディアムから始め、ハードへ進めます。','移動照準の練習はプラクティスで行い、ストレイフをONにします。']:[]}));
const sha=async(v:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))).map(b=>b.toString(16).padStart(2,'0')).join('');
let catalogueHash:Promise<string>|undefined;
const catalogHash=()=>catalogueHash??=sha(JSON.stringify({policy:'diamond-v1',entries:rawCatalogue}));
const stable=(v:any):any=>Array.isArray(v)?v.map(stable):obj(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
export class PrivateRecordError extends Error{status:number;constructor(message:string,status=400){super(message);this.status=status;}}
const fail=(message='入力内容を確認してください。',status=400):never=>{throw new PrivateRecordError(message,status);};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const obj=(v:unknown):v is Record<string,any>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const fields=(v:Record<string,any>,keys:string[])=>{if(Object.keys(v).some(k=>!keys.includes(k)))fail('指定できない入力項目があります。');};
const text=(v:unknown,max:number,required=false,multi=false)=>{if(typeof v!=='string'||Array.from(v.trim()).length>max||(multi?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u:/[\u0000-\u001f\u007f]/u).test(v)||required&&!v.trim())fail('文字数と入力内容を確認してください。');return (v as string).trim();};
export const todayJst=()=>new Date(Date.now()+32400000).toISOString().slice(0,10);
const date=(v:unknown)=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||v<'2000-01-01'||v>todayJst()||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)fail('実施日は日本時間の今日までの正しい日付にしてください。');return v as string;};
export async function privateRecordPolicy(){return {catalogVersion:await catalogHash(),todayJst:todayJst(),catalogue:catalogue.map(e=>({id:e.id,title:e.title})),limits:{items:3,reflection:1000,title:80,body:2000,bytes:8192},matchLinksAvailable:true,effectReviewAvailable:true};}
export async function readPrivateBody(request:Request){
 const reader=request.body?.getReader();if(!reader)return fail();const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>8192){await reader.cancel();fail('入力は8 KiB以内にしてください。',413);}chunks.push(r.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}let value:unknown;
 try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(bytes));}catch{return fail('入力形式を確認してください。');}
 if(!obj(value))return fail();return value;
}
type RecordRow={record_id:string;goal_id:string|null;goal_version:number|null;goal_snapshot_json:string|null;catalog_version:string|null;plan_json:string;execution_json:string|null;reflection:string;planned_at:number|null;occurred_date_jst:string|null;recorded_at:number|null;status:string;version:number;create_hash:string;mutation_hash:string;created_at:number;updated_at:number;deleted_at:number|null;match_id:string|null;primary_metric?:string|null;supporting_metrics_json?:string};
type NoteRow={note_id:string;title:string;body:string;record_id:string|null;version:number;create_hash:string;mutation_hash:string;created_at:number;updated_at:number;deleted_at:number|null;match_id:string|null;primary_metric?:string|null;supporting_metrics_json?:string};
const rc='record_id,goal_id,goal_version,goal_snapshot_json,catalog_version,plan_json,execution_json,reflection,planned_at,occurred_date_jst,recorded_at,status,version,create_hash,mutation_hash,created_at,updated_at,deleted_at,match_id,primary_metric,supporting_metrics_json';
const nc='note_id,title,body,record_id,version,create_hash,mutation_hash,created_at,updated_at,deleted_at,match_id';
export const privateRecordDTO=(r:RecordRow)=>r.status==='deleted'?{id:r.record_id,status:'deleted',version:r.version}:{id:r.record_id,status:r.status,version:r.version,goal:r.goal_snapshot_json?JSON.parse(r.goal_snapshot_json):null,catalogVersion:r.catalog_version,items:JSON.parse(r.plan_json),execution:r.execution_json?JSON.parse(r.execution_json):null,reflection:r.reflection,plannedAt:r.planned_at,occurredDate:r.occurred_date_jst,recordedAt:r.recorded_at,createdAt:r.created_at,updatedAt:r.updated_at,backfilled:r.planned_at===null,practiceVerified:false,matchLinked:!!r.match_id,primaryMetric:r.primary_metric??'dpr',supportingMetrics:JSON.parse(r.supporting_metrics_json??'[]')};
export const privateNoteDTO=(r:NoteRow)=>r.deleted_at!==null?{id:r.note_id,status:'deleted',version:r.version}:{id:r.note_id,status:'active',title:r.title,body:r.body,recordId:r.record_id,matchLinked:!!r.match_id,version:r.version,createdAt:r.created_at,updatedAt:r.updated_at};
function cursor(value:string|null){if(!value)return null;try{const v=JSON.parse(atob(value.replace(/-/g,'+').replace(/_/g,'/')));if(!Array.isArray(v)||v.length!==2||!Number.isSafeInteger(v[0])||v[0]<0||!uuid(v[1]))return fail('履歴の位置が無効です。');return v as [number,string];}catch{return fail('履歴の位置が無効です。');}}
const next=(at:number,id:string)=>btoa(JSON.stringify([at,id])).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
export async function readPrivateRecords(db:D1Database,guild:string,subject:string,kind:'records'|'notes',page:string|null){
 const c=cursor(page),tail=c?' AND (updated_at<? OR (updated_at=? AND '+(kind==='records'?'record_id':'note_id')+'<?))':'',args=c?[c[0],c[0],c[1]]:[];
 if(kind==='notes'){const rows=(await db.prepare(`SELECT ${nc} FROM coach_personal_notes WHERE guild=? AND subject_id=? AND deleted_at IS NULL${tail} ORDER BY updated_at DESC,note_id DESC LIMIT 21`).bind(guild,subject,...args).all<NoteRow>()).results;return {items:rows.slice(0,20).map(privateNoteDTO),nextCursor:rows.length>20?next(rows[19].updated_at,rows[19].note_id):null};}
 const rows=(await db.prepare(`SELECT ${rc} FROM coach_practice_records WHERE guild=? AND subject_id=? AND status='planned'
 UNION ALL SELECT * FROM (SELECT ${rc} FROM coach_practice_records WHERE guild=? AND subject_id=? AND status IN ('recorded','skipped')${tail} ORDER BY updated_at DESC,record_id DESC LIMIT 21)`).bind(guild,subject,guild,subject,...args).all<RecordRow>()).results;
 const history=rows.filter(r=>r.status!=='planned');return {active:rows.find(r=>r.status==='planned')?privateRecordDTO(rows.find(r=>r.status==='planned')!):null,items:history.slice(0,20).map(privateRecordDTO),nextCursor:history.length>20?next(history[19].updated_at,history[19].record_id):null,policy:await privateRecordPolicy()};
}
export async function privatePracticeState(db:D1Database,guild:string,subject:string){return await db.prepare("SELECT record_id AS id,version,status FROM coach_practice_records WHERE guild=? AND subject_id=? AND status='planned'").bind(guild,subject).first<{id:string;version:number;status:string}>();}
const conflict=()=>fail('別の画面で更新されています。入力を控えてから最新の記録を読み直してください。',409);
export async function savePrivateRecord(db:D1Database,guild:string,subject:string,kind:'records'|'notes',b:Record<string,any>,now=Date.now()){
 const isRecord=kind==='records',table=isRecord?'coach_practice_records':'coach_personal_notes',idCol=isRecord?'record_id':'note_id',cols=isRecord?rc:nc;
 if(!uuid(b.id)||!['create','update','delete'].includes(b.op)||!Number.isSafeInteger(b.expectedVersion)||b.expectedVersion<0||(b.op==='create')!==(b.expectedVersion===0))return fail();
 fields(b,['id','op','expectedVersion',...(b.op==='delete'?[]:isRecord?['status','execution','reflection','occurredDate',...(b.op==='create'?['items','catalogVersion','goal','context']:[])]:['title','body','recordId'])]);
 const get=()=>db.prepare(`SELECT ${cols} FROM ${table} WHERE guild=? AND subject_id=? AND ${idCol}=?`).bind(guild,subject,b.id).first<RecordRow&NoteRow>();
 const old=await get(),hash=await sha(JSON.stringify(stable(b))),show=(r:RecordRow&NoteRow)=>isRecord?privateRecordDTO(r):privateNoteDTO(r);
 const finish=async(r:(RecordRow&NoteRow)|null)=>{if(r)return {item:show(r),replayed:false};const latest=await get();if(latest?.mutation_hash===hash)return {item:show(latest),replayed:true};return conflict();};
 if(old){if(old.mutation_hash===hash||b.op==='create'&&old.create_hash===hash)return {item:show(old),replayed:true};if(b.op==='create')return conflict();if(old.status==='deleted'||old.deleted_at!==null){if(b.op==='delete')return {item:show(old),replayed:true};return conflict();}if(old.version!==b.expectedVersion)return conflict();}
 else if(b.op!=='create')return fail('この記録は利用できません。',404);
 if(b.op==='delete'){
  const clear=isRecord?"match_id=NULL,primary_metric=NULL,supporting_metrics_json='[]',goal_id=NULL,goal_version=NULL,goal_snapshot_json=NULL,catalog_version=NULL,plan_json='[]',execution_json=NULL,reflection='',planned_at=NULL,occurred_date_jst=NULL,recorded_at=NULL,status='deleted'":"title='',body='',record_id=NULL,match_id=NULL";
  const r=await db.prepare(`UPDATE ${table} SET ${clear},deleted_at=?,updated_at=?,version=version+1,mutation_hash=? WHERE guild=? AND subject_id=? AND ${idCol}=? AND version=? RETURNING ${cols}`).bind(now,now,hash,guild,subject,b.id,b.expectedVersion).first<RecordRow&NoteRow>();return finish(r);
 }
 if(!isRecord){
  const title=text(b.title,80,true),body=text(b.body,2000,true,true),parent=b.recordId??null;if(parent!==null&&!uuid(parent))return fail();
  if(parent!==null&&(parent!==old?.record_id||!old)){const p=await db.prepare("SELECT record_id FROM coach_practice_records WHERE guild=? AND subject_id=? AND record_id=? AND status<>'deleted'").bind(guild,subject,parent).first();if(!p)return fail('関連付ける記録は利用できません。',404);}
  const values=[title,body,parent,hash,now];let r;
  if(!old){try{r=await db.prepare(`INSERT INTO coach_personal_notes(guild,subject_id,note_id,title,body,record_id,create_hash,mutation_hash,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?, ?,1,?,?) RETURNING ${nc}`).bind(guild,subject,b.id,title,body,parent,hash,hash,now,now).first<RecordRow&NoteRow>();}catch(e){if(!/UNIQUE constraint failed/.test(String(e)))throw e;const concurrent=await get();if(concurrent?.create_hash===hash)return {item:show(concurrent),replayed:true};return conflict();}}
  else r=await db.prepare(`UPDATE coach_personal_notes SET title=?,body=?,record_id=?,mutation_hash=?,updated_at=?,version=version+1 WHERE guild=? AND subject_id=? AND note_id=? AND version=? AND deleted_at IS NULL RETURNING ${nc}`).bind(...values,guild,subject,b.id,b.expectedVersion).first<RecordRow&NoteRow>();
  return finish(r);
 }
 if(!['planned','recorded','skipped'].includes(b.status)||old&&b.status==='planned'&&old.status!=='planned')return fail('実施記録の状態を確認してください。');
 const reflection=text(b.reflection??'',1000,false,true),day=b.status==='planned'?null:date(b.occurredDate);
 let execution:null|{report:string;minutes:number|null;attempts:number|null;successes:number|null}=null;
 if(b.status!=='planned'){
  if(!obj(b.execution))return fail('本人の実施申告を選んでください。');fields(b.execution,['report','minutes','attempts','successes']);
  const {report,minutes=null,attempts=null,successes=null}=b.execution;
  if(!['done','partial','skipped','unknown'].includes(report)||b.status==='skipped'&&report!=='skipped'||b.status==='recorded'&&report==='skipped')return fail('実施申告と状態を確認してください。');
  if([['minutes',minutes,180],['attempts',attempts,100],['successes',successes,100]].some(([,v,max])=>v!==null&&(!Number.isSafeInteger(v)||Number(v)<0||Number(v)>Number(max)))||(attempts===null)!==(successes===null)||attempts!==null&&successes!==null&&successes>attempts)return fail('時間・確認回数を確認してください。');
  execution={report,minutes,attempts,successes};
 }else if(b.execution!==null&&b.execution!==undefined||b.occurredDate!==null&&b.occurredDate!==undefined)return fail('予定の段階では実施結果を登録できません。');
 if(old){const r=await db.prepare(`UPDATE coach_practice_records SET status=?,execution_json=?,reflection=?,occurred_date_jst=?,recorded_at=COALESCE(recorded_at,?),version=version+1,mutation_hash=?,updated_at=? WHERE guild=? AND subject_id=? AND record_id=? AND version=? AND status<>'deleted' RETURNING ${rc}`).bind(b.status,execution?JSON.stringify(execution):null,reflection,day,b.status==='planned'?null:now,hash,now,guild,subject,b.id,b.expectedVersion).first<RecordRow&NoteRow>();return finish(r);}
 if(!Array.isArray(b.items)||!b.items.length||b.items.length>3)return fail('練習は1〜3件を選んでください。');
 const cv=await catalogHash();if(b.items.some((v:any)=>obj(v)&&v.practiceId)&&b.catalogVersion!==cv)return fail('練習内容が更新されています。最新の内容を確認してください。',409);
 const map=b.context?.map??'';if(b.context!==undefined){if(!obj(b.context))return fail();fields(b.context,['map']);text(map,64);}
 const plan=b.items.map((item:any)=>{if(!obj(item))return fail();if(item.practiceId){fields(item,['practiceId']);const e=catalogue.find(e=>e.id===item.practiceId);if(!e)return fail('練習IDを確認してください。');return {source:'catalogue',id:e.id,title:e.title,action:e.action.replaceAll('{{map}}',map||'次に遊ぶマップ'),check:e.check.replaceAll('{{map}}',map||'次に遊ぶマップ'),minutes:e.minutes,guidance:e.guidance};}fields(item,['title','action','check']);return {source:'personal',id:null,title:text(item.title,80,true),action:text(item.action,200,true),check:text(item.check,120,true),minutes:null};});
 if(new Set(plan.filter(p=>p.id).map(p=>p.id)).size!==plan.filter(p=>p.id).length)return fail('同じ練習を重複して選べません。');
 let goal:null|{goal_id:string;version:number;action:string;steps_json:string;self_check:string}=null;
 if(b.goal!==null&&b.goal!==undefined){if(!obj(b.goal))return fail();fields(b.goal,['id','version']);if(!uuid(b.goal.id)||(!Number.isSafeInteger(b.goal.version)||b.goal.version<1))return fail();goal=await db.prepare("SELECT goal_id,version,action,steps_json,self_check FROM coach_goals WHERE guild=? AND subject_id=? AND goal_id=? AND kind='process' AND status='active' AND version=?").bind(guild,subject,b.goal.id,b.goal.version).first();if(!goal)return fail('目標が更新または終了されています。最新の目標を確認してください。',409);}
 const snapshot=goal?JSON.stringify({id:goal.goal_id,version:goal.version,action:goal.action,steps:JSON.parse(goal.steps_json),selfCheck:goal.self_check}):null;
 try{const r=await db.prepare(`INSERT INTO coach_practice_records(guild,subject_id,record_id,goal_id,goal_version,goal_snapshot_json,catalog_version,plan_json,execution_json,reflection,planned_at,occurred_date_jst,recorded_at,status,version,create_hash,mutation_hash,created_at,updated_at)
 SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,? WHERE ${goal?"EXISTS(SELECT 1 FROM coach_goals WHERE guild=? AND subject_id=? AND goal_id=? AND version=? AND status='active' AND kind='process')":'1'} RETURNING ${rc}`).bind(guild,subject,b.id,goal?.goal_id??null,goal?.version??null,snapshot,plan.some(p=>p.source==='catalogue')?cv:null,JSON.stringify(plan),execution?JSON.stringify(execution):null,reflection,b.status==='planned'?now:null,day,b.status==='planned'?null:now,b.status,hash,hash,now,now,...goal?[guild,subject,goal.goal_id,goal.version]:[]).first<RecordRow&NoteRow>();return finish(r);}
 catch(e){if(!/UNIQUE constraint failed/.test(String(e)))throw e;const concurrent=await get();if(concurrent?.create_hash===hash)return {item:show(concurrent),replayed:true};return fail('未完了の予定があります。保存済みの予定を開いてください。',409);}
}
