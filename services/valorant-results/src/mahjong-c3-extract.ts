// Inspect decoded Mahjong Soul actions on the trusted GitHub Actions side.
// Only uninterrupted four-player turns get a "N巡目" label: after a call/kan
// a player's Nth discard is not necessarily the table's Nth turn.
import type {PaipuAction} from './mahjong-summary.ts';

export interface C3DiscardCandidate {
 round:number;
 seat:number;
 turn:number;
 actual:string;
 actionIndex:number;
}
const VALID=/^(?:[1-9][mps]|5[mps]r|[ESWNPFC])$/;
const HONORS=['E','S','W','N','P','F','C'];
/** Mahjong Soul 0p means red five; 1z...7z are honors. */
export function toC3Tile(value:unknown):string|null{
 if(typeof value!=='string')return null;
 const t=/^0([mps])$/.exec(value)?.[1];
 if(t)return '5'+t+'r';
 const h=/^([1-7])z$/.exec(value)?.[1];
 if(h)return HONORS[Number(h)-1];
 return VALID.test(value)?value:null;
}
export function c3DiscardCandidates(actions:PaipuAction[]):C3DiscardCandidate[]{
 if(!Array.isArray(actions)||actions.length>10000)return [];
 let round=-1,interrupted=true;
 const turns=[0,0,0,0],out:C3DiscardCandidate[]=[];
 for(let i=0;i<actions.length;i++){
  const a=actions[i],d=a?.data;
  if(a?.name==='RecordNewRound'){
   round++;turns.fill(0);
   interrupted=!(Number.isSafeInteger(d?.ju)&&Number.isSafeInteger(d?.chang)&&d.chang>=0&&d.chang<=1&&d.ju>=0&&d.ju<=3);
   continue;
  }
  if(round<0||interrupted)continue;
  if(['RecordChiPengGang','RecordAnGangAddGang','RecordBaBei'].includes(a?.name)){
   interrupted=true;
   continue;
  }
  if(['RecordHule','RecordNoTile','RecordLiuJu'].includes(a?.name)){
   interrupted=true;
   continue;
  }
  if(a?.name!=='RecordDiscardTile')continue;
  const seat=d?.seat;
  if(!Number.isSafeInteger(seat)||seat<0||seat>=4){interrupted=true;continue;}
  turns[seat]++;
  // Reached hands, no-tile events and malformed tile data do not get commentary.
  const actual=toC3Tile(d.tile);
  if(d.is_liqi||d.is_wliqi||!actual||turns[seat]>30)continue;
  out.push({round,seat,turn:turns[seat],actual,actionIndex:i});
  if(out.length>=200)break;
 }
 return out;
}
