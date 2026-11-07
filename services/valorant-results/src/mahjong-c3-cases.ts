// Four-player MJAI adapter, gated by the shared physical/turn-order replay.
// Only the focal player's concealed information survives the final snapshot.
import type {PaipuAction,PaipuSummary} from './mahjong-summary.ts';
import {toC3Tile} from './mahjong-c3-extract.ts';
import {reviewDecisions,hasReachAcceptance} from './mahjong-review-state.ts';
import type {ReviewTransition} from './mahjong-review-state.ts';

type Event={type:string;[key:string]:unknown};
export interface C3Case {
 seat:number;round:number;turn:number;actual:string;legal:string[];events:Event[];position:'discard';
}
const tile=(x:unknown)=>toC3Tile(x);
const array=(xs:unknown):string[]=>Array.isArray(xs)?xs.map(tile).filter((t):t is string=>t!==null):[];
const wind=['E','S','W','N'];
function copyForSeat(events:Event[],seat:number):Event[]{
 const copy=structuredClone(events);
 for(const e of copy){
  if(e.type==='start_kyoku')e.tehais=(e.tehais as string[][]).map((h,i)=>i===seat?h.slice():Array(13).fill('?'));
  if(e.type==='tsumo'&&e.actor!==seat)e.pai='?';
  e.can_act=false;
 }
 if(copy.length)copy[copy.length-1].can_act=true;
 return copy;
}
/** Reconstructs the whole known history, including accepted opponent riichi,
 * calls and kans. Unknown records / illegal physical histories get no later
 * candidate from reviewDecisions. Own locked riichi and unverified riichi-kan
 * remain excluded. Model invocations stay bounded; replay itself covers all. */
export function buildC3Cases(actions:PaipuAction[],summary:PaipuSummary,cap=48):C3Case[]{
 if(summary.players!==4||!/^4-(tonpu|hanchan)$/.test(summary.game)||!Number.isInteger(cap)||cap<1||cap>128)return [];
 const transitions=new Map<number,ReviewTransition>();
 const frames=reviewDecisions(actions,summary,512,undefined,transitions),byIndex=new Map(frames.map(f=>[f.actionIndex,f]));
 if(!frames.length)return [];
 let round=-1,events:Event[]=[],doras:string[]=[],dealer=-1,dealerDrawKnown=false,firstDiscard=true;
 let pending:{seat:number;tile:string}|null=null;
 const accepted=new Set<number>(),candidates:C3Case[]=[],stageCounts=new Map<string,number>();
 const pushDoras=(d:any)=>{
  const ds=array(d?.doras);
  for(const t of ds.slice(doras.length))events.push({type:'dora',dora_marker:t});
  if(ds.length)doras=ds;
 };
 const reachAccepted=(d:any)=>{if(hasReachAcceptance(d)&&!accepted.has(d.seat)){events.push({type:'reach_accepted',actor:d.seat});accepted.add(d.seat);}};
 for(const [index,a] of actions.entries()){
  const d=a?.data,name=a?.name;
  if(name==='RecordNewRound'){
   round++;events=[];accepted.clear();dealer=d?.ju;firstDiscard=true;dealerDrawKnown=false;pending=null;
   const hands=Array.from({length:4},(_,s)=>array(d?.['tiles'+s]));
   if(!Number.isInteger(dealer)||dealer<0||dealer>3||hands.some((h,s)=>h.length!==(s===dealer?14:13))||!Array.isArray(d.scores)||d.scores.length!==4)continue;
   const provisional=hands[dealer].pop()!;
   doras=array(d?.doras?.length?d.doras:[d?.dora]);
   events=[{type:'start_game'},{type:'start_kyoku',bakaze:wind[d.chang],kyoku:dealer+1,honba:d.ben,kyotaku:d.liqibang,oya:dealer,scores:d.scores.slice(),dora_marker:doras[0],tehais:hands},{type:'tsumo',actor:dealer,pai:provisional}];
   for(const t of doras.slice(1))events.splice(events.length-1,0,{type:'dora',dora_marker:t});
   continue;
  }
  if(!events.length)continue;
  if(name==='RecordDealTile'){
   reachAccepted(d?.liqi);pushDoras(d);events.push({type:'tsumo',actor:d?.seat,pai:tile(d?.tile)});continue;
  }
  if(name==='RecordDiscardTile'){
   const actual=tile(d?.tile);
   if(firstDiscard&&d?.seat===dealer){
    // Only a real initial tsumogiri proves the dealer's initial self-draw.
    // For everyone else, both versions are masked, so no guess is exposed.
    const tsumo=events.find(e=>e.type==='tsumo')!,start=events.find(e=>e.type==='start_kyoku')!;
    if(d.moqie===true&&actual){
     const hands=start.tehais as string[][],all=[...hands[dealer],tsumo.pai as string];
     const at=all.indexOf(actual);if(at>=0){all.splice(at,1);hands[dealer]=all;tsumo.pai=actual;dealerDrawKnown=true;}
    }
    firstDiscard=false;
   }
   const f=byIndex.get(index),last=events.at(-1);
   if(f&&(f.seat!==dealer||dealerDrawKnown)&&f.turn<=30&&(f.turn>=3||f.interrupted||f.riichi.some(Boolean))&&last&&['tsumo','chi','pon'].includes(last.type)){
    const stage=[f.round,f.seat,Number(f.melds.some(m=>m.length)),Number(f.riichi.some(Boolean)),f.melds.flat().filter(m=>m.kind==='ankan'||m.kind==='kan').length].join(':');
    if((stageCounts.get(stage)??0)<2){
     stageCounts.set(stage,(stageCounts.get(stage)??0)+1);
     candidates.push({seat:f.seat,round:f.round,turn:f.turn,actual:f.actual,legal:[...new Set(f.hand)],position:'discard',events:copyForSeat(events,f.seat)});
    }
   }
   if(d?.is_liqi||d?.is_wliqi){events.push({type:'reach',actor:d.seat});}
   events.push({type:'dahai',actor:d?.seat,pai:actual,tsumogiri:Boolean(d?.moqie)});pushDoras(d);pending={seat:d?.seat,tile:actual!};continue;
  }
  if(name==='RecordLiqiSuccess'){reachAccepted(d);continue;}
  if(name==='RecordChiPengGang'){
   reachAccepted(d?.liqi);const ts=array(d?.tiles),froms=d?.froms;
   if(!pending||!Array.isArray(froms)||!Number.isInteger(d?.seat)||d.seat<0||d.seat>3){events=[];continue;}
   const consumed=ts.filter((_,i)=>froms[i]===d.seat),kind=['chi','pon','daiminkan'][d.type];
   events.push({type:kind,actor:d.seat,target:pending.seat,pai:pending.tile,consumed});pending=null;continue;
  }
  if(name==='RecordAnGangAddGang'){
   const transition=transitions.get(index);
   if(!transition){events=[];continue;}
   events.push({...transition});pushDoras(d);pending=null;continue;
  }
  if(['RecordHule','RecordNoTile','RecordLiuJu'].includes(name)){events=[];continue;}
  events=[];
 }
 // Round-robin across seats keeps a long first player's history from taking
 // the complete inference budget. Every case still contains its own prefix.
 const queues=Array.from({length:4},(_,s)=>candidates.filter(c=>c.seat===s)),out:C3Case[]=[];
 while(out.length<cap&&queues.some(q=>q.length))for(const q of queues){if(q.length&&out.length<cap)out.push(q.shift()!);}
 return out;
}
