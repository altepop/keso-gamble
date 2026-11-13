import test from 'node:test';
import assert from 'node:assert/strict';
import {tsumoRanks,riverSuji} from '../src/mahjong-sanma-context.ts';
import {sanmaPlacementFinding} from '../src/mahjong-sanma-value.ts';
import {acceptedSanmaReport,equalSanmaComments} from '../src/mahjong-sanma-comment.ts';
import {reviewDecisions} from '../src/mahjong-review-state.ts';
import {threeValueScenario} from './fixtures/mahjong-review-three.ts';
// @ts-expect-error Actions-side coordinator.
import {reviewSanmaValues} from '../scripts/mahjong-sanma-value.mjs';
const metric=(tile:string,main=2000,additional=1000)=>({tile,live:7,min:main+additional,max:main+additional,hanMin:3,hanMax:3,fuMin:30,fuMax:30,payments:[{main,additional}]});
const setup=()=>{
 const f=threeValueScenario(),base=reviewDecisions(f.actions,f.summary).find(d=>d.seat===1&&d.turn===2)!;
 const d={...base,wind:1,dealer:2,honba:0,sticks:0,scores:[43000,28000,34000]};
 return {...f,d,summary:{...f.summary,rounds:[{...f.summary.rounds[0],label:'南3局'}]}};
};
test('rank uses asymmetric payer deductions, not just the winner total',()=>{
 const m=metric('2s');
 assert.deepEqual(tsumoRanks([43000,28000,34000],1,2,m),[3]);
 assert.deepEqual(tsumoRanks([43000,28000,34000],1,2,metric('5s',4000,2000)),[2]);
 // Same 3,000 total, but the near opponent is now the child paying only 1,000.
 assert.deepEqual(tsumoRanks([32500,28000,44500],1,2,m),[3]);
 assert.deepEqual(tsumoRanks([44500,28000,32500],1,2,m),[2]);
 assert.equal(tsumoRanks([43000,28000,33000],1,2,m),null,'equal scores need an explicit tie rule');
 assert.equal(tsumoRanks([43000,28000,34000],1,2,{...m,min:9999}),null);
});
test('endgame finding compares all conditional outcomes and retains live waits',()=>{
 const {d,summary}=setup(),f=sanmaPlacementFinding(d,summary.game,[metric('2s'),metric('5s',4000,2000)])!;
 assert.ok(f);assert.equal(f.basis,'placement');
 const r={version:4,source:'sanma-rules',model:'sanma-rules-v4',uuid:summary.uuid,findings:[f]};
 assert.ok(acceptedSanmaReport(summary,r));
 const lines=equalSanmaComments(summary,r,new Map([[1,{name:'検証者'}]]));
 assert.match(lines[0],/6000点差/);assert.match(lines[0],/3000点.*3位/);assert.match(lines[0],/6000点.*2位/);
 assert.match(lines[0],/ツモ損/);assert.match(lines[0],/対局終了までは別/);
 assert.equal(acceptedSanmaReport(summary,{...r,version:3,model:'sanma-rules-v3'}),null);
 assert.equal(acceptedSanmaReport({...summary,rounds:[{...summary.rounds[0],label:'南2局'}]},r),null);
 for(const change of [{honba:1},{sticks:1},{seat:2},{declaringReach:true},{wind:2}])assert.equal(sanmaPlacementFinding({...d,...change},summary.game,[metric('2s'),metric('5s',4000,2000)]),null);
 assert.equal(sanmaPlacementFinding(d,summary.game,[metric('2s'),{...metric('5s',4000,2000),live:6}]),null);
 const variable={...metric('5s'),max:6000,payments:[{main:2000,additional:1000},{main:4000,additional:2000}]};
 assert.equal(sanmaPlacementFinding(d,summary.game,[metric('2s'),variable]),null,'a favorable wait alone cannot establish a rank improvement');
});
test('suji requires both sides for middle tiles and never means safe',()=>{
 assert.equal(riverSuji('1p',['4p']),true);assert.equal(riverSuji('9s',['6s']),true);
 assert.equal(riverSuji('5pr',['2p']),false);assert.equal(riverSuji('5p',['2p','8p']),true);
 assert.equal(riverSuji('4p',['7p']),false);assert.equal(riverSuji('E',['E']),null);
});
test('real calculator supplies payer evidence for an endgame comparison',{skip:!process.env.SANMA_PYTHON},()=>{
 const {d,summary}=setup();const result=reviewSanmaValues([d],summary.game);
 assert.equal(result.length,1);assert.equal(result[0].basis,'placement');
 assert.deepEqual(result[0].actualValue.payments,[{main:2000,additional:1000}]);
 assert.deepEqual(result[0].recommendedValue.payments,[{main:4000,additional:2000}]);
 const {publicRed,...withoutPublicRed}=d;assert.deepEqual(reviewSanmaValues([withoutPublicRed],summary.game),[]);
});

test('endgame context survives the real isolated replay worker',{skip:!process.env.SANMA_PYTHON},async()=>{
 // @ts-expect-error Actions-side worker.
 const {createPaipuReviewer}=await import('../scripts/mahjong-review.mjs');
 const f=threeValueScenario(),actions=structuredClone(f.actions),start=actions[0].data;
 const remap=(s:number)=>(s+2)%3,hands=[start.tiles0,start.tiles1,start.tiles2];
 hands.forEach((h,i)=>start['tiles'+remap(i)]=h);
 start.ju=2;start.chang=1;start.scores=[28000,43000,34000];start.ben=0;start.liqibang=0;
 for(const a of actions.slice(1)){if(Number.isInteger(a.data.seat))a.data.seat=remap(a.data.seat);}
 const summary={...f.summary,rounds:[{...f.summary.rounds[0],label:'南3局'}]};
 const reviewer=createPaipuReviewer({sanmaEnabled:true,timeoutMs:15000});
 try{
  const r=await reviewer.review(summary,actions);assert.ok(acceptedSanmaReport(summary,r));
  assert.equal(r.version,5);assert.ok(r.findings.some((v:any)=>v.basis==='placement'));
  const text=equalSanmaComments(summary,r,new Map([[0,{name:'検証者'}]])).join('');
  assert.match(text,/3位/);assert.match(text,/2位/);
 }finally{await reviewer.close();}
});

test('late final-round decisions can reserve bounded replay slots without changing default callers',()=>{
 const f=threeValueScenario(),late=structuredClone(f.actions);late[0].data.chang=1;late[0].data.ju=2;
 const hands=[late[0].data.tiles0,late[0].data.tiles1,late[0].data.tiles2];
 hands.forEach((h,i)=>late[0].data['tiles'+((i+2)%3)]=h);
 for(const a of late.slice(1))if(Number.isInteger(a.data.seat))a.data.seat=(a.data.seat+2)%3;
 const summary={...f.summary,rounds:[f.summary.rounds[0],{...f.summary.rounds[0],label:'南3局'}]};
 const actions=[...f.actions,...late];
 const original=reviewDecisions(actions,summary,2),reserved=reviewDecisions(actions,summary,2,undefined,undefined,true);
 assert.equal(original.length,2);assert.ok(original.every(d=>d.round===0));
 assert.equal(reserved.length,2);assert.ok(reserved.every(d=>d.round===1));
});
