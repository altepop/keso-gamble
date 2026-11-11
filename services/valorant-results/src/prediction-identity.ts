import type { KpMapping } from './kp.ts';

// Exact Discord account + monitored Riot ID pairs, SHA-256. The public repository
// intentionally does not include the linked secondary Discord account IDs.
// Only an exact full account+Riot pair matches; no nicknames or suffix guessing.
const SELF_BET_ALIAS_DIGESTS: ReadonlySet<string> = new Set([
  '48f64874967f38e8cb71878183cb18d87e2c3fa38b8bff3ca2b100a365787a20',
  'f2ba03ed1a24f4decdad61ad5dfe983b541b772d9439fb97f29b6ac7675125b8',
  'f383047010402ab701441dab4f9d49427c4d1d4519dda48fec6365793308f17e',
]);
const normalizeRiot = (riot: string) => riot.normalize('NFKC').toLowerCase();
export async function selfBetAliasDigest(riot: string, discordUserId: string): Promise<string> {
  const data = new TextEncoder().encode('vp-owner:v1:' + normalizeRiot(riot) + ':' + discordUserId);
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return [...bytes].map(byte => byte.toString(16).padStart(2,'0')).join('');
}
/** Always compare exact IDs against the encrypted primary mapping first.
 * Explicit sub-account pairs are checked without querying D1 or revealing linkages. */
export async function isOwnPrediction(mapping: KpMapping, riot: string,
  discordUserId: string, aliases: ReadonlySet<string> = SELF_BET_ALIAS_DIGESTS): Promise<boolean> {
  if (mapping.accounts.some(account => account.discordUserId === discordUserId
      && normalizeRiot(account.riotId) === normalizeRiot(riot))) return true;
  if (!/^\d{15,22}$/.test(discordUserId)) return false;
  return aliases.has(await selfBetAliasDigest(riot, discordUserId));
}
