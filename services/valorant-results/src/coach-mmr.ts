// Account MMR snapshots for the coach display: current tier, RR, the RR
// change of the last game, and the peak tier. The source is the HenrikDev
// v2 MMR endpoint (by-puuid). The result bot already proves this data is
// reachable: its rank-change notices are derived from the sibling
// mmr-history endpoint. Snapshots live in D1 and are refreshed lazily, when
// the coach report is read and the stored snapshot is stale, so the coach
// never needs to wait for a backfill and old matches cost no extra
// HenrikDev quota. The monitor's delivery path is deliberately untouched:
// its ordering guarantee (queued posts are delivered before slower history
// requests finish) is covered by tests, and a snapshot refresh does not
// belong in that path.
//
// Only fields the endpoint actually returns are stored. A failed or empty
// response leaves the previous snapshot (or no snapshot) untouched, and the
// display keeps showing its not-acquired state instead of invented values.

export type MmrSnapshot = {
  riotId: string; tier: number | null; tierPatched: string | null;
  rankingInTier: number | null; mmrChange: number | null;
  peakTier: number | null; peakPatched: string | null; peakSeason: string | null;
  fetchedAt: number;
};
export type MmrFetcher = (path: string) => Promise<unknown>;
type Stmt = { bind: (...values: unknown[]) => Stmt; run: () => Promise<unknown>; first: <T>() => Promise<T | null>; all: <T>() => Promise<{ results: T[] }> };
type Db = { prepare: (sql: string) => Stmt };

export const MMR_SNAPSHOT_TTL_MS = 30 * 60_000;

const TIER_GROUPS = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal'];
export function tierPatchedEn(tier: number | null): string | null {
  if (tier === null || !Number.isSafeInteger(tier)) return null;
  if (tier === 27) return 'Radiant';
  if (tier < 3 || tier > 26) return null;
  return `${TIER_GROUPS[Math.floor((tier - 3) / 3)]} ${((tier - 3) % 3) + 1}`;
}

const int = (v: unknown): number | null => typeof v === 'number' && Number.isSafeInteger(v) ? v : null;
const str = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v.trim() : null;

export function parseHenrikMmr(json: unknown) {
  const data: any = (json as any)?.data ?? json;
  const current: any = data?.current_data ?? data?.current ?? null;
  const highest: any = data?.highest_rank ?? null;
  if (!current || typeof current !== 'object') return null;
  const tier = int(current.currenttier ?? current.tier);
  const peakTier = int(highest?.tier);
  const season = str(highest?.season), act = str(highest?.act);
  return {
    tier,
    tierPatched: str(current.currenttier_patched ?? current.patched_tier) ?? tierPatchedEn(tier),
    rankingInTier: int(current.ranking_in_tier),
    mmrChange: int(current.mmr_change_to_last_game),
    elo: int(current.elo),
    peakTier,
    peakPatched: str(highest?.patched_tier ?? highest?.patched) ?? tierPatchedEn(peakTier),
    peakSeason: season || act ? [season, act].filter(Boolean).join(' ').toUpperCase() : null,
  };
}

export async function ensureMmrTable(db: Db): Promise<void> {
  await db.prepare(`CREATE TABLE IF NOT EXISTS valorant_mmr_snapshots(
    puuid TEXT PRIMARY KEY, riot_id TEXT, region TEXT,
    tier INTEGER, tier_patched TEXT, ranking_in_tier INTEGER, mmr_change INTEGER, elo INTEGER,
    peak_tier INTEGER, peak_patched TEXT, peak_season TEXT, fetched_at INTEGER NOT NULL)`).run();
}

type SnapshotRow = {
  puuid: string; riot_id: string | null; tier: number | null; tier_patched: string | null;
  ranking_in_tier: number | null; mmr_change: number | null;
  peak_tier: number | null; peak_patched: string | null; peak_season: string | null; fetched_at: number;
};

const toSnapshot = (row: SnapshotRow, riotId: string): MmrSnapshot => ({
  riotId, tier: row.tier, tierPatched: row.tier_patched, rankingInTier: row.ranking_in_tier,
  mmrChange: row.mmr_change, peakTier: row.peak_tier, peakPatched: row.peak_patched,
  peakSeason: row.peak_season, fetchedAt: row.fetched_at,
});

