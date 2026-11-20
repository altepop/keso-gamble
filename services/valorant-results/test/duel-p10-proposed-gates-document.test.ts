import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const document=readFileSync(new URL('../../../docs/duel-phase10-proposed-gates.md',import.meta.url),'utf8');
const requiredGates=[
  '観戦の公開ポリシー',
  '観戦同期方式',
  '大会規模・方式',
  '演出音声の許可',
  '運営者ロール',
];

test('P10 readiness: all five distinct approval gates remain explicitly PROPOSED',()=>{
  const headings=document.match(/^## [1-5]\. .* — PROPOSED$/gm)??[];
  assert.equal(headings.length,5);
  for(const [index,name] of requiredGates.entries()){
    assert.ok(document.includes(`## ${index+1}. ${name} — PROPOSED`),name);
  }
  assert.doesNotMatch(document,/^## [1-5]\. .* — (?:APPROVED|ACTIVE)$/gm);
});

test('P10 readiness: proposed gates document retains activation and production write prohibitions',()=>{
  for(const restriction of [
    'Phase 9報酬','本番ポリシーINSERT','D1書込','明示承認',
    'Phase 10完了','coach側コード',
  ]){
    assert.ok(document.includes(restriction),restriction);
  }
});
