/** Goal data is private even when a future profile summary is shared. */
export const COACH_RANKS=[...['アイアン','ブロンズ','シルバー','ゴールド','プラチナ','ダイヤモンド','アセンダント','イモータル'].flatMap((name,i)=>[1,2,3].map(n=>({value:['iron','bronze','silver','gold','platinum','diamond','ascendant','immortal'][i]+n,label:name+' '+n}))),{value:'radiant',label:'レディアント'}];
export const goalPolicy=()=>({rankOptions:COACH_RANKS,limits:{action:200,step:80,steps:3,selfCheck:120,bodyBytes:4096},todayJst:new Date(Date.now()+9*3600000).toISOString().slice(0,10)});
export class GoalError extends Error {status:number;constructor(message:string,status=400){super(message);this.status=status;}}
type Input={goalId:string;kind:'rank'|'process';expectedVersion:number;action:string;steps:string[];selfCheck:string;targetRank:string|null;targetDate:string|null;status:'active'|'self-achieved'|'archived'};
type Row={goal_id:string;kind:Input['kind'];action:string;steps_json:string;self_check:string;target_rank:string|null;target_date:string|null;status:Input['status'];version:number;create_hash:string;created_at:number;updated_at:number};
const columns='goal_id,kind,action,steps_json,self_check,target_rank,target_date,status,version,create_hash,created_at,updated_at';
const expose=(r:Row)=>({goalId:r.goal_id,kind:r.kind,action:r.action,steps:JSON.parse(r.steps_json) as string[],selfCheck:r.self_check,targetRank:r.target_rank,targetDate:r.target_date,status:r.status,version:r.version,createdAt:r.created_at,updatedAt:r.updated_at});
export async function readCoachGoals(db:D1Database,guild:string,subject:string){
 const rows=(await db.prepare(`SELECT ${columns} FROM coach_goals WHERE guild=? AND subject_id=? AND status='active'
 UNION ALL SELECT * FROM (SELECT ${columns} FROM coach_goals WHERE guild=? AND subject_id=? AND status<>'active' ORDER BY updated_at DESC,goal_id LIMIT 20)`).bind(guild,subject,guild,subject).all<Row>()).results;
 return {policy:goalPolicy(),goals:rows.filter(r=>r.status==='active').map(expose),history:rows.filter(r=>r.status!=='active').map(expose),historyLimit:20};
}
const text=(v:unknown,max:number,required=false)=>{if(typeof v!=='string'||Array.from(v.trim()).length>max||/[\u0000-\u001f\u007f]/u.test(v)||required&&!v.trim())throw new GoalError('文字数と入力内容を確認してください。');return v.trim();};
export async function parseCoachGoal(request:Request):Promise<Input>{
 const reader=request.body?.getReader();if(!reader)throw new GoalError('入力内容がありません。');
 const parts:Uint8Array[]=[];let size=0;
 try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>4096){await reader.cancel();throw new GoalError('入力は4 KiB以内にしてください。',413);}parts.push(r.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
 let b:Record<string,unknown>;try{b=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(bytes));}catch{throw new GoalError('入力形式を確認してください。');}
 const fields=['goalId','kind','expectedVersion','action','steps','selfCheck','targetRank','targetDate','status'];
 if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!fields.includes(k)))throw new GoalError('指定できない入力項目があります。');
 if(typeof b.goalId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.goalId)||!Number.isSafeInteger(b.expectedVersion)||Number(b.expectedVersion)<0||!['rank','process'].includes(String(b.kind))||!['active','self-achieved','archived'].includes(String(b.status)))throw new GoalError('目標の形式を確認してください。');
 const action=text(b.action??'',200,b.kind==='process'),selfCheck=text(b.selfCheck??'',120,b.kind==='process');
 if(!Array.isArray(b.steps)||b.steps.length>3)throw new GoalError('手順は3件まで登録できます。');
 const steps=b.steps.map(s=>text(s,80,true));
 const targetRank=b.targetRank??null,targetDate=b.targetDate??null;
 if(b.kind==='rank'?(!COACH_RANKS.some(r=>r.value===targetRank)||action!==''||steps.length>0||selfCheck!==''):(targetRank!==null))throw new GoalError('目標ランクと行動の入力を確認してください。');
 if(targetDate!==null&&(typeof targetDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)||Number(targetDate.slice(0,4))<2000||!Number.isFinite(Date.parse(targetDate+'T00:00:00Z'))||new Date(targetDate+'T00:00:00Z').toISOString().slice(0,10)!==targetDate))throw new GoalError('目標日は正しい日付で入力してください。');
 return {goalId:b.goalId.toLowerCase(),kind:b.kind as Input['kind'],expectedVersion:Number(b.expectedVersion),action,steps,selfCheck,targetRank:targetRank as string|null,targetDate:targetDate as string|null,status:b.status as Input['status']};
}
export async function saveCoachGoal(db:D1Database,guild:string,subject:string,input:Input,now=Date.now()){
 const get=()=>db.prepare(`SELECT ${columns} FROM coach_goals WHERE guild=? AND subject_id=? AND goal_id=?`).bind(guild,subject,input.goalId).first<Row>();
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({...input,expectedVersion:0}))))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const old=await get();
 const conflict=()=>new GoalError('別の画面で更新されています。入力を控えたうえで、最新の目標を読み直してください。',409);
 if(input.expectedVersion===0){
  if(old){if(old.create_hash===digest)return {goal:expose(old),created:false};throw conflict();}
  if(input.status!=='active')throw new GoalError('新しい目標は取り組み中で登録してください。');
  try{const row=await db.prepare(`INSERT INTO coach_goals(guild,subject_id,goal_id,kind,action,steps_json,self_check,target_rank,target_date,status,version,create_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'active',1,?,?,?) RETURNING ${columns}`).bind(guild,subject,input.goalId,input.kind,input.action,JSON.stringify(input.steps),input.selfCheck,input.targetRank,input.targetDate,digest,now,now).first<Row>();return {goal:expose(row!),created:true};}
  catch(e){if(!/UNIQUE constraint failed/i.test(String(e)))throw e;const concurrent=await get();if(concurrent?.create_hash===digest)return {goal:expose(concurrent),created:false};throw conflict();}
 }
 if(!old)throw new GoalError('この目標は利用できません。',404);
 if(old.kind!==input.kind||old.status!=='active'||old.version!==input.expectedVersion)throw conflict();
 const updated=await db.prepare(`UPDATE coach_goals SET action=?,steps_json=?,self_check=?,target_rank=?,target_date=?,status=?,version=version+1,updated_at=? WHERE guild=? AND subject_id=? AND goal_id=? AND version=? AND status='active' RETURNING ${columns}`).bind(input.action,JSON.stringify(input.steps),input.selfCheck,input.targetRank,input.targetDate,input.status,now,guild,subject,input.goalId,input.expectedVersion).first<Row>();
 if(!updated)throw conflict();return {goal:expose(updated),created:false};
}
