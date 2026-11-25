/** P11 server-owned 三目並べ transitions.
 * Client supplies only a cell; all board, turn, winner and CPU state come
 * from a trusted server session. This module NEVER awards KP itself.
 */
// @ts-expect-error Shared pure JS rules without a TypeScript declaration file.
import {trioMove,trioWinner,trioCpuChoice} from '../../../js/duel-trio.js';

export type TrioMark='X'|'O';
export type TrioWinner=TrioMark|'draw'|null;
export interface TrustedTrioState {
 board:string;
 turn:TrioMark|null;
 winner:TrioWinner;
 version:number;
}
export function startTrustedTrio():TrustedTrioState {
 return {board:'.........',turn:'X',winner:null,version:0};
}
function checkState(state:TrustedTrioState){
 if(!state||!Number.isSafeInteger(state.version)||state.version<0||
    typeof state.board!=='string'||!/^[.XO]{9}$/.test(state.board))
  throw Error('三目並べのサーバー状態が不正です。');
 const winner=trioWinner(state.board);
 if(winner!==state.winner||state.turn!==(winner?null:
   [...state.board].filter(c=>c==='X').length===[...state.board].filter(c=>c==='O').length?'X':'O'))
  throw Error('三目並べのサーバー状態が不正です。');
}
export function advanceTrustedTrio(state:TrustedTrioState,cell:unknown):TrustedTrioState {
 checkState(state);
 if(state.winner!==null||state.turn===null)throw Error('三目並べは既に終了しています。');
 if(typeof cell!=='number'||!Number.isSafeInteger(cell))throw Error('着手が不正です。');
 const board=trioMove(state.board,cell,state.turn);
 const winner=trioWinner(board);
 return {board,turn:winner?null:state.turn==='X'?'O':'X',winner,version:state.version+1};
}
/** CPU never receives an untrusted result, hidden reward, or client board. */
export function advanceTrustedTrioPve(
 state:TrustedTrioState,cell:unknown,level:'easy'|'normal'|'strong',random:()=>number
):TrustedTrioState {
 checkState(state);
 if(state.turn!=='X'||state.winner!==null)throw Error('プレイヤーの手番ではありません。');
 if(!['easy','normal','strong'].includes(level))throw Error('CPU難易度が不正です。');
 const human=advanceTrustedTrio(state,cell);
 if(human.winner!==null)return human;
 const cpuCell=trioCpuChoice(human.board,level,random);
 if(cpuCell===null)throw Error('CPUの合法手がありません。');
 return advanceTrustedTrio(human,cpuCell);
}
