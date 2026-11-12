import test from 'node:test';
import assert from 'node:assert/strict';
import {selectSanmaFindings} from '../src/mahjong-sanma-selection.ts';
import {acceptedSanmaReport,equalSanmaComments} from '../src/mahjong-sanma-comment.ts';
import {threeValueScenario} from './fixtures/mahjong-review-three.ts';
import type {SanmaRuleFinding} from '../src/mahjong-sanma-report.ts';
const shape=(seat=0,turn=1,gap=8):SanmaRuleFinding=>({seat,round:0,turn,actual:'1p',recommended:'9p',basis:'shape',
 actualMetric:{tile:'1p',shanten:2,ukeire:12,improving:['2p'],bonus:0},
 recommendedMetric:{tile:'9p',shanten:2,ukeire:12+gap,improving:['2p','3s'],bonus:0}});
const value=(seat=0,turn=8):SanmaRuleFinding=>({seat,round:0,turn,actual:'2s',recommended:'5s',basis:'tsumo-value',riichi:false,doubleRiichi:false,menzen:true,
 actualValue:{tile:'2s',live:7,min:3000,max:3000,hanMin:3,hanMax:3,fuMin:30,fuMax:30},
 recommendedValue:{tile:'5s',live:7,min:6000,max:6000,hanMin:5,hanMax:5,fuMin:20,fuMax:20}});
test('later substantial comparisons outrank early notes; same decisions are not repeated',()=>{
 const small=shape(),large=shape(0,2,16),valuable=value(0,3);
 const sameDecision=shape(0,3,24);
 assert.deepEqual(selectSanmaFindings([small,large,sameDecision,valuable],2),[valuable,large]);
 assert.deepEqual(selectSanmaFindings([small,large,sameDecision,valuable],2),[valuable,large]);
});
test('remaining notes cover other players before adding a second note for one player',()=>{
 const strong=value(),second=shape(0,2,24),other=shape(1,3);
 assert.deepEqual(selectSanmaFindings([second,other,strong],2),[strong,other]);
 assert.deepEqual(selectSanmaFindings([second,other,strong]),[strong,other,second]);
});
test('old agreement reports do not consume slots or force a congratulation',()=>{
 const old=shape();old.recommended=old.actual;
 if(old.basis==='shape')old.recommendedMetric=old.actualMetric;
 const useful=value();
 assert.deepEqual(selectSanmaFindings([old]),[]);
 assert.deepEqual(selectSanmaFindings([old,useful]),[useful]);
 const {summary}=threeValueScenario();
 const report={version:3,source:'sanma-rules',model:'sanma-rules-v3',uuid:summary.uuid,findings:[old,useful]};
 assert.ok(acceptedSanmaReport(summary,report));
 const comments=equalSanmaComments(summary,report,new Map([[0,{name:'けそ'}]]));
 assert.equal(comments.length,1);assert.match(comments[0],/3000点/);assert.match(comments[0],/6000点/);
});
test('only registered members take the two commentary slots',()=>{
 const {summary}=threeValueScenario();
 const report={version:3,source:'sanma-rules',model:'sanma-rules-v3',uuid:summary.uuid,findings:[value(0),value(1),shape(2)]};
 const comments=equalSanmaComments(summary,report,new Map([[2,{name:'登録者'}]]));
 assert.equal(comments.length,1);assert.match(comments[0],/登録者/);
});
