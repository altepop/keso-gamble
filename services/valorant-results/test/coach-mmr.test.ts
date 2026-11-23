import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureCoachMmr, parseHenrikMmr, tierPatchedEn } from '../src/coach-mmr.ts';

test('tier ids render as English patched names', () => {
  assert.equal(tierPatchedEn(3), 'Iron 1');
  assert.equal(tierPatchedEn(15), 'Platinum 1');
  assert.equal(tierPatchedEn(18), 'Diamond 1');
  assert.equal(tierPatchedEn(20), 'Diamond 3');
  assert.equal(tierPatchedEn(21), 'Ascendant 1');
  assert.equal(tierPatchedEn(23), 'Ascendant 3');
  assert.equal(tierPatchedEn(24), 'Immortal 1');
  assert.equal(tierPatchedEn(26), 'Immortal 3');
  assert.equal(tierPatchedEn(27), 'Radiant');
  assert.equal(tierPatchedEn(2), null);
  assert.equal(tierPatchedEn(null), null);
});

test('v2 MMR payload parses into current, change and peak fields', () => {
  const parsed = parseHenrikMmr({
    status: 200,
    data: {
      current_data: { currenttier: 20, currenttier_patched: 'Diamond 3', ranking_in_tier: 62, mmr_change_to_last_game: -14, elo: 1590 },
      highest_rank: { tier: 23, patched_tier: 'Ascendant 3', season: 'e9', act: 'a1' },
    },
  });
  assert.deepEqual(parsed, {
    tier: 20, tierPatched: 'Diamond 3', rankingInTier: 62, mmrChange: -14, elo: 1590,
    peakTier: 23, peakPatched: 'Ascendant 3', peakSeason: 'E9 A1',
  });
  assert.equal(parseHenrikMmr(null), null);
  assert.equal(parseHenrikMmr({ data: {} }), null);
  const noPatched = parseHenrikMmr({ data: { current_data: { currenttier: 20 }, highest_rank: { tier: 20 } } });
  assert.equal(noPatched?.tierPatched, 'Diamond 3');
  assert.equal(noPatched?.peakPatched, 'Diamond 3');
});

// Minimal in-memory D1 stand-in covering only the statements coach-mmr issues.
function fakeDb(regions: Record<string, string>) {
  const snapshots = new Map<string, any>();
  const db = {
    snapshots,
    prepare(sql: string) {
      let bound: unknown[] = [];
      const stmt: any = {
        bind(...values: unknown[]) { bound = values; return stmt; },
        async run() {
          if (sql.startsWith('INSERT INTO valorant_mmr_snapshots')) {
            const [puuid, riot_id, region, tier, tier_patched, ranking_in_tier, mmr_change, elo, peak_tier, peak_patched, peak_season, fetched_at] = bound;
            snapshots.set(puuid as string, { puuid, riot_id, region, tier, tier_patched, ranking_in_tier, mmr_change, elo, peak_tier, peak_patched, peak_season, fetched_at });
          }
          return { meta: { changes: 1 } };
        },
        async first() { return null; },
        async all() {
          if (sql.includes('FROM valorant_mmr_snapshots')) return { results: bound.map(p => snapshots.get(p as string)).filter(Boolean) };
          if (sql.includes('FROM coach_member_sources')) return { results: bound.map(r => ({ riot_id: r, region: regions[r as string] ?? null })) };
          return { results: [] };
        },
      };
      return stmt;
    },
  };
  return db as any;
}

const mmrPayload = {
  data: {
    current_data: { currenttier: 20, currenttier_patched: 'Diamond 3', ranking_in_tier: 62, mmr_change_to_last_game: 17, elo: 1590 },
    highest_rank: { tier: 23, patched_tier: 'Ascendant 3', season: 'e9', act: 'a1' },
  },
};
const account = { riotId: 'Aquatopia#toppy', puuid: 'puuid-1' };

test('a missing snapshot is fetched once and then served from D1 within the TTL', async () => {
  const db = fakeDb({ 'Aquatopia#toppy': 'ap' });
  let calls = 0;
  const fetcher = async (path: string) => { calls++; assert.equal(path,'/valorant/v2/by-puuid/mmr/ap/puuid-1'); return mmrPayload; };
  const first = await ensureCoachMmr(db, [account], fetcher, 1_000_000);
  assert.equal(calls, 1);
  assert.equal(first.get(account.riotId)?.tierPatched, 'Diamond 3');
  assert.equal(first.get(account.riotId)?.rankingInTier, 62);
  assert.equal(first.get(account.riotId)?.peakPatched, 'Ascendant 3');
  const second = await ensureCoachMmr(db, [account], fetcher, 1_000_000 + 60_000);
  assert.equal(calls, 1, 'fresh snapshot is not refetched');
  assert.equal(second.get(account.riotId)?.tier, 20);
  const third = await ensureCoachMmr(db, [account], fetcher, 1_000_000 + 31 * 60_000);
  assert.equal(calls, 2, 'stale snapshot is refreshed');
  assert.equal(third.get(account.riotId)?.fetchedAt, 1_000_000 + 31 * 60_000);
});

