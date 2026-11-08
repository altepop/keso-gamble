// Artificial three-player prefix: one valid riichi and a far hand which
// considers a genbutsu. No real account IDs, names or record identifiers.
import {summarizePaipu} from '../../src/mahjong-summary.ts';
import type {PaipuAction} from '../../src/mahjong-summary.ts';
export function threeDefenseScenario(){
 const pool:string[]=[];
 for(const suit of ['m','p','s'])for(let n=1;n<=9;n++)if(suit!=='m'||n===1||n===9)for(let c=0;c<4;c++)pool.push(n+suit);
 for(let n=1;n<=7;n++)for(let c=0;c<4;c++)pool.push(n+'z');
 const take=(t:string)=>{const at=pool.indexOf(t);if(at<0)throw Error('synthetic_tile_exhausted');pool.splice(at,1);return t;};
 const zero=['1m','9m','1p','2p','3p','4p','6p','8p','2s','3s','4s','1z','5z','7z'].map(take);
 const one=['1p','2p','3p','4p','5p','6p','7s','8s','9s','1z','1z','1z','5z'].map(take);
 const reachTile=take('9m'),sixthDraw=take('6z'),indicator=take('7z');
 const two=pool.splice(0,13);
 const actions:PaipuAction[]=[{name:'RecordNewRound',data:{chang:0,ju:0,ben:0,liqibang:0,scores:[35000,35000,35000],doras:[indicator],tiles0:zero,tiles1:one,tiles2:two}},{name:'RecordDiscardTile',data:{seat:0,tile:'7z',moqie:true}},
  {name:'RecordDealTile',data:{seat:1,tile:reachTile}},{name:'RecordDiscardTile',data:{seat:1,tile:reachTile,moqie:true,is_liqi:true}}];
 const draw=(seat:number,tile:string,extra={})=>actions.push({name:'RecordDealTile',data:{seat,tile,...extra}});
 const discard=(seat:number,tile:string,moqie=true)=>actions.push({name:'RecordDiscardTile',data:{seat,tile,moqie}});
 for(let turn=2;turn<=8;turn++){
  const t2=pool.pop()!;draw(2,t2,turn===2?{liqi:{seat:1,score:34000,liqibang:1}}:{});discard(2,t2);
  const t0=turn===6?sixthDraw:pool.pop()!;draw(0,t0);discard(0,turn===6?'2p':t0,turn!==6);
  if(turn<8){const t1=pool.pop()!;draw(1,t1);discard(1,t1);}
 }
 const head={uuid:'synthetic-three-defense',start_time:0,end_time:1,config:{mode:{mode:12}},accounts:Array.from({length:3},(_,seat)=>({account_id:seat+1,seat,nickname:'test'+seat})),result:{players:Array.from({length:3},(_,seat)=>({seat,part_point_1:35000}))}};
 return {head,actions,summary:summarizePaipu(head,actions)};
}

/** Artificial closed tenpai: changing 2s to 5s keeps seven unseen waits,
 * retaining 2s dora and pinfu. No real person, game or wall information. */
export function threeValueScenario(){
 const pool:string[]=[];
 for(const s of ['m','p','s'])for(let n=1;n<=9;n++)if(s!=='m'||n===1||n===9)for(let c=0;c<4;c++)pool.push((n===5&&c===0&&s!=='m'?'0':n)+s);
 for(let n=1;n<=7;n++)for(let c=0;c<4;c++)pool.push(n+'z');
 const take=(t:string)=>{const i=pool.indexOf(t);if(i<0)throw Error('synthetic_tile_exhausted');return pool.splice(i,1)[0];};
 const own=['1p','2p','3p','4p','5p','6p','7p','8p','9p','2s','3s','5s','5s'].map(take);
 const valueDraw=take('5s'),firstDraw=take('7z'),indicator=take('1s');
 const zero=pool.splice(0,14),two=pool.splice(0,13);
 const actions:PaipuAction[]=[{name:'RecordNewRound',data:{chang:0,ju:0,ben:0,liqibang:0,scores:[35000,35000,35000],doras:[indicator],tiles0:zero,tiles1:own,tiles2:two}},
  {name:'RecordDiscardTile',data:{seat:0,tile:zero.at(-1),moqie:true}},
  {name:'RecordDealTile',data:{seat:1,tile:firstDraw}},{name:'RecordDiscardTile',data:{seat:1,tile:firstDraw,moqie:true}}];
 for(const seat of [2,0]){const tile=pool.pop()!;actions.push({name:'RecordDealTile',data:{seat,tile}},{name:'RecordDiscardTile',data:{seat,tile,moqie:true}});}
 actions.push({name:'RecordDealTile',data:{seat:1,tile:valueDraw}},{name:'RecordDiscardTile',data:{seat:1,tile:'2s',moqie:false}});
 const head={uuid:'synthetic-three-value',start_time:0,end_time:1,config:{mode:{mode:12}},accounts:Array.from({length:3},(_,seat)=>({account_id:seat+1,seat,nickname:'test'+seat})),result:{players:Array.from({length:3},(_,seat)=>({seat,part_point_1:35000}))}};
 return {head,actions,summary:summarizePaipu(head,actions)};
}
