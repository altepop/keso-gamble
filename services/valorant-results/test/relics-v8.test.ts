import test from 'node:test';
import assert from 'node:assert/strict';
import {NORMAL_RELICS} from '../src/relic-catalog.ts';
import {RELIC_PRESET_LIMIT,RELIC_PRESET_NAME_LIMIT,saveRelicPreset,loadRelicPreset,removeRelicPreset,renameRelicPreset,listRelicPresets,type RelicCollection} from '../src/relics.ts';

const make=()=>{
 const item=NORMAL_RELICS[0]!;
 const c:RelicCollection={totalSummons:125,items:{[item.id]:{...item,origin:'normal',count:1}},equipped:[item.id]};
 return {c,state:{relics:c}};
};
test('custom Japanese preset names work and old six preset names remain recoverable',()=>{
 const {c,state}=make();
 const legacy=saveRelicPreset(state,'valorant');
 const bespoke=saveRelicPreset(state,'競技用・勝利バフ');
 assert.equal(legacy.name,'valorant');
 assert.equal(bespoke.name,'競技用・勝利バフ');
 assert.equal(listRelicPresets(c).find(p=>p.id==='valorant')?.name,'VALORANT');
 assert.equal(listRelicPresets(c).find(p=>p.id==='競技用・勝利バフ')?.name,'競技用・勝利バフ');
 c.equipped=[];
 assert.deepEqual(loadRelicPreset(state,'競技用・勝利バフ').equipped,[NORMAL_RELICS[0]!.id]);
 assert.equal(c.totalSummons,125);
});
test('same name overwrites loadout; rename is atomic and cannot clobber another build',()=>{
 const {c,state}=make();
 saveRelicPreset(state,'A');c.equipped=[];saveRelicPreset(state,'B');
 assert.equal(saveRelicPreset(state,'A').updated,true);
 assert.deepEqual(loadRelicPreset(state,'A').equipped,[]);
 assert.throws(()=>renameRelicPreset(state,'A','B'),/同名/);
 assert.deepEqual(loadRelicPreset(state,'A').equipped,[]);
 assert.equal(renameRelicPreset(state,'A','大会用').renamed,true);
 assert.throws(()=>loadRelicPreset(state,'A'),/保存/);
 assert.deepEqual(loadRelicPreset(state,'大会用').equipped,[]);
 removeRelicPreset(state,'大会用');
 assert.throws(()=>loadRelicPreset(state,'大会用'),/保存/);
});
test('preset names are normalized, limited and safe against control characters',()=>{
 const {state}=make();
 assert.equal(RELIC_PRESET_NAME_LIMIT,24);
 assert.equal(saveRelicPreset(state,'  あいう  ').name,'あいう');
 for(const bad of ['', ' ','a'.repeat(25),'a\nb','__proto__','constructor','prototype','<img>']){
  assert.throws(()=>saveRelicPreset(state,bad),/プリセット名/);
 }
 const name='🎰'.repeat(24);
 assert.equal(saveRelicPreset(state,name).name,name);
});
test('limit of 20 applies only to NEW keys and never blocks replacing an existing key',()=>{
 const {state,c}=make();
 for(let i=0;i<RELIC_PRESET_LIMIT;i++)saveRelicPreset(state,'custom'+i);
 assert.equal(Object.keys(c.presets!).length,20);
 assert.throws(()=>saveRelicPreset(state,'21番目'),/20個/);
 assert.equal(saveRelicPreset(state,'custom0').updated,true);
 assert.deepEqual(loadRelicPreset(state,'custom0').equipped,[NORMAL_RELICS[0]!.id]);
});
test('loading an invalid legacy preset cannot equip missing or duplicate relics',()=>{
 const {c,state}=make();
 c.presets={old:['unknown'],duplicate:[NORMAL_RELICS[0]!.id,NORMAL_RELICS[0]!.id]};
 const initial=[...c.equipped];
 assert.throws(()=>loadRelicPreset(state,'old'),/未所持/);
 assert.throws(()=>loadRelicPreset(state,'duplicate'),/重複/);
 assert.deepEqual(c.equipped,initial);
});