test('a failed refresh keeps the previous snapshot and never throws', async () => {
  const db = fakeDb({ 'Aquatopia#toppy': 'ap' });
  const ok = await ensureCoachMmr(db, [account], async () => mmrPayload, 1_000_000);
  assert.equal(ok.get(account.riotId)?.tier, 20);
  const failed = await ensureCoachMmr(db, [account], async () => { throw new Error('429'); }, 1_000_000 + 60 * 60_000);
  assert.equal(failed.get(account.riotId)?.tier, 20);
  const noFetcher = await ensureCoachMmr(db, [account], null, 1_000_000 + 120 * 60_000);
  assert.equal(noFetcher.get(account.riotId)?.tier, 20);
});

test('an account without a known region is skipped without failing the others', async () => {
  const db = fakeDb({});
  const result = await ensureCoachMmr(db, [account], async () => mmrPayload, 1_000_000);
  assert.equal(result.get(account.riotId), null);
});

// HenrikDev's MMR v2 has {region}/{puuid}; only v3 MMR and v2 MMR-history
// include a {platform} component between them. Catch route regressions.
test('MMR v2 request never inserts the v3 platform segment',async()=>{
 const db=fakeDb({'Aquatopia#toppy':'ap'});
 const requested:string[]=[];
 const result=await ensureCoachMmr(db,[account],async path=>{
  requested.push(path);
  if(path!=='/valorant/v2/by-puuid/mmr/ap/puuid-1')throw new Error('unexpected Henrik v2 route');
  return mmrPayload;
 },1_000_000);
 assert.deepEqual(requested,['/valorant/v2/by-puuid/mmr/ap/puuid-1']);
 assert.equal(result.get(account.riotId)?.rankingInTier,62);
 assert.equal(result.get(account.riotId)?.peakPatched,'Ascendant 3');
});


test('unsupported stored MMR region never calls HenrikDev or writes a snapshot', async () => {
  for (const region of ['unknown', 'ap/../../na', 'AP', '']) {
    const db = fakeDb({ 'Aquatopia#toppy': region });
    let calls = 0;
    const result = await ensureCoachMmr(db, [account], async () => { calls++; return mmrPayload; }, 1_000_000);
    assert.equal(calls, 0, 'invalid region must not trigger a request');
    assert.equal(db.snapshots.size, 0, 'invalid region must not persist MMR');
    assert.equal(result.get(account.riotId), null);
  }
});

test('all supported HenrikDev MMR regions retain their existing route', async () => {
  for (const region of ['ap', 'na', 'eu', 'kr', 'br', 'latam']) {
    const db = fakeDb({ 'Aquatopia#toppy': region });
    const paths: string[] = [];
    const result = await ensureCoachMmr(db, [account], async path => {
      paths.push(path);
      return mmrPayload;
    }, 1_000_000);
    assert.deepEqual(paths, [`/valorant/v2/by-puuid/mmr/${region}/puuid-1`]);
    assert.equal(result.get(account.riotId)?.tier, 20);
  }
});

test('impossible Henrik MMR tiers are never persisted as observed rank', async () => {
  for (const invalidTier of [-1, 28, 999]) {
    const parsed = parseHenrikMmr({
      data: {
        current_data: { currenttier: invalidTier, ranking_in_tier: 99 },
        highest_rank: { tier: invalidTier },
      },
    });
    assert.equal(parsed?.tier, null);
    assert.equal(parsed?.peakTier, null);
    const db = fakeDb({ 'Aquatopia#toppy': 'ap' });
    const result = await ensureCoachMmr(db, [account], async () => ({
      data: { current_data: { currenttier: invalidTier } },
    }), 1_000_000);
    assert.equal(db.snapshots.size, 0, 'invalid current tier must not be written');
    assert.equal(result.get(account.riotId), null);
  }
  assert.equal(parseHenrikMmr({ data: { current_data: { currenttier: 0 } } })?.tier, 0,
    'valid unranked tier remains accepted');
});

test('untrusted Henrik patched labels cannot contradict validated tier IDs', async () => {
  const payload = {
    data: {
      current_data: { currenttier: 20, currenttier_patched: 'Radiant' },
      highest_rank: { tier: 23, patched_tier: 'Iron 1' },
    },
  };
  const parsed = parseHenrikMmr(payload);
  assert.equal(parsed?.tierPatched, 'Diamond 3');
  assert.equal(parsed?.peakPatched, 'Ascendant 3');
  const db = fakeDb({ 'Aquatopia#toppy': 'ap' });
  const snapshots = await ensureCoachMmr(db, [account], async () => payload, 1_000_000);
  assert.equal(snapshots.get(account.riotId)?.tierPatched, 'Diamond 3');
  assert.equal(snapshots.get(account.riotId)?.peakPatched, 'Ascendant 3');
  assert.equal(db.snapshots.get(account.puuid)?.tier_patched, 'Diamond 3');
  assert.equal(db.snapshots.get(account.puuid)?.peak_patched, 'Ascendant 3');
});
