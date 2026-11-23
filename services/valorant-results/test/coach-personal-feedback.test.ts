import test from 'node:test';
import assert from 'node:assert/strict';
import {formatPersonalFeedback,largestObservedSwing,postCoachPersonalFeedback,claimPersonalFeedbackReceipt} from '../src/coach-personal-feedback.ts';

const players=Array.from({length:10},(_,i)=>({puuid:'p'+i,team_id:i<5?'Blue':'Red'}));
const archive={
 ended_at:100,map:'Bind',players_json:JSON.stringify(players),
 rounds_json:JSON.stringify([{r:0,winner:'Blue'}]),
 kills_json:JSON.stringify([
  {r:0,t:1000,killer:'p5',victim:'p0'},
  {r:0,t:2000,killer:'p6',victim:'p1'},
  {r:0,t:3000,killer:'p2',victim:'p5'},
  {r:0,t:4000,killer:'p3',victim:'p6'},
  {r:0,t:5000,killer:'p4',victim:'p7'},
  {r:0,t:6000,killer:'p2',victim:'p8'},
  {r:0,t:7000,killer:'p3',victim:'p9'}
 ])
};
const session={
 date:'2026-11-23T10:00:00.000Z',map:'Bind',agent:'Clove',
 lesson:{track:'kpr',practice:{name:'止まって撃つ練習'}},
 metrics:[{key:'kpr',label:'1R当たりのキル（KPR）',current:{value:0.8},baseline:{value:0.6,matches:4}}]
};
test('verified alive-count comeback is the only turning point; absent evidence stays absent',()=>{
 assert.deepEqual(largestObservedSwing(archive,'p2'),{
  round:1,description:'人数不利から逆転したラウンド（最大2人差）'
 });
 assert.equal(largestObservedSwing({...archive,kills_json:null},'p2'),null);
 assert.equal(largestObservedSwing({...archive,players_json:'[]'},'p2'),null);
 assert.equal(largestObservedSwing(archive,'not-a-player'),null);
});
test('short polite individual notice uses only supplied session facts and validated daily items',()=>{
 const body=formatPersonalFeedback({user:'123456789012345678',name:'選手',map:'Bind',outcome:'win',
  swing:{round:1,description:'人数不利から逆転したラウンド（最大2人差）'},
  session,daily:{warmup:{title:'止まって撃つ練習'},study:{map:'Bind',theme:'テレポーターとスプリット'}}});
 assert.ok(body);
 assert.match(body!,/^<@123456789012345678> 🎯/);
 assert.match(body!,/KPR.*0\.80.*0\.60/);
 assert.match(body!,/第1ラウンド/);
 assert.match(body!,/本日の座学/);
 assert.match(body!,/止まって撃つ練習/);
 assert.ok(body!.length<=2000);
});
test('no invented training, study or Discord mention for missing information',()=>{
 const template={user:'123456789012345678',name:'選手',map:'Bind',outcome:'win' as const,
  swing:{round:1,description:'観測済み'},session};
 assert.equal(formatPersonalFeedback({...template,daily:{warmup:null,study:{map:'Bind',theme:'座学'}}}),null);
 assert.equal(formatPersonalFeedback({...template,daily:{warmup:{title:'練習'},study:null}}),null);
 assert.equal(formatPersonalFeedback({...template,user:'invalid',daily:{warmup:{title:'練習'},study:{map:'Bind',theme:'座学'}}}),null);
});
test('missing webhook never queries database or sends a message',async()=>{
 let queries=0,posts=0;
 const env={DB:{prepare(){queries++;throw Error('should not query');}},KESO_COACH_WEBHOOK_URL:undefined} as any;
 const result=await postCoachPersonalFeedback(env,{guildId:'g'} as any,'match','p2',100,async()=>{posts++;throw Error('should not send');});
 assert.equal(result,'unconfigured');assert.equal(queries,0);assert.equal(posts,0);
});
test('an explicit OFF preference suppresses without webhook requests or claims',async()=>{
 let calls=0;
 const env={DB:{prepare(sql:string){assert.match(sql,/coach_team_notice_preferences/);return {bind:()=>({first:async()=>null})};}},KESO_COACH_WEBHOOK_URL:'https://discord.com/api/webhooks/123456789012345678/abcdefgh'} as any;
 const status=await postCoachPersonalFeedback(env,{guildId:'g'} as any,'match','p2',100,async()=>{calls++;throw Error('no network');});
 assert.equal(status,'suppressed');assert.equal(calls,0);
});

test('atomic claim admits only one sender across concurrent Cron retries',async()=>{
 const rows=new Map<string,string>();
 const db={prepare(sql:string){assert.match(sql,/INSERT OR IGNORE INTO monitor_state/);
  return {bind(key:string,value:string){return {async run(){if(rows.has(key))return {meta:{changes:0}};
   rows.set(key,value);return {meta:{changes:1}};}};}};}} as any;
 const outcomes=await Promise.all(Array.from({length:8},()=>claimPersonalFeedbackReceipt(db,'coach_personal_feedback:v1:subject:match',100)));
 assert.deepEqual(outcomes.filter(Boolean),[true]);
 assert.equal(rows.size,1);
 assert.deepEqual(JSON.parse(rows.values().next().value!),{state:'claimed',at:100});
});
