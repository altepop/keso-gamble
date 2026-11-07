// Exact, pre-discard public-state cases from 4-player Mahjong Soul records.
// Strictly excludes any incomplete/ambiguous rounds rather than guessing.
import type {PaipuAction,PaipuSummary} from './mahjong-summary.ts';
import {toC3Tile} from './mahjong-c3-extract.ts';

type Event={type:string;[key:string]:unknown};
export interface C3Case {
 seat:number;round:number;turn:number;actual:string;legal:string[];events:Event[];
}
const WINDS=['E','S'];
const tile=(x:unknown)=>toC3Tile(x);
const seatOk=(n:unknown)=>Number.isInteger(n)&&Number(n)>=0&&Number(n)<4;
const arrayOf=(input:unknown):string[]|null=>{
 if(!Array.isArray(input))return null;
 const xs=input.map(tile);
 return xs.every((x):x is string=>typeof x==='string')?xs:null;
};
function startCase(d:any):{events:Event[];dealer:number;hands:string[][]}|null{
 if(!d||!Number.isInteger(d.chang)||d.chang<0||d.chang>1||
  !Number.isInteger(d.ju)||d.ju<0||d.ju>3||
  !Number.isSafeInteger(d.ben)||d.ben<0||
  !Number.isSafeInteger(d.liqibang)||d.liqibang<0||
  !Array.isArray(d.scores)||d.scores.length!==4||d.scores.some((s:unknown)=>!Number.isInteger(s))||
  !tile(Array.isArray(d.doras)?d.doras[0]:d.dora))return null;
 const hands:string[][]=[];
 for(let i=0;i<4;i++){
  const h=arrayOf(d['tiles'+i]);
  if(!h||h.length!==(i===d.ju?14:13))return null;
  hands.push(h);
 }
 // The dealer's 14th starting tile is an initial self-draw. Never evaluate
 // that first discard because older records differ in initial tile ordering.
 // Reject impossible dealt copies and duplicate red fives.
 const observed=hands.flat().concat(tile(Array.isArray(d.doras)?d.doras[0]:d.dora)!);
 const counts=new Map<string,number>(),reds=new Set<string>();
 for(const t of observed){
  const kind=t.endsWith('r')?t.slice(0,-1):t;
  counts.set(kind,(counts.get(kind)??0)+1);
  if((counts.get(kind)??0)>4)return null;
  if(t.endsWith('r')){if(reds.has(kind))return null;reds.add(kind);}
 }
 const firstDraw=hands[d.ju].pop()!;
 const events:Event[]=[
  {type:'start_game'},
  {type:'start_kyoku',bakaze:WINDS[d.chang],kyoku:d.ju+1,honba:d.ben,kyotaku:d.liqibang,
   oya:d.ju,scores:d.scores.slice(),dora_marker:tile(Array.isArray(d.doras)?d.doras[0]:d.dora),tehais:hands},
  {type:'tsumo',actor:d.ju,pai:firstDraw},
 ];
 return {events,dealer:d.ju,hands:hands.map((h,i)=>i===d.ju?[...h,firstDraw]:h.slice())};
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
 let concealed:string[][]=[];
 let initialDealerDrawUnknown=false;
 let pendingDraw:{seat:number;tile:string}|null=null;
 const turns=[0,0,0,0],out:C3Case[]=[];
 for(let i=0;i<actions.length;i++){
  const a=actions[i];
  const name=a?.name,d=a?.data;
  if(name==='RecordNewRound'){
   round++;turns.fill(0);current=startCase(d);blocked=!current||round>=summary.rounds.length;
   events=current?.events??[];concealed=current?.hands.map(h=>h.slice())??[];
   initialDealerDrawUnknown=false;
   pendingDraw=current?{seat:current.dealer,tile:(events.at(-1) as Event).pai as string}:null;
   if(!blocked&&summary.rounds[round].label!==['東','南'][d.chang]+(d.ju+1)+'局'+(d.ben?' '+d.ben+'本場':''))blocked=true;
   continue;
  }
  if(blocked||!name)continue;
  if(name==='RecordDealTile'){
   if(!seatOk(d?.seat)||!tile(d?.tile)||pendingDraw||concealed[d.seat]?.length!==13){blocked=true;continue;}
   const t=tile(d.tile)!;
   concealed[d.seat].push(t);
   events.push({type:'tsumo',actor:d.seat,pai:t});
   pendingDraw={seat:d.seat,tile:t};
   continue;
  }
  if(name==='RecordDiscardTile'){
   if(!seatOk(d?.seat)||!tile(d?.tile)||!pendingDraw||pendingDraw.seat!==d.seat||concealed[d.seat]?.length!==14){blocked=true;continue;}
   const actual=tile(d.tile)!;
   const idx=concealed[d.seat].indexOf(actual);
   if(idx<0){blocked=true;continue;}
   // The 14 dealer starting tiles do not reliably identify the real first
   // draw. If the first discard was tsumogiri, that tile IS the real draw.
   // Otherwise only the concealed hand of other seats is independently
   // reconstructable. Never review the dealer's later choices in this round.
   if(turns[d.seat]===0&&current?.dealer===d.seat){
    const chosen=d.moqie===true?actual:concealed[d.seat].find(t=>t!==actual);
    if(!chosen||events[1]?.type!=='start_kyoku'||events[2]?.type!=='tsumo'){blocked=true;continue;}
    const initial=concealed[d.seat].slice();
    initial.splice(initial.indexOf(chosen),1);
    const ts=events[1].tehais as string[][];
    ts[d.seat]=initial;
    events[2].pai=chosen;
    pendingDraw.tile=chosen;
    initialDealerDrawUnknown=d.moqie!==true;
   }
   concealed[d.seat].splice(idx,1);
   turns[d.seat]++;
   if(d.moqie===true&&actual!==pendingDraw.tile){blocked=true;continue;}
   // Stop at declaration. The real paipu may omit separate reach-accepted events.
   const reach=Boolean(d.is_liqi||d.is_wliqi);
   if(!reach&&!(initialDealerDrawUnknown&&d.seat===current?.dealer)&&turns[d.seat]>=2&&turns[d.seat]<=18&&out.length<cap){
    // One or two good sample turns per seat per round, avoiding long polling.
    const candidatesForSeat=out.filter(x=>x.round===round&&x.seat===d.seat).length;
    if(candidatesForSeat<2&&turns[d.seat]>=3)out.push({seat:d.seat,round,turn:turns[d.seat],actual,legal:[...new Set([...concealed[d.seat],actual])],events:copyForSeat(events,d.seat)});
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
