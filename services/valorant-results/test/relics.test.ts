import {NORMAL_RELICS,RELIC_CATALOG_COUNT,RELIC_RARITIES,RELIC_MODE_NAMES} from '../src/relic-catalog.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {RELIC_SUMMON_COST,rarityForRoll,rarityRatesForLevel,modeRelicBonus,nativeRelicBonus,relicCollection,summonLevel,summonRelics,grantSteamRelic,grantUniteRelic,equipRelic,autoEquipRelics,SUMMON_MILESTONES,summonProgress,steamRelicTier,steamRelicArchetype,STEAM_RELIC_TIERS,UNITE,UNITE_REQUIREMENTS,UNITE_STREAK_IDS,type RelicCollection} from '../src/relics.ts';
test('200KP per roll, valid batch sizes, never overspends or draws entropy for rejected input',()=>{
  assert.equal(RELIC_SUMMON_COST,200);
  const x:{cash:number;relics?:RelicCollection}={cash:351000};
  assert.throws(()=>summonRelics(x,10000000),/1・10・100・1000/);
  assert.throws(()=>summonRelics(x,2000),/1・10・100・1000/);
  const outcome=summonRelics(x,1000,new Uint32Array(2000).fill(900000));
  assert.equal(outcome.count,1000);
  assert.equal(outcome.cost,200000);
  assert.equal(x.cash,151000);
  assert.equal(outcome.summary.common,1000);
  assert.equal(x.relics!.totalSummons,1000);
  assert.equal(Object.values(x.relics!.items).reduce((n,i)=>n+i.count,0),1000);
  assert.equal(outcome.level,3);
  assert.throws(()=>summonRelics(x,1000),/KPが足りません/);
  assert.equal(x.cash,151000);
});
test('transcendent is exceptionally rare at all levels, capped at 3/100000 in level 10',()=>{
  assert.equal(summonLevel(0),1);
  assert.equal(summonLevel(1800),4);
  assert.equal(summonLevel(8100),10);
  assert.equal(summonProgress(1200).remaining,150);
  assert.equal(SUMMON_MILESTONES.length,10);
  assert.equal(rarityForRoll(7,1),'transcendent');
  assert.equal(rarityForRoll(8,1),'ancient');
  assert.equal(rarityForRoll(29,10),'transcendent');
  assert.equal(rarityForRoll(30,10),'ancient');
  assert.equal(rarityForRoll(999999,10),'uncommon');
  const x:{cash:number;relics?:RelicCollection}={cash:200};
  const o=summonRelics(x,1,new Uint32Array([0,0]));
  assert.equal(o.summary.transcendent,1);
  assert.equal(Object.values(x.relics!.items)[0]?.power,350);
});
test('verified Steam record grants a one-of-one, not tradable exclusive with no Unite prerequisites',()=>{
  const x:{relics?:RelicCollection}={};
  const proof={id:'steam:1:76561199999999999:123:abc',app:123,achievement:'ACH_WIN',title:'極限クリア',percent:0.06};
  const r=grantSteamRelic(x,proof);
  assert.equal(r.item.origin,'steam');
  assert.equal(r.item.power,285);
  assert.ok(r.item.mode);
  assert.ok(r.item.skill);
  assert.ok(r.item.percent);
  assert.equal(r.item.cap,58);
  assert.match(r.item.name,/極限クリア/);
  assert.throws(()=>grantSteamRelic(x,proof),/受け取り済み/);
  assert.throws(()=>grantSteamRelic(x,{...proof,id:'steam:fake',percent:101}),/確認できません/);
});
test('Unite relics are individually extremely strong and have no cross-source dependency',()=>{
  const x:{relics?:RelicCollection}={};
  assert.throws(()=>grantUniteRelic(x,'unite.five_wins',4),/確認できません/);
  const a=grantUniteRelic(x,'unite.first_win',1).item;
  const b=grantUniteRelic(x,'unite.three_wins',3).item;
  const c=grantUniteRelic(x,'unite.five_wins',5).item;
  assert.deepEqual([a.power,b.power,c.power],[390,480,620]);
  assert.equal(a.origin,'unite');
  assert.equal(Object.values(x.relics!.items).some(item=>item.origin==='steam'),false);
  assert.throws(()=>grantUniteRelic(x,'unite.five_wins',5),/受け取り済み/);
  const result=equipRelic(x,'unite.five_wins',0);
  assert.equal(result.power,620);
  assert.deepEqual(result.equipped,['unite.five_wins']);
  const switched=equipRelic(x,'unite.first_win',1);
  assert.equal(switched.power,390);
  assert.deepEqual(switched.equipped,['','unite.first_win']);
  assert.throws(()=>equipRelic(x,'unite.missing',0),/所持していない/);
});
test('equipment is optional for both sources; no hardcoded combination or earnings multiplier',()=>{
 const x:{cash:number;relics?:RelicCollection}={cash:2000};
 summonRelics(x,10,new Uint32Array(20).fill(999999));
 const common=Object.keys(x.relics!.items)[0]!;
 let r=equipRelic(x,common,0);
 assert.equal(r.power,25);
 assert.equal(x.relics!.items[common]!.count,10);
 assert.deepEqual(equipRelic(x,'',0).equipped,['']);
 assert.equal(x.cash,0);
});

