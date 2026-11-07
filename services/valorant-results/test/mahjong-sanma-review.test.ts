import test from 'node:test';
import reference from './fixtures/sanma-shanten-reference.json' with {type:'json'};
import assert from 'node:assert/strict';
import {reviewDecisions,tileKind} from '../src/mahjong-review-state.ts';
import type {ReviewDecision} from '../src/mahjong-review-state.ts';
import {sanmaShanten,sanmaDiscardMetrics,sanmaShapeFinding} from '../src/mahjong-sanma-efficiency.ts';
import {acceptedSanmaReport,equalSanmaComments} from '../src/mahjong-sanma-comment.ts';
import {summarizePaipu} from '../src/mahjong-summary.ts';
import type {PaipuAction,PaipuSummary} from '../src/mahjong-summary.ts';
import {paipuPost} from '../src/mahjong-paipu.ts';
const baseHand=['1m','9m','1p','2p','3p','4p','6p','8p','2s','3s','4s','E','P','C'];
function setup(n:3|4=3,custom=baseHand){
 const pool:string[]=[];
 for(const suit of ['m','p','s'])for(let k=1;k<=9;k++)if(n===4||suit!=='m'||k===1||k===9)for(let c=0;c<4;c++)pool.push(k+suit);
 for(let k=1;k<=7;k++)for(let c=0;c<4;c++)pool.push(k+'z');
 const remove=(t:string)=>{const raw=({E:'1z',S:'2z',W:'3z',N:'4z',P:'5z',F:'6z',C:'7z'} as Record<string,string>)[t]??t;const idx=pool.indexOf(raw);assert.ok(idx>=0);pool.splice(idx,1);return raw;};
 const hand=custom.map(remove);
 const data:any={chang:0,ju:0,ben:0,liqibang:0,scores:Array(n).fill(n===3?35000:25000),tiles0:hand};
 for(let s=1;s<n;s++)data['tiles'+s]=pool.splice(0,13);
 data.doras=[pool.pop()!];
 const actions:PaipuAction[]=[{name:'RecordNewRound',data}];
 const head={uuid:'synthetic-sanma-test',start_time:1,end_time:999,config:{mode:{mode:2}},accounts:Array.from({length:n},(_,seat)=>({account_id:seat+1,seat,nickname:'Player'+seat})),result:{players:Array.from({length:n},(_,seat)=>({seat,part_point_1:35000}))}};
 const summary=()=>summarizePaipu(head,[...actions,{name:'RecordNoTile',data:{players:[],scores:[]}}]);
 return {actions,data,pool,summary,remove};
}
const discard=(seat:number,tile:string,extra={})=>({name:'RecordDiscardTile',data:{seat,tile,moqie:false,...extra}});
const draw=(seat:number,tile:string,extra={})=>({name:'RecordDealTile',data:{seat,tile,...extra}});
function cycle(f:ReturnType<typeof setup>,selfDraw='1s'){
 f.actions.push(discard(0,f.data.tiles0.at(-1)));
 for(let seat=1;seat<f.data.scores.length;seat++){
  const t=f.pool.pop()!;f.actions.push(draw(seat,t),discard(seat,t,{moqie:true}));
 }
 f.actions.push(draw(0,f.remove(selfDraw)),discard(0,selfDraw,{moqie:true}));
}
function decision(hand=baseHand):ReviewDecision{return {seat:0,round:0,turn:4,actionIndex:0,actual:hand[0],draw:hand.at(-1)!,hand,players:3,dealer:0,wind:0,honba:0,sticks:0,scores:[35000,35000,35000],rivers:[[],[],[]],melds:[[],[],[]],north:[0,0,0],riichi:[false,false,false],doubleRiichi:[false,false,false],doras:['S'],visible:Array(34).fill(0),interrupted:false};}

