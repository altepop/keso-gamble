import test from 'node:test';
import assert from 'node:assert/strict';
import {summonRelics} from '../src/relics.ts';
import {transcendentGodPullPost} from '../src/relic-god-pull.ts';

const user='827801943928995840';
const proof=(summary:Record<string,number>,highlights:Array<{id:string;name:string;rarity:string}>,count=100)=>
 ({count,summary,highlights});

test('神引き速報 is exclusive to transcendent draws, not ancient, mythic, foil or mutation',()=>{
 const ancient=proof({ancient:1,legendary:1},[{id:'a',name:'古代の剣',rarity:'ancient'}]);
 assert.equal(transcendentGodPullPost(user,ancient),null);
 assert.equal(transcendentGodPullPost(user,proof({mythic:2},[{id:'m',name:'神話',rarity:'mythic'}])),null);
 assert.equal(transcendentGodPullPost(user,proof({},[])),null);
 const fancy={...ancient,foils:['古代の剣'],mutations:['古代の剣']};
 assert.equal(transcendentGodPullPost(user,fancy),null);
});

test('real seeded transcendent draw sends one announcement and hides lesser rarity names',()=>{
 // Lv1 ticket 0 is transcendental; ticket 8 is ancient.
 const state={cash:2000};
 const entropy=new Uint32Array(20).fill(999999);
 entropy[0]=0; entropy[1]=0; // transcendental
 entropy[2]=8; entropy[3]=0; // ancient
 const summon=summonRelics(state,10,entropy);
 assert.equal(summon.summary.transcendent,1);
 assert.equal(summon.summary.ancient,1);
 const msg=transcendentGodPullPost(user,summon);
 assert.ok(msg);
 assert.match(msg,/【神引き速報｜超越降臨】/);
 assert.match(msg,/<@827801943928995840>/);
 assert.match(msg,/超越を1個獲得/);
 assert.match(msg,/10連召喚/);
 const chosen=summon.highlights.find(x=>x.rarity==='transcendent')!;
 assert.ok(msg.includes(chosen.name));
 const lesser=summon.highlights.find(x=>x.rarity==='ancient')!;
 assert.ok(!msg.includes(lesser.name));
 assert.equal(state.cash,0);
});

test('multiple transcendents share a single compact god-pull post',()=>{
 const top=Array.from({length:12},(_,i)=>({id:'t'+i,name:'超越'+i,rarity:'transcendent'}));
 const msg=transcendentGodPullPost(user,proof({transcendent:14},top,1000));
 assert.ok(msg);
 assert.match(msg,/1,000連召喚/);
 assert.match(msg,/超越を14個獲得/);
 assert.match(msg,/ほか 9個の超越を獲得/);
 assert.match(msg,/超越0/);
 assert.ok(!msg.includes('超越8'));
 assert.ok(msg.length<2000);
});

test('untrusted IDs, invalid counts and untrusted relic name markup cannot inject mentions',()=>{
 const draw=proof({transcendent:1},[{id:'x',name:'<@everyone>**_変な名前_`',rarity:'transcendent'}],1);
 assert.equal(transcendentGodPullPost('@everyone',draw),null);
 assert.equal(transcendentGodPullPost(user,proof({transcendent:2},draw.highlights,1)),null);
 const msg=transcendentGodPullPost(user,draw);
 assert.ok(msg);
 assert.ok(!msg.includes('@everyone'));
 assert.ok(!msg.includes('<@everyone>'));
 assert.ok(!msg.includes('**_変'));
});
