import test from 'node:test';
import assert from 'node:assert/strict';
import {kpCreditLine} from '../src/kp.ts';

test('Spike Rush total clearly separates match reward and verified relic credit',()=>{
 const base='🔫 試合結果\n💬 いい試合だった！';
 const note='（基礎40・補正0・端数精算 40 KP）';
 const result=kpCreditLine(base,90,note,50);
 assert.match(result,/🪙 この試合 \+90 KP/);
 assert.match(result,/↳ 試合報酬 \+40 KP/);
 assert.match(result,/基礎40・補正0/);
 assert.match(result,/↳ 🧿 遺物補正 \+50 KP/);
 assert.ok(result.indexOf('遺物補正')<result.indexOf('💬'));
 assert.equal((result.match(/遺物補正/g)||[]).length,1);
});
test('reformatting a settled notification never duplicates relic lines or old totals',()=>{
 const note='（基礎40・補正0・端数精算 40 KP）';
 const start='最初の通知\n💬 メッセージ';
 const once=kpCreditLine(start,90,note,50);
 const twice=kpCreditLine(once,90,note,50);
 assert.equal(twice,once);
 assert.equal((twice.match(/🪙 この試合/g)||[]).length,1);
 assert.equal((twice.match(/↳/g)||[]).length,2);
 const updated=kpCreditLine(once,140,note,100);
 assert.match(updated,/この試合 \+140 KP/);
 assert.match(updated,/遺物補正 \+100 KP/);
 assert.doesNotMatch(updated,/遺物補正 \+50 KP/);
});
test('when no relic is credited, original result remains compact',()=>{
 const raw='結果\n💬 ちゃんと遊んだな';
 const msg=kpCreditLine(raw,40,'（基礎40・補正0・端数精算 40 KP）',0);
 assert.match(msg,/🪙 この試合 \+40 KP（基礎40/);
 assert.doesNotMatch(msg,/遺物補正/);
 assert.doesNotMatch(msg,/↳ 試合報酬/);
});
test('other modes and penalty do not fabricate a relic bonus',()=>{
 const msg=kpCreditLine('対戦結果',-10,'',0);
 assert.match(msg,/この試合 −10 KP/);
 assert.doesNotMatch(msg,/遺物補正/);
});