test('sanma exact shanten: standard, seven pairs, thirteen orphans and forbidden tiles',()=>{
 assert.equal(sanmaShanten(['1p','2p','3p','4p','5p','6p','7s','8s','9s','E','E','E','P']),0);
 assert.equal(sanmaShanten(['1p','2p','3p','4p','5p','6p','7s','8s','9s','E','E','E','P','P']),-1);
 assert.equal(sanmaShanten(['1m','1m','9m','9m','1p','1p','3p','3p','5s','5s','E','E','P']),0);
 assert.equal(sanmaShanten(['1m','9m','1p','9p','1s','9s','E','S','W','N','P','F','C']),0);
 assert.equal(sanmaShanten(['1m','9m','1p','9p','1s','9s','E','S','W','N','P','F','C','C']),-1);
 assert.equal(sanmaShanten(['2m',...baseHand.slice(1)]),null);
 assert.equal(sanmaShanten(Array(14).fill('1p')),null);
 assert.equal(sanmaShanten(['1p','2p','3p','7s','8s','9s','E','E','P','P'],1),0);
});
test('ukeire uses only sanma tiles, available physical copies and legal held discards',()=>{
 const d=decision(),metrics=sanmaDiscardMetrics(d);assert.equal(metrics.length,new Set(d.hand).size);
 for(const m of metrics){assert.ok(d.hand.includes(m.tile));assert.ok(m.improving.every(t=>!/[2-8]m/.test(t)));assert.ok(m.ukeire>=0&&m.ukeire<=108);}
 const full=structuredClone(d);full.visible[9]=4;
 assert.deepEqual(sanmaDiscardMetrics(full),[],'impossible visible+hand copies are refused');
 const remaining=structuredClone(d);remaining.visible[5+9]=3;
 const observed=sanmaDiscardMetrics(remaining);assert.ok(observed.every(m=>m.ukeire<=(metrics.find(x=>x.tile===m.tile)!.ukeire)));
});
test('review inputs include own exact draw and public context, never opponent hands/wall/ura/future',()=>{
 for(const n of [3,4] as const){
  const f=setup(n);cycle(f);const s=f.summary(),frames=reviewDecisions(f.actions,s);assert.ok(frames.length>=n);
  const own=frames.find(d=>d.seat===0)!;assert.equal(own.turn,2);assert.equal(own.draw,'1s');assert.equal(own.actual,'1s');assert.equal(own.hand.length,14);
  assert.equal(own.players,n);assert.deepEqual(own.scores,Array(n).fill(n===3?35000:25000));
  f.data.paishan='PRIVATE_FUTURE';f.data.lidora=['PRIVATE_URA'];f.actions.push({name:'RecordHule',data:{hules:[],delta_scores:[]}});
  assert.deepEqual(reviewDecisions(f.actions,s),frames);
  const serialized=JSON.stringify(frames);assert.doesNotMatch(serialized,/PRIVATE|tiles0|tiles1|paishan|lidora|tehais/);
  assert.ok(own.rivers.every(r=>r.length===1));
 }
});
test('north extraction preserves hand size, replacement draw and visible north without adding a meld',()=>{
 const f=setup(3,['N',...baseHand.slice(1)]);
 f.actions.push({name:'RecordBaBei',data:{seat:0}},draw(0,f.remove('1s')),discard(0,'1s',{moqie:true}));
 const ds=reviewDecisions(f.actions,f.summary());assert.equal(ds.length,1);const d=ds[0];
 assert.equal(d.north[0],1);assert.equal(d.visible[30],1);assert.equal(d.melds[0].length,0);assert.equal(d.hand.length,14);assert.equal(d.turn,1);assert.equal(d.interrupted,true);
 assert.equal(d.hand.includes('N'),false);
 const impossible=setup(4);impossible.actions.push({name:'RecordBaBei',data:{seat:0}},draw(0,'1s'),discard(0,'1s'));
 assert.deepEqual(reviewDecisions(impossible.actions,impossible.summary()),[]);
});
test('opponent riichi and accepted deposit survive replay, but locked hands are never judged',()=>{
 const f=setup();f.actions.push(discard(0,f.data.tiles0.at(-1),{is_liqi:true}));
 const t=f.pool.pop()!;f.actions.push(draw(1,t,{liqi:{seat:0,score:34000,liqibang:1}}),discard(1,t,{moqie:true}));
 const ds=reviewDecisions(f.actions,f.summary());assert.equal(ds.length,1);assert.equal(ds[0].riichi[0],true);assert.equal(ds[0].scores[0],34000);assert.equal(ds[0].sticks,1);
 assert.equal(sanmaShapeFinding(ds[0],'3-hanchan'),null);
});
test('unknown records, impossible fifth copies, wrong turn and sanma chi fail closed',()=>{
 const f=setup();cycle(f);const s=f.summary(),before=reviewDecisions(f.actions,s);
 assert.ok(before.length>0);
 const broken=[f.actions[0],{name:'RecordUnknown',data:{}},...f.actions.slice(1)];assert.deepEqual(reviewDecisions(broken,s),[]);
 const wrong=[f.actions[0],draw(2,'1s'),...f.actions.slice(1)];assert.deepEqual(reviewDecisions(wrong,s),[]);
 const bad=structuredClone(f.actions);bad[0].data.tiles0=Array(14).fill('1p');assert.deepEqual(reviewDecisions(bad,s),[]);
 const chi=[f.actions[0],discard(0,'1p'),{name:'RecordChiPengGang',data:{seat:1,type:0,tiles:['1p','2p','3p'],froms:[0,1,1]}},...f.actions.slice(2)];assert.deepEqual(reviewDecisions(chi,s),[]);
});
test('shape comments omit strategic uncertainty, value sacrifice, north choice, final rounds and ties',()=>{
 const d=decision();
 for(const changed of [{...d,hand:['N',...d.hand.slice(1)]},{...d,turn:11},{...d,wind:1,dealer:2},{...d,scores:[9000,40000,56000]},{...d,riichi:[false,true,false]},{...d,melds:[[],[{kind:'pon' as const,tiles:['1m','1m','1m'],from:0}],[]]}])assert.equal(sanmaShapeFinding(changed,'3-hanchan'),null);
 const metrics=sanmaDiscardMetrics(d),worst=metrics.at(-1)!;d.actual=worst.tile;
 const finding=sanmaShapeFinding(d,'3-hanchan');assert.ok(finding,'a real computed shape alternative exists');
 assert.ok(finding.recommendedMetric.shanten<finding.actualMetric.shanten||finding.recommendedMetric.ukeire>=finding.actualMetric.ukeire+8);
 const f=setup(),s=f.summary(),r={version:1,source:'sanma-shape',model:'sanma-shape-v1',uuid:s.uuid,findings:[finding]};
 assert.ok(acceptedSanmaReport(s,r));const members=new Map([[0,{name:'@everyone **X**'}]]);
 const lines=equalSanmaComments(s,r,members);assert.equal(lines.length,1);assert.match(lines[0],/だけなら|形だけ|つながり/);assert.match(lines[0],/4打目/);assert.doesNotMatch(lines.join(''),/@|c3|完璧|神プレイ|放銃率|期待値/i);
 const old=paipuPost(s,members,()=> 'normal',['✅ KP +100']),post=paipuPost({...s,review:r},members,()=> 'normal',['✅ KP +100']);
 assert.match(post,/松本等しいのひと言/);assert.ok(post.length<=1900);
 for(const line of old.split('\n').filter(Boolean))assert.ok(post.includes(line));
 assert.equal(acceptedSanmaReport(s,{...r,findings:[{...finding,recommended:'5m'}]}),null);
 assert.equal(acceptedSanmaReport({...s,players:4},r),null);
});