test('all 10 summon tiers add up to 100% and level 10 completely eliminates common',()=>{
 assert.equal(RELIC_CATALOG_COUNT,140);
 assert.equal(new Set(NORMAL_RELICS.map(r=>r.id)).size,140);
 assert.equal(new Set(NORMAL_RELICS.map(r=>r.name)).size,140);
 assert.equal(Object.keys(RELIC_MODE_NAMES).length,20);
 for(const tier of RELIC_RARITIES) assert.equal(NORMAL_RELICS.filter(r=>r.rarity===tier).length,20);
 const checks=[1,2,3,4,5,6,7,8,9,10];
 for(const lvl of checks){
  const rates=rarityRatesForLevel(lvl);
  assert.ok(Math.abs(Object.values(rates).reduce((n,v)=>n+v,0)-100)<0.000001);
  if(lvl>1){
   assert.ok(rates.common<rarityRatesForLevel(lvl-1).common);
   assert.ok(rates.legendary>rarityRatesForLevel(lvl-1).legendary);
   assert.ok(rates.ancient>rarityRatesForLevel(lvl-1).ancient);
  }
 }
 assert.equal(rarityRatesForLevel(10).common,0);
 assert.equal(rarityRatesForLevel(10).uncommon,4);
 assert.equal(rarityRatesForLevel(10).rare,30);
 assert.equal(rarityRatesForLevel(10).legendary,40);
 assert.equal(rarityRatesForLevel(10).mythic,21);
 assert.equal(rarityRatesForLevel(10).ancient,4.997);
 assert.equal(rarityRatesForLevel(10).transcendent,0.003);
 assert.equal(rarityForRoll(0,10),'transcendent');
 assert.equal(rarityForRoll(29,10),'transcendent');
 assert.equal(rarityForRoll(30,10),'ancient');
 assert.equal(rarityForRoll(999999,10),'uncommon');
});
test('existing 21 relic ids preserve all copies and become named mode skills',()=>{
 const state:{relics?:RelicCollection}={relics:{totalSummons:450,items:{
  'normal.copper':{id:'normal.copper',name:'くすんだ銅貨',origin:'normal',rarity:'common',ability:'蓄積',power:10,count:8},
  'normal.rainbow':{id:'normal.rainbow',name:'万象を超える賽',origin:'normal',rarity:'transcendent',ability:'超越',power:350,count:2},
 },equipped:['normal.copper','normal.rainbow']}};
 const c=relicCollection(state);
 assert.equal(c.totalSummons,450);
 assert.deepEqual(c.equipped,['normal.copper','normal.rainbow']);
 assert.equal(c.items['normal.copper']?.count,8);
 assert.equal(c.items['normal.copper']?.power,25);
 assert.equal(c.items['normal.copper']?.mode,'competitive');
 assert.match(c.items['normal.copper']!.ability,/コンペの報酬で/);
 assert.equal(c.items['normal.rainbow']?.origin,'normal');
 assert.match(c.items['normal.rainbow']!.ability,/コンペの報酬で/);
});
test('mode specialists activate only their own verified mode and cannot multiply arbitrary rewards',()=>{
 const x:{cash:number;relics?:RelicCollection}={cash:4000};
 const draws=new Uint32Array(20).fill(999999);
 for(let n=1;n<draws.length;n+=2)draws[n]=0;
 summonRelics(x,10,draws);
 const common=Object.keys(x.relics!.items)[0]!;
 const mode=x.relics!.items[common]!.mode!;
 equipRelic(x,common,0);
 const off=mode==='competitive'?'unrated':'competitive';
 assert.equal(modeRelicBonus(x.relics,off,{amount:500,win:true}).bonus,0);
 const on=modeRelicBonus(x.relics,mode,{amount:507,win:true});
 assert.ok(on.bonus>0);
 assert.ok(on.bonus<=80);
 assert.ok(on.bonus<=500*0.15);
 assert.equal(modeRelicBonus(x.relics,mode,{amount:0,win:true}).bonus,0);
});
test('native earnings are capped to 1% of source and 120KP per day, including repeats',()=>{
 const def=NORMAL_RELICS.find(r=>r.mode==='market'&&r.rarity==='transcendent')!;
 const item={id:def.id,name:def.name,origin:'normal' as const,rarity:def.rarity,ability:def.ability,mode:def.mode,
  skill:def.skill,power:def.power,count:10};
 const state:{cash:number;relics?:RelicCollection}={cash:1000,relics:{totalSummons:4000,items:{[def.id]:item},equipped:[def.id]}};
 assert.equal(nativeRelicBonus(state,'market',100000,Date.parse('2026-11-02')),80);
 assert.equal(nativeRelicBonus(state,'market',100000,Date.parse('2026-11-02')),40);
 assert.equal(nativeRelicBonus(state,'market',100000,Date.parse('2026-11-02')),0);
 assert.equal(state.cash,1120);
 assert.equal(state.relics?.dailyNativeBonus?.amount,120);
});

