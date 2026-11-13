import test from 'node:test';import assert from 'node:assert/strict';
import {threeValueScenario} from './fixtures/mahjong-review-three.ts';
import {reviewDecisions} from '../src/mahjong-review-state.ts';
import {sanmaValueCase,sanmaTradeoffFinding} from '../src/mahjong-sanma-value.ts';
import {sanmaPushFoldFinding,sanmaDefenseFinding} from '../src/mahjong-sanma-defense.ts';
import {acceptedSanmaReport,equalSanmaComments} from '../src/mahjong-sanma-comment.ts';
// @ts-expect-error Standalone Actions calculator.
import {reviewSanmaValues} from '../scripts/mahjong-sanma-value.mjs';
const setup=()=>{const f=threeValueScenario();return {...f,d:reviewDecisions(f.actions,f.summary).find(d=>d.seat===1&&d.turn===2)!};};
const m=(tile:string,live:number,min:number)=>({tile,live,min,max:min,hanMin:3,hanMax:3,fuMin:30,fuMax:30});
test('a real speed/value tradeoff is explained in both directions without calling it a mistake',()=>{
 const {d,summary}=setup();
 for(const metrics of [[m('2s',8,3000),m('5s',4,6000)],[m('2s',4,6000),m('5s',8,3000)]]){
  const finding=sanmaTradeoffFinding(d,metrics)!;assert.ok(finding);
  const report={version:5,source:'sanma-rules',model:'sanma-rules-v5',uuid:summary.uuid,findings:[finding]};
  assert.ok(acceptedSanmaReport(summary,report));const text=equalSanmaComments(summary,report,new Map([[1,{name:'検証者'}]])).join('');
  assert.match(text,/8枚/);assert.match(text,/4枚/);assert.match(text,/3000点/);assert.match(text,/6000点/);assert.match(text,/分かれ道/);assert.match(text,/待ちの広さを優先するなら、僕は.+切りが好み/);assert.doesNotMatch(text,/ミス|間違い|ええ選択/);
  assert.equal(acceptedSanmaReport(summary,{...report,version:4,model:'sanma-rules-v4'}),null);
 }
 assert.equal(sanmaTradeoffFinding(d,[m('2s',8,3000),m('5s',8,6000)]),null,'ordinary domination remains a separate finding');
 assert.equal(sanmaTradeoffFinding(d,[m('2s',8,3000),m('5s',7,3500)]),null,'small differences are not manufactured into a lesson');
});
test('near hands can compare keeping efficiency against a real held genbutsu',()=>{
 const {d,summary}=setup();d.seat=0;d.dealer=0;d.turn=8;d.actual='2s';d.declaringReach=false;
 d.hand=['1p','2p','3p','4p','5p','6p','2s','4s','7s','8s','E','E','P','P'];d.visible=Array(34).fill(0);d.doras=['S'];d.riichi=[false,true,false];d.rivers=[[],['9m','E'],[]];
 assert.equal(sanmaDefenseFinding(d,summary.game),null,'the old far-hand category is not stretched');
 const finding=sanmaPushFoldFinding(d,summary.game)!;assert.ok(finding);assert.ok(finding.shanten<=2);assert.equal(finding.recommended,'E');
 const report={version:5,source:'sanma-rules',model:'sanma-rules-v5',uuid:summary.uuid,findings:[finding]};
 assert.ok(acceptedSanmaReport(summary,report));const text=equalSanmaComments(summary,report,new Map([[0,{name:'検証者'}]])).join('');
 assert.match(text,/守備に寄せるなら、僕は現物の東切りが好み/);assert.match(text,/向聴/);assert.match(text,/放銃率/);assert.match(text,/正解までは計算してへん/);
 assert.equal(sanmaPushFoldFinding({...d,riichi:[true,true,false]},summary.game),null);
 assert.equal(sanmaPushFoldFinding({...d,riichi:[false,true,true]},summary.game),null);
 assert.equal(acceptedSanmaReport(summary,{...report,findings:[{...finding,recommendedMetric:{...finding.recommendedMetric,tile:'9m'}}]}),null);
});
test('a single tenpai discard at a recorded riichi produces a real dama comparison',{skip:!process.env.SANMA_PYTHON},()=>{
 const {d,summary}=setup();d.hand=['1p','2p','3p','4p','5p','6p','7s','8s','9s','E','E','E','P','9m'];d.actual='9m';d.draw='9m';d.declaringReach=true;d.visible=Array(34).fill(0);d.visible[8]=3;d.doras=['S'];
 const c=sanmaValueCase(d,summary.game)!;assert.ok(c);assert.equal(c.candidates.length,1);
 const findings=reviewSanmaValues([d],summary.game);assert.equal(findings.length,1);const finding=findings[0];assert.equal(finding.basis,'riichi-choice');assert.equal(finding.actual,finding.recommended);
 assert.ok(finding.riichiValue.min>=finding.damaValue.max+1000);
 const report={version:5,source:'sanma-rules',model:'sanma-rules-v5',uuid:summary.uuid,findings};
 const text=equalSanmaComments(summary,report,new Map([[1,{name:'検証者'}]])).join('');
 assert.match(text,/ダマ/);assert.match(text,/1000点を供託/);assert.match(text,/自由に手を変え/);assert.doesNotMatch(text,/ええですね|神プレイ/);
 assert.equal(sanmaValueCase({...d,declaringReach:false},summary.game),null,'a hypothetical declaration is not invented from a single candidate');
 assert.equal(acceptedSanmaReport(summary,{...report,findings:[{...finding,riichiValue:{...finding.riichiValue,live:99}}]}),null);
});

test('real calculator finds the value/wait tradeoff caused by public tile depletion',{skip:!process.env.SANMA_PYTHON},()=>{
 const {d,summary}=setup();d.visible[18]=3; // Three 1s are public, including the actual indicator.
 const result=reviewSanmaValues([d],summary.game);assert.equal(result.length,1);
 const f=result[0];assert.equal(f.basis,'wait-value-tradeoff');
 assert.equal(f.actualValue.live,7);assert.equal(f.recommendedValue.live,5);
 assert.equal(f.actualValue.min,3000);assert.equal(f.recommendedValue.min,6000);
});
