// Pure replay on the trusted fetcher. Returned decisions contain one player's
// hand and public facts only. No opponent hand, wall, ura or future action.
import type {PaipuAction,PaipuSummary} from './mahjong-summary.ts';
import {toC3Tile} from './mahjong-c3-extract.ts';
export interface ReviewMeld {kind:'chi'|'pon'|'kan'|'ankan';tiles:string[];from:number|null}
export interface ReviewDecision {
 seat:number;round:number;turn:number;actual:string;draw:string|null;hand:string[];
 players:3|4;dealer:number;wind:number;honba:number;sticks:number;scores:number[];
 rivers:string[][];melds:ReviewMeld[][];north:number[];riichi:boolean[];doubleRiichi:boolean[];
 doras:string[];visible:number[];interrupted:boolean;
}
export const tileKind=(tile:string):number=>{
 const h=['E','S','W','N','P','F','C'].indexOf(tile);
 if(h>=0)return h+27;
 if(!/^(?:[1-9][mps]|5[mps]r)$/.test(tile))return -1;
 const m=/^([1-9])([mps])r?$/.exec(tile);
 return m?Number(m[1])-1+'mps'.indexOf(m[2])*9:-1;
};
export const sanmaKind=(kind:number)=>kind>=0&&kind<34&&!(kind>=1&&kind<=7);
export const kindTile=(kind:number)=>kind>=27?['E','S','W','N','P','F','C'][kind-27]:String(kind%9+1)+'mps'[Math.floor(kind/9)];
const integer=(v:unknown,a:number,b:number)=>Number.isSafeInteger(v)&&Number(v)>=a&&Number(v)<=b;
/** Decode known standard Mahjong Soul rules only; variant rounds fail closed. */
export function reviewDecisions(actions:PaipuAction[],summary:PaipuSummary,cap=256):ReviewDecision[]{
 if(![3,4].includes(summary.players)||!new RegExp('^'+summary.players+'-(tonpu|hanchan)$').test(summary.game)||!Array.isArray(actions)||actions.length>10000||!integer(cap,1,512))return [];
 const n=summary.players as 3|4,seat=(v:unknown):v is number=>integer(v,0,n-1);
 const parse=(v:unknown)=>{const t=toC3Tile(v);return t&&(n===4||sanmaKind(tileKind(t)))?t:null;};
 const tiles=(v:unknown):string[]|null=>Array.isArray(v)&&v.every(t=>parse(t)!==null)?v.map(t=>parse(t)!):null;
 let round=-1,blocked=true,dealer=0,wind=0,honba=0,sticks=0,interrupted=false;
 let hands:string[][]=[],rivers:string[][]=[],melds:ReviewMeld[][]=[],north:number[]=[],riichi:boolean[]=[],doubleRiichi:boolean[]=[],doras:string[]=[],scores:number[]=[],visible:number[]=[],seen:number[]=[],redSeen=new Set<string>();
 let pending:{seat:number;draw:string|null;afterCall?:boolean}|null=null,last:{seat:number;tile:string}|null=null,nextSeat=0,replacement:number|null=null;
 const out:ReviewDecision[]=[];
 const observe=(t:string)=>{const k=tileKind(t);if(++seen[k]>4)throw Error('copies');if(t.endsWith('r')){if(redSeen.has(t))throw Error('red');redSeen.add(t);}};
 const reveal=(t:string)=>{if(++visible[tileKind(t)]>4)throw Error('visible');};
 const remove=(s:number,t:string)=>{const i=hands[s].indexOf(t);if(i<0)throw Error('missing tile');hands[s].splice(i,1);};
 const updateDoras=(d:any)=>{
  if(!Array.isArray(d?.doras)||!d.doras.length)return;
  const ts=tiles(d.doras);if(!ts||ts.length<doras.length||ts.length>5||!doras.every((t,i)=>ts[i]===t))throw Error('dora history');
  for(const t of ts.slice(doras.length)){observe(t);reveal(t);}doras=ts;
 };
 const acceptReach=(d:any)=>{
  if(!d)return;
  if(d.failed===true)throw Error('failed reach');
  if(!seat(d.seat)||!riichi[d.seat]||!integer(d.score,-100000,1000000)||!integer(d.liqibang,0,100))throw Error('reach data');
  scores[d.seat]=d.score;sticks=d.liqibang;
 };
 for(const a of actions){
  const d=a?.data,name=a?.name;
  if(name==='RecordNewRound'){
   round++;blocked=true;pending=null;last=null;replacement=null;
   try{
    if(!d||!integer(d.chang,0,3)||!seat(d.ju)||!integer(d.ben,0,100)||!integer(d.liqibang,0,100)||!Array.isArray(d.scores)||d.scores.length!==n||!d.scores.every((s:unknown)=>integer(s,-100000,1000000)))continue;
    if((Array.isArray(d.opens)&&d.opens.length)||d.muyu||d.yongchang||d.field_spell)continue;
    if(summary.rounds[round]?.label!==['東','南','西','北'][d.chang]+(d.ju+1)+'局'+(d.ben?' '+d.ben+'本場':''))continue;
    dealer=d.ju;wind=d.chang;honba=d.ben;sticks=d.liqibang;scores=d.scores.slice();
    hands=Array.from({length:n},(_,s)=>tiles(d['tiles'+s])??[]);
    if(hands.some((h,s)=>h.length!==(s===dealer?14:13)))continue;
    seen=Array(34).fill(0);visible=Array(34).fill(0);redSeen=new Set();hands.flat().forEach(observe);
    doras=[];updateDoras({doras:d.doras?.length?d.doras:[d.dora]});
    if(!doras.length)continue;
    rivers=Array.from({length:n},()=>[]);melds=Array.from({length:n},()=>[]);north=Array(n).fill(0);riichi=Array(n).fill(false);doubleRiichi=Array(n).fill(false);
    pending={seat:dealer,draw:null};nextSeat=dealer;interrupted=false;blocked=false;
   }catch{blocked=true;}
   continue;
  }
  if(blocked)continue;
  try{
   if(name==='RecordHule'||name==='RecordNoTile'||name==='RecordLiuJu'){blocked=true;pending=null;continue;}
   if(name==='RecordLiqiSuccess'){acceptReach(d);continue;}
   if(name==='RecordDealTile'){
    if(!seat(d?.seat)||pending||d.seat!==(replacement??nextSeat)||hands[d.seat].length!==13-3*melds[d.seat].length)throw Error('draw order');
    acceptReach(d.liqi);updateDoras(d);const t=parse(d.tile);if(!t)throw Error('draw');observe(t);hands[d.seat].push(t);pending={seat:d.seat,draw:t};replacement=null;last=null;continue;
   }
   if(name==='RecordDiscardTile'){
    if(!seat(d?.seat)||!pending||pending.seat!==d.seat||hands[d.seat].length!==14-3*melds[d.seat].length)throw Error('discard order');
    const t=parse(d.tile);if(!t||!hands[d.seat].includes(t)||(d.moqie===true&&pending.draw!==null&&pending.draw!==t))throw Error('discard');
    // A discard ordinal stays unambiguous even after calls and replacement draws.
    if(pending.draw!==null&&out.length<cap&&!riichi[d.seat]&&!d.is_liqi&&!d.is_wliqi){
     out.push({seat:d.seat,round,turn:rivers[d.seat].length+1,actual:t,draw:pending.draw,hand:hands[d.seat].slice(),players:n,dealer,wind,honba,sticks,scores:scores.slice(),rivers:rivers.map(r=>r.slice()),melds:structuredClone(melds),north:north.slice(),riichi:riichi.slice(),doubleRiichi:doubleRiichi.slice(),doras:doras.slice(),visible:visible.slice(),interrupted});
    }
    if(riichi[d.seat]&&pending.draw!==t)throw Error('locked reach hand');
    remove(d.seat,t);reveal(t);rivers[d.seat].push(t);updateDoras(d);
    if(d.is_liqi||d.is_wliqi){riichi[d.seat]=true;doubleRiichi[d.seat]=Boolean(d.is_wliqi);}
    last={seat:d.seat,tile:t};nextSeat=(d.seat+1)%n;pending=null;continue;
   }
   if(name==='RecordBaBei'){
    if(n!==3||!seat(d?.seat)||pending?.seat!==d.seat||pending?.afterCall||!hands[d.seat].includes('N')||(riichi[d.seat]&&pending?.draw!=='N'))throw Error('north');
    updateDoras(d);remove(d.seat,'N');reveal('N');north[d.seat]++;replacement=d.seat;pending=null;last=null;interrupted=true;continue;
   }
   if(name==='RecordChiPengGang'){
    if(!seat(d?.seat)||pending||!last||last.seat===d.seat||riichi[d.seat]||!Array.isArray(d.froms))throw Error('call');
    const ts=tiles(d.tiles);if(!ts||!integer(d.type,0,2)||ts.length!==(d.type===2?4:3)||d.froms.length!==ts.length)throw Error('meld');
    const called=d.froms.flatMap((from:unknown,i:number)=>from!==d.seat?[i]:[]);
    if(called.length!==1||d.froms[called[0]]!==last.seat||ts[called[0]]!==last.tile)throw Error('called tile');
    const ks=ts.map(tileKind).sort((a,b)=>a-b),chi=d.type===0;
    if(chi?(n===3||d.seat!==(last.seat+1)%n||ks[0]>=27||Math.floor(ks[0]/9)!==Math.floor(ks[2]/9)||ks[1]!==ks[0]+1||ks[2]!==ks[0]+2):ks.some(k=>k!==ks[0]))throw Error('meld shape');
    acceptReach(d.liqi);
    ts.forEach((t,i)=>{if(i!==called[0]){remove(d.seat,t);reveal(t);}});
    melds[d.seat].push({kind:chi?'chi':d.type===1?'pon':'kan',tiles:ts,from:last.seat});
    if(d.type===2){replacement=d.seat;pending=null;}else pending={seat:d.seat,draw:null,afterCall:true};
    last=null;interrupted=true;continue;
   }
   if(name==='RecordAnGangAddGang'){
    if(!seat(d?.seat)||pending?.seat!==d.seat||pending?.afterCall||riichi[d.seat])throw Error('kan');
    const t=parse(d.tiles);if(!t||![2,3].includes(d.type))throw Error('kan type');const k=tileKind(t);
    const owned=hands[d.seat].filter(x=>tileKind(x)===k);
    if(d.type===3){
     if(owned.length!==4)throw Error('ankan');owned.forEach(t=>{remove(d.seat,t);reveal(t);});melds[d.seat].push({kind:'ankan',tiles:owned,from:null});
    }else{
     const meld=melds[d.seat].find(m=>m.kind==='pon'&&tileKind(m.tiles[0])===k);
     if(!meld||owned.length!==1)throw Error('kakan');remove(d.seat,owned[0]);reveal(owned[0]);meld.kind='kan';meld.tiles.push(owned[0]);
    }
    updateDoras(d);pending=null;replacement=d.seat;last=null;interrupted=true;continue;
   }
   // No allowlist for unknown game-changing records.
   blocked=true;
  }catch{blocked=true;pending=null;}
 }
 return out;
}
