import type { Match, Outcome } from './results.ts';

/** Cross-repository contract. This module does not grant money or expose an HTTP endpoint. */
export type RewardMode = 'competitive' | 'escalation' | 'unrated';
export interface MatchRewardEvent {
  schemaVersion: 1;
  type: 'valorant.match.completed';
  eventId: string;
  guildId: string;
  subject: { puuid: string };
  match: { id: string; mode: RewardMode; outcome: Outcome; startedAt: number; endedAt: number };
  observedAt: number;
}
export interface RewardPolicy {
  enabled: boolean;
  currency: string;
  version: string;
  modes: Record<RewardMode, { participation: number | null; winBonus: number | null }>;
}
export type RewardQuote = { status: 'disabled' | 'unconfigured' }
  | { status: 'ready'; eventId: string; currency: string; policyVersion: string; participation: number; winBonus: number; total: number };

const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200;
const timestamp = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const modes: RewardMode[] = ['competitive', 'escalation', 'unrated'];
/** PUUID, rather than Riot display name, makes a rename keep the same deduplication key. */
export function rewardEventId(guildId: string, matchId: string, puuid: string): string {
  return ['valorant', guildId, matchId, puuid].map(encodeURIComponent).join(':');
}

/** Call only from the trusted API collector, with server-stored guild/player identity and cutoff. */
export function createMatchRewardEvent(raw: Match, subject: { guildId: string; puuid: string; eligibleSince: number }, now = Date.now()): MatchRewardEvent | null {
  const queue = raw.metadata?.queue?.id;
  const mode = queue === 'ggteam' ? 'escalation' : queue;
  if (!modes.includes(mode as RewardMode) || raw.metadata?.is_completed !== true
    || !/^\d{15,22}$/.test(subject.guildId) || !identifier(subject.puuid) || !timestamp(subject.eligibleSince) || !timestamp(now)
    || !identifier(raw.metadata?.match_id)) return null;
  const members = raw.players?.filter(player => player.puuid === subject.puuid) ?? [];
  if (members.length !== 1 || raw.teams?.length !== 2) return null;
  const team = raw.teams.find(team => team.team_id === members[0].team_id);
  const enemy = raw.teams.find(team => team.team_id !== members[0].team_id);
  if (!team || !enemy || typeof team.won !== 'boolean' || typeof enemy.won !== 'boolean' || (team.won && enemy.won)) return null;
  const startedAt = Date.parse(raw.metadata.started_at), duration = raw.metadata.game_length_in_ms;
  const endedAt = startedAt + duration;
  if (!timestamp(startedAt) || !Number.isSafeInteger(duration) || duration <= 0 || !timestamp(endedAt)
    || endedAt <= subject.eligibleSince || endedAt > now + 60_000) return null;
  return {
    schemaVersion: 1, type: 'valorant.match.completed',
    eventId: rewardEventId(subject.guildId, raw.metadata.match_id, subject.puuid), guildId: subject.guildId,
    subject: { puuid: subject.puuid }, match: { id: raw.metadata.match_id, mode: mode as RewardMode,
      outcome: team.won ? 'win' : enemy.won ? 'loss' : 'draw', startedAt, endedAt }, observedAt: now,
  };
}

/** Validate again at a future receiver; a valid payload still requires trusted-source authentication. */
export function isMatchRewardEvent(value: unknown): value is MatchRewardEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<MatchRewardEvent>;
  return event.schemaVersion === 1 && event.type === 'valorant.match.completed'
    && typeof event.guildId === 'string' && /^\d{15,22}$/.test(event.guildId)
    && identifier(event.subject?.puuid) && identifier(event.match?.id)
    && modes.includes(event.match?.mode as RewardMode) && ['win', 'loss', 'draw'].includes(event.match?.outcome ?? '')
    && timestamp(event.match?.startedAt) && timestamp(event.match?.endedAt) && event.match!.endedAt > event.match!.startedAt
    && timestamp(event.observedAt) && event.match!.endedAt <= event.observedAt + 60_000
    && event.eventId === rewardEventId(event.guildId, event.match!.id, event.subject!.puuid);
}

/** A quote is not a balance update. The wallet must apply it and its unique event key atomically. */
export function quoteMatchReward(event: MatchRewardEvent, policy: RewardPolicy): RewardQuote {
  if (!isMatchRewardEvent(event)) throw new Error('Invalid reward event');
  if (!policy.enabled) return { status: 'disabled' };
  if (!identifier(policy.currency) || !identifier(policy.version)) throw new Error('Invalid reward policy');
  const amounts = policy.modes[event.match.mode];
  if (!amounts || amounts.participation === null || amounts.winBonus === null) return { status: 'unconfigured' };
  const valid = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
  if (!valid(amounts.participation) || !valid(amounts.winBonus) || !Number.isSafeInteger(amounts.participation + amounts.winBonus)) throw new Error('Invalid reward amounts');
  const winBonus = event.match.outcome === 'win' ? amounts.winBonus : 0;
  return { status: 'ready', eventId: event.eventId, currency: policy.currency, policyVersion: policy.version,
    participation: amounts.participation, winBonus, total: amounts.participation + winBonus };
}