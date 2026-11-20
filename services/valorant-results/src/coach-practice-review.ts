import {coachPerformance} from './coach-performance.ts';
import {PrivateRecordError,privateRecordDTO,privateNoteDTO} from './coach-private-records.ts';
import type {CoachIdentity} from './coach-identity.ts';

type Identity=Extract<CoachIdentity,{status:'linked'}>;
export type ReviewRow={match_id:string;ended_at:number;recorded_at:number;map:string|null;act_name:string|null;players_json:string;teams_json:string|null;rounds_json:string|null};
export const REVIEW_RULE='coach-observation-v1';
export const REVIEW_METRICS=['kd','kpr','dpr','acs','adr','hs'] as const;
type Metric=typeof REVIEW_METRICS[number];
const DAY=86400000;
const fields='r.match_id,r.ended_at,r.recorded_at,r.map,r.act_name,r.players_json,r.teams_json,e.rounds_json';
const from='FROM valorant_match_rosters r LEFT JOIN valorant_match_round_events e ON e.match_id=r.match_id';
const fail=(message:string,status=400):never=>{throw new PrivateRecordError(message,status);};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const sha=async(v:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))].map(b=>b.toString(16).padStart(2,'0')).join('');
export const practiceMatchRef=(guild:string,subject:string,id:string)=>sha(JSON.stringify(['KESO_COACH_MATCH_REF_V1',guild,subject,id]));
const clause=(identity:Identity)=>`EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(r.players_json) THEN r.players_json ELSE '[]' END) p WHERE json_extract(CASE WHEN p.type='object' THEN p.value ELSE '{}' END,'$.puuid') IN (${identity.accounts.map(()=>'?').join(',')}))`;
const accounts=(identity:Identity)=>identity.accounts.map(a=>({name:'',tag:'',puuid:a.puuid}));
const performance=(rows:ReviewRow[],identity:Identity)=>coachPerformance(rows,accounts(identity));
const unpack=(s:string|null)=>{try{return s?JSON.parse(s):null;}catch{return null;}};
export async function ownPracticeRow(db:D1Database,guild:string,identity:Identity,id:string,kind='record'){
 if(!['record','note'].includes(kind))return fail('記録の種類を確認してください。');
 if(!uuid(id))return fail('この記録は利用できません。',404);
 const isNote=kind==='note';
 const row=await db.prepare(`SELECT * FROM ${isNote?'coach_personal_notes':'coach_practice_records'} WHERE guild=? AND subject_id=? AND ${isNote?'note_id':'record_id'}=? AND deleted_at IS NULL`).bind(guild,identity.subjectId,id).first<any>();
 if(!row)return fail('この記録は利用できません。',404);return row;
}
function bounds(row:any,now:number){
 // A self-reported date helps browse matches; it NEVER becomes an observation anchor.
 const center=row.planned_at??(typeof row.occurred_date_jst==='string'?Date.parse(row.occurred_date_jst+'T12:00:00+09:00'):row.created_at);
 return {start:Math.max(1,center-30*DAY),end:Math.min(now,center+30*DAY)};
}
const decode=(v:string|null)=>{if(!v)return null;try{const x=JSON.parse(atob(v.replace(/-/g,'+').replace(/_/g,'/')));if(!Array.isArray(x)||x.length!==2||!Number.isSafeInteger(x[0])||typeof x[1]!=='string'||x[1].length>128)throw Error();return x as [number,string];}catch{return fail('試合一覧の位置が無効です。');}};
const encode=(r:ReviewRow)=>btoa(JSON.stringify([r.ended_at,r.match_id])).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
function verifiedMatch(row:ReviewRow,identity:Identity){
 const p=performance([row],identity);if(p.quality.selectedMatches!==1)return null;
 return {endedAt:row.ended_at,map:p.timeline[0]?.map??'不明',agent:p.timeline[0]?.agent??'不明',outcome:p.timeline[0]?.outcome??'unknown',performance:p};
}
export async function practiceMatches(db:D1Database,guild:string,identity:Identity,id:string,kind:string,page:string|null,now=Date.now(),preloaded?:any){
 if(!['record','note'].includes(kind))return fail('記録の種類を確認してください。');
 const row=preloaded??await ownPracticeRow(db,guild,identity,id,kind),range=bounds(row,now),c=decode(page);
 const rows=(await db.prepare(`SELECT ${fields} ${from} WHERE r.ended_at>=? AND r.ended_at<=? AND ${clause(identity)} ${c?'AND (r.ended_at<? OR (r.ended_at=? AND r.match_id<?))':''} ORDER BY r.ended_at DESC,r.match_id DESC LIMIT 21`).bind(range.start,range.end,...identity.accounts.map(a=>a.puuid),...c?[c[0],c[0],c[1]]:[]).all<ReviewRow>()).results;
 const items=[];for(const r of rows.slice(0,20)){const m=verifiedMatch(r,identity);if(m)items.push({matchRef:await practiceMatchRef(guild,identity.subjectId,r.match_id),endedAt:m.endedAt,map:m.map,agent:m.agent,outcome:m.outcome});}
 const linked=await linkedMatch(db,guild,identity,row.match_id);
 return {items,nextCursor:rows.length>20?encode(rows[19]):null,scanned:Math.min(rows.length,20),excluded:Math.min(rows.length,20)-items.length,range,linked:linked?.match??null,recordVersion:row.version,selectionDoesNotVerifyPractice:true};
}
async function linkedMatch(db:D1Database,guild:string,identity:Identity,id:string|null,known?:ReviewRow){
 if(!id)return null;
 const row=known??await db.prepare(`SELECT ${fields} ${from} WHERE r.match_id=? AND ${clause(identity)}`).bind(id,...identity.accounts.map(a=>a.puuid)).first<ReviewRow>();
 if(!row)return null;const m=verifiedMatch(row,identity);if(!m)return null;
 return {row,performance:m.performance,match:{matchRef:await practiceMatchRef(guild,identity.subjectId,id),endedAt:m.endedAt,map:m.map,agent:m.agent,outcome:m.outcome}};
}
export async function savePracticeMatch(db:D1Database,guild:string,identity:Identity,b:Record<string,any>,now=Date.now()){
 if(Object.keys(b).some(k=>!['id','kind','expectedVersion','matchRef','primaryMetric','supportingMetrics','endedAt'].includes(k))||!['record','note'].includes(b.kind)||!Number.isSafeInteger(b.expectedVersion)||b.expectedVersion<1)return fail('関連付けの入力を確認してください。');
 if(b.matchRef!==null&&(typeof b.matchRef!=='string'||!/^[a-f0-9]{64}$/.test(b.matchRef)))return fail('この試合は利用できません。',404);
 if(b.kind==='record'&&(!REVIEW_METRICS.includes(b.primaryMetric)||!Array.isArray(b.supportingMetrics)||b.supportingMetrics.length>2||b.supportingMetrics.some((m:any)=>!REVIEW_METRICS.includes(m)||m===b.primaryMetric)||new Set(b.supportingMetrics).size!==b.supportingMetrics.length))return fail('主指標1つと補助指標2つまでを選んでください。');
 if(b.kind==='note'&&('primaryMetric'in b||'supportingMetrics'in b))return fail('メモには評価指標を指定できません。');
 if(b.matchRef!==null&&(!Number.isSafeInteger(b.endedAt)||b.endedAt<=0||b.endedAt>now))return fail('試合の終了時刻を確認してください。');
 const row=await ownPracticeRow(db,guild,identity,b.id,b.kind),hash=await sha(JSON.stringify(['practice-link-v1',b.kind,b.id,b.expectedVersion,b.matchRef,b.endedAt??null,b.primaryMetric??null,b.supportingMetrics??null]));
 const dto=(r:any,replayed:boolean)=>({item:b.kind==='note'?privateNoteDTO(r):privateRecordDTO(r),replayed});
 if(row.mutation_hash===hash)return dto(row,true);
 if(row.version!==b.expectedVersion)return fail('別の画面で更新されています。入力を控えてから記録を読み直してください。',409);
 let matchId:string|null=null;
 if(b.matchRef!==null){
  // Ref is only a selector. Recheck the current verified owner roster; no client IDs.
  // Bounded time range; the hash cannot be reversed to recover a foreign match_id.
  const range=bounds(row,now);
  const candidates=(await db.prepare(`SELECT ${fields} ${from} WHERE r.ended_at=? AND ((r.ended_at>=? AND r.ended_at<=?) OR r.match_id=?) AND ${clause(identity)} ORDER BY r.match_id DESC LIMIT 21`).bind(b.endedAt,range.start,range.end,row.match_id,...identity.accounts.map(a=>a.puuid)).all<ReviewRow>()).results;
  if(candidates.length>20)return fail('同時刻の候補が多いため、関連付けを確認できません。',409);
  for(const r of candidates)if(await practiceMatchRef(guild,identity.subjectId,r.match_id)===b.matchRef&&verifiedMatch(r,identity)){matchId=r.match_id;break;}
  if(!matchId)return fail('この試合は利用できません。',404);
 }
 const table=b.kind==='note'?'coach_personal_notes':'coach_practice_records',idColumn=b.kind==='note'?'note_id':'record_id';
 const updated=await db.prepare(`UPDATE ${table} SET match_id=?,${b.kind==='record'?'primary_metric=?,supporting_metrics_json=?,':''}version=version+1,mutation_hash=?,updated_at=? WHERE guild=? AND subject_id=? AND ${idColumn}=? AND version=? AND deleted_at IS NULL RETURNING *`).bind(matchId,...b.kind==='record'?[b.primaryMetric,JSON.stringify(b.supportingMetrics)]:[],hash,now,guild,identity.subjectId,b.id,b.expectedVersion).first<any>();
 if(updated)return dto(updated,false);
 const latest=await ownPracticeRow(db,guild,identity,b.id,b.kind);if(latest.mutation_hash===hash)return dto(latest,true);
 return fail('別の画面で更新されています。記録を読み直してください。',409);
}
export function observationSql(identity:Identity){
 const side=(before:boolean)=>`SELECT ${fields} ${from} WHERE r.ended_at${before?'<':'>='}? AND r.ended_at${before?'>=':'<='}? AND ${clause(identity)} ORDER BY r.ended_at ${before?'DESC':'ASC'},r.match_id ${before?'DESC':'ASC'} LIMIT 10`;
 return `SELECT * FROM (${side(true)}) UNION ALL SELECT * FROM (${side(false)})`;
}
export async function observationRows(db:D1Database,identity:Identity,anchor:number,now=Date.now()){
 const ids=identity.accounts.map(a=>a.puuid);
 return (await db.prepare(observationSql(identity)).bind(anchor,Math.max(1,anchor-30*DAY),...ids,anchor,Math.min(now,anchor+30*DAY),...ids).all<ReviewRow>()).results;
}
function metric(p:ReturnType<typeof coachPerformance>,key:Metric){
 const o=p.overall,q=p.quality;
 const x=key==='kd'?{value:o.kd,numerator:o.kills,denominator:o.deaths,valid:o.kdMatches}:key==='acs'?{value:o.acs,numerator:o.scoreTotal,denominator:o.scoreRounds,valid:o.acsMatches}:key==='adr'?{value:o.adr,numerator:o.damageTotal,denominator:o.damageRounds,valid:o.damageMatches}:key==='hs'?{value:o.hsPct,numerator:o.headHits,denominator:o.totalHits,valid:o.hitMatches}:{value:o[key],numerator:o.rateBases[key].numerator,denominator:o.rateBases[key].rounds,valid:o.rateBases[key].matches};
 const reasons={...q.excluded,[key==='kd'?'missing-or-invalid-kills-or-deaths':key==='hs'?'missing-or-invalid-hit-triple':key==='adr'?'missing-damage-or-unverified-rounds':key==='acs'?'missing-score-or-unverified-rounds':'missing-stat-or-unverified-rounds']:q.selectedMatches-x.valid};
 return {...x,exclusionReasons:reasons,total:q.candidateMatches,excluded:q.candidateMatches-x.valid,rosterExclusions:q.excluded,missingFields:q.missingFields,coverage:q.metricCoverage[key],zeroDenominator:x.denominator===0,source:q.source,archiveTimestampMeaning:q.snapshotSource};
}
function side(rows:ReviewRow[],identity:Identity,keys:Metric[]){
 const p=performance(rows,identity);
 return {candidateMatches:rows.length,validRosters:p.quality.selectedMatches,rosterExclusions:p.quality.excluded,period:rows.length?{firstEndedAt:Math.min(...rows.map(r=>r.ended_at)),lastEndedAt:Math.max(...rows.map(r=>r.ended_at))}:null,metrics:Object.fromEntries(keys.map(k=>[k,metric(p,k)])),conditions:{maps:p.maps.map(m=>({value:m.value,matches:m.matches})),agents:p.agents.map(m=>({value:m.value,matches:m.matches})),roles:p.roles.map(m=>({value:m.value,matches:m.matches})),acts:p.acts.map(m=>({value:m.value,matches:m.matches})),parties:p.parties.map(m=>({value:m.value,matches:m.matches})),compositions:p.compositions.map(m=>({value:m.value,matches:m.matches})),wins:p.overall.wins,knownOutcomes:p.overall.knownOutcomes},quality:p.quality};
}
export function compareObservation(rows:ReviewRow[],identity:Identity,anchor:number,keys:Metric[]){
 const beforeRows=rows.filter(r=>r.ended_at<anchor),afterRows=rows.filter(r=>r.ended_at>=anchor),before=side(beforeRows,identity,keys),after=side(afterRows,identity,keys);
 const comparisons=keys.map(key=>{const a=before.metrics[key],b=after.metrics[key];return {key,before:a,after:b,difference:a.value===null||b.value===null?null:b.value-a.value,state:a.valid>=5&&b.valid>=5&&a.value!==null&&b.value!==null?'provisional':'observing',causalEffectVerified:false};});
 const groups=new Map<string,{map:string;agent:string;rows:ReviewRow[]}>();
 for(const row of rows){const m=verifiedMatch(row,identity);if(!m||m.map==='不明'||m.agent==='不明')continue;const key=JSON.stringify([m.map,m.agent]),g=groups.get(key)??{map:m.map,agent:m.agent,rows:[]};g.rows.push(row);groups.set(key,g);}
 return {before,after,comparisons,sameMapAgent:[...groups.values()].map(g=>({map:g.map,agent:g.agent,before:side(g.rows.filter(r=>r.ended_at<anchor),identity,keys),after:side(g.rows.filter(r=>r.ended_at>=anchor),identity,keys)}))};
}
export async function practiceReview(db:D1Database,guild:string,identity:Identity,id:string,previous:string|null,now=Date.now(),preloaded?:any){
 if(previous!==null&&!/^[a-f0-9]{64}$/.test(previous))return fail('評価の版を確認してください。');
 const record=preloaded??await ownPracticeRow(db,guild,identity,id),keys=[record.primary_metric??'dpr',...unpack(record.supporting_metrics_json)??[]] as Metric[];
 const rows=record.planned_at===null?[]:await observationRows(db,identity,record.planned_at,now);
 const linked=await linkedMatch(db,guild,identity,record.match_id,rows.find(r=>r.match_id===record.match_id));
 const observation=record.planned_at===null?null:compareObservation(rows,identity,record.planned_at,keys);
 const simultaneous=record.planned_at===null?0:await db.prepare("SELECT COUNT(*) AS n FROM coach_practice_records WHERE guild=? AND subject_id=? AND record_id<>? AND deleted_at IS NULL AND planned_at>=? AND planned_at<=?").bind(guild,identity.subjectId,id,record.planned_at-30*DAY,Math.min(now,record.planned_at+30*DAY)).first<{n:number}>();
 const version=await sha(JSON.stringify([REVIEW_RULE,record.version,record.planned_at,keys,rows,linked?.row??null,simultaneous]));
 const plan=unpack(record.plan_json)??[],check=plan[0]?.check??'次の試合で試す行動を一つ決めてください。';
 return {recordId:id,recordVersion:record.version,evaluatedAt:now,evaluationVersion:version,ruleVersion:REVIEW_RULE,revisedComparedWithPrevious:previous!==null&&previous!==version,anchor:record.planned_at,backfilled:record.planned_at===null,
  selfReport:{source:'本人の申告',practiceVerified:false,execution:unpack(record.execution_json),reflection:record.reflection,items:plan,occurredDate:record.occurred_date_jst},
  linked:linked?{match:linked.match,metrics:Object.fromEntries(keys.map(k=>[k,metric(linked.performance,k)])),selfReportedApplication:true}:null,linkedUnavailable:!!record.match_id&&!linked,
  observation,otherPlannedRecords:typeof simultaneous==='object'?simultaneous?.n??0:0,causalEffectVerified:false,
  nextStep:{action:check,explanation:record.planned_at===null?'後から登録した記録のため、自動の前後比較は行いません。本人の確認方法と、関連付けた試合を振り返ってください。':observation?.comparisons.some(c=>c.state==='provisional')?'数値と条件の違いを確認し、次の試合では同じ行動を一つ試してください。数値の差だけで練習の効果は断定しません。':'試合数にかかわらず、次の試合で確認する一場面を決めてください。両側の有効試合が5件未満の指標は観察中です。'},
  limitations:['保存済みの本人のコンペだけを、終了時刻順で最大10試合ずつ選んでいます。全試合を収集できた保証はありません。','試合終了が予定保存より後でも、試合開始が練習後だったとは断定できません。','攻守、相手の強さ、味方、同時に変えた練習は統制していません。勝率を練習の成功判定には使いません。','各側5試合は表示上の運用基準であり、統計的有意差や実力の認定基準ではありません。','立ち位置、視線、VC、行動の実施は録画や本人への確認が必要です。']};
}
