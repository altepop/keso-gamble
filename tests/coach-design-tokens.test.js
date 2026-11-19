import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../coach.html',import.meta.url),'utf8'),css=html.match(/<style>([\s\S]*?)<\/style>/)[1];
test('coach uses only the three approved radius tokens in its stylesheet',()=>{
 assert.match(css,/--radius-control:8px/);assert.match(css,/--radius-panel:12px/);assert.match(css,/--radius-pill:999px/);
 const values=[...css.matchAll(/border-radius:([^;}]+)/g)].map(m=>m[1].replace('!important',''));
 assert.ok(values.length>20);assert.ok(values.every(v=>/^var\(--radius-(control|panel|pill)\)$/.test(v)));
});
test('spacing uses the shared rhythm, while the primary accent and background retain official hues',()=>{
 assert.match(css,/--accent:#FF4655/);assert.match(css,/--canvas:#0F1923/);
 for(const m of css.matchAll(/(?:padding|margin|gap)(?:-(?:top|bottom|left|right))?:([^;}]+)/g))assert.equal(/\dpx/.test(m[1]),false,m[0]);
});
