import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ESCALATION_ART,escalationArt} from '../js/escalation-rank-assets.js';
import {escalationRankPanel} from '../js/escalation-rank-view.js';
test('all 25 Riot rank images match recorded source hashes and dimensions, with correct division lookup and a local unranked fallback',()=>{
 assert.equal(ESCALATION_ART.length,9);
 const source=JSON.parse(readFileSync(new URL('../assets/escalation-ranks/SOURCE.json',import.meta.url),'utf8'));assert.equal(source.files.length,25);assert.match(source.copyright,/Riot Games/);
 for(const art of source.files){const png=readFileSync(new URL('../assets/escalation-ranks/'+art.file,import.meta.url));assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(createHash('sha256').update(png).digest('hex'),art.sha256);assert.equal(png.readUInt32BE(16),art.width);assert.equal(png.readUInt32BE(20),art.height);}
 assert.equal(escalationArt(7,3).file,'immortal-3.png');assert.equal(escalationArt(8,3).file,'radiant.png');assert.equal(escalationArt(3,99).file,'gold-1.png');assert.equal(escalationArt('../../private').file,'unranked.png');
 const html=escalationRankPanel({escalationRating:{rank:{name:'ゴールド Ⅱ',tier:3,division:2,rr:40},rating:1040,act:{name:'<img src=x>'},leaders:[]}});
 assert.match(html,/gold-2\.png/);assert.match(html,/40 RR/);assert.match(html,/value="40"/);assert.match(html,/&lt;img src=x&gt;/);assert.doesNotMatch(html,/<img src=x>/);assert.match(html,/Riot Games/);assert.match(html,/\/esca rank/);
});
