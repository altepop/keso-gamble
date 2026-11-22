/** Phase 11: daily mixed-game CPU challenge. Server chooses the game/level;
 * browser values never determine a result, reward or private hand.
 * Date changes at midnight JST. No new KP bonus or achievement is minted.
 */
import {DUEL_PROGRESSION_GAMES,type DuelProgressionGame} from './duel-progression.ts';
export interface DailyDuelChallenge{day:string;game:DuelProgressionGame;level:'easy'|'normal'|'strong';rule:'standard-server-pve';bonusKp:0}
export function duelDailyChallenge(now:number):DailyDuelChallenge{
 if(!Number.isSafeInteger(now)||now<0||now>8_640_000_000_000_000)throw Error('Invalid challenge clock');
 const iso=new Date(now+32_400_000).toISOString().slice(0,10);
 const day=iso.replaceAll('-','');
 // Calendar day selects from all six games and three audited CPU levels.
 // Fixed schedule, no personalization or secret server salt.
 const dayNumber=Math.floor((now+32_400_000)/86_400_000);
 const game=DUEL_PROGRESSION_GAMES[((dayNumber%6)+6)%6];
 const level=(['easy','normal','strong'] as const)[((Math.floor(dayNumber/6)%3)+3)%3];
 return {day,game,level,rule:'standard-server-pve',bonusKp:0};
}
