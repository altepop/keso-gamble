// Artificial, legal prefixes. Terminal data tests replay closure/fact rendering;
// it does NOT certify that the synthetic winning hand is a legal yakuman.
import test from 'node:test';
import assert from 'node:assert/strict';
import {threeValueScenario} from './fixtures/mahjong-review-three.ts';
import {fourScenario} from './fixtures/mahjong-review-four.ts';
import {reviewDecisions} from '../src/mahjong-review-state.ts';
import {sanmaValueCase} from '../src/mahjong-sanma-value.ts';
import {summarizePaipu} from '../src/mahjong-summary.ts';
import {paipuPostMessages} from '../src/mahjong-paipu.ts';
for(const players of [3,4] as const)for(const length of ['tonpu','hanchan'] as const){
 test(`${players}-${length}: exhaustive/abortive/multi-win/yakuman endings never alter earlier decisions`,()=>{
  const fixture=players===3?threeValueScenario():fourScenario('reach');
  const actions=fixture.actions,head=players===3?threeValueScenario().head:{uuid:'synthetic-matrix-four',start_time:0,end_time:1,accounts:Array.from({length:4},(_,seat)=>({seat,account_id:seat+1,nickname:'test'+seat})),result:{players:Array.from({length:4},(_,seat)=>({seat,part_point_1:25000}))}};
  const h={...head,config:{mode:{mode:players===3?(length==='tonpu'?11:12):(length==='tonpu'?1:2)}}};
  const before=reviewDecisions(actions,summarizePaipu(h,actions));assert.ok(before.length);
  const endings=[
   {name:'RecordNoTile',data:{players:Array.from({length:players},(_,s)=>({tingpai:s===1})),scores:[]}},
   {name:'RecordLiuJu',data:{}},
   {name:'RecordHule',data:{hules:[{seat:0,zimo:false,yiman:true,count:1,fans:[{id:42,val:1}],fu:0}],delta_scores:Array.from({length:players},()=>0)}},
   {name:'RecordHule',data:{hules:[{seat:0,zimo:false,fu:30,point_rong:2000,fans:[{id:2,val:1}]},{seat:2,zimo:false,fu:30,point_rong:2000,fans:[{id:2,val:1}]}],delta_scores:Array.from({length:players},()=>0)}},
  ];
  for(const end of endings){
   const completed=[...actions,end],summary=summarizePaipu(h,completed),after=reviewDecisions(completed,summary);
   assert.deepEqual(after,before,'future terminal metadata does not influence the earlier snapshot');
   const members=new Map(Array.from({length:players},(_,seat)=>[seat,{name:'test'+seat}]));
   const messages=paipuPostMessages(summary,members,()=> 'full',['✅ KP +100']);
   const text=messages.flatMap(m=>[m.content,...(m.embeds??[]).map(e=>e.description)]).join('');
   for(const section of ['**順位**','**KP**','**メンバー**','💬 '])assert.ok(text.includes(section));
   if(end.name==='RecordHule')assert.ok(text.includes('**主な和了**'));
  }
 });
 test(`${players}-${length}: final-round metadata and bust results are retained; sanma omits unverified placement advice`,()=>{
  const fixture=players===3?threeValueScenario():fourScenario('reach'),actions=structuredClone(fixture.actions),n=players-1;
  const remap=(s:number)=>(s+n)%players;
  const start=actions[0].data,hands=Array.from({length:players},(_,seat)=>start['tiles'+seat]);hands.forEach((hand,seat)=>start['tiles'+remap(seat)]=hand);
  start.ju=n;start.chang=length==='tonpu'?0:1;
  for(const a of actions.slice(1)){
   if(Number.isInteger(a.data.seat))a.data.seat=remap(a.data.seat);
   if(a.data.liqi&&Number.isInteger(a.data.liqi.seat))a.data.liqi.seat=remap(a.data.liqi.seat);
   if(a.data.froms)a.data.froms=a.data.froms.map(remap);
  }
  const head={uuid:'synthetic-final-'+players,start_time:0,end_time:1,config:{mode:{mode:players===3?(length==='tonpu'?11:12):(length==='tonpu'?1:2)}},accounts:Array.from({length:players},(_,seat)=>({seat,account_id:seat+1,nickname:'test'+seat})),result:{players:Array.from({length:players},(_,seat)=>({seat,part_point_1:seat===n?-1000:35000}))}};
  const summary=summarizePaipu(head,actions),frames=reviewDecisions(actions,summary);assert.ok(frames.length);assert.ok(frames.every(d=>d.dealer===n));
  if(players===3)assert.ok(frames.every(d=>sanmaValueCase(d,summary.game)===null));
  const text=paipuPostMessages(summary,new Map([[n,{name:'test'+n}]]),()=> 'full').map(m=>m.content+(m.embeds??[]).map(e=>e.description).join('')).join('');assert.match(text,/トビ/);
 });
}
