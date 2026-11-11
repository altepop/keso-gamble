import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ESCALATION_ART,escalationArt} from '../js/escalation-rank-assets.js';
import {escalationRankPanel} from '../js/escalation-rank-view.js';
test('all ranks have original local SVGs and real Discord-compatible PNGs; unknown tiers cannot select arbitrary paths',()=>{
 assert.equal(ESCALATION_ART.length,9);
 for(const art of [...ESCALATION_ART,escalationArt(-1)]){
  const svg=readFileSync(new URL('../assets/escalation-ranks/'+art.key+'.svg',import.meta.url),'utf8');
  assert.doesNotMatch(svg,/<script|<foreignObject|\bon\w+\s*=|(?:href|src)\s*=/i);
  const png=readFileSync(new URL('../assets/escalation-ranks/'+art.key+'.png',import.meta.url));assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),256);assert.equal(png.readUInt32BE(20),256);
 }
 assert.equal(escalationArt('../../private').key,'unranked');assert.equal(escalationArt(9).key,'unranked');
 const html=escalationRankPanel({escalationRating:{rank:{name:'ゴールド Ⅰ',tier:3,rr:40},rating:940,act:{name:'<img src=x>'},leaders:[]}});
 assert.match(html,/gold\.svg/);assert.match(html,/40 RR/);assert.match(html,/value="40"/);assert.match(html,/&lt;img src=x&gt;/);assert.doesNotMatch(html,/<img src=x>/);
});
