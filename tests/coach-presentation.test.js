import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
import '../coach/practice.js';
const html=readFileSync(new URL('../coach.html',import.meta.url),'utf8');const start=html.indexOf('const CoachPresentation=');const end=html.indexOf('const coachParagraphs=',start);const ctx={};vm.runInNewContext(html.slice(start,end)+';globalThis.copy=CoachPresentation;',ctx);const copy=ctx.copy;
test('display copy is polite and stable when a panel is rendered more than once',()=>{
 assert.equal(copy.polite('結果を確認。左右10回。'),'結果を確認してください。左右10回行います。');
 assert.equal(copy.polite('表示した。'),'表示しました。');assert.equal(copy.polite('表示しました。'),'表示しました。');
 for(const e of KesoCoachPractice.entries)for(const t of [e.title,e.action,e.check])assert.equal(copy.polite(copy.polite(t)),copy.polite(t));
 assert.equal(copy.title('Sageの蘇生カバー'),'蘇生中の味方を安全に守ります');
 assert.equal(copy.title('敵を倒せていない？ それとも倒されすぎ？'),'キルの不足とデスの増加を分けて確認します');
});
test('diamond intensity changes only the displayed instruction, preserving the catalogue and chosen recipe',()=>{
 const before=JSON.stringify(KesoCoachPractice.entries);const text=KesoCoachPractice.entries.find(e=>e.id==='P004').action;copy.action(text);copy.steps(text);
 assert.equal(JSON.stringify(KesoCoachPractice.entries),before);assert.equal(copy.action('静止ボット'),'移動するボット');assert.ok(copy.range.some(t=>t.includes('ミディアム')&&t.includes('ハード')));assert.ok(copy.range.some(t=>t.includes('ストレイフ')&&t.includes('ON')));
});
test('PDCA exposes the same five stages and preserves the existing operation controls',()=>{
 for(const stage of ['match','result','analysis','task','next'])assert.ok(html.includes('data-pdca-step="'+stage+'"'));
 assert.ok(html.indexOf('id="coach-operations"')>html.indexOf('id="member-result"'));
 for(const id of ['reload','share','start-member-archive','pause-member-archive','resume-backfill'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(html,/data-primary-mission/);assert.match(html,/① 今起きていること/);assert.match(html,/② この手順/);assert.match(html,/③ 次の一戦/);assert.match(html,/④ 結果は次回/);
});
