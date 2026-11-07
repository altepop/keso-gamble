import test from 'node:test';
import assert from 'node:assert/strict';
import {buildC3Cases} from '../src/mahjong-c3-cases.ts';
import type {PaipuAction,PaipuSummary} from '../src/mahjong-summary.ts';
import {summarizePaipu} from '../src/mahjong-summary.ts';
import {head} from './fixtures/mahjong-paipu.ts';

const deals=[
 ['1m','2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','5p'],
 ['1s','2s','3s','4s','5s','6s','7s','8s','9s','1z','2z','3z','4z'],
 ['2m','3m','4m','5m','6m','7m','8m','9m','1p','2p','3p','4p','5p'],
 ['1m','2m','3m','4m','5m','6m','7m','8m','9m','5z','6z','7z','1z'],
];
const round:PaipuAction={name:'RecordNewRound',data:{chang:0,ju:0,ben:0,liqibang:0,scores:[25000,25000,25000,25000],doras:['1z'],tiles0:deals[0],tiles1:deals[1],tiles2:deals[2],tiles3:deals[3]}};
const discard=(seat:number,tile:string):PaipuAction=>({name:'RecordDiscardTile',data:{seat,tile,moqie:true,is_liqi:false}});
const draw=(seat:number,tile:string):PaipuAction=>({name:'RecordDealTile',data:{seat,tile}});
function fixture(){
 const actions:PaipuAction[]=[round,discard(0,'5p')];
 for(let turn=1;turn<5;turn++){
  for(let seat=1;seat<4;seat++)actions.push(draw(seat,seat===1?'1p':seat===2?'2p':'3p'),discard(seat,seat===1?'1p':seat===2?'2p':'3p'));
  actions.push(draw(0,'6p'),discard(0,'6p'));
 }
 actions.push({name:'RecordNoTile',data:{players:[],scores:[]}});
 return actions;
}
const summary:PaipuSummary={...summarizePaipu(head,fixture()),game:'4-hanchan'};

test('historical C3 inputs hide other hands and future draws for all candidates',()=>{
 const actions=fixture(),cases=buildC3Cases(actions,summary);
 assert.ok(cases.length>=5,'actual turn 3+ cases are available');
 for(const c of cases){
  assert.equal(c.round,0);
  const start=c.events.find(e=>e.type==='start_kyoku')!;
  const hands=start.tehais as string[][];
  for(let i=0;i<4;i++){
   assert.equal(hands[i].length,13);
   if(i!==c.seat)assert.ok(hands[i].every(x=>x==='?'));
   else assert.ok(hands[i].every(x=>x!=='?'));
  }
  assert.equal(c.events.at(-1)?.type,'tsumo');
  assert.equal(c.events.at(-1)?.actor,c.seat);
  assert.equal(c.events.at(-1)?.can_act,true);
  assert.equal(c.events.filter(e=>e.can_act).length,1);
  for(const event of c.events){
   if(event.type==='tsumo'&&event.actor!==c.seat)assert.equal(event.pai,'?');
  }
  const lastDiscard=actions[cases.find(x=>x===c)!.turn]?.data;
  assert.ok(!JSON.stringify(c.events).includes('paishan'));
  assert.ok(c.actual.match(/^[1-9][mps]$/));
 }
});

test('future events and post-chi/riichi actions are never passed to the model',()=>{
 const actions=fixture(),baseline=buildC3Cases(actions,summary);
 assert.ok(baseline.length>0);
 const past=[...actions];
 past.splice(5,0,{name:'RecordChiPengGang',data:{seat:2,type:1,tiles:['1p','1p','1p']}});
 assert.equal(buildC3Cases(past,summary).length,0,'all candidate turns after the call are excluded');
 const before=[round,discard(0,'5p'),draw(1,'1p'),discard(1,'1p'),draw(2,'2p'),discard(2,'2p'),draw(3,'3p'),discard(3,'3p'),draw(0,'6p'),discard(0,'6p')];
 const reached=[...before,draw(1,'1p'),{name:'RecordDiscardTile',data:{seat:1,tile:'1p',moqie:true,is_liqi:true}},...actions.slice(12)];
 assert.equal(buildC3Cases(reached,summary).length,0);
});

test('missing or malformed hand histories fail closed, and non-four-player games skip',()=>{
 const actions=fixture();
 const broken=structuredClone(actions);
 delete broken[0].data.tiles2;
 assert.deepEqual(buildC3Cases(broken,summary),[]);
 const hidden=structuredClone(actions);
 hidden[0].data.tiles0=['0x',...deals[0].slice(1)];
 assert.deepEqual(buildC3Cases(hidden,summary),[]);
 assert.deepEqual(buildC3Cases(actions,{...summary,players:3,game:'3-hanchan'}),[]);
 assert.deepEqual(buildC3Cases(actions,summary,0),[]);
});

test('dealer initial tsumogiri is reconstructed from actual discard instead of guessed tile order',()=>{
 const actions=fixture();
 const altered=structuredClone(actions);
 const dealer=altered[0].data.tiles0 as string[];
 dealer.unshift(dealer.pop()!);
 const cases=buildC3Cases(altered,summary);
 assert.ok(cases.length>=4,'scrambled initial dealer tile order must not stop honest review');
});

test('unidentified initial dealer draw excludes only the dealer, preserving other players',()=>{
 const altered=structuredClone(fixture());
 // Change the first discard to an ordinary hand discard. The initial
 // dealer draw cannot be proven, but other players still see a legal river.
 altered[1].data.tile='1m';
 altered[1].data.moqie=false;
 const cases=buildC3Cases(altered,summary);
 assert.ok(cases.length>=2);
 assert.ok(cases.every(c=>c.seat!==0),'dealer receives no claim based on unknown draw');
});
