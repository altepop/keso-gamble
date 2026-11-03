import {NORMAL_RELICS,RISK_RELICS,ALL_NORMAL_RELICS,RELIC_CATALOG_COUNT,RELIC_RARITIES,RELIC_MODE_NAMES} from '../src/relic-catalog.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spikeOpeningTier,RELIC_SUMMON_COST,rarityForRoll,rarityRatesForLevel,modeRelicBonus,evaluateRelicBonus,nativeRelicBonus,relicCollection,summonLevel,summonRelics,grantSteamRelic,grantUniteRelic,equipRelic,autoEquipRelics,SUMMON_MILESTONES,summonProgress,steamRelicTier,steamRelicArchetype,STEAM_RELIC_TIERS,UNITE,UNITE_REQUIREMENTS,UNITE_STREAK_IDS,type RelicCollection} from '../src/relics.ts';
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
 assert.equal(RELIC_CATALOG_COUNT,183);
 assert.equal(RISK_RELICS.length,8);
 assert.equal(new Set(ALL_NORMAL_RELICS.map(r=>r.id)).size,183);
 assert.equal(new Set(NORMAL_RELICS.map(r=>r.id)).size,175);
 assert.equal(new Set(NORMAL_RELICS.map(r=>r.name)).size,175);
 assert.equal(Object.keys(RELIC_MODE_NAMES).length,25);
 for(const tier of RELIC_RARITIES) assert.equal(NORMAL_RELICS.filter(r=>r.rarity===tier).length,25);
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
 assert.match(c.items['normal.copper']!.ability,/コンペで/);
 assert.equal(c.items['normal.rainbow']?.origin,'normal');
 assert.match(c.items['normal.rainbow']!.ability,/コンペで/);
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
 assert.equal(on.bonus,evaluateRelicBonus(x.relics,mode,{amount:507,win:true}).bonus);
 assert.equal(modeRelicBonus(x.relics,mode,{amount:0,win:true}).bonus,0);
});
test('native confirmed positive payouts stack forever without old daily or percent limits',()=>{
 const def=NORMAL_RELICS.find(r=>r.mode==='market'&&r.rarity==='transcendent')!;
 const item={...def,origin:'normal' as const,count:10};
 const state:{cash:number;relics?:RelicCollection}={cash:1000,relics:{totalSummons:4000,items:{[def.id]:item},equipped:[def.id]}};
 const expected=evaluateRelicBonus(state.relics,'market',{amount:100000,win:true}).bonus;
 assert.ok(expected>120);
 assert.equal(nativeRelicBonus(state,'market',100000,Date.parse('2026-11-02')),expected);
 assert.equal(nativeRelicBonus(state,'market',100000,Date.parse('2026-11-02')),expected);
 assert.equal(nativeRelicBonus(state,'market',100000,Date.parse('2026-11-02')),expected);
 assert.equal(state.cash,1000+expected*3);
 assert.equal(state.relics?.dailyNativeBonus,undefined);
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
 assert.equal(NORMAL_RELICS.length,175);
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
 assert.ok(nativeRelicBonus(granted,'market',500,Date.UTC(2026,10,3))>5);
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


test('short headlines say bonus KP percentage directly, and preserve ancient/transcendental identity',()=>{
 assert.equal(NORMAL_RELICS.length,175);
 assert.ok(NORMAL_RELICS.every(x=>x.short.includes('KP報酬＋')&&x.short.includes('%')));
 const mastery=NORMAL_RELICS.find(x=>x.mode==='competitive'&&x.rarity==='ancient')!;
 assert.match(mastery.short,/勝利・達成時：KP報酬＋9%/);
 assert.match(mastery.trait??'',/刻印連鎖/);
 const transcendent=NORMAL_RELICS.find(x=>x.rarity==='transcendent')!;
 assert.match(transcendent.trait??'',/運命突破/);
 const legacy:{relics?:RelicCollection}={relics:{totalSummons:250,items:{
  'normal.origin':{id:'normal.origin',name:'古い遺物',rarity:'ancient',origin:'normal',count:4,power:260,ability:'旧表示'}
 },equipped:['normal.origin']}};
 relicCollection(legacy);
 assert.equal(legacy.relics!.items['normal.origin']?.count,4);
 assert.equal(legacy.relics!.equipped[0],'normal.origin');
});
test('ancient chain seal is added without a global cap',()=>{
 const ancient=NORMAL_RELICS.find(x=>x.mode==='competitive'&&x.rarity==='ancient')!;
 const universal=NORMAL_RELICS.find(x=>x.mode==='universal'&&x.rarity==='rare')!;
 const fortune=NORMAL_RELICS.find(x=>x.mode==='fortune'&&x.rarity==='rare')!;
 const items=Object.fromEntries([ancient,universal,fortune].map(x=>[x.id,{...x,origin:'normal' as const,count:1}]));
 const x:RelicCollection={totalSummons:0,items,equipped:[ancient.id,universal.id,fortune.id]};
 const r=evaluateRelicBonus(x,'competitive',{amount:307,win:true});
 const a=r.lines.find(x=>x.id===ancient.id)!;
 assert.ok(a.trait.startsWith('刻印連鎖'));
 assert.equal(a.exotic,8);
 assert.equal(r.gross,r.bonus);
 assert.ok(r.bonus>Math.floor(307*.15));
 assert.equal(r.percent,a.effectivePercent+universal.percent+fortune.percent);
});
test('transcendental fate breakthrough pays fixed KP when conditions fail',()=>{
 const transcend=NORMAL_RELICS.find(x=>x.mode==='competitive'&&x.rarity==='transcendent')!;
 const x:RelicCollection={totalSummons:0,items:{[transcend.id]:{...transcend,origin:'normal',count:1}},equipped:[transcend.id]};
 const r=evaluateRelicBonus(x,'competitive',{amount:500,win:false});
 assert.equal(r.percent,0);
 assert.equal(r.lines[0]?.triggered,false);
 assert.ok(r.lines[0]?.trait.startsWith('運命突破'));
 assert.ok(r.lines[0]!.exotic>0);
 assert.ok(r.bonus>0);
 assert.equal(modeRelicBonus(x,'competitive',{amount:500,win:false}).bonus,r.bonus);
});
test('Steam and Unite fixed seals also stack without a shared cap',()=>{
 const x:{relics?:RelicCollection}={};
 grantUniteRelic(x,'unite.first_win',1);
 const r=evaluateRelicBonus(x.relics,'competitive',{amount:100,win:true});
 assert.equal(r.bonus,0); // none is equipped
 equipRelic(x,'unite.first_win',0);
 const withUnite=evaluateRelicBonus(x.relics,'competitive',{amount:1000,win:true});
 assert.equal(withUnite.lines[0]?.trait,'出自の加護');
 assert.ok(withUnite.lines[0]!.exotic>0);
 assert.ok(withUnite.bonus>80);
 const steam={id:'steam:g:76561199999999999:123:EX',app:123,achievement:'EX',title:'達成',percent:30};
 const claimed=grantSteamRelic(x,steam).item;
 equipRelic(x,claimed.id,1);
 const withSteam=evaluateRelicBonus(x.relics,'competitive',{amount:1000,win:true});
 assert.ok(withSteam.lines.some(l=>l.id===claimed.id&&l.trait==='出自の加護'));
 assert.ok(withSteam.bonus>80);
});
test('native simulator reports real final percentage and never credits fake KP',()=>{
 const def=NORMAL_RELICS.find(x=>x.mode==='market'&&x.rarity==='ancient')!;
 const state:{cash:number;relics?:RelicCollection}={cash:100,relics:{totalSummons:1,items:{[def.id]:{...def,origin:'normal',count:1}},equipped:[def.id]}};
 const before=JSON.stringify(state);
 const x=evaluateRelicBonus(state.relics,'market',{amount:5000,win:true},120);
 assert.equal(x.bonus,450);
 assert.equal(x.effectivePercent,9);
 assert.equal(JSON.stringify(state),before);
 const actual=nativeRelicBonus(state,'market',5000,Date.UTC(2026,10,3));
 assert.equal(actual,x.bonus);
 assert.equal(state.cash,550);
 assert.equal(state.relics?.lastNativeEffect?.bonus,450);
 assert.equal(state.relics?.lastNativeEffect?.percent,9);
 const capped=evaluateRelicBonus(state.relics,'market',{amount:5000,win:true},70);
 assert.equal(capped.bonus,450);
});


test('all eight new risk pacts are normal-summon only, with new stable IDs and visible drawbacks',()=>{
 assert.equal(RISK_RELICS.length,8);
 for(const item of RISK_RELICS){
  assert.equal(item.id.startsWith('normal.pact.'),true);
  assert.ok(item.tradeoff);
  assert.ok((item.drawback?.length??0)>10);
  assert.ok(['legendary','mythic','ancient','transcendent'].includes(item.rarity));
 }
 assert.equal(RISK_RELICS.filter(x=>x.rarity==='transcendent').length,2);
});
test('the lonely crown grants huge bonus but silences the second relic by 80 percent',()=>{
 const pact=RISK_RELICS.find(x=>x.tradeoff==='solo')!;
 const other=NORMAL_RELICS.find(x=>x.mode==='competitive'&&x.rarity==='ancient')!;
 const items=Object.fromEntries([pact,other].map(i=>[i.id,{...i,origin:'normal' as const,count:1}]));
 const result=evaluateRelicBonus({totalSummons:0,items,equipped:[pact.id,other.id]},'competitive',{amount:900,win:true});
 assert.ok(result.bonus>1000);
 const crown=result.lines.find(x=>x.id===pact.id)!;
 const muted=result.lines.find(x=>x.id===other.id)!;
 assert.equal(crown.base,1575);
 assert.equal(muted.base,16); // original 9% of 900 =81, *0.2 =16
 assert.equal(result.cap,0);
});
test('prime-only frenzy also creates a genuine dead draw with other skills weakened',()=>{
 const pact=RISK_RELICS.find(x=>x.tradeoff==='frenzy')!;
 const other=NORMAL_RELICS.find(x=>x.mode==='universal'&&x.rarity==='rare')!;
 const items=Object.fromEntries([pact,other].map(i=>[i.id,{...i,origin:'normal' as const,count:1}]));
 const coll:RelicCollection={totalSummons:0,items,equipped:[pact.id,other.id]};
 const prime=evaluateRelicBonus(coll,'competitive',{amount:307,win:true});
 assert.equal(prime.lines[0]?.base,2763);
 const fail=evaluateRelicBonus(coll,'competitive',{amount:300,win:true});
 assert.equal(fail.lines[0]?.base,0);
 assert.ok(fail.bonus<prime.bonus/20);
});
test('chains require other triggers and preserve an intelligible actual percentage',()=>{
 const pact=RISK_RELICS.find(x=>x.tradeoff==='chain')!;
 const rare=NORMAL_RELICS.find(x=>x.mode==='universal'&&x.rarity==='rare')!;
 const common=NORMAL_RELICS.find(x=>x.mode==='competitive'&&x.rarity==='rare')!;
 const items=Object.fromEntries([pact,rare,common].map(i=>[i.id,{...i,origin:'normal' as const,count:1}]));
 const coll:RelicCollection={totalSummons:0,items,equipped:[pact.id]};
 assert.equal(evaluateRelicBonus(coll,'competitive',{amount:307,win:true}).bonus,0);
 coll.equipped=[pact.id,rare.id,common.id];
 const result=evaluateRelicBonus(coll,'competitive',{amount:307,win:true});
 assert.ok(result.lines[0]!.base>307*2.6);
 assert.equal(result.lines[0]!.reason.startsWith('連鎖成功'),true);
 assert.ok(result.effectivePercent>260);
});
test('summon 1000 highlights rarest first even if final rare pull appears late',()=>{
 const state:{cash:number;relics?:RelicCollection}={cash:210000};
 const rolls=new Uint32Array(2000).fill(700000);
 rolls[1998]=0;rolls[1999]=1;
 const result=summonRelics(state,1000,rolls);
 assert.equal(result.summary.transcendent,1);
 assert.equal(result.highlights[0]?.rarity,'transcendent');
 assert.ok(result.highlights.length<=12);
});


test('Spike opening relics are strong immediately at 20/40 KP with no growth progress',()=>{
 const spike=NORMAL_RELICS.find(x=>x.mode==='spikerush'&&x.rarity==='common')!;
 const other=NORMAL_RELICS.find(x=>x.mode==='competitive'&&x.rarity==='common')!;
 const inventory:RelicCollection={totalSummons:0,items:Object.fromEntries([spike,other].map(x=>[x.id,{...x,origin:'normal',count:1}])),equipped:[spike.id,other.id]};
 const noOpening=evaluateRelicBonus(inventory,'spikerush',{amount:40,win:true});
 assert.equal(noOpening.bonus,0,'existing lucky7 condition is not triggered by 40KP');
 const first=evaluateRelicBonus(inventory,'spikerush',{amount:40,win:true,spikeGamesBefore:0});
 assert.equal(first.spikeOpening?.game,1);
 assert.equal(first.spikeOpening?.flatPerRelic,50);
 assert.equal(first.spikeOpening?.eligible,1,'competitive-only relic must not become universal');
 assert.equal(first.bonus,50);
 assert.equal(first.lines.find(x=>x.id===other.id)?.exotic,0);
 assert.match(first.lines.find(x=>x.id===spike.id)!.reason,/先陣の加護/);
 assert.equal(evaluateRelicBonus(inventory,'spikerush',{amount:20,win:false,spikeGamesBefore:0}).bonus,50);
});
test('the first 6/next 9/next 25 Spike matches gradually taper, then normal relics resume at game 41',()=>{
 const spike=NORMAL_RELICS.find(x=>x.mode==='spikerush'&&x.rarity==='uncommon')!;
 const c:RelicCollection={totalSummons:0,items:{[spike.id]:{...spike,origin:'normal',count:1}},equipped:[spike.id]};
 const baseline=evaluateRelicBonus(c,'spikerush',{amount:40,win:true});
 assert.ok(baseline.bonus>0,'even 40KP activates uncommon Spike relic');
 const expectAt=(n:number,factor:number,flat:number)=>{
  const got=evaluateRelicBonus(c,'spikerush',{amount:40,win:true,spikeGamesBefore:n});
  assert.equal(got.spikeOpening?.multiplier,factor);
  assert.equal(got.spikeOpening?.flatPerRelic,flat);
  assert.equal(got.bonus,baseline.bonus*factor+flat);
 };
 expectAt(0,3,50);expectAt(5,3,50);
 expectAt(6,2,30);expectAt(14,2,30);
 // 1.5x is floored for safe integer KP accounting.
 for(const n of [15,39]){
  const got=evaluateRelicBonus(c,'spikerush',{amount:40,win:true,spikeGamesBefore:n});
  assert.equal(got.spikeOpening?.flatPerRelic,15);
  assert.equal(got.bonus,Math.floor(baseline.bonus*1.5)+15);
 }
 assert.equal(evaluateRelicBonus(c,'spikerush',{amount:40,win:true,spikeGamesBefore:40}).bonus,baseline.bonus);
 assert.equal(spikeOpeningTier(40),null);
 assert.equal(spikeOpeningTier(-1),null);
});
test('four compatible Spike relics stack opening bonuses; empty slots and other games do not',()=>{
 const defs=NORMAL_RELICS.filter(x=>x.mode==='spikerush').slice(0,4);
 assert.equal(defs.length,4);
 const coll:RelicCollection={totalSummons:0,items:Object.fromEntries(defs.map(x=>[x.id,{...x,origin:'normal',count:1}])),equipped:defs.map(x=>x.id)};
 const early=evaluateRelicBonus(coll,'spikerush',{amount:40,win:true,spikeGamesBefore:0});
 assert.ok(early.bonus>=200,'four equipped relics each grant 50KP immediately');
 assert.equal(early.spikeOpening?.eligible,4);
 assert.ok(early.bonus>evaluateRelicBonus(coll,'spikerush',{amount:40,win:true}).bonus);
 assert.equal(evaluateRelicBonus(undefined,'spikerush',{amount:40,win:true,spikeGamesBefore:0}).bonus,0);
 assert.equal(evaluateRelicBonus(coll,'competitive',{amount:40,win:true,spikeGamesBefore:0}).spikeOpening,undefined);
});

test('2026-11-03: 雀魂・ユナイト・Steam・KESO LOOP・デスマッチ一発勝負にも7レアずつ遺物があり、既存のIDは変わらない',()=>{
 for(const mode of ['mahjong','unite','steam','loop','dmchallenge']){
  const items=NORMAL_RELICS.filter(r=>r.mode===mode);
  assert.deepEqual(items.map(r=>r.rarity),[...RELIC_RARITIES],mode);
  assert.ok(items.every(r=>r.id===`normal.${mode}.${r.rarity}`));
 }
 assert.ok(NORMAL_RELICS.some(r=>r.id==='normal.copper'),'legacy ids stay');
 const own=(id:string)=>{const def=NORMAL_RELICS.find(r=>r.id===id)!;return {totalSummons:1,equipped:[id],items:{[id]:{...def,origin:'normal' as const,count:1}}} as unknown as RelicCollection;};
 assert.ok(evaluateRelicBonus(own('normal.mahjong.transcendent'),'mahjong',{amount:600,win:true}).bonus>0,'a 雀魂 relic works on 雀魂');
 assert.equal(evaluateRelicBonus(own('normal.mahjong.transcendent'),'competitive',{amount:600,win:true}).bonus,0,'and not elsewhere');
 assert.ok(evaluateRelicBonus(own('normal.loop.legendary'),'loop',{amount:50000,win:true}).bonus>0,'LOOP milestones (multiples of 25) trigger the quarter skill');
 assert.ok(evaluateRelicBonus(own('normal.dmchallenge.mythic'),'dmchallenge',{amount:5000,win:true}).bonus>0);
 assert.ok(evaluateRelicBonus(own('normal.universal.common'),'unite',{amount:200,win:true}).bonus>0,'universal relics also cover the new games');
});
