import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const loop=readFileSync(new URL('../coach/loop.js',import.meta.url),'utf8');
const sharing=readFileSync(new URL('../coach/sharing.js',import.meta.url),'utf8');

test('private execution record copy never enters the guild summary allowlist',()=>{
  const context={};
  vm.runInNewContext(sharing,context);
  const summary=context.KesoCoachSharing.safeSummary({
    subjectId:'owner',displayName:'表示名',
    occurredDate:'2026-11-22',reflection:'PRIVATE_REFLECTION',
    execution:{report:'done'},recordNotes:[{title:'PRIVATE_NOTE',body:'PRIVATE_BODY'}],
    items:[{title:'PRIVATE_PRACTICE',check:'PRIVATE_CHECK'}],
    period:{from:'2026-11-01',to:'2026-11-22'},
    matches:{analyzed:1,candidates:1,excluded:0,rowLimit:250},
    metrics:{kd:{value:1.2,validMatches:1,excludedMatches:0,numerator:12,denominator:10,formula:'K/D'}}
  });
  const serialized=JSON.stringify(summary);
  for(const secret of ['PRIVATE_REFLECTION','PRIVATE_NOTE','PRIVATE_BODY','PRIVATE_PRACTICE','PRIVATE_CHECK','occurredDate','recordNotes','execution','reflection','items'])
    assert.equal(serialized.includes(secret),false,secret);
  assert.equal(summary.metrics.kd.value,1.2);
});

test('private copy is explicit, notes opt-in defaults off, and no transport is introduced',()=>{
  assert.match(loop,/const includeNotes=element\.querySelector\('\[data-copy-include-notes\]'\)\?\.checked===true/);
  assert.match(loop,/check\.checked=false/);
  assert.match(loop,/button\('本人の実施記録をコピーします',\(\)=>void copyRecord\(latest\),'copy'\)/);
  assert.match(loop,/linkedNotes=includeNotes\?\(snapshot\?\.recordNotes\|\|\[\]\):\[\]/);
  assert.doesNotMatch(loop,/\bfetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\s*\(|\b(?:localStorage|sessionStorage)\b/);
  assert.match(loop,/本人の記録です。実施・改善の客観的証明ではありません。/);
});