test('Steam relic tiers include ordinary achievements at >=25% and a separate 10–25% band without backfilling',()=>{
 assert.deepEqual(STEAM_RELIC_TIERS.map(t=>t.max),[0.01,0.1,1,5,10,25,100]);
 for(const percent of [0,0.01,0.1,1,5,10,10.01,25,25.01,30,75,100])
  assert.ok(steamRelicTier(percent).label);
 assert.equal(steamRelicTier(10.01).label,'挑戦');
 assert.equal(steamRelicTier(24.99).label,'挑戦');
 assert.equal(steamRelicTier(25).label,'旅路');
 assert.equal(steamRelicTier(25.01).label,'旅路');
 assert.equal(steamRelicTier(30).label,'旅路');
 assert.throws(()=>steamRelicTier(100.1),/確認/);
 const proof={id:'steam:g:76561197960265729:123:abcf123456789',app:123,achievement:'A1',title:'解除したての実績',percent:30};
 const state:{relics?:RelicCollection}={};
 const item=grantSteamRelic(state,proof).item;
 assert.equal(item.origin,'steam');
 assert.equal(item.power,65);
 assert.equal(item.mode,steamRelicArchetype(123,'A1').mode);
 assert.equal(item.percent,2);
 assert.throws(()=>grantSteamRelic(state,proof),/受け取り済み/);
 const a:{relics?:RelicCollection}={};
 const p=grantSteamRelic(a,{...proof,id:'steam:g:76561197960265729:123:other',percent:19.9});
 assert.equal(p.item.power,95);
 assert.equal(p.item.percent,4);
});
test('Unite tiers grow from actual max five streak to certified cumulative wins',()=>{
 assert.equal(Object.keys(UNITE).length,10);
 assert.equal(UNITE_STREAK_IDS.size,5);
 assert.equal(UNITE_REQUIREMENTS['unite.two_wins'],2);
 assert.equal(UNITE_REQUIREMENTS['unite.four_wins'],4);
 assert.equal(UNITE_REQUIREMENTS['unite.career_200'],200);
 const s:{relics?:RelicCollection}={};
 assert.throws(()=>grantUniteRelic(s,'unite.career_25',5),/確認できません/);
 const item=grantUniteRelic(s,'unite.career_25',25).item;
 assert.equal(item.power,510);
 assert.equal(item.mode,'casino');
 assert.ok(item.skill);
 assert.ok(item.source?.includes('累計25勝'));
});
test('meta-capable lower rarity, universal and specialist normal relics are effective without Unite',()=>{
 const x:{relics?:RelicCollection}={relics:{totalSummons:10,items:{},equipped:[]}};
 const a=NORMAL_RELICS.find(r=>r.mode==='universal'&&r.rarity==='rare')!;
 const b=NORMAL_RELICS.find(r=>r.mode==='marketplus'&&r.rarity==='rare')!;
 const c=NORMAL_RELICS.find(r=>r.mode==='fortune'&&r.rarity==='rare')!;
 for(const def of [a,b,c]) x.relics!.items[def.id]={...def,origin:'normal',count:1};
 x.relics!.equipped=[a.id,b.id,c.id];
 assert.equal(NORMAL_RELICS.length,140);
 assert.equal(a.percent,8);
 assert.equal(b.percent,17);
 assert.equal(c.skill,'prime');
 assert.equal(Object.values(x.relics!.items).some(r=>r.origin==='unite'),false);
 const played=modeRelicBonus(x.relics,'competitive',{amount:307,win:true});
 assert.ok(played.bonus>0);
 assert.ok(played.skills.some(s=>s===a.name));
 assert.ok(played.skills.some(s=>s===c.name));
 const native=modeRelicBonus(x.relics,'market',{amount:500,win:true});
 assert.ok(native.skills.includes(b.name));
 const no=modeRelicBonus(x.relics,'competitive',{amount:500,win:true});
 assert.ok(!no.skills.includes(c.name));
 const granted={cash:0,relics:x.relics};
 assert.ok(nativeRelicBonus(granted,'market',500,Date.UTC(2026,10,3))<=5);
});

