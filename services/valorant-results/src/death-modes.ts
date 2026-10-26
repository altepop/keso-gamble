export const deathModes = [
  { value: 'unrated', name: 'デスアンレ', queueName: 'アンレ' },
  { value: 'swiftplay', name: 'デススイフト', queueName: 'スイフト' },
  { value: 'spikerush', name: 'デススパイクラッシュ', queueName: 'スパイクラッシュ' },
  { value: 'competitive', name: 'デスコンペ', queueName: 'コンペ' },
  { value: 'custom', name: 'デスカスタム', queueName: 'カスタム' },
  { value: 'deathmatch', name: 'デスデスマッチ', queueName: 'デスマッチ' },
  { value: 'hurm', name: 'デスチームデスマッチ', queueName: 'チームデスマッチ' },
  { value: 'ggteam', name: 'デスエスカレーション', queueName: 'エスカレーション' },
  { value: 'onefa', name: 'デスレプリケーション', queueName: 'レプリケーション' },
] as const;
export type DeathMode = typeof deathModes[number]['value'];
export interface ExpectedDeathAction { riotId: string; value: string | null }
export function isDeathMode(value: unknown): value is DeathMode { return deathModes.some(mode => mode.value === value); }
export function deathName(mode: DeathMode): string { return deathModes.find(entry => entry.value === mode)!.name; }
export function deathQueueName(mode: DeathMode): string { return deathModes.find(entry => entry.value === mode)!.queueName; }
export function deathStoredMode(mode: DeathMode): string { return mode === 'unrated' ? 'unrated' : 'death_' + mode; }
export function isDeathNotice(mode: string | null): boolean { return mode === 'unrated' || Boolean(mode?.startsWith('death_') && isDeathMode(mode.slice(6))); }
export const deathModeKey = (sessionId: string, riotId: string) => 'death_mode:' + sessionId + ':' + riotId;
export const deathActionKey = (riotId: string) => 'death_action:' + riotId;
// Keep existing reservations and schema: older sessions without a mode are unrated.
// Session and mode are written together in one D1 batch.
export const sessionModeSQL = "COALESCE((SELECT value FROM monitor_state WHERE key='death_mode:'||s.session_id||':'||s.riot_id),'unrated')";
