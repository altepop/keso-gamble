// Artificial legal standard four-player events, never real account/game data.
import type {PaipuAction,PaipuSummary} from '../../src/mahjong-summary.ts';
import {summarizePaipu} from '../../src/mahjong-summary.ts';
export const FOUR_SCENARIOS=['chi','pon','daiminkan','ankan','kakan','reach'] as const;
export function fourScenario(kind:typeof FOUR_SCENARIOS[number]){
 const pool:string[]=[];
 for(const suit of ['m','p','s'])for(let n=1;n<=9;n++)for(let copy=0;copy<4;copy++)pool.push(n+suit);
 for(const suit of ['m','p','s'])pool[pool.indexOf('5'+suit)]='0'+suit;
 for(let n=1;n<=7;n++)for(let copy=0;copy<4;copy++)pool.push(n+'z');
 const take=(tile:string)=>{const i=pool.indexOf(tile);if(i<0)throw Error('synthetic_tile_exhausted');pool.splice(i,1);return tile;};
 const reserve=kind==='chi'?['2p','3p']:kind==='pon'?['5p','0p']:kind==='daiminkan'?['5p','5p','0p']:kind==='ankan'?['5p','5p','0p']:kind==='kakan'?['5p','5p','0p']:['1p','2p','3p','4p','5p','6p','7s','8s','9s','1z','1z','1z','5z'];
 const one=reserve.map(take);
 if(kind!=='reach')one.push(take('7z'));
 const called=kind==='chi'?'1p':kind==='pon'||kind==='daiminkan'||kind==='kakan'?'5p':null;
 const initialDiscard=take(called??'9m');
 while(one.length<13)one.push(pool.pop()!);
 const dealer=pool.splice(0,13);dealer.push(initialDiscard);
 const hands=[dealer,one,pool.splice(0,13),pool.splice(0,13)];
 const indicator=pool.pop()!,secondIndicator=pool.pop()!;
 const actions:PaipuAction[]=[{name:'RecordNewRound',data:{chang:0,ju:0,ben:0,liqibang:0,scores:[25000,25000,25000,25000],doras:[indicator],...Object.fromEntries(hands.map((h,s)=>['tiles'+s,h]))}},{name:'RecordDiscardTile',data:{seat:0,tile:initialDiscard,moqie:true}}];
 const draw=(seat:number,tile=pool.pop()!,liqi?:object)=>actions.push({name:'RecordDealTile',data:{seat,tile,...liqi?{liqi}:{}}});
 const discard=(seat:number,tile:string,moqie=true,extra={})=>actions.push({name:'RecordDiscardTile',data:{seat,tile,moqie,...extra}});
 const tsumoDiscard=(seat:number,liqi?:object)=>{const t=pool.pop()!;draw(seat,t,liqi);discard(seat,t);};
 if(kind==='reach'){
  // Preserve the 13-tile waiting hand; the declaration discards a real draw.
  const t=pool.pop()!;draw(1,t);discard(1,t,true,{is_liqi:true});
  tsumoDiscard(2,{seat:1,score:24000,liqibang:1});tsumoDiscard(3);tsumoDiscard(0);
 }else if(kind==='ankan'){
  draw(1,take('5p'));
  actions.push({name:'RecordAnGangAddGang',data:{seat:1,type:3,tiles:'5p',doras:[indicator,secondIndicator]}});
  tsumoDiscard(1);tsumoDiscard(2);tsumoDiscard(3);tsumoDiscard(0);
 }else{
  const consumed=kind==='chi'?['2p','3p']:kind==='daiminkan'?['5p','5p','0p']:['5p','0p'];
  actions.push({name:'RecordChiPengGang',data:{seat:1,type:kind==='chi'?0:kind==='daiminkan'?2:1,tiles:[called,...consumed],froms:[0,...consumed.map(()=>1)]}});
  if(kind==='daiminkan'){tsumoDiscard(1);actions.at(-2)!.data.doras=[indicator,secondIndicator];}else discard(1,'7z',false);
  tsumoDiscard(2);tsumoDiscard(3);tsumoDiscard(0);
  if(kind==='kakan'){
   draw(1);actions.push({name:'RecordAnGangAddGang',data:{seat:1,type:2,tiles:'5p',doras:[indicator,secondIndicator]}});tsumoDiscard(1);tsumoDiscard(2);tsumoDiscard(3);tsumoDiscard(0);
  }
 }
 for(let cycle=0;cycle<3;cycle++)for(const seat of [1,2,3,0])tsumoDiscard(seat);
 const head={uuid:'synthetic-four-'+kind,start_time:0,end_time:100,config:{mode:{mode:2}},accounts:Array.from({length:4},(_,seat)=>({account_id:seat+1,seat,nickname:'test'+seat})),result:{players:Array.from({length:4},(_,seat)=>({seat,part_point_1:25000}))}};
 const summary:PaipuSummary=summarizePaipu(head,[...actions,{name:'RecordNoTile',data:{players:[],scores:[]}}]);
 return {actions,summary};
}
