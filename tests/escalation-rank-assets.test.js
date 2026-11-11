import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ESCALATION_ART,escalationArt} from '../js/escalation-rank-assets.js';
import {escalationRankPanel} from '../js/escalation-rank-view.js';
test('all 26 Riot rank images match recorded source hashes and dimensions, with correct division lookup and a local unranked fallback',()=>{
 assert.equal(ESCALATION_ART.length,9);
 const source=JSON.parse(readFileSync(new URL('../assets/escalation-ranks/SOURCE.json',import.meta.url),'utf8'));assert.equal(source.files.length,26);assert.match(source.copyright,/Riot Games/);
 for(const art of source.files){const png=readFileSync(new URL('../assets/escalation-ranks/'+art.file,import.meta.url));assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(createHash('sha256').update(png).digest('hex'),art.sha256);assert.equal(png.readUInt32BE(16),art.width);assert.equal(png.readUInt32BE(20),art.height);}
 assert.equal(escalationArt(7,3).file,'immortal-3.png');assert.equal(escalationArt(8,3).file,'radiant.png');assert.equal(escalationArt(3,99).file,'gold-1.png');assert.equal(escalationArt('../../private').file,'unranked.png');
 const html=escalationRankPanel({escalationRating:{rank:{name:'ゴールド Ⅱ',tier:3,division:2,rr:40},rating:1040,act:{name:'<img src=x>'},leaders:[]}});
 assert.match(html,/gold-2\.png/);assert.match(html,/40 RR/);assert.match(html,/value="40"/);assert.match(html,/&lt;img src=x&gt;/);assert.doesNotMatch(html,/<img src=x>/);assert.match(html,/Riot Games/);assert.match(html,/\/esca rank/);
});

test('initial placement uses the recorded VALORANT unranked icon and shows the remaining placement games',()=>{const html=escalationRankPanel({escalationRating:{rating:null,measurementGames:1,measurementRequired:3}});assert.match(html,/unranked\.png/);assert.match(html,/認定まであと2試合/);assert.match(html,/初回認定 1\/3試合/);});

test('rank shield panel shows remaining and consumed shields, warns when exhausted and stays absent during placement',()=>{
 const power={rating:1200,rank:{name:'プラチナ Ⅰ',tier:4,division:1,rr:0},rankShields:{eligible:true,remaining:1,lastConsumed:true}};
 const html=escalationRankPanel({escalationRating:power});assert.match(html,/ランクシールド 残り1\/2/);assert.match(html,/前の試合で1枚使用/);assert.equal((html.match(/class="filled"/g)||[]).length,1);assert.equal((html.match(/class="empty"/g)||[]).length,1);
 const exhausted=escalationRankPanel({escalationRating:{...power,rankShields:{eligible:true,remaining:0}}});assert.match(exhausted,/次に0 RRで負けると降格/);
 assert.doesNotMatch(escalationRankPanel({escalationRating:{...power,rating:null}}),/class="esca-shields"/);
});
