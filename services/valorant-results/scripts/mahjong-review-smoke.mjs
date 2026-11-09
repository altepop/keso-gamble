// Artificial, physically consistent four-player game. This is NOT a real
// Mahjong Soul match or a claim about playing strength. No account/DB/Discord.
import {createPaipuReviewer} from './mahjong-review.mjs';
import {buildC3Cases} from '../src/mahjong-c3-cases.ts';
import {acceptedC3Report} from '../src/mahjong-c3-comment.ts';
const root=process.env.C3_ASSETS_ROOT;if(!root)throw Error('model_cache_unconfigured');
const pool=[];
for(const suit of ['m','p','s'])for(let rank=1;rank<=9;rank++)for(let copy=0;copy<4;copy++)pool.push(rank+suit);
for(const suit of ['m','p','s'])pool[pool.indexOf('5'+suit)]='0'+suit;
for(let rank=1;rank<=7;rank++)for(let copy=0;copy<4;copy++)pool.push(rank+'z');
let seed=924851;for(let i=pool.length-1;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%(i+1);[pool[i],pool[j]]=[pool[j],pool[i]];}
const hands=Array.from({length:4},(_,s)=>pool.splice(0,s===0?14:13));
const start={chang:0,ju:0,ben:0,liqibang:0,scores:[25000,25000,25000,25000],doras:[pool.pop()],...Object.fromEntries(hands.map((h,s)=>['tiles'+s,h]))};
const actions=[{name:'RecordNewRound',data:start},{name:'RecordDiscardTile',data:{seat:0,tile:hands[0].at(-1),moqie:true}}];
for(let cycle=0;cycle<4;cycle++)for(const seat of [1,2,3,0]){const tile=pool.pop();actions.push({name:'RecordDealTile',data:{seat,tile}},{name:'RecordDiscardTile',data:{seat,tile,moqie:true}});}
const summary={v:1,uuid:'synthetic-physical-four-player-smoke',game:'4-hanchan',players:4,start:0,end:1,seats:[],rounds:[{label:'東1局'}]};
const cases=buildC3Cases(actions,summary);
if(!cases.length)throw Error('synthetic_case_missing');
const reviewer=createPaipuReviewer({root,fourEnabled:true,sanmaEnabled:true,timeoutMs:45000,budgetMs:90000});
try{
 const result=await reviewer.review(summary,actions);
 if(!acceptedC3Report(summary,result))throw Error('isolated_real_model_review_failed');
 for(const f of result.findings){const c=cases.find(c=>c.seat===f.seat&&c.round===f.round&&c.turn===f.turn&&c.actual===f.actual);if(!c||!c.legal.includes(f.recommended))throw Error('model_discard_unverified');}
 console.log('Equal review: real model + isolated worker + artificial legal four-player replay passed; no real-game, Discord or KP claim.');
 if(process.env.SANMA_PYTHON){
  const {makeProbeBody}=await import('./mahjong-review-delivery-probe.mjs');const body=await makeProbeBody({reviewer});
  if(body.embeds.length!==2||JSON.stringify(body.allowed_mentions)!==JSON.stringify({parse:[]})||!body.content.includes('人工牌譜')||!body.content.includes('KP支給・残高変更はありません'))throw Error('probe_presentation_invalid');
  if(/<@|c3|synthetic|sanma-rules/.test(JSON.stringify(body)))throw Error('probe_identity_or_model_leak');
  console.log('Equal review: real models generated labelled three/four-player probe body; not queued or sent by this smoke.');
 }

}finally{await reviewer.close();}

// All are artificial records. This verifies the actual encoder's state/mask,
// plus real network output after each supported strategic transition.
const {fourScenario,FOUR_SCENARIOS}=await import('../test/fixtures/mahjong-review-four.ts');
const {createC3Reviewer}=await import('./mahjong-c3-infer.mjs');
const four=await createC3Reviewer(root);
try{
 for(const kind of FOUR_SCENARIOS){
  const {summary,actions}=fourScenario(kind),cases=buildC3Cases(actions,summary);
  const event=kind==='reach'?'reach_accepted':kind;
  const relevant=cases.filter(c=>c.events.some(e=>e.type===event));
  if(!relevant.length)throw Error('synthetic_transition_missing_'+kind);
  // Include the immediate called-hand discard if present and all sampled seats.
  for(const c of relevant){const inspected=await four.inspect(c);if(!inspected.actualLegal||!inspected.legalDiscardCount)throw Error('synthetic_mask_invalid_'+kind);}
  const report=await four.review(summary,actions);
  if(!acceptedC3Report(summary,report))throw Error('synthetic_model_report_missing_'+kind);
  console.log('Equal review: artificial '+kind+' context, real encoder legal masks and model findings passed');
 }
}finally{await four.close();}
