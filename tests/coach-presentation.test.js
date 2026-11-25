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
test('retired legacy data is absent while courtesy conversion still handles negative forms and sentence endings',()=>{
 assert.ok(html.includes('<div id="legacy-coach" hidden></div>'));
 assert.ok(!html.includes("request('/api/kp/coach/rounds'"),'retired API is never fetched');
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

test('all seven prototype artworks preserve the original uploaded PNG bytes',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../docs/design/v6-assets.json',import.meta.url),'utf8'));
 const names=[...new Set([...html.matchAll(/src="assets\/([^"/]+\.png)"/g)].map(m=>m[1]))].sort();
 assert.deepEqual(names,Object.keys(manifest.files).sort());assert.equal(names.length,7);
 for(const name of names){const bytes=readFileSync(new URL('../assets/'+name,import.meta.url));assert.equal(bytes.length,manifest.files[name].bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.files[name].sha256);}
});
test('registered headings do not concatenate a dictionary-form verb with a noun suffix',()=>{
 for(const title of Object.values(copy.headings))assert.doesNotMatch(title,/(確認を確認|るを確認|うを確認|くを確認|ないを確認|？を確認)/,title);
});

test('private goal headings are explicitly registered and helper uses content-addressed URL',()=>{
 const code=readFileSync(new URL('../coach/goals.js',import.meta.url),'utf8');
 const context={};vm.runInNewContext(code,context);
 assert.equal(Object.keys(context.KesoCoachGoals.headings).length,3);
 for(const text of Object.values(context.KesoCoachGoals.headings))assert.match(text,/ます$/);
 assert.ok(html.includes('goals.js?v=coach-'+createHash('sha256').update(code).digest('hex').slice(0,12)));
 assert.doesNotMatch(code,/\b(?:sessionStorage|localStorage)\b|\bfetch\s*\(|innerHTML\s*=/);
});

test('sharing headings are explicit, helper is content addressed and summary copy rejects nested or unknown private data',()=>{
 const code=readFileSync(new URL('../coach/sharing.js',import.meta.url),'utf8'),context={};vm.runInNewContext(code,context);
 for(const text of Object.values(context.KesoCoachSharing.headings))assert.match(text,/ます$/);
 assert.ok(html.includes('sharing.js?v=coach-'+createHash('sha256').update(code).digest('hex').slice(0,12)));
 assert.doesNotMatch(code,/\b(?:sessionStorage|localStorage)\b|\bfetch\s*\(|innerHTML\s*=/);
 const safe=context.KesoCoachSharing.safeSummary({subjectId:'opaque',displayName:'chosen',goals:'secret',period:{from:{secret:'id'},to:null},matches:{analyzed:{secret:'id'}},metrics:{kd:{value:{secret:'id'},formula:'approved',secret:'id'},private:{secret:'id'}}});
 assert.doesNotMatch(JSON.stringify(safe),/secret/);assert.equal(safe.metrics.kd.value,null);assert.equal(safe.matches.analyzed,null);
});

test('private record headings and cache URL are explicit, with no browser persistence or raw HTML rendering',()=>{
 const code=readFileSync(new URL('../coach/records.js',import.meta.url),'utf8'),context={};vm.runInNewContext(code,context);
 for(const text of Object.values(context.KesoCoachRecords.headings))assert.match(text,/ます$/);
 assert.ok(html.includes('records.js?v=coach-'+createHash('sha256').update(code).digest('hex').slice(0,12)));
 assert.doesNotMatch(code,/\b(?:localStorage|sessionStorage)\b|innerHTML\s*=|\bfetch\s*\(/);
});

test('Phase 2-C v6 loop is owner-only, read-only until explicit actions, and content addressed',()=>{
 const code=readFileSync(new URL('../coach/loop.js',import.meta.url),'utf8'),context={};
 vm.runInNewContext(code,context);
 for(const heading of Object.values(context.KesoCoachLoop.headings))assert.match(heading,/(ます|です)$/);
 assert.ok(html.includes('loop.js?v=coach-'+createHash('sha256').update(code).digest('hex').slice(0,12)));
 assert.ok(html.includes('<div id="coach-loop-host"></div>'));
 assert.ok(html.indexOf('id="member-result"')<html.indexOf('id="coach-loop-host"'),'one-priority dashboard must precede optional review history');
 assert.doesNotMatch(code,/\b(?:sessionStorage|localStorage)\b|innerHTML\s*=|\bfetch\s*\(/);
 assert.match(code,/前後の数字は未確認です/);
 assert.match(code,/練習の効果が証明されたとは扱いません/);
});
test('private observation headings, content address and no persistent drafts or direct network/copy HTML',()=>{
 const code=readFileSync(new URL('../coach/practice-review.js',import.meta.url),'utf8'),context={};vm.runInNewContext(code,context);
 for(const heading of Object.values(context.KesoCoachPracticeReview.headings))assert.match(heading,/(ます|です)$/);
 assert.ok(html.includes('practice-review.js?v=coach-'+createHash('sha256').update(code).digest('hex').slice(0,12)));
 assert.doesNotMatch(code,/\b(?:localStorage|sessionStorage)\b|innerHTML\s*=|\bfetch\s*\(/);
});

test('team consent UI uses hashed helper URL and only requests aggregate team metrics with explicit opt-in',()=>{
 const html=readFileSync(new URL('../coach.html',import.meta.url),'utf8');
 const code=readFileSync(new URL('../coach/team.js',import.meta.url),'utf8');
 assert.ok(html.includes('team.js?v=coach-'+createHash('sha256').update(code).digest('hex').slice(0,12)));
 assert.ok(html.includes('id="coach-team-host"'));
 assert.match(code,/\/api\/kp\/coach\/team\/metrics/);
 assert.match(code,/\/api\/kp\/coach\/team\/consent/);
 assert.doesNotMatch(code,/localStorage|sessionStorage|innerHTML|sendBeacon/);
 assert.match(code,/clear=\(\)=>/);
 assert.match(code,/invalidate=\(\)=>/);
 assert.match(code,/expectedVersion:settings.version/);
});

test('Phase 3-E Discord notice UI never sends messages, persists credentials or renders untrusted markup',()=>{
 const ui=readFileSync(new URL('../coach/team.js',import.meta.url),'utf8');
 assert.match(ui,/data-team-notice/);
 assert.match(ui,/data-notice-load/);
 assert.match(ui,/data-notice-form/);
 assert.match(ui,/expectedVersion/);
 assert.match(ui,/includesPersonalNotes===false/);
 assert.match(ui,/includesMatchIds===false/);
 assert.doesNotMatch(ui,/sendBeacon|localStorage|sessionStorage|innerHTML|discord\.com\/api\/webhooks/);
 const html=readFileSync(new URL('../coach.html',import.meta.url),'utf8');
 assert.ok(html.includes('team.js?v=coach-'+createHash('sha256').update(ui).digest('hex').slice(0,12)));
});

test('Phase 4 position evidence is presented as owner-only counts without coordinates or new fetches',()=>{
 const code=readFileSync(new URL('../coach/prototype-view.js',import.meta.url),'utf8');
 assert.match(code,/const position=d\.positionCoverage/);
 assert.match(code,/立ち位置データの取得状況/);
 assert.match(code,/位置取得/);
 assert.match(code,/0mとして扱いません/);
 assert.doesNotMatch(code,/position\.positions_json|position\.frames|position\.roster|JSON\.stringify\(position\)/);
 assert.doesNotMatch(code,/\bfetch\s*\(|\b(?:sessionStorage|localStorage)\b|XMLHttpRequest|sendBeacon/);
});

test('Phase 4 map-position evidence renders owner-only counts without sensitive source fields',()=>{
 const code=readFileSync(new URL('../coach/prototype-view.js',import.meta.url),'utf8');
 assert.match(code,/d\.mapPositionCoverage\?\.pool/);
 assert.match(code,/位置データ：取得試合/);
 assert.match(code,/デス時の位置/);
 assert.match(code,/キル時の位置/);
 assert.doesNotMatch(code,/mapPositionCoverage\.positions_json|mapPositionCoverage\.frames|mapPositionCoverage\.roster/);
 assert.doesNotMatch(code,/\bfetch\s*\(|\b(?:sessionStorage|localStorage)\b|XMLHttpRequest|sendBeacon/);
});
