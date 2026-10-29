import sealed from '../private-casino.encrypted.json' with {type:'json'};
import {decryptKpMapping} from './kp.ts';
import type {KpEnv} from './kp.ts';
// @ts-expect-error Shared pure game engine.
import {spin} from '../../../js/engine.js';
// @ts-expect-error Shared pure game engine.
import {playChinchiro,bjStart} from '../../../js/casino.js';
// @ts-expect-error Shared pure game engine.
import {playSlot} from '../../../js/casino-more.js';
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
/** Uses the ordinary stake limits, wallet rules and game records. No client-supplied payout or cash. */
export function privateCasinoRound(state:any,args:Record<string,unknown>){
 const amount=args.amount;
 if(args.game==='roulette'){
  const number=args.number;if(!Number.isInteger(number)||Number(number)<0||Number(number)>36)throw Error('数字は0〜36で指定してください。');
  return {action:'spin',args:{type:'number',amount,choice:number},result:spin(state,'number',amount,number,number)};
 }
 if(args.game==='chinchiro'){
  const dice=[2,2,3,1,1,1];return {action:'chinchiro',args:{amount},result:playChinchiro(state,amount,()=>dice.shift())};
 }
 if(args.game==='blackjack'){
  const cards=[{r:1,s:0},{r:13,s:1},{r:9,s:2},{r:8,s:3}];return {action:'bj-start',args:{amount},result:bjStart(state,amount,()=>cards.shift())};
 }
 if(args.game==='slot')return {action:'slot',args:{amount},result:playSlot(state,amount,()=>18,{amount:state.jackpot.amount,version:state.jackpot.version})};
 throw Error('ゲームを選んでください。');
}
