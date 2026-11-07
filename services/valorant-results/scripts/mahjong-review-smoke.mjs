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
const reviewer=createPaipuReviewer({root,fourEnabled:true,timeoutMs:45000,budgetMs:90000});
try{
 const result=await reviewer.review(summary,actions);
 if(!acceptedC3Report(summary,result))throw Error('isolated_real_model_review_failed');
 for(const f of result.findings){const c=cases.find(c=>c.seat===f.seat&&c.round===f.round&&c.turn===f.turn&&c.actual===f.actual);if(!c||!c.legal.includes(f.recommended))throw Error('model_discard_unverified');}
 console.log('Equal review: real model + isolated worker + artificial legal four-player replay passed; no real-game, Discord or KP claim.');
}finally{await reviewer.close();}
