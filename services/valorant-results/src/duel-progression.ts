/** Duel progression eligibility contract. This module NEVER writes KP or D1.
 * Only authenticated, server-verified finalized matches may call this function
 * with origin='server'. Do not copy origin from an untrusted request body.
 */
export const DUEL_PROGRESSION_GAMES=['othello','gomoku','connect4','hitblow','bluffdice','poker','trio'] as const;
export type DuelProgressionGame=typeof DUEL_PROGRESSION_GAMES[number];
export type DuelProgressionMode='pve'|'pvp';
export type DuelProgressionOutcome='win'|'loss'|'draw';
export type DuelFinishReason='natural'|'resign'|'timeout'|'cancelled';
export interface DuelProgressionFinalization{
 origin:'server'|'browser-practice';
 guild:string;
 matchId:string;
 user:string;
 opponent:string|null;
 mode:DuelProgressionMode;
 game:DuelProgressionGame;
 status:'finished'|'pending'|'active'|'cancelled';
 finishReason:DuelFinishReason;
 outcome:DuelProgressionOutcome;
 verifiedTerminal:boolean;
}
export type DuelProgressionEligibility=
 | {eligible:true;receiptKey:string;mode:DuelProgressionMode;game:DuelProgressionGame;outcome:DuelProgressionOutcome}
 | {eligible:false;reason:'unverified'|'unfinished'|'unnatural-finish'|'invalid-identity'|'invalid-mode'|'invalid-game'|'invalid-outcome'};

const id=/^[a-zA-Z0-9_-]{1,100}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function evaluateVerifiedDuelProgression(value:DuelProgressionFinalization):DuelProgressionEligibility{
 if(!value||value.origin!=='server'||value.verifiedTerminal!==true)return {eligible:false,reason:'unverified'};
 if(value.status!=='finished')return {eligible:false,reason:'unfinished'};
 if(value.finishReason!=='natural')return {eligible:false,reason:'unnatural-finish'};
 if(value.mode!=='pve'&&value.mode!=='pvp')return {eligible:false,reason:'invalid-mode'};
 if(!DUEL_PROGRESSION_GAMES.includes(value.game))return {eligible:false,reason:'invalid-game'};
 if(!['win','loss','draw'].includes(value.outcome))return {eligible:false,reason:'invalid-outcome'};
 if(!id.test(value.guild)||!id.test(value.user)||!uuid.test(value.matchId))return {eligible:false,reason:'invalid-identity'};
 if(value.mode==='pvp'&&(!value.opponent||!id.test(value.opponent)||value.opponent===value.user))
  return {eligible:false,reason:'invalid-identity'};
 if(value.mode==='pve'&&value.opponent!==null)return {eligible:false,reason:'invalid-identity'};
 // D1 receipt will enforce a unique key (guild/match/user/mode/game).
 const receiptKey=[value.guild,value.matchId,value.user,value.mode,value.game].join(':');
 return {eligible:true,receiptKey,mode:value.mode,game:value.game,outcome:value.outcome};
}
/** In normal PvP no relic-based win probability or turn-rule adjustments exist. */
export function duelProgressionAllowsRelicWinModifier(mode:DuelProgressionMode){return mode==='pve';}
