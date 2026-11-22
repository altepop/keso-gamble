-- Coach MMR snapshots (HenrikDev v2 MMR: current tier / RR / last change /
-- peak). Refreshed lazily by the coach report when the stored snapshot is
-- stale; the table is also created inline by coach-mmr.ts.
-- Separate additive migration; intentionally not wired into production migration automation.
CREATE TABLE IF NOT EXISTS valorant_mmr_snapshots(
 puuid TEXT PRIMARY KEY,
 riot_id TEXT,
 region TEXT,
 tier INTEGER,
 tier_patched TEXT,
 ranking_in_tier INTEGER,
 mmr_change INTEGER,
 elo INTEGER,
 peak_tier INTEGER,
 peak_patched TEXT,
 peak_season TEXT,
 fetched_at INTEGER NOT NULL
);
