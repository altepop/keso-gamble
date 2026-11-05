import test from 'node:test';
import assert from 'node:assert/strict';
import {STEAM_RELIC_TIERS,STEAM_RELIC_ARCHETYPES,STEAM_RELIC_POOL_GRADES,
 steamRelicPool,steamRelicVariant,steamRelicTier,grantSteamRelic,evaluateRelicBonus,
 type RelicCollection} from '../src/relics.ts';
import {STEAM_EXTRA_PER_GRADE,steamExtraRelics} from '../src/steam-relic-catalog.ts';
import {RELIC_MODE_NAMES} from '../src/relic-catalog.ts';

test('210 published Steam trophy candidates: seven unlock bands, 12 originals plus 18 unique additions each',()=>{
 assert.equal(STEAM_RELIC_POOL_GRADES.length,7);
 const addedNames=new Set<string>();
 for(const grade of STEAM_RELIC_POOL_GRADES){
  const pool=steamRelicPool(grade);
  assert.equal(pool.length,30,grade);
  assert.equal(steamExtraRelics(grade).length,STEAM_EXTRA_PER_GRADE);
  assert.deepEqual(pool.slice(0,12).map(x=>x.name),STEAM_RELIC_ARCHETYPES.map(x=>x.name));
  assert.equal(new Set(pool.map(x=>x.name)).size,30);
  for(const item of pool){
   assert.ok(Object.hasOwn(RELIC_MODE_NAMES,item.mode),item.name);
   assert.ok(Number.isSafeInteger(item.percent)&&item.percent>=0&&item.percent<=2000,item.name);
   assert.ok(Number.isSafeInteger(item.featureValue)&&item.featureValue>=0&&item.featureValue<=300,item.name);
   assert.ok(['none','fixed','chorus','mirror','curse'].includes(item.feature));
  }
  for(const item of pool.slice(12))assert.equal(addedNames.has(item.name),false,item.name),addedNames.add(item.name);
 }
 assert.equal(addedNames.size,126);
 assert.deepEqual(STEAM_RELIC_TIERS.map(t=>t.max),[0.01,0.1,1,5,10,25,100]);
 assert.equal(steamRelicTier(25).label,'旅路');
 assert.equal(steamRelicTier(100).label,'旅路');
});

test('within each grade there are elite, practical, niche and intentionally weak trophies',()=>{
 for(const grade of STEAM_RELIC_POOL_GRADES){
  const pool=steamRelicPool(grade);
  const base=STEAM_RELIC_TIERS.find(t=>t.label===grade)!.percent;
  assert.ok(pool.some(x=>x.percent>=base*6),grade+' has a chase item');
  assert.ok(pool.some(x=>x.percent<=base),grade+' has a collector item');
  assert.ok(pool.some(x=>x.feature==='fixed'),grade+' has fixed KP');
  assert.ok(pool.some(x=>x.feature==='curse'),grade+' has a risky item');
  assert.ok(pool.some(x=>x.feature==='chorus'),grade+' has a build synergy');
 }
});

test('Steam trophy generation is deterministic and requires a verified proof; past owned items are not remapped',()=>{
 const app=123,achievement='UNIQUE_HARD_ACHIEVEMENT';
 const first=steamRelicVariant(app,achievement,0.02);
 assert.deepEqual(steamRelicVariant(app,achievement,0.02),first);
 assert.ok(steamRelicPool('深淵').some(item=>item.name===first.name));
 const proof={id:'steam:proof:1234567890abcdef1234',app,achievement,title:'難関実績',percent:0.02};
 const state:{relics?:RelicCollection}={};
 const item=grantSteamRelic(state,proof).item;
 assert.equal(item.name,'深淵の'+first.name+'：難関実績');
 assert.equal(item.origin,'steam');
 assert.equal(item.percent,first.percent);
 assert.equal(item.steamFeature?.kind,first.feature==='none'?undefined:first.feature);
 assert.throws(()=>grantSteamRelic(state,proof),/受け取り済み/);
 assert.equal(state.relics?.items[item.id],item);
});

test('fixed KP, chorus, mirror and downside apply to bonuses rather than tampering with the base payout',()=>{
 const make=(id:string,percent:number,skill='spark',feature?:{kind:'fixed'|'chorus'|'mirror'|'curse';value:number})=>({
  id,name:id,origin:'steam' as const,rarity:'exclusive' as const,power:100,
  ability:'test',count:1,mode:'universal' as const,skill,percent,cap:0,
  ...(feature?{steamFeature:feature}:{}),
 });
 const root=make('steam.root',100);
 const fixed=make('steam.fixed',1,'spark',{kind:'fixed',value:40});
 const chorus=make('steam.chorus',1,'spark',{kind:'chorus',value:30});
 const mirror=make('steam.mirror',1,'spark',{kind:'mirror',value:50});
 const state:RelicCollection={totalSummons:0,items:Object.fromEntries([root,fixed,chorus,mirror].map(x=>[x.id,x])),equipped:[root.id,fixed.id,chorus.id,mirror.id]};
 const result=evaluateRelicBonus(state,'voice',{amount:100,win:true});
 assert.ok((result.lines.find(l=>l.id===fixed.id)?.exotic??0)>=40);
 assert.ok((result.lines.find(l=>l.id===chorus.id)?.exotic??0)>=90);
 assert.ok((result.lines.find(l=>l.id===mirror.id)?.exotic??0)>=50);
 assert.ok(result.bonus>=280);
 const curse=make('steam.curse',900,'highroll',{kind:'curse',value:80});
 const cursed:RelicCollection={totalSummons:0,items:{[root.id]:root,[curse.id]:curse},equipped:[root.id,curse.id]};
 const drawback=evaluateRelicBonus(cursed,'steam',{amount:100,win:true});
 assert.equal(drawback.lines.find(l=>l.id===root.id)?.base,20);
 assert.equal(drawback.lines.find(l=>l.id===curse.id)?.triggered,false);
 const irrelevant=evaluateRelicBonus(cursed,'quiz',{amount:500,win:true});
 assert.equal(irrelevant.lines.find(l=>l.id===curse.id)?.triggered,true);
});