export async function readMmrSnapshots(db: Db, accounts: readonly { riotId: string; puuid: string | null }[]): Promise<Map<string, MmrSnapshot | null>> {
  const out = new Map<string, MmrSnapshot | null>(accounts.map(a => [a.riotId, null]));
  const known = accounts.filter((a): a is { riotId: string; puuid: string } => typeof a.puuid === 'string' && a.puuid.length > 0);
  if (!known.length) return out;
  await ensureMmrTable(db);
  const marks = known.map(() => '?').join(',');
  const { results } = await db.prepare(`SELECT * FROM valorant_mmr_snapshots WHERE puuid IN (${marks})`)
    .bind(...known.map(a => a.puuid)).all<SnapshotRow>();
  const byPuuid = new Map(results.map(r => [r.puuid, r]));
  for (const a of known) { const row = byPuuid.get(a.puuid); if (row) out.set(a.riotId, toSnapshot(row, a.riotId)); }
  return out;
}

// Reads snapshots and refreshes the stale or missing ones when a fetcher is
// available. Refresh failures never throw: the stale snapshot (or null) is
// returned so the report can still render. An account may carry its region
// directly (the monitor knows it); otherwise the region recorded by the
// member archive is used.
export async function ensureCoachMmr(
  db: Db, accounts: readonly { riotId: string; puuid: string | null; region?: string }[],
  fetcher: MmrFetcher | null, now: number, ttlMs: number = MMR_SNAPSHOT_TTL_MS,
): Promise<Map<string, MmrSnapshot | null>> {
  const snapshots = await readMmrSnapshots(db, accounts);
  if (!fetcher) return snapshots;
  const stale = accounts.filter((a): a is { riotId: string; puuid: string; region?: string } => {
    if (typeof a.puuid !== 'string' || !a.puuid.length) return false;
    const s = snapshots.get(a.riotId);
    return !s || now - s.fetchedAt >= ttlMs;
  });
  if (!stale.length) return snapshots;
  let regions = new Map<string, string>();
  const needRegion = stale.filter(a => !a.region);
  if (needRegion.length) try {
    const marks = needRegion.map(() => '?').join(',');
    const { results } = await db.prepare(`SELECT riot_id,region FROM coach_member_sources WHERE riot_id IN (${marks})`)
      .bind(...needRegion.map(a => a.riotId)).all<{ riot_id: string; region: string | null }>();
    regions = new Map(results.filter(r => r.region).map(r => [r.riot_id, r.region!]));
  } catch { /* region lookup is best-effort; a missing region just skips the refresh */ }
  for (const account of stale) {
    const region = account.region ?? regions.get(account.riotId);
    // Only HenrikDev-supported regions may enter the URL or be persisted.
    if (!region || !['ap', 'na', 'eu', 'kr', 'br', 'latam'].includes(region)) continue;
    try {
      const json = await fetcher(`/valorant/v2/by-puuid/mmr/${encodeURIComponent(region)}/${encodeURIComponent(account.puuid)}`);
      const parsed = parseHenrikMmr(json);
      if (!parsed || parsed.tier === null) continue;
      await db.prepare(`INSERT INTO valorant_mmr_snapshots(puuid,riot_id,region,tier,tier_patched,ranking_in_tier,mmr_change,elo,peak_tier,peak_patched,peak_season,fetched_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(puuid) DO UPDATE SET riot_id=excluded.riot_id,region=excluded.region,
        tier=excluded.tier,tier_patched=excluded.tier_patched,ranking_in_tier=excluded.ranking_in_tier,mmr_change=excluded.mmr_change,
        elo=excluded.elo,peak_tier=excluded.peak_tier,peak_patched=excluded.peak_patched,peak_season=excluded.peak_season,fetched_at=excluded.fetched_at`)
        .bind(account.puuid, account.riotId, region, parsed.tier, parsed.tierPatched, parsed.rankingInTier, parsed.mmrChange,
          parsed.elo, parsed.peakTier, parsed.peakPatched, parsed.peakSeason, now).run();
      snapshots.set(account.riotId, {
        riotId: account.riotId, tier: parsed.tier, tierPatched: parsed.tierPatched, rankingInTier: parsed.rankingInTier,
        mmrChange: parsed.mmrChange, peakTier: parsed.peakTier, peakPatched: parsed.peakPatched,
        peakSeason: parsed.peakSeason, fetchedAt: now,
      });
    } catch { /* keep the stale snapshot; the next read retries */ }
  }
  return snapshots;
}

// The report-facing shape: one entry per account, in the caller's order.
// Accounts without a snapshot stay present with null fields so the display
// can keep its not-acquired state per account.
export function mmrReportView(accounts: readonly { riotId: string }[], snapshots: ReadonlyMap<string, MmrSnapshot | null>) {
  const empty = (riotId: string): MmrSnapshot => ({
    riotId, tier: null, tierPatched: null, rankingInTier: null, mmrChange: null,
    peakTier: null, peakPatched: null, peakSeason: null, fetchedAt: 0,
  });
  return { accounts: accounts.map(a => snapshots.get(a.riotId) ?? empty(a.riotId)) };
}
