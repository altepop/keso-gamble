// Read-only fixture exercise: complete paipu event reconstruction -> Mortal
// observation WASM -> original C3 ONNX -> legal recommendation envelope.
// Uses only synthetic tiles and never connects to Mahjong Soul or Discord.
import assert from 'node:assert/strict';
import {createC3Reviewer} from './mahjong-c3-infer.mjs';
import {buildC3Cases} from '../src/mahjong-c3-cases.ts';
import {summarizePaipu} from '../src/mahjong-summary.ts';
import {acceptedC3Report} from '../src/mahjong-c3-comment.ts';

function fixture(){
 const deck=[];
 for(const suit of 'mps')for(let n=1;n<=9;n++)for(let c=0;c<4;c++)
  deck.push(n===5&&c===0?'0'+suit:n+suit);
 for(let n=1;n<=7;n++)for(let c=0;c<4;c++)deck.push(n+'z');
 let state=539;
 for(let i=deck.length-1;i>0;i--){
  state=(Math.imul(state,1664525)+1013904223)>>>0;
  const j=state%(i+1);
  [deck[i],deck[j]]=[deck[j],deck[i]];
 }
 const hands=Array.from({length:4},(_,seat)=>Array.from({length:seat===0?14:13},()=>deck.shift()));
 const dora=deck.shift();
 const actions=[{name:'RecordNewRound',data:{
  chang:0,ju:0,ben:0,liqibang:0,
  scores:[25000,25000,25000,25000],doras:[dora],
  tiles0:hands[0],tiles1:hands[1],tiles2:hands[2],tiles3:hands[3],
 }}];
 // Uninterrupted four-player tsumo-giri sequence, including the dealer's
 // original 14th tile. No secret opponent tile is passed to the inference.
 actions.push({name:'RecordDiscardTile',data:{seat:0,tile:hands[0][13],moqie:true}});
 for(let turn=0;turn<4;turn++){
  for(const seat of [1,2,3,0]){
   const t=deck.shift();
   actions.push({name:'RecordDealTile',data:{seat,tile:t}});
   actions.push({name:'RecordDiscardTile',data:{seat,tile:t,moqie:true}});
  }
 }
 actions.push({name:'RecordNoTile',data:{players:[],scores:[]}});
 const head={uuid:'261107-11111111-2222-4333-8444-555555555555',start_time:1794000000,end_time:1794001000,
  config:{mode:{mode:2}},accounts:[0,1,2,3].map((seat)=>({account_id:11+seat,seat,nickname:'Synthetic'+seat})),
  result:{players:[0,1,2,3].map(seat=>({seat,part_point_1:25000}))}};
 const summary=summarizePaipu(head,actions);
 return {actions,summary};
}
const {actions,summary}=fixture();
const cases=buildC3Cases(actions,summary);
assert.ok(cases.length>=4,'not enough reconstructed decisions');
for(const c of cases){
 const start=c.events.find(e=>e.type==='start_kyoku');
 assert.ok(start.tehais.every((h,i)=>i===c.seat?h.every(x=>x!=='?'):h.every(x=>x==='?')));
 assert.ok(c.events.filter(e=>e.can_act).length===1&&c.events.at(-1).can_act);
 assert.ok(c.events.every(e=>e.type!=='tsumo'||e.actor===c.seat||e.pai==='?'));
}
const reviewer=await createC3Reviewer(process.env.C3_ASSETS_ROOT);
try{
 const report=await reviewer.review(summary,actions);
 assert.ok(report,'real model returned no legal discard recommendations for all synthetic cases');
 assert.ok(acceptedC3Report(summary,report),'model returned invalid report');
 console.log('equal_review: full synthetic paipu -> WASM observation -> C3 decision -> validated commentary payload PASS');
}finally{await reviewer.close();}
