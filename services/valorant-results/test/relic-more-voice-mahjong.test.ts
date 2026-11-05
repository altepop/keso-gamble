import test from 'node:test';
import assert from 'node:assert/strict';
import {MORE_MAHJONG_VOICE_RELICS} from '../src/relic-more-voice-mahjong.ts';
import {ALL_NORMAL_RELICS,RELIC_CATALOG_COUNT,NORMAL_RELIC_BY_ID} from '../src/relic-catalog.ts';
import {evaluateRelicBonus,type RelicCollection} from '../src/relics.ts';

const gears=['normal.voice.riddle.three','normal.voice.riddle.five','normal.voice.riddle.fifteen','normal.voice.riddle.crown'];
const make=(ids:string[]):RelicCollection=>({totalSummons:0,items:Object.fromEntries(ids.map(id=>{
 const def=NORMAL_RELIC_BY_ID.get(id)!;return [id,{...def,origin:'normal',count:1}];
})),equipped:ids});
test('20 additional relics; 10 voice/10 Mahjong; all IDs unique and old catalog preserved',()=>{
 assert.equal(RELIC_CATALOG_COUNT,214);
 assert.equal(new Set(ALL_NORMAL_RELICS.map(x=>x.id)).size,214);
 assert.equal(ALL_NORMAL_RELICS.filter(x=>x.id.startsWith('normal.voice.riddle.')).length,4);
 assert.equal(MORE_MAHJONG_VOICE_RELICS.filter(x=>x.mode==='mahjong').length,10);
 assert.equal(MORE_MAHJONG_VOICE_RELICS.filter(x=>x.mode==='voice').length,10);
});
test('secret voice build: each gear looks unimpressive, full four-slot resonance is immense',()=>{
 const single=gears.map(id=>evaluateRelicBonus(make([id]),'voice',{amount:15,win:true}).bonus);
 assert.deepEqual(single,[1,3,9,0]);
 const all=evaluateRelicBonus(make(gears),'voice',{amount:15,win:true});
 assert.equal(all.lines.find(x=>x.id===gears[3])?.exotic,900);
 assert.ok(all.bonus>=900);
 assert.ok(all.bonus>Math.max(...single)*50);
 assert.equal(evaluateRelicBonus(make(gears.slice(1)),'voice',{amount:15,win:true}).lines.find(x=>x.id===gears[3])?.exotic,0);
 assert.equal(evaluateRelicBonus(make(gears),'quiz',{amount:15,win:true}).bonus,0);
 assert.equal(evaluateRelicBonus(make(gears),'casino',{amount:15,win:true}).bonus,0);
 assert.equal(evaluateRelicBonus(make(gears),'voice',{amount:14,win:true}).lines.find(x=>x.id===gears[3])?.exotic,0);
});
test('Mahjong specialist powers are verified and never apply to casino/market',()=>{
 const d=NORMAL_RELIC_BY_ID.get('normal.mahjong.ryuuiisou')!;
 const c=make([d.id]);
 assert.ok(evaluateRelicBonus(c,'mahjong',{amount:400,win:true}).bonus>1000);
 assert.equal(evaluateRelicBonus(c,'market',{amount:400,win:true}).bonus,0);
});
