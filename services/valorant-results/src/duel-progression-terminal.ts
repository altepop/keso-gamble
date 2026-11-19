/** Phase 9.3: trusted board-duel terminal-action attestation.
 * This helper does not write D1 or KP, and never trusts a browser-provided result.
 * Call only with a row obtained from kp_board_duels joined to the final
 * kp_board_duel_actions record inside the authenticated Worker.
 */
import {evaluateVerifiedDuelProgression,type DuelProgressionEligibility,type DuelProgressionGame} from './duel-progression.ts';

export interface VerifiedBoardDuelTerminal {
 guild:string;id:string;user_a:string;user_b:string;
 game:string;status:string;winner:string|null;version:number;
 action_kind:string;action_version:number;action_winner:string|null;
 action_actor:string;
}
export function evaluateBoardDuelTerminal(
 row:VerifiedBoardDuelTerminal,user:string
):DuelProgressionEligibility{
 if(!row||!user||!['move','resign','timeout'].includes(row.action_kind)
  ||row.status!=='finished'||row.version!==row.action_version+1
  ||row.winner!==row.action_winner
  ||(row.winner!=='draw'&&row.winner!==row.user_a&&row.winner!==row.user_b)
  ||(user!==row.user_a&&user!==row.user_b)
  ||row.user_a===row.user_b
  ||(row.action_kind==='move'&&row.action_actor!==row.user_a&&row.action_actor!==row.user_b)
  ||(row.action_kind==='resign'&&row.winner===row.action_actor)
  ||(row.action_kind==='timeout'&&row.action_actor!=='system'&&row.action_actor!==row.user_a&&row.action_actor!==row.user_b))
  return {eligible:false,reason:'unverified'};
 const opponent=user===row.user_a?row.user_b:row.user_a;
 return evaluateVerifiedDuelProgression({
  origin:'server',guild:row.guild,matchId:row.id,user,opponent,
  mode:'pvp',game:row.game as DuelProgressionGame,status:'finished',
  finishReason:row.action_kind==='move'?'natural':row.action_kind,
  outcome:row.winner==='draw'?'draw':row.winner===user?'win':'loss',
  verifiedTerminal:row.action_kind==='move'
 });
}
