// OFFLINE only: completed winning hands/ura must NEVER reach decision inference.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {reviewDecisions,tileKind} from '../src/mahjong-review-state.ts';
import {toC3Tile} from '../src/mahjong-c3-extract.ts';
const ts=xs=>Array.isArray(xs)&&xs.every(t=>toC3Tile(t))?xs.map(toC3Tile):null;
export function auditCompletedSanmaHands(actions,summary,{python=process.env.SANMA_PYTHON,runner=spawnSync}={}){
 const out={configured:Boolean(python),winsSeen:0,prepared:0,skipped:0,status:python?'no-wins':'not-configured'};
 if(!python||summary.players!==3)return out;
 const transitions=new Map(),diagnostics={acceptedRounds:0,blocked:{}};
 reviewDecisions(actions,summary,256,diagnostics,transitions);
 if(Object.keys(diagnostics.blocked).length){out.status='replay-unverified';return out;}
 const wins=[];let dealer=-1,wind=-1,doras=[],melds=[[],[],[]],north=[0,0,0];
 for(const [index,{name,data:d}] of actions.entries()){
  if(name==='RecordNewRound'){dealer=d.ju;wind=d.chang;doras=ts(d.doras?.length?d.doras:[d.dora])??[];melds=[[],[],[]];north=[0,0,0];continue;}
  if(d?.doras?.length)doras=ts(d.doras)??[];
  if(name==='RecordBaBei'){north[d.seat]++;continue;}
  if(name==='RecordChiPengGang'){melds[d.seat].push({kind:d.type===1?'pon':'kan',tiles:ts(d.tiles)});continue;}
  if(name==='RecordAnGangAddGang'){
   const t=transitions.get(index);if(!t){out.status='kan-unverified';return out;}
   if(t.type==='ankan')melds[t.actor].push({kind:'ankan',tiles:t.consumed.slice()});
   else{const m=melds[t.actor].find(m=>m.kind==='pon'&&tileKind(m.tiles[0])===tileKind(t.pai));if(!m){out.status='kan-unverified';return out;}m.kind='kan';m.tiles.push(t.pai);}
   continue;
  }
  if(name!=='RecordHule')continue;
  for(const h of d.hules??[]){
   out.winsSeen++;if(wins.length>=12||h.yiman||h.baopai_seats?.length||wind<0||wind>1||!Number.isInteger(h.seat)||h.seat<0||h.seat>2||!Array.isArray(h.fans)||h.fans.some(f=>f.id<1||f.id>34)){out.skipped++;continue;}
   const own=melds[h.seat],needed=14-3*own.length,hand=ts(h.hand),win=toC3Tile(h.hu_tile);
   if(!hand||!win||![needed-1,needed].includes(hand.length)||!doras.length){out.skipped++;continue;}
   if(hand.length===needed){const at=hand.indexOf(win);if(at<0){out.skipped++;continue;}hand.splice(at,1);}
   const han=h.fans.reduce((n,f)=>n+f.val,0);if(!Number.isInteger(han)||han>=13||!Number.isInteger(h.fu)){out.skipped++;continue;}
   const flags=h.fans.filter(f=>[2,3,4,5,6,18,30].includes(f.id)).map(f=>f.id),ura=flags.includes(2)||flags.includes(18)?ts(h.li_doras??[]):[];
   if(!ura){out.skipped++;continue;}
   const parent=h.seat===dealer;
   wins.push({hand,win,melds:structuredClone(own),north:north[h.seat],doras:doras.slice(),ura,seatWind:(h.seat-dealer+3)%3,roundWind:wind,tsumo:Boolean(h.zimo),flags,
    expected:{han,fu:h.fu,main:h.zimo?(parent?h.point_zimo_xian:h.point_zimo_qin):h.point_rong,additional:h.zimo?h.point_zimo_xian:0}});
  }
 }
 out.prepared=wins.length;if(!wins.length)return out;
 try{
  const r=runner(python,['-I',fileURLToPath(new URL('./mahjong-sanma-hand-audit.py',import.meta.url))],{input:JSON.stringify(wins),encoding:'utf8',env:{},timeout:8000,maxBuffer:16384,killSignal:'SIGKILL'});
  if(r.status!==0||r.error){out.status='failed';return out;}
  const counts=JSON.parse(r.stdout),allowed=['prepared','evaluated','matchedHanFu','matchedBasePayment','mismatchedHanFu','mismatchedBasePayment','calculationRejected'];
  if(allowed.some(k=>!Number.isInteger(counts[k])||counts[k]<0||counts[k]>wins.length)){out.status='invalid-counts';return out;}
  return {...out,...Object.fromEntries(allowed.map(k=>[k,counts[k]])),status:'ok'};
 }catch{out.status='failed';return out;}
}
