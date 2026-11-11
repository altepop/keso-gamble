import type {KpEnv} from './kp.ts';
import {initializeKp} from './kp.ts';
import {boardDuelAction,ensureBoardDuels,type BoardDuel} from './board-duels.ts';
import {GAME_IDS} from './game-center.ts';
const ID=/^\d{15,22}$/;
const UUID=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export async function duelOperationId(source:string){
 if(!ID.test(source))throw Error('Discordの操作IDが不正だ。');
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('keso-discord-duel-v1:'+source)));
 bytes[6]=(bytes[6]&15)|64; bytes[8]=(bytes[8]&63)|128;
 const hex=[...bytes.slice(0,16)].map(v=>v.toString(16).padStart(2,'0')).join('');
 return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20,32)].join('-');
}
export async function startDiscordDuel(env:KpEnv,guild:string,issuer:string,opponent:string,
 game:string,stake:number,requestId:string):Promise<BoardDuel>{
 if(![guild,issuer,opponent,requestId].every(id=>ID.test(id))||
    issuer===opponent||!GAME_IDS.has(game)||!Number.isSafeInteger(stake)||stake<100||stake>100000)
    throw Error('対戦相手、ゲーム、KP額を確認してください。');
 const m=await initializeKp(env);if(!m||m.guildId!==guild)throw Error('KPを利用できない。');
 return boardDuelAction(env,m,issuer,{id:await duelOperationId(requestId),action:'create',
  opponent,game,stake});
}
export async function respondDiscordDuel(env:KpEnv,guild:string,user:string,duel:string,
 decision:'accept'|'decline',interactionId:string):Promise<BoardDuel>{
 if(![guild,user,interactionId].every(id=>ID.test(id))||!UUID.test(duel))
  throw Error('対戦の操作を確認できない。');
 const m=await initializeKp(env);if(!m||m.guildId!==guild)throw Error('KPを利用できない。');
 await ensureBoardDuels(env);
 const match=await env.DB.prepare('SELECT id,user_a,user_b,status,version FROM kp_board_duels WHERE guild=? AND id=?')
  .bind(guild,duel).first<Pick<BoardDuel,'id'|'user_a'|'user_b'|'status'|'version'>>();
 if(!match)throw Error('招待は見つからない。');
 if(user!==match.user_b && !(decision==='decline'&&user===match.user_a))
  throw Error('この招待は本人しか操作できない。');
 if(match.status!=='pending')throw Error('この招待は終了している。');
 const action=decision==='accept'?'accept':'cancel';
 return boardDuelAction(env,m,user,{id:await duelOperationId(interactionId),
  action,duel,version:match.version});
}
