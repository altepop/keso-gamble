import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../coach.html',import.meta.url),'utf8'),css=html.match(/<style id="coach-legacy-style">([\s\S]*?)<\/style>/)[1];
test('the folded legacy tools retain their three radius tokens without overriding Muse v6',()=>{
 assert.match(css,/--radius-control:8px/);assert.match(css,/--radius-panel:12px/);assert.match(css,/--radius-pill:999px/);
 const values=[...css.matchAll(/border-radius:([^;}]+)/g)].map(m=>m[1].replace('!important',''));
 assert.ok(values.length>20);assert.ok(values.every(v=>/^(?:var\(--radius-(control|panel|pill)\)|0)$/.test(v)));
});
test('spacing uses the shared rhythm, while the primary accent and background retain official hues',()=>{
 assert.match(css,/--accent:#FF4655/);assert.match(css,/--canvas:#0F1923/);
 assert.ok(css.includes('.coach-existing '),'old selectors are scoped to existing tools');
});
