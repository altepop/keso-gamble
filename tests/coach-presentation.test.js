import {createHash} from 'node:crypto';import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
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
test('approved v6 CSS and structural template are copied literally, not reinterpreted',()=>{
 const proto=readFileSync(new URL('../docs/design/coach-prototype-v6.html',import.meta.url),'utf8');
 assert.equal(html.match(/<style id="coach-prototype-style">([\s\S]*?)<\/style>/)[1],proto.match(/<style>([\s\S]*?)<\/style>/)[1]);
 let template=proto.slice(proto.indexOf('<div class="wrap">')+'<div class="wrap">'.length,proto.indexOf('\n</div>\n\n<script>'));template=template.slice(0,template.indexOf('  <footer>'));
 assert.equal(html.match(/<template id="coach-prototype-template">\n([\s\S]*?)\n<\/template>/)[1],template);
});
test('legacy prose is polite, including unsupported negative forms and sentence endings',()=>{
 const legacy=html.slice(html.indexOf('<details id="legacy-coach"'),html.indexOf('<template id="coach-prototype-template">'));
 assert.ok(legacy.includes('分析の母数は完全保存済み試合だけです。'));
 assert.ok(legacy.includes('取得元に存在しないデータは補いません。'));
 for(const ending of ['だけ。','補わない。','比較する。','提案だ。','回数である。'])assert.ok(!legacy.includes(ending),ending);
 assert.equal(copy.polite('分析の母数は完全保存済み試合だけ。取得元に存在しないデータは補わない。'),'分析の母数は完全保存済み試合だけです。取得元に存在しないデータは補いません。');
 assert.equal(copy.polite('死亡は5.5回。'),'死亡は5.5回。','facts must not turn into prescribed repetitions');
});
test('every new static heading and catalogue title must be registered explicitly',()=>{
 for(const match of html.matchAll(/<h[2-5](?:\s[^>]*)?>([^<]*?)<\/h[2-5]>/g)){
  const t=match[1];if(['${',"'+",'"+','escape('].some(s=>t.includes(s)))continue;
  assert.ok(Object.hasOwn(copy.headings,t),'Register heading in CoachPresentation.headings: '+t);
 }
 for(const entry of KesoCoachPractice.entries)assert.ok(Object.hasOwn(copy.headings,entry.title),'Register catalogue heading: '+entry.title);
});
test('v6 keeps all existing operation controls',()=>{
 assert.ok(html.indexOf('id="coach-operations"')>html.indexOf('id="member-result"'));
 for(const id of ['reload','share','start-member-archive','pause-member-archive','resume-backfill'])assert.ok(html.includes('id="'+id+'"'));
});

test('every catalogue action has a complete courteous display sentence',()=>{
 for(const e of KesoCoachPractice.entries)for(const sentence of copy.steps(copy.action(e.action)))assert.match(sentence,/(ます|ください|ません|ましょう)[。]?$/u,e.id+': '+sentence);
});
test('prototype binding is a local display adapter with a content-addressed cache URL',()=>{
 const code=readFileSync(new URL('../coach/prototype-view.js',import.meta.url),'utf8');
 assert.doesNotMatch(code,/\bfetch\s*\(|\b(?:sessionStorage|localStorage)\b|XMLHttpRequest|sendBeacon/);
 assert.ok(html.includes('prototype-view.js?v=coach-'+createHash('sha256').update(code).digest('hex').slice(0,12)));
});
