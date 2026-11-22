import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const view=readFileSync(new URL('../coach/prototype-view.js',import.meta.url),'utf8');

test('Phase 4 owner position coverage never treats missing coordinates as zero metres',()=>{
 assert.match(view,/取得できない位置は0mとして扱いません/);
 assert.match(view,/この情報だけで孤立・立ち位置・判断の良し悪しは判定できません/);
 for(const field of ['sampleMatches','verifiedPositionMatches','observedOwnVictimEvents','knownOwnVictimLocations','observedOwnKillerEvents','knownOwnKillerLocations'])
  assert.match(view,new RegExp('Number\\.isSafeInteger\\(position\\.'+field+'\\)'),field);
 assert.match(view,/position\.verifiedPositionMatches<=position\.sampleMatches/);
 assert.match(view,/position\.knownOwnVictimLocations<=position\.observedOwnVictimEvents/);
 assert.match(view,/position\.knownOwnKillerLocations<=position\.observedOwnKillerEvents/);
});

test('map position coverage only renders owner-scoped aggregate counts, not raw evidence',()=>{
 for(const field of ['sampleMatches','verifiedPositionMatches','knownOwnVictimLocations','knownOwnKillerLocations','observedOwnVictimEvents','observedOwnKillerEvents'])
  assert.match(view,new RegExp('Number\\.isSafeInteger\\(pos\\.'+field+'\\)'),field);
 assert.match(view,/pos\.verifiedPositionMatches<=pos\.sampleMatches/);
 assert.match(view,/pos\.observedOwnVictimEvents>=pos\.knownOwnVictimLocations/);
 assert.match(view,/pos\.observedOwnKillerEvents>=pos\.knownOwnKillerLocations/);
 assert.doesNotMatch(view,/mapPositionCoverage\.(?:positions_json|frames|roster)|position\.(?:positions_json|frames|roster)/);
 assert.doesNotMatch(view,/\b(?:fetch|sendBeacon)\s*\(|\b(?:localStorage|sessionStorage)\b/);
});
