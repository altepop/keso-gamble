import test from 'node:test';
import assert from 'node:assert/strict';
import {replaySavedCoachFeedback,COACH_FEEDBACK_REPLAY_LIMIT,COACH_FEEDBACK_REPLAY_WINDOW_MS} from '../src/coach-feedback-replay.ts';
const NOW=Date.parse('2026-11-24T01:20:00+09:00');
const mapping={guildId:'guild',accounts:[
 {riotId:'Dolly#SDGs',discordUserId:'123456789012345678'},
 {riotId:'h1d3g1g4s#1037',discordUserId:'234567890123456789'}
]};
const candidate=(riot_id:string,match_id:string,ended_at=NOW-28*60_000)=>({riot_id,match_id,ended_at,puuid:'puuid-'+match_id});
function db(rows:ReturnType<typeof candidate>[],history:{sql?:string;args?:unknown[];diagnostics?:Record<string,string>}={}){
 return {prepare(sql:string){
   if(sql.startsWith('INSERT INTO monitor_state(key,value)'))return {bind(key:string,value:string){return {run:async()=>{(history.diagnostics??={})[key]=value;return {meta:{changes:1}};}};}};
   history.sql=sql;assert.match(sql,/NOT EXISTS .*coach_personal_feedback:v1:/);
   assert.match(sql,/n\.mode='competitive'/);assert.match(sql,/a\.guild=\?/);
   return {bind(...args:unknown[]){history.args=args;return {all:async()=>({results:rows})};}};
 }} as any;
}
test('recent stored member results use existing sender with bounded batch',async()=>{
 const hist:{}={};const rows=[candidate('Dolly#SDGs','sunset'),candidate('h1d3g1g4s#1037','corrode')];
 const sends:string[]=[];
 const result=await replaySavedCoachFeedback({DB:db(rows,hist),KESO_COACH_WEBHOOK_URL:'present'} as any,mapping,NOW,
  (async(_env:any,_mapping:any,id:string)=>{sends.push(id);return 'posted';}) as any);
 assert.deepEqual(sends,['sunset','corrode']);
 assert.deepEqual(result,{scanned:2,attempted:2,posted:2,statuses:{posted:2}});
 assert.ok((hist as {sql:string}).sql.includes('LIMIT 24'));
});
test('SQL excludes all prior receipts including claimed and unknown',async()=>{
 const history:{sql?:string;args?:unknown[]}={};
 await replaySavedCoachFeedback({DB:db([],history),KESO_COACH_WEBHOOK_URL:'present'} as any,mapping,NOW,async()=>{throw Error('unexpected');});
 assert.match(history.sql!,/NOT EXISTS .*monitor_state/);
 assert.match(history.sql!,/a\.subject_id\|\|':'\|\|n\.match_id/);
 assert.equal(history.args?.[0],'guild');
 assert.deepEqual(history.args?.slice(-2),[NOW-COACH_FEEDBACK_REPLAY_WINDOW_MS,NOW]);
});
test('mapping, age, and future validation prevent unintended sends',async()=>{
 const rows=[candidate('Dolly#SDGs','valid'),candidate('other#x','other'),candidate('Dolly#SDGs','future',NOW+1000),
 candidate('Dolly#SDGs','old',NOW-COACH_FEEDBACK_REPLAY_WINDOW_MS-1)];
 const sent:string[]=[];
 const result=await replaySavedCoachFeedback({DB:db(rows),KESO_COACH_WEBHOOK_URL:'present'} as any,mapping,NOW,
  (async(_e:any,_m:any,id:string)=>{sent.push(id);return 'suppressed';}) as any);
 assert.deepEqual(sent,['valid']);assert.equal(result.posted,0);assert.equal(result.statuses.suppressed,1);
});
test('missing webhook cannot read DB or send',async()=>{
 let queries=0;const result=await replaySavedCoachFeedback({DB:{prepare(){queries++;throw Error('DB');}},KESO_COACH_WEBHOOK_URL:undefined} as any,mapping,NOW);
 assert.equal(queries,0);assert.equal(result.attempted,0);
});
test('bounded retry does not retry errored or duplicate receipts within one run',async()=>{
 const rows=Array.from({length:8},(_,i)=>candidate('Dolly#SDGs','id'+i));let calls=0;
 const result=await replaySavedCoachFeedback({DB:db(rows),KESO_COACH_WEBHOOK_URL:'present'} as any,mapping,NOW,
  (async()=>{calls++;if(calls===1)throw Error('transient');return 'duplicate';}) as any);
 assert.equal(calls,COACH_FEEDBACK_REPLAY_LIMIT);
 assert.equal(result.statuses.error,1);assert.equal(result.statuses.duplicate,2);
 assert.equal(result.posted,0);
});

test('every page is visited across three five-minute slots even when all candidates remain incomplete',async()=>{
 const rows=Array.from({length:9},(_,i)=>candidate('Dolly#SDGs','id'+i));
 const seen=new Set<string>();
 for(let n=0;n<3;n++){
   const batch:string[]=[];
   const result=await replaySavedCoachFeedback({DB:db(rows),KESO_COACH_WEBHOOK_URL:'present'} as any,mapping,NOW+n*5*60_000,
     (async(_env:any,_mapping:any,id:string)=>{batch.push(id);seen.add(id);return 'incomplete';}) as any);
   assert.equal(batch.length,COACH_FEEDBACK_REPLAY_LIMIT);
   assert.equal(result.statuses.incomplete,COACH_FEEDBACK_REPLAY_LIMIT);
   assert.equal(result.posted,0);
 }
 assert.equal(seen.size,9,'older matches must not be starved by incomplete newest matches');
});

test('replay persists per-match status without creating delivery receipts',async()=>{
 const history:{diagnostics?:Record<string,string>}={};
 const rows=[candidate('Dolly#SDGs','sunset'),candidate('h1d3g1g4s#1037','corrode')];
 const result=await replaySavedCoachFeedback({DB:db(rows,history),KESO_COACH_WEBHOOK_URL:'present'} as any,mapping,NOW,
  (async(_env:any,_mapping:any,id:string)=>id==='sunset'?'incomplete':'wrong-channel') as any);
 assert.equal(result.posted,0);
 assert.deepEqual(result.statuses,{'incomplete':1,'wrong-channel':1});
 assert.deepEqual(Object.keys(history.diagnostics??{}).sort(),[
  'coach_feedback_replay_result:v1:corrode','coach_feedback_replay_result:v1:sunset'
 ]);
 for(const [key,value] of Object.entries(history.diagnostics??{})){
  const record=JSON.parse(value);
  assert.equal(record.status,key.endsWith(':sunset')?'incomplete':'wrong-channel');
  assert.equal(typeof record.at,'number');
 }
});
