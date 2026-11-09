import skirmishQueues from '../skirmish-queues.json' with {type:'json'};
export const isSkirmishQueue=(id:string)=>(skirmishQueues.publicQueues as string[]).includes(id)&&id!=='custom';
import type { Match } from './results.ts';

// Internal assessment only. Neither an HTTP payload nor this assessment grants KP.
export type CompletionAssessment = { status: 'ready'; mode: string; outcome: 'win' | 'loss' | 'draw' | null }
  | { status: 'hold'; reason: 'unfinished' | 'missing_player' | 'unknown_mode' | 'custom_rules_pending' };
const queues = new Set(['competitive','unrated','swiftplay','spikerush','hurm','teamdeathmatch','ggteam','escalation','onefa','replication','deathmatch','custom']);
export function assessRewardReadiness(match: Match, puuid: string): CompletionAssessment {
  if (match.metadata?.is_completed !== true) return { status: 'hold', reason: 'unfinished' };
  const players = match.players?.filter(player => player.puuid === puuid) ?? [];
  if (players.length !== 1) return { status: 'hold', reason: 'missing_player' };
  const queue = match.metadata.queue?.id;
  if (!queues.has(queue)&&!isSkirmishQueue(queue)) return { status: 'hold', reason: 'unknown_mode' };
  // Deathmatch has no teams: it is settled by K/D and first place (src/kp.ts), not by an outcome.
  // v4 has no personal finish/exit flag, so someone who leaves early is settled on the stats they had (owner's call, 2026-10-28).
  if (queue === 'deathmatch') return { status: 'ready', mode: 'deathmatch', outcome: null };
  if (queue === 'custom') return { status: 'hold', reason: 'custom_rules_pending' };
  const mode = queue === 'ggteam' ? 'escalation' : queue === 'hurm' ? 'teamdeathmatch' : queue === 'onefa' ? 'replication' : queue;
  const team = match.teams?.find(team => team.team_id === players[0].team_id);
  const enemy = match.teams?.find(team => team.team_id !== players[0].team_id);
  const valid = match.teams?.length === 2 && team && enemy && typeof team.won === 'boolean' && typeof enemy.won === 'boolean' && !(team.won && enemy.won);
  if(isSkirmishQueue(queue))return valid&&(team.won||enemy.won)?{status:'ready',mode:'skirmish',outcome:team.won?'win':'loss'}:{status:'hold',reason:'unfinished'};
  return { status: 'ready', mode, outcome: valid ? team.won ? 'win' : enemy.won ? 'loss' : 'draw' : null };
}

export interface VoiceRewardRule { minutesPerUnit: number; pointsPerUnit: number; dailyCap: number }
// Caller must supply today's confirmed eligible duration from trusted Gateway
// records, excluding reconnect gaps, AFK and ineligible membership intervals.
// paidPoints must come from the same server ledger, never the Activity browser.
export function quoteVoiceAccrual(confirmedMilliseconds: number, paidPoints: number, rule: VoiceRewardRule): number {
  const int = (value: number) => Number.isSafeInteger(value) && value >= 0;
  if (![confirmedMilliseconds, paidPoints, rule.minutesPerUnit, rule.pointsPerUnit, rule.dailyCap].every(int)
    || rule.minutesPerUnit === 0 || rule.pointsPerUnit === 0 || !Number.isSafeInteger(rule.minutesPerUnit * 60_000)) throw Error('Invalid voice reward input');
  const units = Math.floor(confirmedMilliseconds / (rule.minutesPerUnit * 60_000));
  const due = Math.min(Math.floor(rule.dailyCap / rule.pointsPerUnit), units) * rule.pointsPerUnit;
  return Math.max(0, due - paidPoints);
}
