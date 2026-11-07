// Exact, pre-discard public-state cases from 4-player Mahjong Soul records.
// Strictly excludes any incomplete/ambiguous rounds rather than guessing.
import type {PaipuAction,PaipuSummary} from './mahjong-summary.ts';
import {toC3Tile} from './mahjong-c3-extract.ts';

type Event={type:string;[key:string]:unknown};
export interface C3Case {
 seat:number;round:number;turn:number;actual:string;events:Event[];
}
const WINDS=['E','S'];
const tile=(x:unknown)=>toC3Tile(x);
const seatOk=(n:unknown)=>Number.isInteger(n)&&Number(n)>=0&&Number(n)<4;
const arrayOf=(input:unknown)=>Array.isArray(input)?input.map(tile):[];
function startCase(d:any):{events:Event[];dealer:number}|null{
 if(!d||!Number.isInteger(d.chang)||d.chang<0||d.chang>1||
  !Number.isInteger(d.ju)||d.ju<0||d.ju>3||
  !Number.isSafeInteger(d.ben)||d.ben<0||
  !Number.isSafeInteger(d.liqibang)||d.liqibang<0||
  !Array.isArray(d.scores)||d.scores.length!==4||d.scores.some((s:unknown)=>!Number.isInteger(s))||
  !Array.isArray(d.doras)||!tile(d.doras[0]))return null;
 const hands=[0,1,2,3].map(i=>arrayOf(d['tiles'+i]));
 if(hands.some((h,i)=>h.length!==(i===d.ju?14:13)||h.some(t=>!t)))return null;
 // The dealer's 14th starting tile is an initial self-draw. Never evaluate
 // that first discard because older records differ in initial tile ordering.
 const firstDraw=hands[d.ju].pop()!;
 const events:Event[]=[
  {type:'start_game'},
  {type:'start_kyoku',bakaze:WINDS[d.chang],kyoku:d.ju+1,honba:d.ben,kyotaku:d.liqibang,
   oya:d.ju,scores:d.scores.slice(),dora_marker:tile(d.doras[0]),tehais:hands},
  {type:'tsumo',actor:d.ju,pai:firstDraw},
 ];
 return {events,dealer:d.ju};
}
function copyForSeat(events:Event[],seat:number):Event[]{
 return events.map(e=>{
  if(e.type==='start_kyoku')return {...e,tehais:(e.tehais as string[][]).map((h,i)=>i===seat?h.slice():Array(13).fill('?'))};
  if(e.type==='tsumo'&&e.actor!==seat)return {...e,pai:'?'};
  return {...e};
 }).map((e,i,arr)=>({...e,can_act:i===arr.length-1}));
}
/**
 * 2+巡目の発話候補。公開履歴だけをAIに渡し、相手の配牌・ツモを伏せる。
 * Reach/call/kan/unknown actions after the decision are not approximated:
 * from that point, skip the rest of the round until full replay is supported.
 */
export function buildC3Cases(actions:PaipuAction[],summary:PaipuSummary,cap=48):C3Case[]{
 if(summary.players!==4||!summary.game.startsWith('4-')||!Array.isArray(actions)||
  actions.length>10000||!Number.isInteger(cap)||cap<1||cap>128)return [];
 let round=-1,events:Event[]=[],current:ReturnType<typeof startCase>=null,blocked=true;
 let pendingDraw:{seat:number;tile:string}|null=null;
 const turns=[0,0,0,0],out:C3Case[]=[];
 for(let i=0;i<actions.length;i++){
  const {name,data:d}=actions[i]??{};
  if(name==='RecordNewRound'){
   round++;turns.fill(0);current=startCase(d);blocked=!current||round>=summary.rounds.length;
   events=current?.events??[];pendingDraw=current?{seat:current.dealer,tile:(events.at(-1) as Event).pai as string}:null;
   if(!blocked&&summary.rounds[round].label!==['東','南'][d.chang]+(d.ju+1)+'局'+(d.ben?' '+d.ben+'本場':''))blocked=true;
   continue;
  }
  if(blocked||!name)continue;
  if(name==='RecordDealTile'){
   if(!seatOk(d?.seat)||!tile(d?.tile)||pendingDraw){blocked=true;continue;}
   const t=tile(d.tile)!;
   events.push({type:'tsumo',actor:d.seat,pai:t});
   pendingDraw={seat:d.seat,tile:t};
   continue;
  }
  if(name==='RecordDiscardTile'){
   if(!seatOk(d?.seat)||!tile(d?.tile)||!pendingDraw||pendingDraw.seat!==d.seat){blocked=true;continue;}
   const actual=tile(d.tile)!;
   turns[d.seat]++;
   if(d.moqie===true&&actual!==pendingDraw.tile){blocked=true;continue;}
   // Stop at declaration. The real paipu may omit separate reach-accepted events.
   const reach=Boolean(d.is_liqi||d.is_wliqi);
   if(!reach&&turns[d.seat]>=2&&turns[d.seat]<=18&&out.length<cap){
    // One or two good sample turns per seat per round, avoiding long polling.
    const candidatesForSeat=out.filter(x=>x.round===round&&x.seat===d.seat).length;
    if(candidatesForSeat<2&&turns[d.seat]>=3)out.push({seat:d.seat,round,turn:turns[d.seat],actual,events:copyForSeat(events,d.seat)});
   }
   events.push({type:'dahai',actor:d.seat,pai:actual,tsumogiri:Boolean(d.moqie)});
   pendingDraw=null;
   if(reach)blocked=true;
   continue;
  }
  if(name==='RecordHule'||name==='RecordNoTile'||name==='RecordLiuJu'||
   name==='RecordChiPengGang'||name==='RecordAnGangAddGang'||name==='RecordBaBei'||
   name==='RecordLiqiSuccess'){blocked=true;pendingDraw=null;continue;}
  // Explicitly known non-decision records without strategic effect are omitted.
  // Unknown record types may affect legality. Never treat them as harmless.
  blocked=true;
 }
 return out;
}