test('pon and added kan preserve public melds, own hand length and replacement draw',()=>{
 const f=setup();f.actions.push(discard(0,'1m'),{name:'RecordChiPengGang',data:{seat:1,type:1,tiles:['1m','1m','1m'],froms:[0,1,1]}},discard(1,'1m'));
 // The fourth 1m has now been discarded, so an added-kan on it must be refused.
 const t=f.pool.pop()!;f.actions.push(draw(2,t),discard(2,t,{moqie:true}));
 const a=f.remove('1s');f.actions.push(draw(0,a),discard(0,a,{moqie:true}));
 const b=f.pool.pop()!;f.actions.push(draw(1,b),discard(1,b,{moqie:true}));
 const ds=reviewDecisions(f.actions,f.summary());const called=ds.find(d=>d.seat===1)!;
 assert.ok(called);assert.equal(called.hand.length,11);assert.equal(called.melds[1][0].kind,'pon');assert.equal(called.melds[1][0].from,0);assert.equal(called.visible[0],4);assert.equal(called.interrupted,true);
 assert.equal(sanmaShapeFinding(called,'3-hanchan'),null);
 const g=setup();g.actions.push(discard(0,'1m'),{name:'RecordChiPengGang',data:{seat:1,type:1,tiles:['1m','1m','1m'],froms:[0,1,1]}},discard(1,g.data.tiles1.find((t:string)=>t!=='1m')));
 for(const seat of [2,0]){const t=g.pool.pop()!;g.actions.push(draw(seat,t),discard(seat,t,{moqie:true}));}
 g.actions.push(draw(1,g.pool.pop()!),{name:'RecordAnGangAddGang',data:{seat:1,type:2,tiles:'1m'}});
 const repl=g.pool.pop()!;g.actions.push(draw(1,repl),discard(1,repl,{moqie:true}));
 const kan=reviewDecisions(g.actions,g.summary()).find(d=>d.seat===1)!;
 assert.ok(kan);assert.equal(kan.melds[1][0].kind,'kan');assert.equal(kan.melds[1][0].tiles.length,4);assert.equal(kan.hand.length,11);
});
test('concealed kan, red dora and additional indicators are retained without ura',()=>{
 const f=setup(3,['E','E','E','E',...baseHand.filter(t=>t!=='E').slice(0,10)]);
 f.actions.push({name:'RecordAnGangAddGang',data:{seat:0,type:3,tiles:'1z'}});
 const t=f.pool.pop()!,indicator=f.pool.pop()!;
 f.actions.push(draw(0,t,{doras:[f.data.doras[0],indicator]}),discard(0,t,{moqie:true}));
 const ds=reviewDecisions(f.actions,f.summary());assert.equal(ds.length,1);assert.equal(ds[0].melds[0][0].kind,'ankan');assert.equal(ds[0].hand.length,11);assert.equal(ds[0].visible[27],4);assert.equal(ds[0].doras.length,2);
 const red=setup(3,['5p',...baseHand.slice(1)]);red.data.tiles0[0]='0p';cycle(red);
 const own=reviewDecisions(red.actions,red.summary()).find(d=>d.seat===0)!;assert.ok(own.hand.includes('5pr'));
 assert.equal(sanmaShanten(['6pr',...baseHand.slice(1)]),null);
});

test('independent shanten reference corpus agrees on 64 synthetic sanma hands',()=>{
 for(const c of reference.cases)assert.equal(sanmaShanten(c.hand),c.expected,JSON.stringify(c.hand));
});

test('north extraction immediately after a pon is illegal and cannot produce a review',()=>{
 const f=setup();
 // Seat 1 has the north in its starting hand; exchange one tile from seat 2
 // without changing the physical deck, then call before any north draw.
 const i=f.data.tiles2.indexOf('4z');
 if(i>=0)[f.data.tiles1[12],f.data.tiles2[i]]=[f.data.tiles2[i],f.data.tiles1[12]];
 else{const north=f.remove('4z');f.pool.push(f.data.tiles1[12]);f.data.tiles1[12]=north;}
 f.actions.push(discard(0,'1m'),{name:'RecordChiPengGang',data:{seat:1,type:1,tiles:['1m','1m','1m'],froms:[0,1,1]}},{name:'RecordBaBei',data:{seat:1}},draw(1,f.pool.pop()!),discard(1,'4z'));
 assert.deepEqual(reviewDecisions(f.actions,f.summary()),[]);
});
