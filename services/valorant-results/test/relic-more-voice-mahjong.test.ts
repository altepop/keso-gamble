import {DatabaseSync} from 'node:sqlite';
import {ensureRelicEffectLog} from '../src/relics.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {MORE_MAHJONG_VOICE_RELICS} from '../src/relic-more-voice-mahjong.ts';
import {ALL_NORMAL_RELICS,RELIC_CATALOG_COUNT,NORMAL_RELIC_BY_ID} from '../src/relic-catalog.ts';
import {evaluateRelicBonus,winLoadout,type RelicCollection} from '../src/relics.ts';

const gears=['normal.voice.riddle.three','normal.voice.riddle.five','normal.voice.riddle.fifteen','normal.voice.riddle.crown'];
const make=(ids:string[]):RelicCollection=>({totalSummons:0,items:Object.fromEntries(ids.map(id=>{
 const def=NORMAL_RELIC_BY_ID.get(id)!;return [id,{...def,origin:'normal',count:1}];
})),equipped:ids});
test('20 additional relics; 10 voice/10 Mahjong; all IDs unique and old catalog preserved',()=>{
 assert.equal(RELIC_CATALOG_COUNT,216);
 assert.equal(new Set(ALL_NORMAL_RELICS.map(x=>x.id)).size,216);
 assert.equal(ALL_NORMAL_RELICS.filter(x=>x.id.startsWith('normal.voice.riddle.')).length,4);
 assert.equal(MORE_MAHJONG_VOICE_RELICS.filter(x=>x.mode==='mahjong').length,10);
 assert.equal(MORE_MAHJONG_VOICE_RELICS.filter(x=>x.mode==='voice').length,10);
});
test('secret voice build: each gear looks unimpressive, full four-slot resonance is immense',()=>{
 const single=gears.map(id=>evaluateRelicBonus(make([id]),'voice',{amount:15,win:true}).bonus);
 assert.deepEqual(single,[1,3,9,0]);
 const all=evaluateRelicBonus(make(gears),'voice',{amount:15,win:true});
 assert.equal(all.lines.find(x=>x.id===gears[3])?.exotic,5400);
 assert.ok(all.bonus>=5400);
 assert.ok(all.bonus>Math.max(...single)*50);
 assert.equal(evaluateRelicBonus(make(gears.slice(1)),'voice',{amount:15,win:true}).lines.find(x=>x.id===gears[3])?.exotic,0);
 assert.equal(evaluateRelicBonus(make(gears),'quiz',{amount:15,win:true}).bonus,0);
 assert.equal(evaluateRelicBonus(make(gears),'casino',{amount:15,win:true}).bonus,0);
 assert.equal(evaluateRelicBonus(make(gears),'voice',{amount:14,win:true}).lines.find(x=>x.id===gears[3])?.exotic,0);
});
test('four normal voice relics, with no transcendent, settle 10k–20k KP per verified hour',()=>{
 const ids=[...gears.slice(0,3),'normal.voice.alarm'];
 assert.ok(ids.every(id=>NORMAL_RELIC_BY_ID.get(id)?.rarity!=='transcendent'));
 const loadout=make(ids),settled=evaluateRelicBonus(loadout,'voice',{amount:15,win:true});
 assert.equal(settled.lines.find(x=>x.id==='normal.voice.riddle.fifteen')?.exotic,4800);
 // Base 15 KP for all twelve five-minute slots; three 20-minute relic receipts.
 const hourly=12*15+3*Math.min(settled.bonus,15*400);
 assert.ok(hourly>=10000&&hourly<=20000,`unexpected voice hourly yield: ${hourly}`);
 const transcendent=make(gears);
 const advanced=evaluateRelicBonus(transcendent,'voice',{amount:15,win:true});
 const advancedHourly=12*15+3*Math.min(advanced.bonus,15*400);
 assert.ok(advancedHourly>hourly&&advancedHourly<=20000,'the transcendent quartet should be slightly stronger');
 assert.ok(evaluateRelicBonus(make(ids.slice(1)),'voice',{amount:15,win:true}).bonus<1000);
 assert.equal(evaluateRelicBonus(loadout,'quiz',{amount:15,win:true}).bonus,0);
 // Anti-swap protection applies until 20 verified minutes pass, not to other modes.
 const at=Date.parse('2026-11-14T12:00:00Z');
 assert.equal(evaluateRelicBonus(winLoadout({...loadout,loadoutChangedAt:at-19*60000},'voice',15,at),'voice',{amount:15,win:true}).bonus,0);
 assert.equal(evaluateRelicBonus(winLoadout({...loadout,loadoutChangedAt:at-20*60000},'voice',15,at),'voice',{amount:15,win:true}).bonus,settled.bonus);
});

test('Mahjong specialist powers are verified and never apply to casino/market',()=>{
 const d=NORMAL_RELIC_BY_ID.get('normal.mahjong.ryuuiisou')!;
 const c=make([d.id]);
 assert.ok(evaluateRelicBonus(c,'mahjong',{amount:400,win:true}).bonus>1000);
 assert.equal(evaluateRelicBonus(c,'market',{amount:400,win:true}).bonus,0);
});

test('live relic effect logs are initialized only once without changing reward receipt state', async()=>{
 const sqlite=new DatabaseSync(':memory:');
 let creates=0;
 const db={prepare:(sql:string)=>({run:async()=>{creates++;sqlite.exec(sql);return {meta:{changes:0}};}})} as unknown as D1Database;
 try{
  await ensureRelicEffectLog(db);
  await ensureRelicEffectLog(db);
  assert.equal(creates,1);
  const table=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='relic_effect_logs'").get();
  assert.equal(table?.name,'relic_effect_logs');
  sqlite.prepare("INSERT INTO relic_effect_logs(id,guild,user,mode,base,bonus,details,at) VALUES(?,?,?,?,?,?,?,?)")
   .run('receipt-1','guild','user','voice',15,5305,'{}',0);
  assert.equal(sqlite.prepare("SELECT bonus FROM relic_effect_logs WHERE id=?").get('receipt-1')?.bonus,5305);
 }finally{sqlite.close();}
});
