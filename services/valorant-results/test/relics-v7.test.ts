import test from 'node:test';
import assert from 'node:assert/strict';
import {NORMAL_RELICS,RISK_RELICS} from '../src/relic-catalog.ts';
import {summonRelics,evaluateRelicBonus,saveRelicPreset,loadRelicPreset,removeRelicPreset,diagnoseRelicBuild,RELIC_PRESETS,type RelicCollection} from '../src/relics.ts';
const owned=(...defs:(typeof NORMAL_RELICS)[number][]):RelicCollection=>({totalSummons:0,items:Object.fromEntries(defs.map(i=>[i.id,{...i,origin:'normal' as const,count:1}])),equipped:defs.map(i=>i.id)});

test('new rarity modifications use independent deterministic chance and never reroll existing summons',()=>{
 const r=NORMAL_RELICS.find(x=>x.mode==='competitive'&&x.rarity==='common')!;
 const state:{cash:number;relics?:RelicCollection}={cash:2500,relics:owned(r)};
 state.relics!.equipped=[];
 const rarityRolls=new Uint32Array(20);
 for(let n=0;n<10;n++){rarityRolls[n*2]=999999;rarityRolls[n*2+1]=0;}
 const variants=new Uint32Array(20).fill(0xffffffff);variants[0]=0;variants[1]=0;
 // Draw uses the caller's deterministic rarity and item slots, and independent variant bytes.
 const result=summonRelics(state,10,rarityRolls,variants);
 assert.equal(state.relics!.totalSummons,10);
 assert.equal(state.relics!.summonHistory?.[0]?.count,10);
 assert.equal(result.start,1);
 assert.equal(result.end,10);
 assert.equal(result.cost,2000);
 assert.equal(state.cash,500);
 assert.ok(result.mutations.length<=1);
 assert.ok(result.foils.length<=1);
 assert.equal(state.relics!.summonHistory?.length,1);
 assert.equal(result.summary.common,10);
});
test('summon history is bounded by 30 entries and retains rarest highlight for replay',()=>{
 const s:{cash:number;relics?:RelicCollection}={cash:10000};
 for(let i=0;i<31;i++)summonRelics(s,1,new Uint32Array([999999,0]));
 assert.equal(s.relics!.summonHistory?.length,30);
 assert.equal(s.relics!.summonHistory?.[0]?.end,31);
 assert.equal(s.relics!.summonHistory?.[29]?.end,2);
 assert.equal(s.relics!.totalSummons,31);
});
test('presets save, load, remove, reject missing, and enforce Unite singleton atomically',()=>{
 const first=NORMAL_RELICS[0]!,second=NORMAL_RELICS[1]!;
 const c=owned(first,second),state:{relics?:RelicCollection}={relics:c};
 assert.equal(RELIC_PRESETS.length,6);
 saveRelicPreset(state,'valorant');
 c.equipped=[second.id];
 assert.deepEqual(loadRelicPreset(state,'valorant').equipped,[first.id,second.id]);
 assert.deepEqual(c.equipped,[first.id,second.id]);
 assert.throws(()=>loadRelicPreset(state,'risk'),/保存/);
 assert.deepEqual(saveRelicPreset(state,'自作ビルド').equipped,[first.id,second.id]);
 assert.throws(()=>saveRelicPreset(state,' '),/1〜24文字/);
 removeRelicPreset(state,'valorant');
 assert.throws(()=>loadRelicPreset(state,'valorant'),/保存/);
});
test('building diagnosis is reproducible and never modifies KP or relics',()=>{
 const a=NORMAL_RELICS.find(x=>x.mode==='competitive'&&x.rarity==='ancient')!;
 const state=owned(a),before=JSON.stringify(state);
 const d=diagnoseRelicBuild(state);
 assert.ok(['安定型','ハイリスク型','一撃必殺型','万能強化型'].includes(d.style));
 assert.equal(d.best.length,4);
 assert.ok(d.best.some(x=>x.mode==='competitive'));
 assert.equal(JSON.stringify(state),before);
});
test('sets and curse reversal really modify payout, not just a label',()=>{
 const a=NORMAL_RELICS.find(x=>x.mode==='competitive'&&x.rarity==='mythic')!;
 const b=NORMAL_RELICS.find(x=>x.mode==='competitive'&&x.rarity==='ancient')!;
 const c=owned(a,b);
 const x=evaluateRelicBonus(c,'competitive',{amount:307,win:true});
 assert.ok(x.sets.some(s=>s.name.includes('同系統の絆')));
 assert.ok(x.sets[0]!.bonus>0);
 assert.equal(x.bonus,x.gross);
 const coin=RISK_RELICS.find(x=>x.tradeoff==='coinflip')!;
 const voidPact=RISK_RELICS.find(x=>x.tradeoff==='void')!;
 const duo=owned(coin,voidPact,a);
 const reversed=evaluateRelicBonus(duo,'competitive',{amount:707,win:true});
 assert.equal(reversed.curseReversed,true);
 assert.ok(reversed.sets.some(x=>x.name.includes('呪い反転')));
 const nonReversed=evaluateRelicBonus(duo,'competitive',{amount:705,win:true});
 assert.equal(nonReversed.curseReversed,false);
 assert.ok(reversed.bonus>nonReversed.bonus);
});
test('native effect log records the actual earned amount and 30-entry bounded history',async()=>{
 const mod=await import('../src/relics.ts');
 const def=NORMAL_RELICS.find(x=>x.mode==='casino'&&x.rarity==='ancient')!;
 const state:{cash:number;relics?:RelicCollection}={cash:1000,relics:owned(def)};
 for(let i=0;i<33;i++){
  mod.nativeRelicBonus(state,'casino',500,Date.UTC(2026,10,3+i),10000);
 }
 assert.equal(state.relics?.nativeCount,33);
 assert.equal(state.relics?.nativeEffects?.length,30);
 assert.equal(state.relics?.nativeEarned,(state.cash-1000));
 assert.equal(state.relics?.nativeEffects?.[0]?.bonus,state.relics?.lastNativeEffect?.bonus);
});
