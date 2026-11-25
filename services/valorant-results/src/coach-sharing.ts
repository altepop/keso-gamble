import {resolveCoachIdentity,type CoachIdentity} from './coach-identity.ts';
import type {KpMapping} from './kp.ts';
import {coachPerformance} from './coach-performance.ts';
export const SUMMARY_FIELDS=[{key:'matches',label:'対象期間・試合数（必須）'},{key:'winRate',label:'勝率'},{key:'kd',label:'K/D'},{key:'acs',label:'ACS'},{key:'adr',label:'ADR'}] as const;
type Field=typeof SUMMARY_FIELDS[number]['key'];type Linked=Extract<CoachIdentity,{status:'linked'}>;
export class SharingError extends Error{status:number;constructor(message:string,status=400){super(message);this.status=status;}}
const hidden=()=>new SharingError('この表示は利用できません。',404);
function selected(json:string):Field[]{try{const v=JSON.parse(json);return Array.isArray(v)&&v.length<=5&&new Set(v).size===v.length&&v.every(k=>SUMMARY_FIELDS.some(f=>f.key===k))&&v.includes('matches')?SUMMARY_FIELDS.filter(f=>v.includes(f.key)).map(f=>f.key):[];}catch{return [];}}
export function coachSharingSettings(identity:Linked){return {displayName:identity.displayName,visibility:identity.summaryVisibility==='guild-summary'&&selected(identity.sharedFieldsJson).length?'guild-summary':'private',fields:selected(identity.sharedFieldsJson),version:identity.policyVersion,options:SUMMARY_FIELDS};}
export async function saveCoachSharing(db:D1Database,guild:string,identity:Linked,request:Request){
 const reader=request.body?.getReader();if(!reader)throw new SharingError('入力内容がありません。');let size=0;const chunks:Uint8Array[]=[];
 try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>2048){await reader.cancel();throw new SharingError('入力は2 KiB以内にしてください。',413);}chunks.push(r.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
 let b:any;try{b=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(bytes));}catch{throw new SharingError('入力形式を確認してください。');}
 if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['displayName','visibility','fields','expectedVersion'].includes(k)))throw new SharingError('指定できない入力項目があります。');
 if(typeof b.displayName!=='string'||!b.displayName.trim()||Array.from(b.displayName.trim()).length>40||/[\u0000-\u001f\u007f]/u.test(b.displayName)||!['private','guild-summary'].includes(b.visibility)||!Number.isSafeInteger(b.expectedVersion)||b.expectedVersion<1||!Array.isArray(b.fields)||new Set(b.fields).size!==b.fields.length||b.fields.some((k:unknown)=>!SUMMARY_FIELDS.some(f=>f.key===k)))throw new SharingError('表示名・公開範囲・共有項目を確認してください。');
 const fields=b.visibility==='private'?[]:selected(JSON.stringify(b.fields));if(b.visibility==='guild-summary'&&!fields.length)throw new SharingError('共有には対象期間と試合数を含めてください。');
 const row=await db.prepare(`UPDATE coach_profiles SET display_name=?,visibility=?,shared_fields_json=?,policy_version=policy_version+1,updated_at=? WHERE guild=? AND subject_id=? AND policy_version=? RETURNING policy_version`).bind(b.displayName.trim(),b.visibility,JSON.stringify(fields),Date.now(),guild,identity.subjectId,b.expectedVersion).first<{policy_version:number}>();
 if(!row)throw new SharingError('別の画面で設定が更新されています。入力を控えてから最新の設定を読み直してください。',409);
 return {displayName:b.displayName.trim() as string,visibility:b.visibility as 'private'|'guild-summary',fields,version:row.policy_version,options:SUMMARY_FIELDS};
}
type Policy={subject_id:string;owner_user:string;display_name:string;visibility:string;policy_version:number;shared_fields_json:string};
const publicPolicy=(p:Policy)=>p.visibility==='guild-summary'&&selected(p.shared_fields_json).length>0;
async function policies(db:D1Database,guild:string,ids?:string[]){return (await db.prepare(`SELECT subject_id,owner_user,display_name,visibility,policy_version,shared_fields_json FROM coach_profiles WHERE guild=? AND visibility='guild-summary'${ids?' AND subject_id IN ('+ids.map(()=>'?').join(',')+')':''} ORDER BY subject_id LIMIT 5`).bind(guild,...ids??[]).all<Policy>()).results.filter(publicPolicy);}
async function authorized(db:D1Database,mapping:KpMapping,p:Policy){const identity=await resolveCoachIdentity(db,mapping,p.owner_user);return identity.status==='linked'&&identity.subjectId===p.subject_id&&identity.policyVersion===p.policy_version&&identity.summaryVisibility==='guild-summary'?identity:null;}
export async function coachDirectory(db:D1Database,mapping:KpMapping){
 const initial=await policies(db,mapping.guildId),valid:Policy[]=[];
 for(const p of initial)if(await authorized(db,mapping,p))valid.push(p);
 const latest=valid.length?await policies(db,mapping.guildId,valid.map(p=>p.subject_id)):[];
 return {people:latest.filter(p=>valid.some(v=>v.subject_id===p.subject_id&&v.policy_version===p.policy_version)).map(p=>({subjectId:p.subject_id,displayName:p.display_name})),sharingAvailable:true};
}
const jstDate=(at:number)=>Number.isSafeInteger(at)&&at>0&&at<8640000000000000-32400000?new Date(at+32400000).toISOString().slice(0,10):null;
export function projectCoachSummary(performance:ReturnType<typeof coachPerformance>,fields:Field[],rows:readonly {ended_at:number}[],name:string,subject:string,version:number){
 const o=performance.overall,dates=rows.flatMap(r=>jstDate(r.ended_at)??[]).sort();
 const metrics:Record<string,{value:number|null;validMatches:number;excludedMatches:number;numerator:number;denominator:number;formula:string}>={};
 const metric=(key:Field,value:number|null,validMatches:number,numerator:number,denominator:number,formula:string)=>{if(fields.includes(key))metrics[key]={value,validMatches,excludedMatches:o.matches-validMatches,numerator,denominator,formula};};
 metric('winRate',o.winPct,o.knownOutcomes,o.wins,o.knownOutcomes,'勝利数 ÷ 勝敗・引分が判明した試合数 × 100');
 metric('kd',o.kd,o.kdMatches,o.kills,o.deaths,'有効試合の合計キル数 ÷ 合計デス数');
 metric('acs',o.acs,o.acsMatches,o.scoreTotal,o.scoreRounds,'スコア合計 ÷ 検証済みラウンド数');
 metric('adr',o.adr,o.damageMatches,o.damageTotal,o.damageRounds,'与ダメージ合計 ÷ 検証済みラウンド数');
 return {subjectId:subject,displayName:name,policyVersion:version,scope:'guild-summary' as const,period:{from:dates[0]??null,to:dates.at(-1)??null,timezone:'Asia/Tokyo'},matches:{analyzed:o.matches,candidates:rows.length,excluded:rows.length-o.matches,rowLimit:250,limitReached:rows.length>=250},metrics};
}
export async function coachSharedSummaries(db:D1Database,mapping:KpMapping,ids:string[],allowAnalysis?:()=>Promise<boolean>){
 // Invalid, absent, private and foreign-guild subjects share the same response.
 if(!ids.length||ids.length>5||new Set(ids).size!==ids.length||ids.some(id=>! /^[0-9a-f-]{36}$/i.test(id)))throw hidden();
 const found=await policies(db,mapping.guildId,ids);if(found.length!==ids.length)throw hidden();
 const owners:Linked[]=[];for(const id of ids){const owner=await authorized(db,mapping,found.find(p=>p.subject_id===id)!);if(!owner)throw hidden();owners.push(owner);}
 if(allowAnalysis&&!await allowAnalysis())throw new SharingError('D1節約モード中です。時間を置いてから確認してください。',429);
 // All subjects are authorized BEFORE any match lookup. No round-event kills,
 // positions, goals, coaching prose or collection state enters this read path.
 const summaries=[];
 for(const owner of owners){
  const rows=(await db.prepare(`SELECT r.match_id,r.ended_at,r.recorded_at,r.map,r.players_json,r.teams_json,e.rounds_json FROM valorant_match_rosters r LEFT JOIN valorant_match_round_events e ON e.match_id=r.match_id WHERE EXISTS(SELECT 1 FROM json_each(r.players_json) p WHERE ${owner.accounts.map(()=>"json_extract(p.value,'$.puuid')=?").join(' OR ')}) ORDER BY r.ended_at DESC LIMIT 250`).bind(...owner.accounts.map(a=>a.puuid)).all<{match_id:string;ended_at:number;recorded_at:number;map:string|null;players_json:string;teams_json:string|null;rounds_json:string|null}>()).results;
  const accounts=owner.accounts.map(a=>({name:'',tag:'',puuid:a.puuid}));
  summaries.push(projectCoachSummary(coachPerformance(rows,accounts,[]),selected(owner.sharedFieldsJson),rows,owner.displayName,owner.subjectId,owner.policyVersion));
 }
 // Revalidate after calculation. In-flight revocation/edit never returns an old
 // payload when the policy has already changed. Shared results are never cached.
 const latest=await policies(db,mapping.guildId,ids);if(latest.length!==ids.length||owners.some(o=>!latest.some(p=>p.subject_id===o.subjectId&&p.policy_version===o.policyVersion)))throw hidden();
 return {summaries};
}
