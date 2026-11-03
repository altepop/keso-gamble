import sealed from '../private-casino.encrypted.json' with {type:'json'};
import {decryptKpMapping} from './kp.ts';
import type {KpEnv} from './kp.ts';
// @ts-expect-error Shared pure game engine.
import {spin} from '../../../js/engine.js';
// @ts-expect-error Shared pure game engine.
import {playChinchiro,bjStart} from '../../../js/casino.js';
// @ts-expect-error Shared pure game engine.
import {playSlot,vpDeal,vpDraw,playBaccarat,minesStart,minesPick,minesCashout} from '../../../js/casino-more.js';
// @ts-expect-error Shared table of the hands the menu offers.
import {privateHand,chinchiroDice,slotDraws,pokerDraws,baccaratCards,minesPlan} from '../../../js/private-casino-rules.js';
interface Policy {enabled:boolean;guildId:string;ownerId:string}
const configs=new Map<string,Promise<Policy>>();
export async function privateCasinoAllowed(env:KpEnv,guild:string,user:string){
 const key=env.KP_BOOTSTRAP_PRIVATE_KEY;if(!key)return false;
 const envelope=env.KP_PRIVATE_CASINO_CONFIG??JSON.stringify(sealed),cache=key+'\0'+envelope;
 try{
  if(!configs.has(cache))configs.set(cache,decryptKpMapping(key,JSON.parse(envelope)).then(value=>{
   const p=value as unknown as Policy;
   if(!p||typeof p.enabled!=='boolean'||!/^\d{15,22}$/.test(p.guildId)||!/^\d{15,22}$/.test(p.ownerId))throw Error('Invalid private casino configuration');return p;
  }));
  const p=await configs.get(cache)!;return p.enabled&&p.guildId===guild&&p.ownerId===user;
 }catch{return false;}
}
/** Uses the ordinary stake limits, wallet rules and game records. No client-supplied payout or cash; the hand is only
 * chosen from the fixed table in js/private-casino-rules.js. */
export function privateCasinoRound(state:any,args:Record<string,unknown>){
 const amount=args.amount,game=String(args.game);
 if(game==='roulette'){
  const number=args.number;if(!Number.isInteger(number)||Number(number)<0||Number(number)>36)throw Error('数字は0〜36で指定してください。');
  return {action:'spin',args:{type:'number',amount,choice:number},result:spin(state,'number',amount,number,number)};
 }
 const hand=privateHand(game,args.hand);if(!hand)throw Error('ゲームを選んでください。');
 const next=(list:unknown[])=>()=>{if(!list.length)throw Error('役の並びが足りません。');return list.shift();};
 if(game==='chinchiro')return {action:'chinchiro',args:{amount},result:playChinchiro(state,amount,next(chinchiroDice(hand)))};
 if(game==='blackjack'){
  const cards=[{r:1,s:0},{r:13,s:1},{r:9,s:2},{r:8,s:3}];return {action:'bj-start',args:{amount},result:bjStart(state,amount,next(cards))};
 }
 // The 💎 jackpot is never offered: the shared pool only gets the ordinary contribution.
 if(game==='slot')return {action:'slot',args:{amount},result:playSlot(state,amount,next(slotDraws(hand)),{amount:state.jackpot.amount,version:state.jackpot.version})};
 if(game==='poker'){
  vpDeal(state,amount,pokerDraws(hand));
  return {action:'vp-draw',args:{amount},result:vpDraw(state,[true,true,true,true,true],()=>{throw Error('交換はしません。');})};
 }
 if(game==='baccarat')return {action:'baccarat',args:{amount,side:hand},result:playBaccarat(state,amount,hand,next(baccaratCards(hand)))};
 if(game==='mines'){
  const plan=minesPlan(hand);minesStart(state,amount,plan.mines);
  let result:any=null;
  for(let cell=0;cell<plan.opens&&!result?.done;cell++)result=minesPick(state,cell,(n:number)=>n-1);
  if(!result?.done)result=minesCashout(state,()=>0);
  return {action:'mines-cashout',args:{amount,mines:plan.mines},result};
 }
 throw Error('ゲームを選んでください。');
}
