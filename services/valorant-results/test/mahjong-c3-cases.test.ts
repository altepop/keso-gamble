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
 const actions:PaipuAction[]=[structuredClone(round),discard(0,'5p')];
 const pool:string[]=[];
 for(const suit of ['m','p','s','z'])for(let k=1;k<=(suit==='z'?7:9);k++)for(let copy=0;copy<4;copy++)pool.push(k+suit);
 for(const t of [...deals.flat(),'1z']){const at=pool.indexOf(t);assert.ok(at>=0);pool.splice(at,1);}
 for(let turn=1;turn<5;turn++)for(const seat of [1,2,3,0]){
  const t=pool.shift()!;actions.push(draw(seat,t),discard(seat,t));
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

test('malformed call and unacknowledged riichi histories do not invent later cases',()=>{
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

test('accepted riichi, chi, pon and every non-riichi kan produce exact public-prefix cases',async()=>{
 const {fourScenario,FOUR_SCENARIOS}=await import('./fixtures/mahjong-review-four.ts');
 const {reviewDecisions}=await import('../src/mahjong-review-state.ts');
 for(const kind of FOUR_SCENARIOS){
  const {actions,summary}=fourScenario(kind),cases=buildC3Cases(actions,summary),frames=reviewDecisions(actions,summary);
  const event=kind==='reach'?'reach_accepted':kind;
  assert.ok(cases.some(c=>c.events.some(e=>e.type===event)),kind+' is represented after the actual event');
  if(kind==='chi'||kind==='pon')assert.ok(cases.some(c=>c.seat===1&&c.events.at(-1)?.type===kind),'immediate call discard is represented');
  for(const c of cases){
   assert.equal(c.position,'discard');const f=frames.find(f=>f.seat===c.seat&&f.round===c.round&&f.turn===c.turn)!;
   assert.ok(f);assert.equal(c.actual,f.actual);assert.deepEqual(c.legal.slice().sort(),[...new Set(f.hand)].sort());
   const initial=c.events.find(e=>e.type==='start_kyoku')!;
   assert.ok((initial.tehais as string[][]).every((h,s)=>s===c.seat||h.every(t=>t==='?')));
   assert.ok(c.events.filter(e=>e.type==='tsumo'&&e.actor!==c.seat).every(e=>e.pai==='?'));
   const prefix=actions.slice(0,f.actionIndex+1),same=buildC3Cases(prefix,summary).find(x=>x.seat===c.seat&&x.round===c.round&&x.turn===c.turn);
   assert.ok(same);assert.deepEqual(same.events,c.events,'later actions cannot change this decision');
  }
  if(kind==='reach'){
   assert.ok(cases.every(c=>c.seat!==1),'own locked riichi is never praised for a forced discard');
   const c=cases.find(c=>c.events.some(e=>e.type==='reach_accepted'))!;
   assert.equal(c.events.filter(e=>e.type==='reach_accepted').length,1);
   assert.ok(c.events.findIndex(e=>e.type==='reach')<c.events.findIndex(e=>e.type==='reach_accepted'));
  }
  if(kind==='ankan'||kind==='kakan'){
   const c=cases.find(c=>c.events.some(e=>e.type===kind))!;
   const k=c.events.find(e=>e.type===kind)!;
   const publicTiles=[...(k.consumed as string[]),...typeof k.pai==='string'?[k.pai]:[]];
   assert.ok(publicTiles.includes('5pr'),'red identity comes from the actual kan, not a guessed red five');
   assert.equal(publicTiles.length,4);
  }
 }
});

test('new protobuf default extension objects do not turn a standard round into a special mode',()=>{
 const actions=fixture();
 const start=actions[0].data;
 start.opens=[0,1,2,3].map(seat=>({seat,tiles:[],count:[]}));
 start.muyu={seat:0,count:0,count_max:0,id:0};start.yongchang={seat:0,moqie_count:0,moqie_bonus:0,shouqie_count:0,shouqie_bonus:0};start.field_spell=0;
 assert.ok(buildC3Cases(actions,summary).length>=5);
 start.muyu.count_max=3;assert.deepEqual(buildC3Cases(actions,summary),[]);
});

test('empty protobuf riichi placeholders neither deduct points nor fabricate reach-accepted events',()=>{
 const actions=fixture();
 for(const a of actions)if(a.name==='RecordDealTile')a.data.liqi={seat:0,score:0,liqibang:0,failed:false};
 const cases=buildC3Cases(actions,summary);
 assert.ok(cases.length>=5);assert.ok(cases.every(c=>c.events.every(e=>e.type!=='reach_accepted')));
});
