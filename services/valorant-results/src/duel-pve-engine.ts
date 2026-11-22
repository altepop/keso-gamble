/** Server-authoritative PvE game transition engine for the six duel modes.
 * P9.4a: rules and CPU decisions only. No browser-provided winner, rewards,
 * KP, D1 or Activity CPU-practice state is ever accepted here.
 * The 'secret' field must remain server-private. Use pvePublicSnapshot() for
 * responses; CPU receives its own private hand and the public board only.
 */
// @ts-expect-error Shared pure duel board rules (runtime JS).
import {initialDuelBoard,playDuelMove} from '../../../js/duel-rules.js';
// @ts-expect-error Shared pure server-authoritative mini-game rules.
import {miniStart,miniMove,miniPrivate} from '../../../js/duel-mini-games.js';
// @ts-expect-error Reuse audited bounded CPU strategy without client network access.
import {chooseCpuMove} from '../../../duel-preview/cpu.js';
// @ts-expect-error Shared pure triple-board rules.
import {trioPlayTurn} from '../../../js/duel-trio.js';
import {DUEL_PROGRESSION_GAMES,type DuelProgressionGame} from './duel-progression.ts';

export type PveLevel='easy'|'normal'|'strong';
export type PveWinner='human'|'cpu'|'draw'|null;
export type PveTurn='human'|'cpu'|'finished';
export interface TrustedPveState{
 game:DuelProgressionGame;level:PveLevel;
 board:string;secret:string|null;
 turn:PveTurn;winner:PveWinner;
 version:number;humanMoves:number;cpuMoves:number;
}
export type PublicPveSnapshot=Omit<TrustedPveState,'secret'> & {ownHand:{kind:string;value:unknown}|null};
const boardGames=new Set(['othello','gomoku']);
const validLevels=new Set(['easy','normal','strong']);
function finish(winner:string|null):PveWinner{
 if(winner==='draw')return 'draw';
 if(winner==='a'||winner==='B')return 'human';
 if(winner==='b'||winner==='W')return 'cpu';
 throw Error('確定していない勝者です。');
}
export function pvePublicSnapshot(value:TrustedPveState):PublicPveSnapshot{
 const ownHand=(boardGames.has(value.game)||value.game==='trio')?null:miniPrivate(value.game,value.secret,'a');
 const {secret:_hidden,...safe}=value;
 return {...safe,ownHand};
}
export function startServerPve(game:string,level:string,randInt:(n:number)=>number):TrustedPveState{
 if(!DUEL_PROGRESSION_GAMES.includes(game as DuelProgressionGame)||!validLevels.has(level))
  throw Error('ゲームまたはCPU難易度が不正です。');
 const initial=game==='trio'?{board:'.........',secret:null}:boardGames.has(game)?{board:initialDuelBoard(game),secret:null}:miniStart(game,randInt);
 return {game:game as DuelProgressionGame,level:level as PveLevel,
  board:initial.board,secret:initial.secret,turn:'human',
  winner:null,version:0,humanMoves:0,cpuMoves:0};
}
/** The CPU cannot inspect the player's private information. */
export function advanceServerPve(
 old:TrustedPveState,body:Record<string,unknown>,
 randInt:(n:number)=>number,random:()=>number
):TrustedPveState{
 if(old.turn!=='human'||old.winner!==null)throw Error('CPU戦の手番が不正です。');
 if(typeof body!=='object'||!body||Array.isArray(body))throw Error('着手が不正です。');
 if(old.game==='trio'){
  if(typeof body.cell!=='number'||!Number.isSafeInteger(body.cell))throw Error('着手が不正です。');
  const result=trioPlayTurn(old.board,body.cell,old.level,random);
  const winner=result.winner==='X'?'human':result.winner==='O'?'cpu':result.winner==='draw'?'draw':null;
  return {...old,board:result.board,secret:null,turn:winner?'finished':'human',winner,
   version:old.version+1,humanMoves:old.humanMoves+1,cpuMoves:old.cpuMoves+(result.cpuCell===null?0:1)};
 }
 let board=old.board,secret=old.secret;
 let turn:PveTurn='cpu',winner:PveWinner=null;
 const boardMode=boardGames.has(old.game);
 const human=boardMode
  ?playDuelMove(old.game,board,'B',Number(body.cell))
  :miniMove(old.game,board,secret,'a',body,randInt);
 board=human.board;secret=boardMode?null:human.secret;
 if(human.winner){winner=finish(human.winner);turn='finished';}
 else if(human.nextColor==='B'||human.turnSide==='a')turn='human';
 let cpuMoves=old.cpuMoves;
 // Othello may grant another turn on pass; dice may roll to CPU again.
 // Never run an unbounded CPU loop in one request.
 for(let n=0;turn==='cpu'&&n<12;n++){
  const hand=boardMode?null:miniPrivate(old.game,secret,'b')?.value??null;
  const choice=chooseCpuMove(old.game,board,{
   side:boardMode?'W':'b',hand,level:old.level,random
  }) as Record<string,unknown>;
  const result=boardMode
   ?playDuelMove(old.game,board,'W',Number(choice.cell))
   :miniMove(old.game,board,secret,'b',choice,randInt);
  board=result.board;secret=boardMode?null:result.secret;
  cpuMoves++;
  if(result.winner){winner=finish(result.winner);turn='finished';}
  else turn=result.nextColor==='W'||result.turnSide==='b'?'cpu':'human';
 }
 if(turn==='cpu')throw Error('CPUの連続手番が上限を超えました。');
 return {...old,board,secret,turn,winner,version:old.version+1,
  humanMoves:old.humanMoves+1,cpuMoves};
}