test('auto equipment selects owned relics and obeys four slots and Unite singleton',()=>{
 const x:{relics?:RelicCollection}={};
 grantUniteRelic(x,'unite.first_win',1);
 grantUniteRelic(x,'unite.five_wins',5);
 for(const def of NORMAL_RELICS.filter(d=>['competitive','universal','racing','finance'].includes(d.mode)).slice(0,30))
  x.relics!.items[def.id]={...def,origin:'normal',count:1};
 const first=autoEquipRelics(x,'competitive');
 assert.ok(first.equipped.length<=4);
 assert.equal(new Set(first.equipped).size,first.equipped.length);
 assert.ok(first.equipped.filter(id=>id.startsWith('unite.')).length<=1);
 for(const id of first.equipped)assert.ok(x.relics!.items[id]);
 const second=autoEquipRelics(x,'all');
 assert.ok(second.power>0);
 assert.equal(second.equipped.length,4);
 assert.throws(()=>autoEquipRelics(x,'exploit'),/目的/);
});
test('tactical triggers differentiate rarities instead of rewarding all amounts',()=>{
 const rare=NORMAL_RELICS.find(i=>i.mode==='fortune'&&i.rarity==='rare')!;
 assert.equal(rare.skill,'prime');
 const x:{relics?:RelicCollection}={relics:{totalSummons:0,items:{[rare.id]:{...rare,origin:'normal',count:1}},equipped:[rare.id]}};
 assert.equal(modeRelicBonus(x.relics,'competitive',{amount:300,win:true}).bonus,0);
 assert.ok(modeRelicBonus(x.relics,'competitive',{amount:307,win:true}).bonus>0);
});
