import { commentPools, memeQuotes } from '../src/comments.ts';
import configuredPlayers from '../players.json' with { type: 'json' };
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { monitor, resultMessage } from '../src/index.ts';
import type { Env } from '../src/index.ts';

function environment(): Env {
  const db = new DatabaseSync(':memory:');
  const migrations = new NodeURL('../migrations/', import.meta.url);
  for (const file of readdirSync(migrations).filter(file => file.endsWith('.sql')).sort()) {
    db.exec(readFileSync(new NodeURL(file, migrations), 'utf8'));
  }
  class Query {
    sql: string; values: Array<string | number | null> = [];
    constructor(sql: string) { this.sql = sql; }
    bind(...values: Array<string | number | null>) { this.values = values; return this; }
    async first() { return db.prepare(this.sql).get(...this.values) ?? null; }
    async all() { return { results: db.prepare(this.sql).all(...this.values) }; }
    async run() { return { meta: { changes: Number(db.prepare(this.sql).run(...this.values).changes) } }; }
  }
  return {
    DB: { prepare(sql: string) { return new Query(sql); }, async batch(queries: Query[]) {
      db.exec('BEGIN');
      try { const result = []; for (const query of queries) result.push(await query.run()); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    } } as unknown as D1Database,
    HENRIK_API_KEY: 'test-key', DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/123/test',
  };
}

function match(id: string, mode = 'competitive', win = true, ended = Date.now(), puuid = 'user-1') {
  return {
    metadata: { match_id: id, is_completed: true, started_at: new Date(ended - 1000).toISOString(), game_length_in_ms: 1000, queue: { id: mode }, season: { id: 'act-one', short: 'E9A1' } },
    players: [{ puuid, team_id: 'red' }],
    teams: [{ team_id: 'blue', won: !win, rounds: { won: win ? 10 : 13 } }, { team_id: 'red', won: win, rounds: { won: win ? 13 : 10 } }],
  };
}

test('winner flags and opaque team IDs produce the requested chat messages', () => {
  assert.equal(resultMessage(match('1'), 'user-1', 'たろう')?.message.split('\n')[0], '🎉 たろうは13対10で勝ち！！（コンペ）');
  const loss = resultMessage(match('2', 'ggteam', false), 'user-1', 'はなこ')!;
  assert.equal(loss.message.split('\n')[0], '📢 はなこは10対13で負け！（エスカレーション）');
  assert.match(loss.message, /\n💬 .+/);
  assert.equal(resultMessage(match('2', 'ggteam', false), 'user-1', 'はなこ')!.message, loss.message);
  assert.ok(new Set(Array.from({ length: 32 }, (_, n) => resultMessage(match('loss-' + n, 'competitive', false), 'user-1', 'name')!.message)).size > 1);
  assert.match(resultMessage(match('3', 'hurm'), 'user-1', 'name')!.message,/チームデスマッチ/);
  const draw = match('4'); draw.teams.forEach(t => { t.won = false; });
  assert.equal(resultMessage(draw, 'user-1', 'name')?.outcome, 'draw');
  const incomplete = match('5'); incomplete.metadata.is_completed = false;
  assert.equal(resultMessage(incomplete, 'user-1', 'name'), null);
});

test('no API or Discord calls are made for an empty configuration', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('must not make network calls'); };
  try { await monitor(environment(), []); } finally { globalThis.fetch = original; }
});

test('invalid IDs and more than five players are rejected before network access', async () => {
  const env = environment();
  await assert.rejects(monitor(env, [{ riotId: 'invalid' }]), /名前#タグ/);
  await assert.rejects(monitor(env, Array.from({ length: 6 }, (_, n) => ({ riotId: `player${n}#JP1` }))), /上限/);
});

test('first run skips old games; new results are sent once, even with a long-idle recent match', async () => {
  const env = environment(); const original = globalThis.fetch;
  let now = Date.now(); const clock = Date.now; Date.now = () => now;
  let games = [match('old', 'competitive', false, now - 1000)];
  const messages: Array<{ content: string; allowed_mentions: { parse: string[] } }> = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/account/')) return Response.json({ data: { puuid: 'user-1', region: 'ap' } });
    if (String(url).includes('/matches/')) return Response.json({ data: games });
    messages.push(JSON.parse(String(init?.body))); return Response.json({ id: '1' });
  };
  try {
    const config = [{ riotId: 'player#JP1', name: 'たろう' }];
    await monitor(env, config); assert.equal(messages.length, 0);
    now += 60_000; games = [match('new', 'competitive', true, now)];
    await monitor(env, config); await monitor(env, config);
    assert.equal(messages.length, 1); assert.match(messages[0].content, /たろうは13対10で勝ち/);
    assert.deepEqual(messages[0].allowed_mentions, { parse: [] });
    now += 10 * 86400_000;
    await monitor(env, config); assert.equal(messages.length, 1);
    await monitor(env, []);
    assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM notifications').first<{ n: number }>())!.n, 0);
  } finally { globalThis.fetch = original; Date.now = clock; }
});

test('failed Discord sends are retried, and the existing lease prevents duplicate concurrent runs', async () => {
  const env = environment(); const original = globalThis.fetch; let attempts = 0; const deliveries: string[] = [];
  const config = [{ riotId: 'player#JP1' }];
  await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind('player#JP1', 'user-1', 'ap', 0).run();
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.henrikdev.xyz')) return Response.json({ data: [match('retry', 'competitive', false)] });
    deliveries.push(JSON.parse(String(init?.body)).content);
    attempts++; return attempts === 1 ? new Response('', { status: 500 }) : Response.json({ id: '1' });
  };
  try {
    await monitor(env, config);
    assert.equal(attempts, 1);
    await env.DB.prepare("DELETE FROM monitor_state WHERE key='discord_after'").run();
    await monitor(env, config); await monitor(env, config); assert.equal(attempts, 2);
    assert.equal(deliveries[0], deliveries[1]);
    assert.match(deliveries[0], /💬/);
    await env.DB.prepare("INSERT INTO monitor_state(key,value) VALUES('lock',?)").bind(String(Date.now() + 60_000)).run();
    await monitor(env, config); assert.equal(attempts, 2);
  } finally { globalThis.fetch = original; }
});

test('an API rate limit pauses requests globally and changes which player gets the next attempt', async () => {
  const env = environment(); const original = globalThis.fetch; const paths: string[] = [];
  const config = [{ riotId: 'first#JP1' }, { riotId: 'second#JP1' }];
  globalThis.fetch = async url => { paths.push(String(url)); return new Response('', { status: 429, headers: { 'Retry-After': '60' } }); };
  try {
    await monitor(env, config); await monitor(env, config);
    assert.equal(paths.length, 1); assert.match(paths[0], /first/);
    await env.DB.prepare("DELETE FROM monitor_state WHERE key='api_after'").run();
    await monitor(env, config); assert.equal(paths.length, 2); assert.match(paths[1], /second/);
  } finally { globalThis.fetch = original; }
});

test('ACT totals and streaks stay separate by mode, reset at the next ACT, and break on draws', async () => {
  const env = environment(); const original = globalThis.fetch;
  const config = [{ riotId: 'player#JP1', name: 'たろう' }];
  await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind('player#JP1', 'user-1', 'ap', 0).run();
  let games: ReturnType<typeof match>[] = [];
  const messages: string[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.henrikdev.xyz')) return Response.json({ data: games });
    messages.push(JSON.parse(String(init?.body)).content); return Response.json({ id: '1' });
  };
  const base = Date.now() - 20_000;
  const push = async (game: ReturnType<typeof match>) => {
    games = [game, ...games].slice(0, 2);
    await monitor(env, config);
    return messages.at(-1)!;
  };
  try {
    assert.match(await push(match('a', 'competitive', false, base)), /0勝1敗\n現在：1連敗/);
    assert.match(await push(match('b', 'competitive', false, base + 1000)), /0勝2敗\n現在：2連敗/);
    const escalation = match('c', 'ggteam', true, base + 2000);
    escalation.teams.forEach(team => { team.rounds.won = 0; });
    const arcadeText = await push(escalation);
    assert.match(arcadeText, /エスカレーション/);
    assert.match(arcadeText, /スコア未取得/);
    assert.doesNotMatch(arcadeText, /0対0/);
    assert.match(arcadeText, /1勝0敗\n現在：1連勝/);
    assert.match(await push(match('d', 'competitive', true, base + 3000)), /1勝2敗\n現在：1連勝/);
    const draw = match('e', 'competitive', false, base + 4000);
    draw.teams.forEach(team => { team.won = false; team.rounds.won = 14; });
    const beforeDraw = messages.length;
    const drawText = await push(draw); assert.equal(messages.length, beforeDraw + 1);
    assert.match(drawText, /14対14で引き分け（コンペ）/);
    assert.match(drawText, /1勝2敗1分\n現在：連勝・連敗なし（引き分けでリセット）/);
    assert.doesNotMatch(drawText, /連勝ストップ|連敗ストップ|\d+連勝|\d+連敗/);
    assert.match(await push(match('f', 'competitive', true, base + 5000)), /2勝2敗1分\n現在：1連勝/);
    assert.match(await push(match('g', 'competitive', true, base + 6000)), /3勝2敗1分\n現在：2連勝/);
    const nextAct = match('h', 'competitive', true, base + 7000);
    nextAct.metadata.season = { id: 'act-two', short: 'E9A2' };
    const nextText = await push(nextAct);
    assert.match(nextText, /ACT E9A2（記録分）：1勝0敗\n現在：1連勝/);
    const count = messages.length;
    await monitor(env, config); assert.equal(messages.length, count);
  } finally { globalThis.fetch = original; }
});

test('two results in one fetch get their own totals at the time of each match', async () => {
  const env = environment(); const original = globalThis.fetch;
  const config = [{ riotId: 'player#JP1', name: '  ' }];
  await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind('player#JP1', 'user-1', 'ap', 0).run();
  const base = Date.now() - 3000;
  const games = [match('later', 'competitive', true, base + 1000), match('earlier', 'competitive', true, base)];
  const messages: string[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.henrikdev.xyz')) return Response.json({ data: games });
    messages.push(JSON.parse(String(init?.body)).content); return Response.json({ id: '1' });
  };
  try {
    await monitor(env, config);
    assert.equal(messages.length, 2);
    assert.match(messages[0], /playerは/);
    assert.match(messages[0], /1勝0敗\n現在：1連勝/);
    assert.match(messages[1], /2勝0敗\n現在：2連勝/);
  } finally { globalThis.fetch = original; }
});

test('unavailable ACT data is not combined into an invented ACT total', async () => {
  const env = environment(); const original = globalThis.fetch;
  await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind('player#JP1', 'user-1', 'ap', 0).run();
  const game = match('no-act');
  const raw = JSON.parse(JSON.stringify(game)); delete raw.metadata.season;
  let content = '';
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.henrikdev.xyz')) return Response.json({ data: [raw] });
    content = JSON.parse(String(init?.body)).content; return Response.json({ id: '1' });
  };
  try {
    await monitor(env, [{ riotId: 'player#JP1' }]);
    assert.match(content, /ACT情報未取得（集計なし）/);
    assert.doesNotMatch(content, /連勝|連敗/);
    assert.match(content, /（記録分）：1勝0敗/);
  } finally { globalThis.fetch = original; }
});

test('stats migration preserves already-delivered notifications without fabricating old results', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new NodeURL('../migrations/0001_compact.sql', import.meta.url), 'utf8'));
  db.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('player#JP1', 'user-1', 'ap', 0);
  db.prepare('INSERT INTO notifications VALUES(?,?,?,?,?)').run('player#JP1', 'old', 'old text', 1, 1);
  db.exec(readFileSync(new NodeURL('../migrations/0002_act_stats.sql', import.meta.url), 'utf8'));
  const row = db.prepare('SELECT * FROM notifications').get()!;
  assert.equal(row.sent, 1); assert.equal(row.match_id, 'old'); assert.equal(row.outcome, null);
  db.close();
});
test('match details calculate KDA, ACS and hit-based HS rate; absent fields never become fake zeroes', () => {
  const game = match('details', 'competitive', false);
  const raw = JSON.parse(JSON.stringify(game));
  raw.metadata.map = { name: 'アセント' };
  raw.players[0].agent = { name: 'ジェット' };
  raw.players[0].stats = { kills: 24, deaths: 16, assists: 5, score: 5405, headshots: 6, bodyshots: 18, legshots: 1 };
  const details = resultMessage(raw, 'user-1', 'プレイヤーA')!.message;
  assert.match(details, /アセント｜ジェット/);
  assert.match(details, /24K \/ 16D \/ 5A｜ACS 235｜HS命中率 24.0%/);
  raw.metadata.queue.id = 'ggteam';
  assert.doesNotMatch(resultMessage(raw, 'user-1', 'プレイヤーA')!.message, /ACS/);
  raw.players[0].stats = { kills: 0, deaths: 0, assists: 0, score: 0, headshots: 0, bodyshots: 0, legshots: 0 };
  const zero = resultMessage(raw, 'user-1', 'プレイヤーA')!.message;
  assert.match(zero, /0K \/ 0D \/ 0A/);
  assert.doesNotMatch(zero, /HS命中率|NaN|Infinity/);
  delete raw.players[0].stats;
  assert.doesNotMatch(resultMessage(raw, 'user-1', 'プレイヤーA')!.message, /0K|ACS|HS命中率/);
});

test('performance-specific defeat taunts stay separate from win and draw comments', () => {
  const taunts = commentPools;
  for (const [kind, kills, deaths, ownScore] of [
    ['high_kills', 24, 16, 10], ['low_kd', 5, 20, 10], ['close_loss', 18, 16, 11], ['blowout', 18, 16, 3],
  ] as const) {
    const raw = JSON.parse(JSON.stringify(match(kind, 'competitive', false)));
    raw.players[0].stats = { kills, deaths, assists: 5 };
    raw.teams[1].rounds.won = ownScore;
    const loss = resultMessage(raw, 'user-1', 'プレイヤーA')!.message;
    const comment = loss.split('\n💬 ')[1];
    assert.ok(taunts[kind].includes(comment), 'Expected situational taunt for ' + kind);
    raw.teams[1].won = true; raw.teams[0].won = false;
    assert.ok(taunts.win_high_kills.concat(taunts.win_low_kd,taunts.win,taunts.close_win,taunts.blowout_win).includes(resultMessage(raw, 'user-1', 'プレイヤーA')!.message.split('\n💬 ')[1]));
    raw.teams[1].won = false;
    assert.ok(taunts.draw.includes(resultMessage(raw, 'user-1', 'プレイヤーA')!.message.split('\n💬 ')[1]));
  }
});

test('three and five losses switch taunts, override performance teasing, and stay stable on retries', async () => {
  const env = environment(); const original = globalThis.fetch;
  await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind('player#JP1', 'user-1', 'ap', 0).run();
  let games: ReturnType<typeof match>[] = [];
  const deliveries: string[] = [];
  let failures = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.henrikdev.xyz')) return Response.json({ data: games });
    deliveries.push(JSON.parse(String(init?.body)).content);
    return failures-- > 0 ? new Response('', { status: 500 }) : Response.json({ id: '1' });
  };
  try {
    const base = Date.now() - 10_000;
    for (let n = 1; n <= 5; n++) {
      const raw = JSON.parse(JSON.stringify(match('loss-' + n, 'competitive', false, base + n * 1000)));
      raw.players[0].stats = { kills: 24, deaths: 16, assists: 5 };
      games = [raw, ...games].slice(0, 2);
      await monitor(env, [{ riotId: 'player#JP1' }]);
      const content = deliveries.at(-1)!;
      assert.equal((content.match(/💬/g) ?? []).length, 3);
      if (n >= 3) {
        assert.match(content, new RegExp('現在：' + n + '連敗'));
        const group = n >= 5 ? 'long_losing_streak' : 'losing_streak';
        const comment = content.split('\n💬 ')[1];
        assert.ok(commentPools[group].some(line => line.replaceAll('{streak}', String(n)) === comment));
      }
    }
    games = [match('loss-six', 'competitive', false, base + 6000), ...games].slice(0, 2);
    failures = 1;
    await monitor(env, [{ riotId: 'player#JP1' }]);
    await env.DB.prepare("DELETE FROM monitor_state WHERE key='discord_after'").run();
    await monitor(env, [{ riotId: 'player#JP1' }]);
    assert.equal(deliveries.at(-1), deliveries.at(-2));
    assert.match(deliveries.at(-1)!, /6連敗/);
  } finally { globalThis.fetch = original; }
});

test('daily totals use Japanese midnight and isolate modes and players', async () => {
  const env = environment(); const original = globalThis.fetch; const clock = Date.now;
  Date.now = () => Date.parse('2026-10-25T00:01:00+09:00');
  await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind('player#JP1', 'user-1', 'ap', 0).run();
  await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind('other#JP1', 'user-2', 'ap', 0).run();
  await env.DB.prepare("INSERT INTO notifications(riot_id,match_id,message,ended_at,mode,act_id,act_name,outcome,sent) VALUES(?,?,?,?,?,?,?,?,?)")
    .bind('other#JP1', 'other-win', 'other', Date.parse('2026-10-25T00:00:00+09:00'), 'competitive', 'act-one', 'E9A1', 'win', 1).run();
  let games = [match('yesterday', 'competitive', false, Date.parse('2026-10-24T23:59:00+09:00'))];
  const messages: string[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.henrikdev.xyz')) return Response.json({ data: games });
    messages.push(JSON.parse(String(init?.body)).content); return Response.json({ id: '1' });
  };
  const config = [{ riotId: 'player#JP1' }, { riotId: 'other#JP1' }];
  // Give the other player's API request no new games; only player#JP1 receives these results.
  const responder = globalThis.fetch;
  globalThis.fetch = async (url, init) => String(url).includes('/pc/user-2') ? Response.json({ data: [] }) : responder(url, init);
  try {
    await monitor(env, config);
    games = [match('today', 'competitive', true, Date.parse('2026-10-25T00:00:00+09:00')), ...games];
    await monitor(env, config);
    assert.match(messages.at(-1)!, /今日（記録分）：1勝0敗/);
    assert.match(messages.at(-1)!, /ACT E9A1（記録分）：1勝1敗/);
    games = [match('arcade', 'ggteam', false, Date.parse('2026-10-25T00:00:30+09:00')), ...games].slice(0, 2);
    await monitor(env, config);
    assert.match(messages.at(-1)!, /今日（記録分）：0勝1敗/);
  } finally { globalThis.fetch = original; Date.now = clock; }
});
test('losing-streak recovery celebrates three or more losses once within the same ACT and mode', async () => {
  const original = globalThis.fetch;
  try {
    for (const scenario of ['two', 'three', 'five', 'draw', 'act', 'mode'] as const) {
      const env = environment();
      await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind('player#JP1', 'user-1', 'ap', 0).run();
      const base = Date.now() - 20_000;
      const losses = scenario === 'two' ? 2 : scenario === 'five' ? 5 : 3;
      for (let n = 0; n < losses; n++) {
        await env.DB.prepare(`INSERT INTO notifications(riot_id,match_id,message,ended_at,mode,act_id,act_name,outcome,sent)
          VALUES(?,?,?,?,?,?,?,?,?)`).bind('player#JP1', 'old-' + n, 'old', base + n * 1000, 'competitive', 'act-one', 'E9A1', 'loss', 1).run();
      }
      if (scenario === 'draw') {
        await env.DB.prepare(`INSERT INTO notifications(riot_id,match_id,message,ended_at,mode,act_id,act_name,outcome,sent)
          VALUES(?,?,?,?,?,?,?,?,?)`).bind('player#JP1', 'draw', 'draw', base + 7000, 'competitive', 'act-one', 'E9A1', 'draw', 1).run();
      }
      let game = match('recovery', scenario === 'mode' ? 'ggteam' : 'competitive', true, base + 10_000);
      if (scenario === 'act') game.metadata.season = { id: 'act-two', short: 'E9A2' };
      const deliveries: string[] = [];
      globalThis.fetch = async (url, init) => {
        if (String(url).includes('api.henrikdev.xyz')) return Response.json({ data: [game] });
        deliveries.push(JSON.parse(String(init?.body)).content); return Response.json({ id: '123' });
      };
      const config = [{ riotId: 'player#JP1' }];
      await monitor(env, config);
      if (scenario === 'three' || scenario === 'five') assert.match(deliveries[0], new RegExp('🎊 ' + losses + '連敗ストップ！'));
      else assert.doesNotMatch(deliveries[0], /🎊|連敗ストップ/);
      assert.equal((deliveries[0].match(/\n💬 /g) ?? []).length, 3);
      game = { ...game, metadata: { ...game.metadata, match_id: 'next-win', started_at: new Date(base + 11_000).toISOString() } };
      await monitor(env, config);
      assert.doesNotMatch(deliveries[1], /🎊|連敗ストップ/);
    }
  } finally { globalThis.fetch = original; }
});

test('same-match opponents share one post and failed delivery keeps every participant pending', async () => {
  const env = environment(); const original = globalThis.fetch;
  const config = [{ riotId: 'one#JP1', name: 'プレイヤーA' }, { riotId: 'two#JP1', name: 'プレイヤーC' }];
  for (const [index, player] of config.entries()) {
    await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind(player.riotId, 'user-' + (index + 1), 'ap', 0).run();
  }
  const game = match('together'); game.players.push({ puuid: 'user-2', team_id: 'blue' });
  const deliveries: Array<{ content: string; allowed_mentions: { parse: string[] } }> = [];
  let fails = true;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.henrikdev.xyz')) return Response.json({ data: [game] });
    assert.equal(init?.method, 'POST'); deliveries.push(JSON.parse(String(init?.body)));
    return fails ? new Response('', { status: 500 }) : Response.json({ id: '1440000000000000011' });
  };
  try {
    await monitor(env, config);
    assert.equal(deliveries.length, 1);
    assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE sent=0').first<{ n: number }>())!.n, 2);
    fails = false;
    await env.DB.prepare("DELETE FROM monitor_state WHERE key='discord_after'").run();
    await monitor(env, config); await monitor(env, config);
    assert.equal(deliveries.length, 2);
    assert.deepEqual(deliveries[0], deliveries[1]);
    assert.match(deliveries[1].content, /同じ試合の結果（2人）/);
    assert.match(deliveries[1].content, /プレイヤーAは13対10で勝ち/);
    assert.match(deliveries[1].content, /プレイヤーCは10対13で負け/);
    assert.match(deliveries[1].content, /1勝0敗/); assert.match(deliveries[1].content, /0勝1敗/);
    assert.deepEqual(deliveries[1].allowed_mentions, { parse: [] });
    assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE sent=0').first<{ n: number }>())!.n, 0);
  } finally { globalThis.fetch = original; }
});

test('late participants edit the existing same-match post, preserving snowflake precision and retrying edits', async () => {
  const env = environment(); const original = globalThis.fetch;
  const config = [{ riotId: 'one#JP1', name: 'プレイヤーA' }, { riotId: 'two#JP1', name: 'プレイヤーC' }];
  for (const [index, player] of config.entries()) {
    await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind(player.riotId, 'user-' + (index + 1), 'ap', 0).run();
  }
  const game = match('late'); game.players.push({ puuid: 'user-2', team_id: 'red' });
  let includeSecond = false; let failEdit = true;
  const requests: Array<{ url: string; method: string; content: string }> = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.henrikdev.xyz')) return Response.json({ data: !includeSecond && String(url).includes('/pc/user-2') ? [] : [includeSecond ? game : { ...game, players: game.players.slice(0, 1) }] });
    requests.push({ url: String(url), method: init!.method!, content: JSON.parse(String(init?.body)).content });
    return init?.method === 'PATCH' && failEdit ? new Response('', { status: 429, headers: { 'Retry-After': '60' } }) : Response.json({ id: '1440000000000000011' });
  };
  try {
    await monitor(env, config);
    assert.equal(requests.length, 1); assert.equal(requests[0].method, 'POST');
    assert.doesNotMatch(requests[0].content, /プレイヤーC/);
    const firstTiming = (await env.DB.prepare("SELECT value FROM monitor_state WHERE key='delivery:last'").first<{ value: string }>())!.value;
    includeSecond = true;
    await monitor(env, config);
    assert.equal(requests[1].method, 'PATCH');
    assert.match(requests[1].url, /\/messages\/1440000000000000011$/);
    await monitor(env, config); assert.equal(requests.length, 2);
    failEdit = false;
    await env.DB.prepare("DELETE FROM monitor_state WHERE key='discord_after'").run();
    await monitor(env, config); await monitor(env, config);
    assert.equal(requests.length, 3); assert.equal(requests[2].method, 'PATCH');
    assert.match(requests[2].content, /プレイヤーA/); assert.match(requests[2].content, /プレイヤーC/);
    assert.equal(requests[1].content, requests[2].content);
    assert.equal((await env.DB.prepare("SELECT value FROM monitor_state WHERE key='delivery:last'").first<{ value: string }>())!.value, firstTiming);
  } finally { globalThis.fetch = original; }
});

test('a deleted grouped message is replaced when a late participant arrives', async () => {
  const env = environment(); const original = globalThis.fetch;
  const config = [{ riotId: 'one#JP1' }, { riotId: 'two#JP1' }];
  for (const [index, player] of config.entries()) {
    await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind(player.riotId, 'user-' + (index + 1), 'ap', 0).run();
  }
  const game = match('deleted'); game.players.push({ puuid: 'user-2', team_id: 'red' });
  let late = false; const methods: string[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.henrikdev.xyz')) return Response.json({ data: !late && String(url).includes('/pc/user-2') ? [] : [late ? game : { ...game, players: game.players.slice(0, 1) }] });
    methods.push(init!.method!);
    return init?.method === 'PATCH' ? new Response('', { status: 404 }) : Response.json({ id: late ? '456' : '123' });
  };
  try {
    await monitor(env, config); late = true;
    await monitor(env, config); await monitor(env, config);
    assert.deepEqual(methods, ['POST', 'PATCH', 'POST']);
    assert.equal((await env.DB.prepare("SELECT value FROM monitor_state WHERE key='post:deleted'").first<{ value: string }>())!.value, '456');
  } finally { globalThis.fetch = original; }
});

test('large five-player groups preserve all details inside a single Discord message', async () => {
  const { groupNotification } = await import('../src/results.ts');
  const notices = Array.from({ length: 5 }, (_, n) => ({
    riot_id: 'player' + n, match_id: 'long', message: n + ':' + '詳細'.repeat(300), ended_at: 1,
    mode: null, act_id: null, act_name: null, outcome: null,
  }));
  const body = await groupNotification(environment().DB, notices);
  assert.ok(body.content.length <= 2000); assert.equal(body.embeds.length, 5);
  assert.ok(body.embeds.every((embed, n) => embed.description === notices[n].message && embed.description.length <= 4096));
  assert.ok(body.embeds.reduce((sum, embed) => sum + embed.description.length, 0) <= 6000);
});
test('defeat awards require complete teammate stats, honor ties, and never invent awards for wins', () => {
  const raw = JSON.parse(JSON.stringify(match('award', 'competitive', false)));
  raw.players = [24, 20, 19, 18, 17].map((kills, n) => ({ puuid: 'user-' + (n + 1), team_id: 'red', stats: { kills, deaths: 16, assists: 5 } }));
  raw.players.push({ puuid: 'enemy', team_id: 'blue', stats: { kills: 40 } });
  assert.match(resultMessage(raw, 'user-1', 'プレイヤーA')!.message, /🏅 負けても健闘賞：チーム最多キル！/);
  assert.doesNotMatch(resultMessage(raw, 'user-2', 'プレイヤーC')!.message, /健闘賞/);
  raw.players[1].stats.kills = 24;
  assert.match(resultMessage(raw, 'user-1', 'プレイヤーA')!.message, /チーム最多キル（同率）/);
  assert.match(resultMessage(raw, 'user-2', 'プレイヤーC')!.message, /チーム最多キル（同率）/);
  delete raw.players[4].stats;
  assert.doesNotMatch(resultMessage(raw, 'user-1', 'プレイヤーA')!.message, /健闘賞/);
  raw.players.pop(); raw.players.pop();
  assert.doesNotMatch(resultMessage(raw, 'user-1', 'プレイヤーA')!.message, /健闘賞/);
  raw.players.push({ puuid: 'user-5', team_id: 'red', stats: { kills: 10 } });
  raw.teams[1].won = true; raw.teams[0].won = false;
  assert.doesNotMatch(resultMessage(raw, 'user-1', 'プレイヤーA')!.message, /健闘賞/);
  raw.teams[1].won = false;
  assert.doesNotMatch(resultMessage(raw, 'user-1', 'プレイヤーA')!.message, /健闘賞/);
  raw.teams[0].won = true;
  raw.players.forEach((member: { stats: { kills: number } }) => { member.stats.kills = 0; });
  assert.doesNotMatch(resultMessage(raw, 'user-1', 'プレイヤーA')!.message, /健闘賞/);
});

test('pair history isolates teams, ACTs and modes, counts draws, and stays deduplicated', async () => {
  const env = environment(); const original = globalThis.fetch;
  const config = [{ riotId: 'one#JP1', name: 'プレイヤーA' }, { riotId: 'two#JP1', name: 'プレイヤーC' }];
  for (const [n, player] of config.entries()) {
    await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind(player.riotId, 'user-' + (n + 1), 'ap', 0).run();
  }
  let game = match('pair-first', 'competitive', true, Date.now() - 10_000);
  const deliveries: string[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.henrikdev.xyz')) return Response.json({ data: [game] });
    deliveries.push(JSON.parse(String(init?.body)).content); return Response.json({ id: '123' });
  };
  let ordinal = 0;
  const push = async (mode = 'competitive', win = true, act = 'act-one', opponent = false, draw = false) => {
    game = match('pair-' + ++ordinal, mode, win, Date.now() - 10_000 + ordinal * 1000);
    game.players.push({ puuid: 'user-2', team_id: opponent ? 'blue' : 'red' });
    game.metadata.season.id = act;
    if (draw) game.teams.forEach(team => { team.won = false; });
    await monitor(env, config);
    return deliveries.at(-1)!;
  };
  try {
    assert.match(await push(), /🤝 プレイヤーA＋プレイヤーC.*1勝0敗.*勝率100%/);
    assert.match(deliveries.at(-1)!, /相性はまだ調査中/);
    assert.match(await push('competitive', false), /🤝 プレイヤーA＋プレイヤーC.*1勝1敗.*勝率50%/);
    assert.doesNotMatch(await push('competitive', true, 'act-one', true), /🤝/);
    assert.match(await push('ggteam'), /🤝 プレイヤーA＋プレイヤーC.*1勝0敗/);
    assert.match(await push('competitive', true, 'act-two'), /🤝 プレイヤーA＋プレイヤーC.*1勝0敗/);
    const beforeDraw = deliveries.length;
    await push('competitive', false, 'act-one', false, true);
    assert.equal(deliveries.length, beforeDraw + 1);
    assert.match(deliveries.at(-1)!, /🤝 プレイヤーA＋プレイヤーC.*1勝1敗1分.*勝率50%/);
    assert.match(await push(), /🤝 プレイヤーA＋プレイヤーC.*2勝1敗1分.*勝率67%/);
    const count = deliveries.length;
    await monitor(env, config); assert.equal(deliveries.length, count);
  } finally { globalThis.fetch = original; }
});

test('pair summaries use each match time and switch comments only after five decisive games', async () => {
  const env = environment(); const original = globalThis.fetch;
  const config = [{ riotId: 'one#JP1' }, { riotId: 'two#JP1' }];
  for (const [n, player] of config.entries()) {
    await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind(player.riotId, 'user-' + (n + 1), 'ap', 0).run();
  }
  const base = Date.now() - 10_000;
  for (let n = 0; n < 3; n++) {
    for (const player of config) {
      await env.DB.prepare(`INSERT INTO notifications(riot_id,match_id,message,ended_at,mode,act_id,outcome,sent,team_id)
        VALUES(?,?,?,?,?,?,?,?,?)`).bind(player.riotId, 'previous-' + n, 'old', base + n * 1000, 'competitive', 'act-one', 'win', 1, 'red').run();
    }
  }
  const games = [match('fifth', 'competitive', true, base + 5000), match('fourth', 'competitive', true, base + 4000)];
  games.forEach(game => { game.players.push({ puuid: 'user-2', team_id: 'red' }); });
  const deliveries: string[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.henrikdev.xyz')) return Response.json({ data: games });
    deliveries.push(JSON.parse(String(init?.body)).content); return Response.json({ id: '123' });
  };
  try {
    await monitor(env, config);
    assert.equal(deliveries.length, 2);
    assert.match(deliveries[0], /🤝 one＋two.*4勝0敗/);
    assert.match(deliveries[0], /相性はまだ調査中/);
    assert.match(deliveries[1], /🤝 one＋two.*5勝0敗/);
    assert.match(deliveries[1], /このコンビ、解散禁止/);
  } finally { globalThis.fetch = original; }
});

test('ten pair combinations fit alongside five detailed player blocks without dropping pairs', async () => {
  const { groupNotification } = await import('../src/results.ts');
  const env = environment();
  const notices = Array.from({ length: 5 }, (_, n) => ({
    riot_id: 'player' + n + '#JP1', match_id: 'five', message: '詳細'.repeat(300), ended_at: Date.now(),
    mode: 'competitive', act_id: 'act-one', act_name: 'E9A1', outcome: 'win' as const, team_id: 'red',
  }));
  for (const notice of notices) {
    await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind(notice.riot_id, notice.riot_id, 'ap', 0).run();
    await env.DB.prepare(`INSERT INTO notifications(riot_id,match_id,message,ended_at,mode,act_id,outcome,sent,team_id)
      VALUES(?,?,?,?,?,?,?,?,?)`).bind(notice.riot_id, notice.match_id, notice.message, notice.ended_at, notice.mode, notice.act_id, notice.outcome, 0, notice.team_id).run();
  }
  const labels = new Map(notices.map((notice, n) => [notice.riot_id, String(n) + '長い名前'.repeat(20)]));
  const body = await groupNotification(env.DB, notices, labels);
  assert.ok(body.content.length <= 2000, String(body.content.length));
  assert.equal((body.content.match(/🤝/g) ?? []).length, 10);
  assert.equal(body.embeds.length, 5);
  assert.ok(body.embeds.every(embed => embed.description.length <= 4096));
  assert.ok(body.embeds.reduce((sum, embed) => sum + embed.description.length, 0) <= 6000);
});

test('pair migration preserves sent flags and leaves unverified historical teams unknown', () => {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0001_compact.sql', '0002_act_stats.sql']) db.exec(readFileSync(new NodeURL('../migrations/' + file, import.meta.url), 'utf8'));
  db.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('old#JP1', 'old', 'ap', 0);
  db.prepare('INSERT INTO notifications(riot_id,match_id,message,ended_at,sent) VALUES(?,?,?,?,?)').run('old#JP1', 'old-game', 'old', 1, 1);
  db.exec(readFileSync(new NodeURL('../migrations/0003_pair_teams.sql', import.meta.url), 'utf8'));
  const row = db.prepare('SELECT sent,team_id FROM notifications').get()!;
  assert.equal(row.sent, 1); assert.equal(row.team_id, null);
  db.close();
});
test('diagnostic logs identify API, migration and Discord failures without exposing credentials', async () => {
  const env = environment(); const originalFetch = globalThis.fetch;
  const info = console.info, warn = console.warn;
  const logs: unknown[][] = [];
  console.info = (...args) => { logs.push(args); };
  console.warn = (...args) => { logs.push(args); };
  env.HENRIK_API_KEY = 'do-not-log-henrik-secret';
  env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/123/do-not-log-discord-secret';
  const prepare = env.DB.prepare.bind(env.DB);
  let scenario = 'http';
  env.DB.prepare = (sql: string) => {
    if (scenario === 'migration' && sql.includes('INSERT OR IGNORE INTO notifications')) throw new Error('D1_ERROR: table notifications has no column named team_id');
    return prepare(sql);
  };
  await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind('player#JP1', 'user-1', 'ap', 0).run();
  globalThis.fetch = async url => {
    if (String(url).includes('api.henrikdev.xyz')) {
      if (scenario === 'http') return new Response('', { status: 401 });
      if (scenario === 'network') throw new Error('fetch failed: ' + env.HENRIK_API_KEY + ' ' + env.DISCORD_WEBHOOK_URL);
      return Response.json({ data: [match('diagnostic')] });
    }
    return scenario === 'discord' ? new Response('', { status: 403 }) : Response.json({ id: '123' });
  };
  try {
    const config = [{ riotId: 'player#JP1' }];
    await monitor(env, config);
    assert.ok(logs.some(entry => JSON.stringify(entry).includes('henrik_http_401')));
    scenario = 'network'; await monitor(env, config);
    scenario = 'migration'; await monitor(env, config);
    assert.ok(logs.some(entry => JSON.stringify(entry).includes('database_migration_missing')));
    scenario = 'discord'; await monitor(env, config);
    assert.ok(logs.some(entry => entry[0] === 'discord_post_failed' && JSON.stringify(entry).includes('403')));
    await env.DB.prepare("DELETE FROM monitor_state WHERE key='discord_after'").run();
    scenario = 'ok'; await monitor(env, config);
    assert.ok(logs.some(entry => entry[0] === 'discord_delivered'));
    const text = JSON.stringify(logs);
    assert.doesNotMatch(text, /do-not-log-henrik-secret|do-not-log-discord-secret|https:\/\/discord/);
  } finally {
    globalThis.fetch = originalFetch; console.info = info; console.warn = warn; env.DB.prepare = prepare;
  }
});
function unratedMatch(id = 'death-unrated') {
  const raw = {
    ...match(id, 'unrated'),
    rounds: Array.from({ length: 23 }, (_, id) => ({ id })),
    kills: [
      { round: 0, time_in_round_in_ms: 5000, victim: { puuid: 'user-1' } },
      { round: 22, time_in_round_in_ms: 10000, victim: { puuid: 'user-2' } },
      { round: 22, time_in_round_in_ms: 20000, victim: { puuid: 'enemy' } },
    ],
    players: Array.from({ length: 5 }, (_, n) => ({
      puuid: 'user-' + (n + 1), team_id: 'red',
      stats: { kills: 20, deaths: n < 2 ? 1 : 0, assists: 5, score: [6000, 3000, 4000, 5000, 1000][n] },
    })),
  };
  raw.players.push({ puuid: 'enemy', team_id: 'blue', stats: { kills: 5, deaths: 1, assists: 1, score: 1000 } });
  return raw;
}

test('death-unrated sends a player to competitive for any one condition, even after winning', async () => {
  const { deathUnratedVerdict } = await import('../src/death-unrated.ts');
  const safe = unratedMatch();
  assert.deepEqual(deathUnratedVerdict(safe, 'user-1'), { negativeKD: false, lastDeath: false, bottomACS: false, verdict: 'safe' });
  for (const kind of ['kd', 'last', 'bottom'] as const) {
    const raw = unratedMatch(kind);
    if (kind === 'kd') raw.players[0].stats.kills = 0;
    if (kind === 'last') { raw.kills[0].round = 22; raw.kills[0].time_in_round_in_ms = 15000; }
    if (kind === 'bottom') raw.players[0].stats.score = 500;
    const verdict = deathUnratedVerdict(raw, 'user-1');
    assert.equal(verdict.verdict, 'competitive', kind);
    assert.equal([verdict.negativeKD, verdict.lastDeath, verdict.bottomACS].filter(Boolean).length, 1, kind);
    const message = resultMessage(raw, 'user-1', 'プレイヤーA', true)!.message;
    assert.match(message, /プレイヤーA、コンペ行き確定/);
    assert.doesNotMatch(message, /（エスカレーション）|で負け|健闘賞/);
  }
  safe.players[0].stats.kills = safe.players[0].stats.deaths;
  assert.equal(deathUnratedVerdict(safe, 'user-1').negativeKD, false);
  assert.doesNotMatch(resultMessage(safe, 'user-1', 'プレイヤーA')!.message,/デスアンレ|コンペ行き/);
});

test('last-death uses the final round and own teammates, independent of kill-list order and opposing deaths', async () => {
  const { deathUnratedVerdict } = await import('../src/death-unrated.ts');
  const raw = unratedMatch();
  raw.kills[0].round = 22; raw.kills[0].time_in_round_in_ms = 15000;
  raw.kills.reverse(); raw.rounds.reverse();
  assert.equal(deathUnratedVerdict(raw, 'user-1').lastDeath, true, 'The later enemy death is irrelevant');
  assert.equal(deathUnratedVerdict(raw, 'user-2').lastDeath, false);
  raw.kills.find(kill => kill.victim.puuid === 'user-2')!.time_in_round_in_ms = 15000;
  assert.equal(deathUnratedVerdict(raw, 'user-2').lastDeath, true, 'Simultaneous last deaths both qualify');
  raw.kills.forEach(kill => { if (kill.victim.puuid.startsWith('user-')) kill.round = 0; });
  assert.equal(deathUnratedVerdict(raw, 'user-1').lastDeath, false, 'No own-team death in the final round means nobody qualifies');
});

test('ACS ties qualify at the exact score while rounded ACS does not manufacture a tie', async () => {
  const { deathUnratedVerdict } = await import('../src/death-unrated.ts');
  const raw = unratedMatch();
  raw.players[0].stats.score = 1000;
  assert.equal(deathUnratedVerdict(raw, 'user-1').bottomACS, true);
  raw.players[4].stats.score = 1001; raw.players[0].stats.score = 1002;
  assert.equal(Math.round(1001 / 23), Math.round(1002 / 23));
  assert.equal(deathUnratedVerdict(raw, 'user-1').bottomACS, false);
  raw.players[0].stats.score = 0; raw.players[4].stats.score = 0;
  assert.equal(deathUnratedVerdict(raw, 'user-1').bottomACS, true);
});

test('missing or inconsistent death history stays unknown rather than awarding a false safe verdict', async () => {
  const { deathUnratedVerdict } = await import('../src/death-unrated.ts');
  for (const kind of ['missing-rounds', 'missing-kills', 'missing-death', 'duplicate', 'bad-round', 'bad-time', 'missing-team', 'missing-score'] as const) {
    const raw = JSON.parse(JSON.stringify(unratedMatch()));
    if (kind === 'missing-rounds') delete raw.rounds;
    if (kind === 'missing-kills') delete raw.kills;
    if (kind === 'missing-death') raw.kills.shift();
    if (kind === 'duplicate') raw.kills.push(raw.kills[0]);
    if (kind === 'bad-round') raw.kills[0].round = 99;
    if (kind === 'bad-time') raw.kills[0].time_in_round_in_ms = -1;
    if (kind === 'missing-team') raw.players.splice(4, 1);
    if (kind === 'missing-score') delete raw.players[3].stats.score;
    assert.equal(deathUnratedVerdict(raw, 'user-1').verdict, 'unknown', kind);
    assert.match(resultMessage(raw, 'user-1', 'プレイヤーA', true)!.message, /判定保留/);
    raw.players[0].stats.kills = 0;
    assert.equal(deathUnratedVerdict(raw, 'user-1').verdict, 'competitive', 'A known KD failure is sufficient despite unavailable conditions');
  }
});

test('death-unrated shares one post, handles draws, and keeps its verdict separate from ACT statistics', async () => {
  const env = environment(); const original = globalThis.fetch;
  const config = [{ riotId: 'one#JP1', name: 'プレイヤーA' }, { riotId: 'two#JP1', name: 'プレイヤーC' }];
  for (const [n, player] of config.entries()) {
    await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind(player.riotId, 'user-' + (n + 1), 'ap', 0).run();
  }
  for (const riotId of ['one#JP1', 'two#JP1']) await env.DB.prepare('INSERT INTO death_unrated_sessions(riot_id,session_id,armed_at,expires_at) VALUES(?,?,?,?)').bind(riotId, 'session', Date.now() - 60_000, Date.now() + 3600_000).run();
  const raw = unratedMatch(); raw.teams.forEach(team => { team.won = false; });
  const messages: string[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.henrikdev.xyz')) return Response.json({ data: [raw] });
    messages.push(JSON.parse(String(init?.body)).content); return Response.json({ id: '123' });
  };
  try {
    await monitor(env, config); await monitor(env, config);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /デスアンレ判定（2人）/);
    assert.match(messages[0], /プレイヤーA、今回はセーフ/);
    assert.match(messages[0], /プレイヤーC、コンペ行き確定/);
    assert.doesNotMatch(messages[0], /ACT|連勝|連敗|🤝/);
    assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE sent=1').first<{ n: number }>())!.n, 2);
  } finally { globalThis.fetch = original; }
});

test('an unknown death-unrated verdict is edited in place once complete death data arrives', async () => {
  const env = environment(); const original = globalThis.fetch;
  await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind('one#JP1', 'user-1', 'ap', 0).run();
  for (const riotId of ['one#JP1', 'two#JP1']) await env.DB.prepare('INSERT INTO death_unrated_sessions(riot_id,session_id,armed_at,expires_at) VALUES(?,?,?,?)').bind(riotId, 'session', Date.now() - 60_000, Date.now() + 3600_000).run();
  const complete = unratedMatch(); let raw = JSON.parse(JSON.stringify(complete)); delete raw.rounds;
  const requests: Array<{ method: string; content: string }> = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.henrikdev.xyz')) return Response.json({ data: [raw] });
    requests.push({ method: init!.method!, content: JSON.parse(String(init?.body)).content }); return Response.json({ id: '123' });
  };
  try {
    const config = [{ riotId: 'one#JP1', name: 'プレイヤーA' }];
    await monitor(env, config);
    assert.match(requests[0].content, /判定保留/);
    raw = complete;
    await monitor(env, config); await monitor(env, config);
    assert.equal(requests.length, 2); assert.equal(requests[1].method, 'PATCH');
    assert.match(requests[1].content, /今回はセーフ/);
  } finally { globalThis.fetch = original; }
});


function deathInteraction(id: string, action: string, targets: string[] = [], mode?: string) {
  return {
    id, application_id: '111', type: 2, token: 'callback-token', guild_id: '222', member: { permissions: '32', user: { id: '444' } },
    data: { name: 'death', options: [{ type: 1, name: action, options: [...targets.map((value, n) => ({ type: 3, name: n ? 'player' + (n + 1) : 'player', value })),
      ...(mode ? [{ type: 3, name: 'mode', value: mode }] : [])] }] },
  };
}

function swiftMatch(id = 'death-swift') {
  const raw = unratedMatch(id); raw.metadata.queue.id = 'swiftplay';
  raw.rounds = Array.from({ length: 9 }, (_, id) => ({ id }));
  raw.kills.forEach(kill => { if (kill.round === 22) kill.round = 8; });
  raw.teams[0].rounds.won = 4; raw.teams[1].rounds.won = 5;
  return raw;
}
function deathSelection(id: string, parent: string, mode = 'swiftplay', userId = '444') {
  return { id, application_id: '111', type: 3, token: 'selection-callback-token', guild_id: '222',
    member: { permissions: '32', user: { id: userId } }, data: { custom_id: 'death_mode:' + parent, component_type: 3, values: [mode] } };
}

test('death reservations persist an explicit queue, preserve legacy unrated, and only the selected queue can claim them', async () => {
  const { runDeathCommand } = await import('../src/discord-interactions.ts');
  const { claimDeathMatch } = await import('../src/death-sessions.ts');
  const env = environment(), config = [{ riotId: 'one#JP1' }, { riotId: 'two#JP1' }];
  await env.DB.prepare('INSERT INTO death_unrated_sessions(riot_id,session_id,armed_at,expires_at) VALUES(?,?,?,?)')
    .bind('two#JP1', 'legacy', Date.now() - 1000, Date.now() + 7200_000).run();
  assert.match(await runDeathCommand(env.DB, deathInteraction('600', 'start', ['one#JP1'], 'swiftplay'), config), /次のスイフト1試合だけ対象/);
  const now = Date.now() + 1000;
  assert.equal(await claimDeathMatch(env.DB, 'one#JP1', 'wrong-unrated', now, now + 1000, 'unrated'), false);
  assert.equal(await claimDeathMatch(env.DB, 'two#JP1', 'wrong-swift', now, now + 1000, 'swiftplay'), false);
  assert.equal(await claimDeathMatch(env.DB, 'two#JP1', 'legacy-unrated', now, now + 1000, 'unrated'), true);
  assert.equal(await claimDeathMatch(env.DB, 'one#JP1', 'right-swift', now, now + 1000, 'swiftplay'), true);
  assert.equal(await claimDeathMatch(env.DB, 'one#JP1', 'second-swift', now, now + 1000, 'swiftplay'), false);
  const status = await runDeathCommand(env.DB, deathInteraction('601', 'status'), config);
  assert.match(status, /デススイフト：対象試合は決定済み/); assert.match(status, /デスアンレ：対象試合は決定済み/);
});

test('choosing another death mode switches a waiting reservation without resetting an identical choice or allowing stale command replay', async () => {
  const { runDeathCommand } = await import('../src/discord-interactions.ts');
  const { claimDeathMatch } = await import('../src/death-sessions.ts');
  const env = environment(), config = [{ riotId: 'one#JP1' }];
  const first = deathInteraction('610', 'start', ['one#JP1'], 'unrated');
  await runDeathCommand(env.DB, first, config);
  await runDeathCommand(env.DB, deathInteraction('611', 'start', ['one#JP1'], 'unrated'), config);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM death_unrated_sessions').first<{ n: number }>())!.n, 1);
  const result = await runDeathCommand(env.DB, deathInteraction('612', 'start', ['one#JP1'], 'swiftplay'), config);
  assert.match(result, /次のスイフト/);
  await runDeathCommand(env.DB, first, config);
  const now = Date.now() + 1000;
  assert.equal(await claimDeathMatch(env.DB, 'one#JP1', 'unrated-after-switch', now, now + 1000, 'unrated'), false);
  assert.equal(await claimDeathMatch(env.DB, 'one#JP1', 'swift-after-switch', now, now + 1000, 'swiftplay'), true);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM death_unrated_sessions WHERE match_id IS NULL AND cancelled_at IS NULL').first<{ n: number }>())!.n, 0);
  const before = (await env.DB.prepare('SELECT COUNT(*) AS n FROM death_unrated_sessions').first<{ n: number }>())!.n;
  assert.match(await runDeathCommand(env.DB, deathInteraction('613', 'start', ['one#JP1'], 'unsupported'), config), /モードは/);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM death_unrated_sessions').first<{ n: number }>())!.n, before);
});

test('mode menus reserve nothing until selection, bind to their operator, and cannot be selected twice or replayed to rearm', async () => {
  const { deathModePicker, selectDeathMode } = await import('../src/death-mode-picker.ts');
  const { runDeathCommand } = await import('../src/discord-interactions.ts');
  const env = environment(), config = [{ riotId: 'one#JP1', name: 'プレイヤーA' }];
  const request = deathInteraction('620', 'start', ['one#JP1']);
  const menu = await deathModePicker(env.DB, request, config);
  assert.ok(menu.components?.[0]?.components[0].options.some(option => option.value === 'custom'));
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM death_unrated_sessions').first<{ n: number }>())!.n, 0);
  assert.match(await selectDeathMode(env.DB, deathSelection('621', '620', 'swiftplay', '555'), config, runDeathCommand), /本人だけ/);
  assert.match(await selectDeathMode(env.DB, deathSelection('622', '620', 'unsupported'), config, runDeathCommand), /モードは/);
  const selection = deathSelection('623', '620');
  const result = await selectDeathMode(env.DB, selection, config, runDeathCommand);
  assert.match(result, /次のスイフト/);
  assert.equal(await selectDeathMode(env.DB, selection, config, runDeathCommand), result);
  assert.match(await selectDeathMode(env.DB, deathSelection('624', '620', 'unrated'), config, runDeathCommand), /選択済み/);
  await runDeathCommand(env.DB, deathInteraction('625', 'stop'), config);
  assert.equal(await selectDeathMode(env.DB, selection, config, runDeathCommand), result, 'Retry returns the old response but does not rearm after stop');
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM death_unrated_sessions WHERE cancelled_at IS NULL').first<{ n: number }>())!.n, 0);
  assert.equal((await deathModePicker(env.DB, request, config)).components?.length, 0);
  assert.doesNotMatch(JSON.stringify((await env.DB.prepare('SELECT * FROM discord_command_receipts').all()).results), /callback-token/);
});

test('expired, cancelled, superseded or changed-roster mode menus cannot create a later reservation', async () => {
  const { deathModePicker, selectDeathMode } = await import('../src/death-mode-picker.ts');
  const { runDeathCommand } = await import('../src/discord-interactions.ts');
  for (const kind of ['expired', 'cancelled', 'superseded', 'roster'] as const) {
    const env = environment(), config = [{ riotId: 'one#JP1' }];
    await deathModePicker(env.DB, deathInteraction('630', 'start', ['one#JP1']), config);
    if (kind === 'expired') await env.DB.prepare('UPDATE discord_command_receipts SET expires_at=0').run();
    if (kind === 'cancelled') await runDeathCommand(env.DB, deathInteraction('631', 'stop'), config);
    if (kind === 'superseded') await runDeathCommand(env.DB, deathInteraction('632', 'start', ['one#JP1'], 'unrated'), config);
    const result = await selectDeathMode(env.DB, deathSelection('633', '630'), kind === 'roster' ? [] : config, runDeathCommand);
    assert.match(result, /期限切れ|予約状態が変わって|対象者の登録が変わって/, kind);
    assert.equal(await env.DB.prepare("SELECT * FROM monitor_state WHERE key LIKE 'death_mode:%' AND value='swiftplay'").first(), null, kind);
  }
});

test('simultaneous mode selections can commit only one mode, and reservation plus mode roll back together', async () => {
  const { deathModePicker, selectDeathMode } = await import('../src/death-mode-picker.ts');
  const { runDeathCommand } = await import('../src/discord-interactions.ts');
  const env = environment(), config = [{ riotId: 'one#JP1' }, { riotId: 'two#JP1' }];
  await deathModePicker(env.DB, deathInteraction('640', 'start', ['all']), config);
  const results = await Promise.all([selectDeathMode(env.DB, deathSelection('641', '640'), config, runDeathCommand),
    selectDeathMode(env.DB, deathSelection('642', '640', 'unrated'), config, runDeathCommand)]);
  assert.ok(results.some(result => result.includes('選択済み')));
  const modes = (await env.DB.prepare("SELECT DISTINCT value FROM monitor_state WHERE key LIKE 'death_mode:%'").all<{ value: string }>()).results;
  assert.equal(modes.length, 1);
  const broken = environment(), batch = broken.DB.batch.bind(broken.DB);
  broken.DB.batch = async queries => batch([...queries, broken.DB.prepare('INSERT INTO no_such_table VALUES(1)')]);
  assert.match(await runDeathCommand(broken.DB, deathInteraction('643', 'start', ['all'], 'swiftplay'), config), /操作結果を確認できません/);
  assert.equal((await broken.DB.prepare('SELECT COUNT(*) AS n FROM death_unrated_sessions').first<{ n: number }>())!.n, 0);
  assert.equal(await broken.DB.prepare("SELECT * FROM monitor_state WHERE key LIKE 'death_mode:%'").first(), null);
});

test('a stop committed during menu selection cannot be undone by the older menu transaction', async () => {
  const { deathModePicker, selectDeathMode } = await import('../src/death-mode-picker.ts');
  const { runDeathCommand } = await import('../src/discord-interactions.ts');
  const env = environment(), config = [{ riotId: 'one#JP1' }, { riotId: 'two#JP1' }];
  await deathModePicker(env.DB, deathInteraction('644', 'start', ['all']), config);
  const result = await selectDeathMode(env.DB, deathSelection('645', '644'), config, async (db, interaction, players, expected) => {
    await runDeathCommand(db, deathInteraction('646', 'stop', ['two#JP1']), players);
    return runDeathCommand(db, interaction, players, expected);
  });
  assert.match(result, /予約状態が変わって/);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM death_unrated_sessions').first<{ n: number }>())!.n, 0, 'No participant in a stale multi-player menu is reserved');
  assert.equal(await env.DB.prepare("SELECT * FROM monitor_state WHERE key LIKE 'death_apply:%'").first(), null);
});

test('swift death verdicts use swift rounds and ACS, stay separate from normal results, and still handle revivals', async () => {
  const { deathUnratedVerdict } = await import('../src/death-unrated.ts');
  const { groupNotification } = await import('../src/results.ts');
  const env = environment(), raw = swiftMatch();
  const normal = resultMessage(raw, 'user-1', 'A')!, death = resultMessage(raw, 'user-1', 'A', true)!;
  assert.equal(normal.mode, 'swiftplay'); assert.doesNotMatch(normal.message, /デススイフト|デスアンレ/);
  assert.equal(death.mode, 'death_swiftplay'); assert.match(death.message, /デススイフト/); assert.match(death.message, /ACS 667/);
  assert.equal(deathUnratedVerdict(raw, 'user-1').verdict, 'safe');
  raw.kills[0].round = 8; raw.kills[0].time_in_round_in_ms = 15000;
  assert.equal(deathUnratedVerdict(raw, 'user-1').lastDeath, true);
  const notices = ['user-1', 'user-2'].map((puuid, n) => { const result = resultMessage(raw, puuid, 'P' + n, true)!;
    return { riot_id: ['one#JP1', 'two#JP1'][n], match_id: raw.metadata.match_id, message: result.message, ended_at: result.endedAt,
      mode: result.mode, act_id: result.actId, act_name: result.actName, outcome: result.outcome, team_id: result.teamId }; });
  const content = (await groupNotification(env.DB, notices)).content;
  assert.match(content, /デススイフト判定（2人）/); assert.doesNotMatch(content, /デスアンレ|ACT|連勝|連敗|🤝/);
});

test('a swift reservation ignores unrated and other queues, consumes one swift, and retries missing details in that same mode', async () => {
  const { runDeathCommand } = await import('../src/discord-interactions.ts');
  const env = environment(), original = globalThis.fetch, clock = Date.now;
  let now = Date.now(); Date.now = () => now;
  const config = [{ riotId: 'one#JP1', name: 'プレイヤーA' }];
  await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind('one#JP1', 'user-1', 'ap', 0).run();
  const posts: Array<{ method: string; content: string }> = []; let details = 0;
  let games: unknown[] = [];
  const complete = swiftMatch('swift-details');
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/by-puuid/matches/')) return Response.json({ data: games });
    if (String(url).includes('/valorant/v4/match/')) { details++; return Response.json({ data: complete }); }
    posts.push({ method: init!.method!, content: JSON.parse(String(init?.body)).content }); return Response.json({ id: '123' });
  };
  try {
    await runDeathCommand(env.DB, deathInteraction('650', 'start', ['one#JP1'], 'swiftplay'), config);
    now += 5000;
    const other = unratedMatch('ordinary-unrated'); other.metadata.started_at = new Date(now - 1000).toISOString();
    games = [other, match('ordinary-tdm', 'hurm', true, now)]; await monitor(env, config);
    assert.equal((await env.DB.prepare('SELECT match_id FROM death_unrated_sessions WHERE riot_id=?').bind('one#JP1').first<{ match_id: string | null }>())!.match_id, null);
    assert.ok(posts.every(post => !post.content.includes('デスアンレ') && !post.content.includes('デススイフト')));
    complete.metadata.started_at = new Date(now).toISOString(); now += 2000;
    const partial = JSON.parse(JSON.stringify(complete)); delete partial.rounds;
    games = [partial]; await monitor(env, config); await monitor(env, config);
    assert.equal(details, 1); assert.match(posts.at(-1)!.content, /デススイフト/); assert.match(posts.at(-1)!.content, /今回はセーフ/);
    assert.equal(posts.at(-1)!.method, 'PATCH');
    now += 2000; const next = swiftMatch('next-ordinary-swift'); next.metadata.started_at = new Date(now).toISOString();
    games = [next]; await monitor(env, config);
    assert.doesNotMatch(posts.at(-1)!.content, /デススイフト/);
  } finally { globalThis.fetch = original; Date.now = clock; }
});

test('cancelled swift reservations suppress pending posts and disappear from the waiting count', async () => {
  const { runDeathCommand } = await import('../src/discord-interactions.ts');
  const { runValoCommand } = await import('../src/valo-queries.ts');
  const env = environment(), original = globalThis.fetch;
  const config = [{ riotId: 'one#JP1' }];
  await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind('one#JP1', 'user-1', 'ap', 0).run();
  await runDeathCommand(env.DB, deathInteraction('660', 'start', ['one#JP1'], 'swiftplay'), config);
  const raw = swiftMatch('cancel-swift'); raw.metadata.started_at = new Date(Date.now() + 10).toISOString();
  let attempts = 0;
  globalThis.fetch = async (url) => String(url).includes('api.henrikdev.xyz') ? Response.json({ data: [raw] }) : (++attempts, new Response('', { status: 503 }));
  try {
    await monitor(env, config); assert.equal(attempts, 1);
    await runDeathCommand(env.DB, deathInteraction('661', 'stop'), config);
    await env.DB.prepare("DELETE FROM monitor_state WHERE key='discord_after'").run();
    await monitor(env, config); assert.equal(attempts, 1);
    const state = await runValoCommand(env.DB, { ...deathInteraction('662', 'status'), data: { name: 'valo', options: [{ type: 1, name: 'status' }] } }, config);
    assert.match(state, /送信待ち：0/);
  } finally { globalThis.fetch = original; }
});

test('an unrelated missing death no longer hides a provable non-last-death result', async () => {
  const { lastDeathCheck, deathUnratedVerdict } = await import('../src/death-unrated.ts');
  const raw = unratedMatch();
  raw.players[3].stats.deaths = 1; // A teammate's event is missing; which round is not known.
  assert.equal(lastDeathCheck(raw, 'user-1').value, false, 'This player has no final-round death and all their own deaths are present');
  assert.equal(deathUnratedVerdict(raw, 'user-1').verdict, 'safe');
  assert.equal(lastDeathCheck(raw, 'user-2').value, null, 'A missing later death could still change who was last');
  assert.equal(lastDeathCheck(raw, 'user-2').reason, 'missing_team_deaths');
  raw.kills[0].round = 22; raw.kills[0].time_in_round_in_ms = 5000;
  assert.equal(lastDeathCheck(raw, 'user-1').reason, 'later_teammate_death');
  raw.players[0].stats.deaths = 2; // Could have been revived and died again after the visible deaths.
  assert.equal(lastDeathCheck(raw, 'user-1').value, null);
  assert.equal(lastDeathCheck(raw, 'user-1').reason, 'missing_personal_deaths');
});

test('zero deaths, resurrections and one-based rounds keep the last-death rule precise', async () => {
  const { lastDeathCheck } = await import('../src/death-unrated.ts');
  const noDeaths = unratedMatch();
  noDeaths.kills.shift(); noDeaths.players[0].stats.deaths = 0; noDeaths.players[3].stats.deaths = 5;
  assert.equal(lastDeathCheck(noDeaths, 'user-1').value, false);
  const revived = unratedMatch();
  revived.kills[0].round = 22; revived.kills[0].time_in_round_in_ms = 5000;
  revived.kills.push({ round: 22, time_in_round_in_ms: 15000, victim: { puuid: 'user-1' } });
  revived.players[0].stats.deaths = 2;
  assert.equal(lastDeathCheck(revived, 'user-1').value, true);
  assert.equal(lastDeathCheck(revived, 'user-2').value, false);
  revived.rounds.forEach(round => round.id++); revived.kills.forEach(kill => kill.round++);
  assert.equal(lastDeathCheck(revived, 'user-1').value, true);
});

test('truncated round histories are not treated as a final round and unknown messages explain why', async () => {
  const { lastDeathCheck } = await import('../src/death-unrated.ts');
  const truncated = unratedMatch(); truncated.rounds.pop();
  assert.equal(lastDeathCheck(truncated, 'user-1').value, null);
  assert.equal(lastDeathCheck(truncated, 'user-1').reason, 'invalid_rounds');
  assert.match(resultMessage(truncated, 'user-1', 'プレイヤーA', true)!.message, /最終ラウンドを特定できない/);
  const missing = unratedMatch(); missing.kills.shift();
  assert.match(resultMessage(missing, 'user-1', 'プレイヤーA', true)!.message, /本人のデス履歴が不足/);
  const teammate = unratedMatch(); teammate.players[3].stats.deaths = 1;
  assert.match(resultMessage(teammate, 'user-2', 'プレイヤーB', true)!.message, /味方のデス履歴が不足/);
});

test('reserved unknown results fetch shared details once, edit the original post and retain verified evidence', async () => {
  const env = environment(), original = globalThis.fetch;
  const config = [{ riotId: 'one#JP1', name: 'プレイヤーA' }, { riotId: 'two#JP1', name: 'プレイヤーB' }];
  for (const [n, player] of config.entries()) {
    await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind(player.riotId, 'user-' + (n + 1), 'ap', 0).run();
    await env.DB.prepare('INSERT INTO death_unrated_sessions(riot_id,session_id,armed_at,expires_at) VALUES(?,?,?,?)')
      .bind(player.riotId, 'reserved', Date.now() - 60_000, Date.now() + 3600_000).run();
  }
  const complete = unratedMatch('details-fill'); complete.kills[0].round = 22; complete.kills[0].time_in_round_in_ms = 15000;
  const partial = JSON.parse(JSON.stringify(complete)); delete partial.rounds;
  let detailRequests = 0;
  const posts: Array<{ method: string; content: string }> = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/by-puuid/matches/')) return Response.json({ data: [partial] });
    if (String(url).includes('/valorant/v4/match/')) {
      detailRequests++;
      assert.equal(posts.length, 1, 'The initial notification must be delivered before requesting details');
      return Response.json({ data: complete });
    }
    posts.push({ method: init!.method!, content: JSON.parse(String(init?.body)).content });
    return Response.json({ id: '123' });
  };
  try {
    await monitor(env, config); await monitor(env, config);
    assert.equal(detailRequests, 1, 'Shared players and repeated history must not refetch resolved details');
    assert.equal(posts.length, 2); assert.equal(posts[0].method, 'POST'); assert.equal(posts[1].method, 'PATCH');
    assert.match(posts[0].content, /ラウンド履歴が未取得/);
    assert.match(posts[1].content, /プレイヤーA、コンペ行き確定/);
    assert.match(posts[1].content, /プレイヤーB、今回はセーフ/);
    assert.doesNotMatch(posts[1].content, /データ不足/);
    assert.equal((await env.DB.prepare('SELECT value FROM monitor_state WHERE key=?').bind('death_last:details-fill:user-1').first<{ value: string }>())!.value, 'true');
  } finally { globalThis.fetch = original; }
});

test('detail failures preserve the first post and retry only after the per-match five-minute cooldown', async () => {
  const env = environment(), original = globalThis.fetch;
  await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind('one#JP1', 'user-1', 'ap', 0).run();
  await env.DB.prepare('INSERT INTO death_unrated_sessions(riot_id,session_id,armed_at,expires_at) VALUES(?,?,?,?)')
    .bind('one#JP1', 'reserved', Date.now() - 60_000, Date.now() + 3600_000).run();
  const complete = unratedMatch('detail-retry'), partial = JSON.parse(JSON.stringify(complete)); delete partial.rounds;
  let detailRequests = 0; const posts: string[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/by-puuid/matches/')) return Response.json({ data: [partial] });
    if (String(url).includes('/valorant/v4/match/')) return ++detailRequests === 1 ? new Response('', { status: 503 }) : Response.json({ data: complete });
    posts.push(JSON.parse(String(init?.body)).content); return Response.json({ id: '123' });
  };
  try {
    const config = [{ riotId: 'one#JP1' }];
    await monitor(env, config); await monitor(env, config);
    assert.equal(detailRequests, 1); assert.equal(posts.length, 1); assert.match(posts[0], /判定保留/);
    await env.DB.prepare("UPDATE monitor_state SET value='0' WHERE key=?").bind('death_detail_after:detail-retry').run();
    await monitor(env, config);
    assert.equal(detailRequests, 2); assert.equal(posts.length, 2); assert.match(posts[1], /今回はセーフ/);
  } finally { globalThis.fetch = original; }
});

test('foreign, unfinished or malformed details cannot resolve a reserved verdict', async () => {
  const original = globalThis.fetch;
  try {
    for (const kind of ['match', 'queue', 'started', 'unfinished', 'player', 'team', 'duplicate-player', 'duration', 'outcome', 'team-list'] as const) {
      const env = environment();
      await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind('one#JP1', 'user-1', 'ap', 0).run();
      await env.DB.prepare('INSERT INTO death_unrated_sessions(riot_id,session_id,armed_at,expires_at) VALUES(?,?,?,?)')
        .bind('one#JP1', 'reserved', Date.now() - 60_000, Date.now() + 3600_000).run();
      const complete = unratedMatch('foreign-' + kind), partial = JSON.parse(JSON.stringify(complete)); delete partial.rounds;
      if (kind === 'match') complete.metadata.match_id = 'another-match';
      if (kind === 'queue') complete.metadata.queue.id = 'competitive';
      if (kind === 'started') complete.metadata.started_at = new Date(0).toISOString();
      if (kind === 'unfinished') complete.metadata.is_completed = false;
      if (kind === 'player') complete.players[0].puuid = 'another-player';
      if (kind === 'team') complete.players[0].team_id = 'blue';
      if (kind === 'duplicate-player') complete.players[4].puuid = complete.players[3].puuid;
      if (kind === 'duration') complete.metadata.game_length_in_ms = 0;
      if (kind === 'outcome') complete.teams.forEach(team => { team.won = true; });
      if (kind === 'team-list') complete.teams[1].team_id = complete.teams[0].team_id;
      const posts: string[] = [];
      globalThis.fetch = async (url, init) => {
        if (String(url).includes('/by-puuid/matches/')) return Response.json({ data: [partial] });
        if (String(url).includes('/valorant/v4/match/')) return Response.json({ data: complete });
        posts.push(JSON.parse(String(init?.body)).content); return Response.json({ id: '123' });
      };
      await monitor(env, [{ riotId: 'one#JP1' }]);
      assert.equal(posts.length, 1, kind); assert.match(posts[0], /判定保留/, kind);
      assert.equal(await env.DB.prepare("SELECT value FROM monitor_state WHERE key LIKE 'death_last:%'").first(), null, kind);
    }
  } finally { globalThis.fetch = original; }
});

test('rate-limited details preserve the initial post and pause all polling until the API retry time', async () => {
  const env = environment(), original = globalThis.fetch;
  const config = [{ riotId: 'one#JP1' }, { riotId: 'two#JP1' }];
  for (const [n, player] of config.entries()) {
    await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind(player.riotId, 'user-' + (n + 1), 'ap', 0).run();
  }
  await env.DB.prepare('INSERT INTO death_unrated_sessions(riot_id,session_id,armed_at,expires_at) VALUES(?,?,?,?)')
    .bind('one#JP1', 'reserved', Date.now() - 60_000, Date.now() + 3600_000).run();
  const partial = JSON.parse(JSON.stringify(unratedMatch('detail-limit'))); delete partial.rounds;
  const paths: string[] = [], methods: string[] = [];
  globalThis.fetch = async (url, init) => {
    const path = String(url);
    if (path.includes('api.henrikdev.xyz')) {
      paths.push(path);
      return path.includes('/valorant/v4/match/') ? new Response('', { status: 429, headers: { 'Retry-After': '90' } }) : Response.json({ data: [partial] });
    }
    methods.push(init!.method!); return Response.json({ id: '123' });
  };
  try {
    await monitor(env, config); await monitor(env, config);
    assert.equal(paths.length, 2, 'The detail limit must stop the next player and the next cron run');
    assert.deepEqual(methods, ['POST'], 'The reserved and ordinary results are delivered together before the API limit');
    assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE sent=1').first<{ n: number }>())!.n, 2);
    const wait = (await env.DB.prepare("SELECT value FROM monitor_state WHERE key='api_after'").first<{ value: string }>())!;
    assert.ok(Number(wait.value) > Date.now() + 80_000);
    assert.equal(await env.DB.prepare("SELECT value FROM monitor_state WHERE key LIKE 'death_last:%'").first(), null);
  } finally { globalThis.fetch = original; }
});

test('ordinary, cancelled and already-resolved unrated games never request additional details', async () => {
  const original = globalThis.fetch;
  try {
    for (const kind of ['ordinary', 'cancelled', 'resolved'] as const) {
      const env = environment();
      await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind('one#JP1', 'user-1', 'ap', 0).run();
      if (kind !== 'ordinary') await env.DB.prepare('INSERT INTO death_unrated_sessions(riot_id,session_id,armed_at,expires_at,cancelled_at) VALUES(?,?,?,?,?)')
        .bind('one#JP1', 'reserved', Date.now() - 60_000, Date.now() + 3600_000, kind === 'cancelled' ? Date.now() : null).run();
      const raw = JSON.parse(JSON.stringify(unratedMatch())); if (kind !== 'resolved') delete raw.rounds;
      let details = 0;
      globalThis.fetch = async (url) => {
        if (String(url).includes('/by-puuid/matches/')) return Response.json({ data: [raw] });
        if (String(url).includes('/valorant/v4/match/')) { details++; throw new Error('Unexpected details request'); }
        return Response.json({ id: '123' });
      };
      await monitor(env, [{ riotId: 'one#JP1' }]);
      assert.equal(details, 0, kind);
    }
  } finally { globalThis.fetch = original; }
});

test('only one unresolved match is enriched per monitor run; another reservation can progress on the next run', async () => {
  const env = environment(), original = globalThis.fetch;
  const config = [{ riotId: 'one#JP1' }, { riotId: 'two#JP1' }];
  const games = [unratedMatch('budget-first'), unratedMatch('budget-second')];
  games.forEach((game, n) => { game.metadata.started_at = new Date(Date.now() - 20_000 + n * 5000).toISOString(); });
  for (const [n, player] of config.entries()) {
    await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind(player.riotId, 'user-' + (n + 1), 'ap', 0).run();
    await env.DB.prepare('INSERT INTO death_unrated_sessions(riot_id,session_id,armed_at,expires_at,match_id) VALUES(?,?,?,?,?)')
      .bind(player.riotId, 'reserved', Date.now() - 60_000, Date.now() + 3600_000, games[n].metadata.match_id).run();
  }
  const partial = JSON.parse(JSON.stringify(games)); partial.forEach((game: { rounds?: unknown }) => { delete game.rounds; });
  const details: string[] = [];
  globalThis.fetch = async (url) => {
    if (String(url).includes('/by-puuid/matches/')) return Response.json({ data: partial });
    if (String(url).includes('/valorant/v4/match/')) {
      const id = String(url).split('/').at(-1)!; details.push(id); return Response.json({ data: games.find(game => game.metadata.match_id === id) });
    }
    return Response.json({ id: '123' });
  };
  try {
    await monitor(env, config); assert.deepEqual(details, ['budget-first']);
    await monitor(env, config); assert.deepEqual(details, ['budget-first', 'budget-second']);
  } finally { globalThis.fetch = original; }
});

test('cancelling a reservation while details are being fetched prevents a late verdict update', async () => {
  const env = environment(), original = globalThis.fetch;
  await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind('one#JP1', 'user-1', 'ap', 0).run();
  await env.DB.prepare('INSERT INTO death_unrated_sessions(riot_id,session_id,armed_at,expires_at) VALUES(?,?,?,?)')
    .bind('one#JP1', 'reserved', Date.now() - 60_000, Date.now() + 3600_000).run();
  const complete = unratedMatch('detail-cancel'), partial = JSON.parse(JSON.stringify(complete)); delete partial.rounds;
  const methods: string[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/by-puuid/matches/')) return Response.json({ data: [partial] });
    if (String(url).includes('/valorant/v4/match/')) {
      await env.DB.prepare('UPDATE death_unrated_sessions SET cancelled_at=?').bind(Date.now()).run();
      return Response.json({ data: complete });
    }
    methods.push(init!.method!); return Response.json({ id: '123' });
  };
  try {
    await monitor(env, [{ riotId: 'one#JP1' }]); assert.deepEqual(methods, ['POST']);
    assert.equal(await env.DB.prepare("SELECT value FROM monitor_state WHERE key LIKE 'death_last:%'").first(), null);
  } finally { globalThis.fetch = original; }
});

test('ordinary unrated is monitored separately; only the first reserved match gets a death verdict', async () => {
  const { runDeathCommand } = await import('../src/discord-interactions.ts');
  const env = environment(); const original = globalThis.fetch; const clock = Date.now;
  let now = Date.now(); Date.now = () => now;
  const config = [{ riotId: 'one#JP1', name: 'プレイヤーA' }];
  await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind('one#JP1', 'user-1', 'ap', 0).run();
  await env.DB.prepare(`INSERT INTO notifications(riot_id,match_id,message,ended_at,mode,outcome,sent)
    VALUES(?,?,?,?,?,?,?)`).bind('one#JP1', 'legacy-global-unrated', '旧版の誤対象', now - 1000, 'unrated', 'win', 0).run();
  let games = [unratedMatch('ordinary-before')]; const messages: string[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.henrikdev.xyz')) return Response.json({ data: games });
    messages.push(JSON.parse(String(init?.body)).content); return Response.json({ id: '123' });
  };
  try {
    await monitor(env, config); assert.equal(messages.length, 1);assert.doesNotMatch(messages[0],/デスアンレ|旧版の誤対象/);
    await runDeathCommand(env.DB, deathInteraction('1', 'start', ['one#JP1']), config);
    await monitor(env, config); assert.equal(messages.length, 1, 'A previously monitored match cannot become a death verdict');
    now += 60_000;
    const first = unratedMatch('reserved-first');
    now += 60_000;
    const second = unratedMatch('ordinary-after');
    games = [second, first];
    await monitor(env, config); await monitor(env, config);
    assert.equal(messages.length, 3);assert.match(messages[1],/デスアンレ/);assert.doesNotMatch(messages[2],/デスアンレ/);
    const session = await env.DB.prepare('SELECT match_id FROM death_unrated_sessions WHERE riot_id=?').bind('one#JP1').first<{ match_id: string }>();
    assert.equal(session!.match_id, 'reserved-first');
    assert.match(await runDeathCommand(env.DB, deathInteraction('2', 'status'), config), /次の予約はOFF/);
  } finally { globalThis.fetch = original; Date.now = clock; }
});

test('reservations select participants explicitly and cancellation suppresses failed-send retries and late verdict edits', async () => {
  const { runDeathCommand } = await import('../src/discord-interactions.ts');
  const env = environment(); const original = globalThis.fetch;
  const config = [{ riotId: 'one#JP1', name: 'プレイヤーA' }, { riotId: 'two#JP1', name: 'プレイヤーC' }];
  for (const [n, player] of config.entries()) await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind(player.riotId, 'user-' + (n + 1), 'ap', 0).run();
  await env.DB.prepare('INSERT INTO death_unrated_sessions(riot_id,session_id,armed_at,expires_at) VALUES(?,?,?,?)')
    .bind('one#JP1', '1', Date.now() - 60000, Date.now() + 3600000).run();
  const raw = unratedMatch(); let games = [raw]; const messages: string[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.henrikdev.xyz')) return Response.json({ data: games });
    messages.push(JSON.parse(String(init?.body)).content); return messages.length===1?new Response('',{status:500}):Response.json({id:'123'});
  };
  try {
    await monitor(env, config);
    assert.equal(messages.length, 1); assert.match(messages[0], /プレイヤーA、.*デスアンレ/);assert.doesNotMatch(messages[0],/プレイヤーC、.*デスアンレ/);
    await runDeathCommand(env.DB, deathInteraction('2', 'stop', ['one#JP1']), config);
    await env.DB.prepare("DELETE FROM monitor_state WHERE key='discord_after'").run();
    await monitor(env, config); assert.equal(messages.length, 2);assert.doesNotMatch(messages[1],/デスアンレ|プレイヤーA/);
    games = [JSON.parse(JSON.stringify(match('regular-competitive')))];
    await monitor(env, config); assert.equal(messages.length, 3);
    assert.match(messages[2], /コンペ）/);
  } finally { globalThis.fetch = original; }
});

test('command receipts prevent replay from rearming completed sessions or cancelling a newer reservation', async () => {
  const { runDeathCommand } = await import('../src/discord-interactions.ts');
  const env = environment(); const config = [{ riotId: 'one#JP1', name: 'プレイヤーA' }];
  const start = deathInteraction('10', 'start', ['one#JP1']);
  const first = await runDeathCommand(env.DB, start, config);
  assert.match(first, /次のアンレ1試合だけ対象/);
  await runDeathCommand(env.DB, deathInteraction('11', 'start', ['one#JP1']), config);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM death_unrated_sessions').first<{ n: number }>())!.n, 1, 'An existing waiting reservation is preserved');
  await env.DB.prepare("UPDATE death_unrated_sessions SET match_id='completed'").run();
  assert.equal(await runDeathCommand(env.DB, start, config), first);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM death_unrated_sessions WHERE match_id IS NULL').first<{ n: number }>())!.n, 0);
  const stop = deathInteraction('12', 'stop'); await runDeathCommand(env.DB, stop, config);
  await runDeathCommand(env.DB, deathInteraction('13', 'start', ['one#JP1']), config);
  await runDeathCommand(env.DB, stop, config);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM death_unrated_sessions WHERE match_id IS NULL AND cancelled_at IS NULL').first<{ n: number }>())!.n, 1);
  assert.match(await runDeathCommand(env.DB, deathInteraction('14', 'start', ["unknown' OR 1=1#JP1"]), config), /登録から外れた/);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM death_unrated_sessions').first<{ n: number }>())!.n, 2);
});

test('expired reservations do not capture ordinary matches and can be replaced without capturing a previous match again', async () => {
  const { runDeathCommand } = await import('../src/discord-interactions.ts');
  const { claimDeathMatch } = await import('../src/death-sessions.ts');
  const env = environment(); const config = [{ riotId: 'one#JP1' }]; const clock = Date.now;
  let now = Date.now(); Date.now = () => now;
  try {
    await runDeathCommand(env.DB, deathInteraction('1', 'start', ['one#JP1']), config);
    now += 3 * 3600000;
    assert.equal(await claimDeathMatch(env.DB, 'one#JP1', 'expired-game', now - 1000, now), false);
    assert.match(await runDeathCommand(env.DB, deathInteraction('2', 'status'), config), /予約期限切れ/);
    await runDeathCommand(env.DB, deathInteraction('3', 'start', ['one#JP1']), config);
    assert.equal(await claimDeathMatch(env.DB, 'one#JP1', 'older-game', now - 1000, now + 1000), false);
    assert.equal(await claimDeathMatch(env.DB, 'one#JP1', 'first', now + 1000, now + 2000), true);
    now += 5000;
    await runDeathCommand(env.DB, deathInteraction('4', 'start', ['one#JP1']), config);
    assert.equal(await claimDeathMatch(env.DB, 'one#JP1', 'first', now - 4000, now - 3000), true, 'Already selected history belongs to the old session');
    assert.equal(await claimDeathMatch(env.DB, 'one#JP1', 'second', now + 1000, now + 2000), true);
    assert.equal((await env.DB.prepare("SELECT match_id FROM death_unrated_sessions WHERE session_id='4'").first<{ match_id: string }>())!.match_id, 'second');
  } finally { Date.now = clock; }
});

test('Discord HTTP verification rejects invalid signatures, replays, wrong guilds and insufficient permissions before changing state', async () => {
  const { discordInteractions } = await import('../src/discord-interactions.ts');
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('hex');
  const config = { applicationId: '111', guildId: '222', publicKey };
  const env = environment(); const jobs: Promise<unknown>[] = [];
  const ctx = { waitUntil(job: Promise<unknown>) { jobs.push(job); } } as ExecutionContext;
  const signed = async (payload: unknown, age = 0) => {
    const body = JSON.stringify(payload), timestamp = String(Math.floor(Date.now() / 1000) - age);
    const signature = Buffer.from(await crypto.subtle.sign('Ed25519', pair.privateKey, new TextEncoder().encode(timestamp + body))).toString('hex');
    return new Request('https://worker.example/interactions', { method: 'POST', body, headers: { 'X-Signature-Ed25519': signature, 'X-Signature-Timestamp': timestamp } });
  };
  assert.deepEqual(await (await discordInteractions(await signed({ type: 1, application_id: '111' }), env, ctx, config)).json(), { type: 1 });
  const payload = deathInteraction('123', 'start', [configuredPlayers[0].riotId]);
  assert.equal((await discordInteractions(await signed(payload, 301), env, ctx, config)).status, 401);
  const tampered = await signed(payload); tampered.headers.set('X-Signature-Ed25519', '0'.repeat(128));
  assert.equal((await discordInteractions(tampered, env, ctx, config)).status, 401);
  const wrongGuild = { ...payload, guild_id: '333' };
  assert.equal((await (await discordInteractions(await signed(wrongGuild), env, ctx, config)).json() as { type: number }).type, 4);
  const noPermission = { ...payload, member: { permissions: '0' } };
  assert.match(JSON.stringify(await (await discordInteractions(await signed(noPermission), env, ctx, config)).json()), /権限/);
  assert.equal(jobs.length, 0);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM death_unrated_sessions').first<{ n: number }>())!.n, 0);
  assert.equal((await discordInteractions(new Request('https://worker.example/interactions'), env, ctx, config)).status, 405);
});

test('signed mode menus and selections defer privately, verify permissions, and reserve only after selection without storing callback tokens', async () => {
  const { discordInteractions } = await import('../src/discord-interactions.ts');
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const config = { applicationId: '111', guildId: '222', publicKey: Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('hex') };
  const env = environment(); const jobs: Promise<unknown>[] = []; const original = globalThis.fetch;
  const ctx = { waitUntil(job: Promise<unknown>) { jobs.push(job); } } as ExecutionContext;
  const body = JSON.stringify(deathInteraction('1234', 'start', [configuredPlayers[0].riotId])), timestamp = String(Math.floor(Date.now() / 1000));
  const signature = Buffer.from(await crypto.subtle.sign('Ed25519', pair.privateKey, new TextEncoder().encode(timestamp + body))).toString('hex');
  const replies: Array<{ method: string; content: string; allowed_mentions: unknown; components?: unknown[] }> = [];
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /^https:\/\/discord.com\/api\/v10\/webhooks\/111\//);
    replies.push({ method: init!.method!, ...JSON.parse(String(init?.body)) }); return Response.json({ id: '1' });
  };
  try {
    const response = await discordInteractions(new Request('https://worker.example/interactions', { method: 'POST', body, headers: { 'X-Signature-Ed25519': signature, 'X-Signature-Timestamp': timestamp } }), env, ctx, config);
    assert.deepEqual(await response.json(), { type: 5, data: { flags: 64 } });
    await Promise.all(jobs);
    assert.equal(replies.length, 1); assert.equal(replies[0].method, 'PATCH');
    assert.ok(replies[0].content.includes(configuredPlayers[0].name || configuredPlayers[0].riotId.split('#')[0]));
    assert.match(replies[0].content, /モードを選んで/);
    assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM death_unrated_sessions').first<{ n: number }>())!.n, 0, 'Opening the mode menu must not reserve a match');
    assert.deepEqual(replies[0].allowed_mentions, { parse: [] });
    assert.equal(replies[0].components?.length, 1);
    const signed = async (payload: unknown) => {
      const text = JSON.stringify(payload), time = String(Math.floor(Date.now() / 1000));
      const sig = Buffer.from(await crypto.subtle.sign('Ed25519', pair.privateKey, new TextEncoder().encode(time + text))).toString('hex');
      return new Request('https://worker.example/interactions', { method: 'POST', body: text, headers: { 'X-Signature-Ed25519': sig, 'X-Signature-Timestamp': time } });
    };
    const component = deathSelection('1235', '1234');
    const noPermission = { ...component, member: { ...component.member, permissions: '0' } };
    assert.match(JSON.stringify(await (await discordInteractions(await signed(noPermission), env, ctx, config)).json()), /権限/);
    assert.equal(jobs.length, 1);
    const tampered = await signed(component); tampered.headers.set('X-Signature-Ed25519', '0'.repeat(128));
    assert.equal((await discordInteractions(tampered, env, ctx, config)).status, 401);
    assert.deepEqual(await (await discordInteractions(await signed(component), env, ctx, config)).json(), { type: 6 });
    await Promise.all(jobs);
    assert.equal(replies.length, 2); assert.match(replies[1].content, /次のスイフト1試合だけ対象/);
    assert.deepEqual(replies[1].components, []); assert.deepEqual(replies[1].allowed_mentions, { parse: [] });
    assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM death_unrated_sessions').first<{ n: number }>())!.n, 1);
    assert.doesNotMatch(JSON.stringify((await env.DB.prepare('SELECT * FROM discord_command_receipts').all()).results), /callback-token/);
  } finally { globalThis.fetch = original; }
});
test('a failed multi-player reservation rolls back every participant and keeps a receipt against stale replay', async () => {
  const { runDeathCommand } = await import('../src/discord-interactions.ts');
  const env = environment();
  const config = [{ riotId: 'one#JP1' }, { riotId: 'two#JP1' }];
  const batch = env.DB.batch.bind(env.DB);
  env.DB.batch = async queries => batch([...queries, env.DB.prepare('INSERT INTO no_such_table VALUES(1)')]);
  const interaction = deathInteraction('123', 'start', ['all']);
  const result = await runDeathCommand(env.DB, interaction, config);
  assert.match(result, /操作結果を確認できません/);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM death_unrated_sessions').first<{ n: number }>())!.n, 0);
  env.DB.batch = batch;
  assert.equal(await runDeathCommand(env.DB, interaction, config), result);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM death_unrated_sessions').first<{ n: number }>())!.n, 0);
});
test('competitive draws notify once with details and group teammates while escalation draws remain record-only', async () => {
  const env = environment(); const original = globalThis.fetch;
  const config = [{ riotId: 'one#JP1', name: 'プレイヤーA' }, { riotId: 'two#JP1', name: 'プレイヤーC' }];
  for (const [n, player] of config.entries()) await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)')
    .bind(player.riotId, 'user-' + (n + 1), 'ap', 0).run();
  const draw = {
    ...match('competitive-draw'),
    players: ['user-1', 'user-2'].map(puuid => ({ puuid, team_id: 'red', agent: { name: 'Cypher' },
      stats: { kills: 20, deaths: 18, assists: 5, score: 5600, headshots: 10, bodyshots: 30, legshots: 0 } })),
  };
  draw.teams.forEach(team => { team.won = false; team.rounds.won = 14; });
  const arcade = match('escalation-draw', 'ggteam'); arcade.teams.forEach(team => { team.won = false; });
  const messages: string[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.henrikdev.xyz')) return Response.json({ data: String(url).includes('user-1') ? [draw, arcade] : [draw] });
    messages.push(JSON.parse(String(init?.body)).content); return Response.json({ id: '123' });
  };
  try {
    await monitor(env, config); await monitor(env, config);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /同じ試合の結果（2人）/);
    for (const name of ['プレイヤーA', 'プレイヤーC']) assert.ok(messages[0].includes(name + 'は14対14で引き分け（コンペ）'));
    assert.match(messages[0], /20K \/ 18D \/ 5A｜ACS 200｜HS命中率 25.0%/);
    assert.match(messages[0], /0勝0敗1分/);
    assert.match(messages[0], /連勝・連敗なし（引き分けでリセット）/);
    assert.match(messages[0], /勝率の分母|引分除く|相性はまだ調査中/);
    assert.doesNotMatch(messages[0], /\d+連敗|\d+連勝|負け！|エスカレーション/);
    assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE sent=1').first<{ n: number }>())!.n, 3);
  } finally { globalThis.fetch = original; }
});

function valoInteraction(action: string, values: Record<string, string> = {}) {
  return { ...deathInteraction('900', action), data: { name: 'valo', options: [{ type: 1, name: action,
    options: Object.entries(values).map(([name, value]) => ({ type: 3, name, value })) }] } };
}
async function saveValo(db: D1Database, riotId: string, id: string, outcome: 'win' | 'loss' | 'draw', ended: number,
  act = 'act-one', mode = 'competitive', team: string | null = 'red', message = '📢 test\n🗺️ Bind｜Cypher\n🔫 20K / 18D / 5A｜ACS 200') {
  await db.prepare(`INSERT INTO notifications(riot_id,match_id,message,ended_at,mode,act_id,act_name,outcome,sent,team_id)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(riotId, id, message, ended, mode, act, act, outcome, 1, team).run();
}
async function valoEnvironment() {
  const env = environment();
  const config = [{ riotId: 'one#JP1', name: 'プレイヤーA' }, { riotId: 'two#JP1', name: 'プレイヤーC' },
    { riotId: 'three#JP1', name: 'プレイヤーD' }, { riotId: 'four#JP1', name: 'プレイヤーB' }];
  for (const [n, player] of config.entries()) await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)')
    .bind(player.riotId, 'user-' + (n + 1), 'ap', 0).run();
  return { env, config };
}

test('slash command definitions preserve death permissions and expose thirteen read-only valo operations', async () => {
  const { discordCommands } = await import('../src/discord-command.ts');
  const commands = discordCommands();
  assert.deepEqual(commands.map(command => command.name), ['death', 'valo']);
  assert.equal(commands[0].default_member_permissions, '32');
  const deathStart = commands[0].options.find(option => option.name === 'start')!;
  const deathMode = deathStart.options!.find(option => option.name === 'mode')!;
  assert.ok(deathMode.choices.some(choice => choice.value === 'custom'));
  assert.equal(deathMode.required, false, 'Existing /death starts remain usable through the mode menu');
  assert.equal('default_member_permissions' in commands[1], false);
  assert.equal(commands[1].options.length, 13);
  for (const subcommand of commands[1].options) {
    assert.ok(subcommand.description.length <= 100);
    let optional = false;
    for (const option of subcommand.options ?? []) {
      assert.ok(!optional || !option.required, 'Required options precede optional options');
      optional ||= !option.required;
      assert.ok(option.choices.length <= 25);
    }
  }
});

test('today, yesterday and Monday-based week use Japan time and keep modes and chosen players separate', async () => {
  const { runValoCommand } = await import('../src/valo-queries.ts');
  const { env, config } = await valoEnvironment(); const clock = Date.now;
  const now = Date.parse('2026-10-26T00:05:00+09:00'); Date.now = () => now;
  const run = (action: string, values: Record<string, string> = {}) => runValoCommand(env.DB, valoInteraction(action, values), config);
  try {
    await saveValo(env.DB, 'one#JP1', 'yesterday', 'loss', now - 6 * 60000);
    await saveValo(env.DB, 'one#JP1', 'boundary', 'win', now - 5 * 60000);
    await saveValo(env.DB, 'one#JP1', 'draw', 'draw', now - 60000);
    await saveValo(env.DB, 'one#JP1', 'other-mode', 'loss', now - 1000, 'act-one', 'escalation');
    const today = await run('today', { player: 'one#JP1' });
    assert.match(today, /2026-10-26/); assert.match(today, /プレイヤーA：1勝0敗1分｜勝率100.0%/);
    assert.match(today, /引き分けでリセット/); assert.doesNotMatch(today, /プレイヤーC：/);
    assert.match(await run('yesterday'), /プレイヤーA：0勝1敗0分/);
    assert.match(await run('week'), /2026-10-26/);
    assert.match(await run('week'), /プレイヤーA：1勝0敗1分/);
    assert.match(await run('today', { mode: 'escalation' }), /プレイヤーA：0勝1敗0分/);
    Date.now = () => now - 10 * 60000;
    assert.match(await run('week'), /2026-10-19/);
  } finally { Date.now = clock; }
});

test('ACT summaries and comparisons use the same latest recorded ACT and reject unregistered option values', async () => {
  const { runValoCommand } = await import('../src/valo-queries.ts');
  const { env, config } = await valoEnvironment(); const now = Date.now();
  const run = (action: string, values: Record<string, string> = {}) => runValoCommand(env.DB, valoInteraction(action, values), config);
  await saveValo(env.DB, 'one#JP1', 'old', 'win', now - 2000);
  await saveValo(env.DB, 'two#JP1', 'new', 'loss', now - 1000, 'act-two');
  const act = await run('act');
  assert.match(act, /act-two/); assert.match(act, /プレイヤーA：0勝0敗0分/); assert.match(act, /プレイヤーC：0勝1敗0分/);
  const comparison = await run('compare', { player: 'one#JP1', partner: 'two#JP1' });
  assert.match(comparison, /プレイヤーA：0勝0敗0分/); assert.match(comparison, /プレイヤーC：0勝1敗0分/);
  assert.doesNotMatch(comparison, /プレイヤーD：/);
  assert.match(await run('pair', { player: 'one#JP1', partner: 'one#JP1' }), /異なる2人/);
  assert.match(await run('act', { player: "x' OR 1=1#JP1" }), /登録済み/);
  assert.match(await run('today', { mode: 'unrated' }), /モードは/);
  assert.match(await run('recent'), /対象者を指定/);
  assert.match(await run('help'), /\/valo versus/);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM discord_command_receipts').first<{ n: number }>())!.n, 0);
});

test('pair and versus queries separate allies and opponents and exclude incomplete teams, other modes and ACTs', async () => {
  const { runValoCommand } = await import('../src/valo-queries.ts');
  const { env, config } = await valoEnvironment(); let when = Date.now() - 20_000;
  for (const [id, a, b, ta, tb, mode, act] of [
    ['ally', 'win', 'win', 'red', 'red', 'competitive', 'act-one'],
    ['enemy', 'loss', 'win', 'red', 'blue', 'competitive', 'act-one'],
    ['enemy-draw', 'draw', 'draw', 'red', 'blue', 'competitive', 'act-one'],
    ['no-team', 'loss', 'win', null, 'blue', 'competitive', 'act-one'],
    ['other-mode', 'loss', 'loss', 'red', 'red', 'escalation', 'act-one'],
    ['older-act', 'loss', 'loss', 'red', 'red', 'competitive', 'old-act'],
  ] as const) {
    await saveValo(env.DB, 'one#JP1', id, a, when, act, mode, ta);
    await saveValo(env.DB, 'two#JP1', id, b, when, act, mode, tb); when--;
  }
  const options = { player: 'one#JP1', partner: 'two#JP1' };
  const pair = await runValoCommand(env.DB, valoInteraction('pair', options), config);
  assert.match(pair, /1勝0敗0分/); assert.match(pair, /相性はまだ調査中/);
  const versus = await runValoCommand(env.DB, valoInteraction('versus', options), config);
  assert.match(versus, /プレイヤーA側：0勝1敗1分/);
  assert.match(await runValoCommand(env.DB, valoInteraction('versus', { player: 'two#JP1', partner: 'one#JP1' }), config), /プレイヤーC側：1勝0敗1分/);
});

test('rankings exclude draws from rates, share tied ranks and leave draws-only or inactive players unranked', async () => {
  const { runValoCommand } = await import('../src/valo-queries.ts');
  const { env, config } = await valoEnvironment(); const now = Date.now();
  await saveValo(env.DB, 'one#JP1', 'a', 'win', now - 1000);
  await saveValo(env.DB, 'one#JP1', 'b', 'draw', now - 900);
  await saveValo(env.DB, 'two#JP1', 'c', 'win', now - 800);
  await saveValo(env.DB, 'two#JP1', 'd', 'win', now - 700);
  await saveValo(env.DB, 'three#JP1', 'e', 'draw', now - 600);
  const ranking = await runValoCommand(env.DB, valoInteraction('ranking'), config);
  assert.match(ranking, /1位 プレイヤーA：1勝0敗1分｜勝率100.0%/);
  assert.match(ranking, /1位 プレイヤーC：2勝0敗0分｜勝率100.0%/);
  assert.match(ranking, /— プレイヤーD：0勝0敗1分｜勝率—/);
  assert.match(ranking, /— プレイヤーB：0勝0敗0分/);
  assert.match(ranking, /5試合未満/);
});

test('longest streaks break on draws while recent results preserve order and limit to three with individual details', async () => {
  const { runValoCommand } = await import('../src/valo-queries.ts');
  const { env, config } = await valoEnvironment(); const now = Date.now();
  for (const [n, result] of (['win', 'win', 'loss', 'loss', 'loss', 'draw', 'loss'] as const).entries()) {
    await saveValo(env.DB, 'one#JP1', 'game-' + n, result, now - 10000 + n * 1000, 'act-one', 'competitive', 'red', '📢 game-' + n + '\n🗺️ Bind｜Cypher\n🔫 20K / 18D / 5A｜ACS 200');
  }
  const streaks = await runValoCommand(env.DB, valoInteraction('streaks', { player: 'one#JP1' }), config);
  assert.match(streaks, /最長2連勝／最長3連敗\n現在：1連敗/);
  const recent = await runValoCommand(env.DB, valoInteraction('recent', { player: 'one#JP1' }), config);
  assert.ok(recent.indexOf('game-6') < recent.indexOf('game-5'));
  assert.ok(recent.indexOf('game-5') < recent.indexOf('game-4'));
  assert.doesNotMatch(recent, /game-3/); assert.match(recent, /ACS 200/);
});

test('monitor records successful history checks; status reports cooldown and only eligible queued games without API calls', async () => {
  const { runValoCommand } = await import('../src/valo-queries.ts');
  const { env, config } = await valoEnvironment(); const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ data: [] });
  try { await monitor(env, config); } finally { globalThis.fetch = original; }
  const now = Date.now();
  await env.DB.prepare("INSERT INTO monitor_state(key,value) VALUES('api_after',?)").bind(String(now + 60000)).run();
  await saveValo(env.DB, 'one#JP1', 'pending', 'win', now);
  await saveValo(env.DB, 'one#JP1', 'cancelled', 'win', now, 'act-one', 'unrated');
  await env.DB.prepare('UPDATE notifications SET sent=0').run();
  globalThis.fetch = async () => { throw new Error('read-only commands must not contact external APIs'); };
  try {
    const status = await runValoCommand(env.DB, valoInteraction('status'), config);
    assert.match(status, /Henrik API：.*まで待機/); assert.match(status, /送信待ち：1試合/);
    assert.doesNotMatch(status, /最終実行開始：未記録|最終実行終了：未記録|最終取得 未記録/);
    assert.doesNotMatch(status, /test-key|api\/webhooks/);
    assert.match(await runValoCommand(env.DB, valoInteraction('players'), config), /プレイヤーA：one#JP1/);
  } finally { globalThis.fetch = original; }
});

test('all valo replies fit Discord content limits even with five long display names and empty data', async () => {
  const { runValoCommand } = await import('../src/valo-queries.ts');
  const { valoCommand } = await import('../src/valo-command.ts');
  const env = environment();
  const config = Array.from({ length: 5 }, (_, n) => ({ riotId: 'user' + n + '#JP1', name: '名前'.repeat(80) }));
  for (const [n, player] of config.entries()) {
    await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind(player.riotId, 'u' + n, 'ap', 0).run();
    await saveValo(env.DB, player.riotId, 'g', 'win', Date.now() - 1000);
  }
  for (const action of valoCommand(config).options) {
    const values = Object.fromEntries((action.options ?? []).filter(option => option.required).map(option => [option.name, config[option.name === 'partner' ? 1 : 0].riotId]));
    const content = await runValoCommand(env.DB, valoInteraction(action.name, values), config);
    assert.ok(content.length <= 2000, action.name + ' length=' + content.length);
  }
  assert.match(await runValoCommand(environment().DB, valoInteraction('act'), config), /まだありません/);
});

test('signed valo queries are available without management permissions and reply privately; death remains restricted', async () => {
  const { discordInteractions } = await import('../src/discord-interactions.ts');
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const config = { applicationId: '111', guildId: '222', publicKey: Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('hex') };
  const env = environment(); const jobs: Promise<unknown>[] = []; const original = globalThis.fetch;
  const ctx = { waitUntil(job: Promise<unknown>) { jobs.push(job); } } as ExecutionContext;
  const contents: string[] = [];
  globalThis.fetch = async (_url, init) => { contents.push(JSON.parse(String(init?.body)).content); return Response.json({ id: '1' }); };
  const signed = async (payload: unknown) => {
    const body = JSON.stringify(payload), timestamp = String(Math.floor(Date.now() / 1000));
    const signature = Buffer.from(await crypto.subtle.sign('Ed25519', pair.privateKey, new TextEncoder().encode(timestamp + body))).toString('hex');
    return new Request('https://worker.example/interactions', { method: 'POST', body, headers: { 'X-Signature-Ed25519': signature, 'X-Signature-Timestamp': timestamp } });
  };
  try {
    const response = await discordInteractions(await signed({ ...valoInteraction('help'), member: { permissions: '0' } }), env, ctx, config);
    assert.deepEqual(await response.json(), { type: 5, data: { flags: 64 } }); await Promise.all(jobs);
    assert.match(contents[0], /コマンド一覧/);
    const denied = await discordInteractions(await signed({ ...deathInteraction('991', 'stop'), member: { permissions: '0' } }), env, ctx, config);
    assert.match(JSON.stringify(await denied.json()), /権限/); assert.equal(jobs.length, 1);
  } finally { globalThis.fetch = original; }
});

test('retry headers distinguish relative waits from Unix reset timestamps and accept fractional seconds', async () => {
  const { retryAfter } = await import('../src/index.ts');
  const now = Date.parse('2026-10-26T00:00:00Z');
  const cases: Array<[Record<string, string>, number]> = [
    [{ 'Retry-After': '1.5' }, 2000], [{ 'Retry-After': new Date(now + 30000).toUTCString() }, 30000],
    [{ 'X-RateLimit-Reset-After': '2.1' }, 3000], [{ 'X-RateLimit-Reset': '30' }, 30000],
    [{ 'X-RateLimit-Reset': String(now / 1000 + 30) }, 30000], [{ 'X-RateLimit-Reset': String(now + 30000) }, 30000],
    [{ 'Retry-After': '10', 'X-RateLimit-Reset': String(now / 1000 + 300) }, 10000],
    [{ 'X-RateLimit-Reset': String(now / 1000 - 10) }, 1000], [{ 'Retry-After': 'bad' }, 60000], [{}, 60000],
  ];
  for (const [headers, expected] of cases) assert.equal(retryAfter(new Response('', { headers }), now), expected, JSON.stringify(headers));
});

test('a detected shared match is posted for both registered players before a later history request finishes', async () => {
  const { env, config } = await valoEnvironment(); const original = globalThis.fetch;
  const selected = config.slice(0, 2); const raw = match('fast-shared', 'competitive', true, Date.now() - 5000);
  raw.players.push({ puuid: 'user-2', team_id: 'red' });
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const later = new Promise<void>(resolve => { entered = resolve; });
  const messages: string[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.henrikdev.xyz')) {
      if (String(url).includes('/pc/user-2')) { entered(); await gate; return Response.json({ data: [] }); }
      return Response.json({ data: [raw] });
    }
    messages.push(JSON.parse(String(init?.body)).content); return Response.json({ id: '123' });
  };
  const running = monitor(env, selected);
  try {
    await later;
    assert.equal(messages.length, 1, 'Delivery must precede the slower second request');
    assert.match(messages[0], /同じ試合の結果（2人）/);
    assert.match(messages[0], /プレイヤーA/); assert.match(messages[0], /プレイヤーC/);
  } finally { release(); await running; globalThis.fetch = original; }
  const row = await env.DB.prepare("SELECT value FROM monitor_state WHERE key='delivery:last'").first<{ value: string }>();
  const timing = JSON.parse(row!.value);
  assert.ok(timing.finishToDetectionMs >= 5000);
  assert.ok(timing.detectionToDiscordMs < 5000);
  const { runValoCommand } = await import('../src/valo-queries.ts');
  const status = await runValoCommand(env.DB, valoInteraction('status'), selected);
  assert.match(status, /終了→Bot検知：0分/); assert.match(status, /検知→Discord送信：0分/);
});

test('queued notifications are delivered before polling and a shared response respects each player monitoring start', async () => {
  const { env, config } = await valoEnvironment(); const original = globalThis.fetch;
  const now = Date.now(), selected = config.slice(0, 2);
  await env.DB.prepare('UPDATE tracked_players SET since=? WHERE riot_id=?').bind(now, selected[1].riotId).run();
  await saveValo(env.DB, selected[0].riotId, 'already-queued', 'win', now - 60000);
  await env.DB.prepare('UPDATE notifications SET sent=0').run();
  const raw = match('before-second-monitoring', 'competitive', true, now - 1000);
  raw.players.push({ puuid: 'user-2', team_id: 'red' });
  const calls: string[] = [], contents: string[] = [];
  globalThis.fetch = async (url, init) => {
    const api = String(url).includes('api.henrikdev.xyz'); calls.push(api ? 'api' : 'discord');
    if (api) return Response.json({ data: [raw] });
    contents.push(JSON.parse(String(init?.body)).content); return Response.json({ id: '123' });
  };
  try {
    await monitor(env, selected);
    assert.equal(calls[0], 'discord'); assert.equal(contents.length, 2);
    assert.doesNotMatch(contents[1], /プレイヤーC/);
    assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE riot_id=?').bind(selected[1].riotId).first<{ n: number }>())!.n, 0);
  } finally { globalThis.fetch = original; }
});

test('an absolute API reset resumes polling at the advertised time rather than pausing for an hour', async () => {
  const { env, config } = await valoEnvironment(); const original = globalThis.fetch, clock = Date.now;
  let now = Date.now(); Date.now = () => now; const paths: string[] = [];
  globalThis.fetch = async url => {
    paths.push(String(url));
    return paths.length === 1 ? new Response('', { status: 429, headers: { 'X-RateLimit-Reset': String(Math.ceil(now / 1000) + 30) } })
      : Response.json({ data: [] });
  };
  try {
    const selected = config.slice(0, 2);
    await monitor(env, selected);
    const next = Number((await env.DB.prepare("SELECT value FROM monitor_state WHERE key='api_after'").first<{ value: string }>())!.value);
    assert.ok(next - now >= 30000 && next - now <= 31000);
    now += 32000; await monitor(env, selected);
    assert.equal(paths.length, 3); assert.match(paths[1], /user-2/);
  } finally { globalThis.fetch = original; Date.now = clock; }
});

test('network delivery failures do not cause an immediate retry for every player in the same run', async () => {
  const { env, config } = await valoEnvironment(); const original = globalThis.fetch; let attempts = 0;
  globalThis.fetch = async url => {
    if (String(url).includes('api.henrikdev.xyz')) return Response.json({ data: [match('network-fail')] });
    attempts++; throw new Error('network unavailable');
  };
  try {
    await monitor(env, config);
    assert.equal(attempts, 1);
    assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE sent=0').first<{ n: number }>())!.n, 1);
  } finally { globalThis.fetch = original; }
});

test('all outcome comment pools are populated, short, unique and safe for Discord text', () => {
  const pools = commentPools;
  assert.ok(Object.values(pools).reduce((n, lines) => n + lines.length, 0) >= 270);
  for (const [kind, lines] of Object.entries(pools)) {
    assert.ok(lines.length >= 12, kind);
    assert.equal(new Set(lines).size, lines.length, kind);
    for (const line of lines) {
      assert.ok(line.trim().length > 0 && [...line].length <= 120, kind);
      assert.doesNotMatch(line, /[\r\n]|@everyone|@here|<@|https?:\/\//);
      assert.doesNotMatch(line.replaceAll('{streak}', '5'), /[{}]/);
      if (kind.includes('streak') && !memeQuotes.some(quote => quote.text === line)) assert.match(line, /\{streak\}/);
    }
  }
});

test('wins and draws each select stable comments across many different matches', () => {
  const pools = commentPools;
  for (const outcome of ['win', 'draw'] as const) {
    const seen = new Set<string>();
    for (let n = 0; n < 80; n++) {
      const raw = match(`${outcome}-${n}`);
      if (outcome === 'draw') raw.teams.forEach(t => { t.won = false; });
      const first = resultMessage(raw, 'user-1', 'プレイヤーA')!.message;
      assert.equal(first, resultMessage(raw, 'user-1', 'プレイヤーA')!.message);
      const comment = first.split('\n💬 ')[1];
      assert.ok(pools[outcome].includes(comment));seen.add(comment);
      assert.equal((first.match(/\n💬 /g) ?? []).length, 3);
    }
    assert.ok(seen.size >= 12, outcome);
  }
});

test('winning streaks use three/five thresholds, remain stable, and draw resets commentary', async () => {
  const env = environment(), original = globalThis.fetch;
  await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind('player#JP1', 'user-1', 'ap', 0).run();
  let games: ReturnType<typeof match>[] = [];
  const deliveries: string[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('api.henrikdev.xyz')) return Response.json({ data: games });
    deliveries.push(JSON.parse(String(init?.body)).content);return Response.json({ id: '1' });
  };
  try {
    const base = Date.now() - 10_000;
    const pools = commentPools;
    for (let n = 1; n <= 5; n++) {
      games = [match('winning-' + n, 'competitive', true, base + n * 1000), ...games].slice(0, 2);
      await monitor(env, [{ riotId: 'player#JP1' }]);
      const content = deliveries.at(-1)!;
      const comment = content.split('\n💬 ')[1];
      const group = n >= 5 ? 'long_winning_streak' : n >= 3 ? 'winning_streak' : 'win';
      assert.ok(pools[group].some(line => line.replaceAll('{streak}', String(n)) === comment));
      assert.equal((content.match(/\n💬 /g) ?? []).length, 3);
      const count = deliveries.length;
      await monitor(env, [{ riotId: 'player#JP1' }]);assert.equal(deliveries.length, count);
    }
    const draw = match('after-wins-draw', 'competitive', false, base + 6000);
    draw.teams.forEach(team => { team.won = false; team.rounds.won = 14; });
    games = [draw,...games].slice(0,2);await monitor(env,[{riotId:'player#JP1'}]);
    const content=deliveries.at(-1)!;
    assert.match(content,/連勝・連敗なし（引き分けでリセット）/);
    assert.ok(pools.draw.includes(content.split('\n💬 ')[1]));
    assert.doesNotMatch(content,/\{streak\}|\d+連勝|\d+連敗/);
  } finally {globalThis.fetch=original;}
});

test('winning performance pools distinguish high kills, team-assisted, close and dominant wins', () => {
  const pools = commentPools;
  for (const [kind,kills,deaths,enemyScore] of [
    ['win_high_kills',24,16,10],['win_low_kd',5,20,10],['close_win',18,16,11],['blowout_win',18,16,3],
  ] as const) {
    const raw=JSON.parse(JSON.stringify(match(kind)));
    raw.players[0].stats={kills,deaths,assists:5};raw.teams[0].rounds.won=enemyScore;
    const message=resultMessage(raw,'user-1','プレイヤーA')!.message;
    assert.ok(pools[kind].includes(message.split('\n💬 ')[1]),kind);
    assert.doesNotMatch(message,/負けても健闘賞/);
  }
});

test('all completed queue IDs are monitored with correct labels; unknown queues do not become escalation',()=>{
 for(const [queue,label] of [['swiftplay','スイフトプレイ'],['spikerush','スパイクラッシュ'],['hurm','チームデスマッチ'],['onefa','レプリケーション'],['custom','カスタム'],['new_mode_2026','new_mode_2026'],['unrated','アンレート']] as const){
  const result=resultMessage(match(queue,queue),'user-1','Player')!;assert.ok(result);assert.match(result.message,new RegExp(label));assert.doesNotMatch(result.message,/エスカレーション|デスアンレ/);
 }
 const invalid=match('invalid');invalid.metadata.queue.id='bad\n@everyone';assert.equal(resultMessage(invalid,'user-1','Player'),null);
});
test('solo deathmatch and unavailable team results are never invented as wins, losses or draws',()=>{
 const raw=match('solo','deathmatch');raw.teams=[];
 const result=resultMessage(raw,'user-1','Player')!;assert.equal(result.outcome,null);assert.match(result.message,/デスマッチ.*勝敗判定なし|勝敗判定なし.*デスマッチ/);assert.doesNotMatch(result.message,/勝ち！！|負け！|引き分け/);
 raw.teams=match('teams').teams;assert.equal(resultMessage(raw,'user-1','Player')!.outcome,null);
});
test('a mixed all-mode history is saved and delivered exactly once without consuming unrated reservations',async()=>{
 const env=environment(),original=globalThis.fetch;await env.DB.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').bind('one#JP1','user-1','ap',0).run();
 const games=['deathmatch','hurm','swiftplay','spikerush','custom'].map((mode,n)=>match('all-'+n,mode,true,Date.now()-10000+n*1000));games[0].teams=[];
 const messages:string[]=[];globalThis.fetch=async(url,init)=>String(url).includes('api.henrikdev.xyz')?Response.json({data:games}):(messages.push(JSON.parse(String(init?.body)).content),Response.json({id:'123'}));
 try{await monitor(env,[{riotId:'one#JP1'}]);await monitor(env,[{riotId:'one#JP1'}]);assert.equal(messages.length,5);assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM notifications').first<{n:number}>())!.n,5);assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM death_unrated_sessions').first<{n:number}>())!.n,0);assert.match(messages[0],/勝敗判定なし/);assert.doesNotMatch(messages[0],/連勝|連敗/);}finally{globalThis.fetch=original;}
});

test('custom and non-round death modes are selectable but never invent missing team or final-round data', async () => {
  const { deathModes, deathStoredMode, isDeathNotice } = await import('../src/death-modes.ts');
  const { runDeathCommand } = await import('../src/discord-interactions.ts');
  const { claimDeathMatch } = await import('../src/death-sessions.ts');
  for (const mode of deathModes) {
    const env = environment();
    assert.match(await runDeathCommand(env.DB, deathInteraction('700', 'start', ['one#JP1'], mode.value), [{ riotId: 'one#JP1' }]), /1試合だけ対象/);
    const now = Date.now() + 1000;
    assert.equal(await claimDeathMatch(env.DB, 'one#JP1', 'chosen', now, now + 1000, mode.value), true);
    assert.equal(isDeathNotice(deathStoredMode(mode.value)), true);
    const raw = unratedMatch('mode-' + mode.value); raw.metadata.queue.id = mode.value;
    assert.match(resultMessage(raw, 'user-1', 'A', true)!.message, new RegExp(mode.name));
  }
  const small = match('small-custom', 'custom');
  assert.match(resultMessage(small, 'user-1', 'A', true)!.message, /判定保留/);
  assert.match(resultMessage(small, 'user-1', 'A', true)!.message, /デスカスタム/);
  assert.doesNotMatch(resultMessage(small, 'user-1', 'A', true)!.message, /今回はセーフ/);
});

test('a Skirmish win that opened a choice is posted with its 受取／続行 buttons; refused buttons fall back to plain text', async () => {
  const { kpSchema } = await import('../src/kp.ts'); const { ensureModeRewards } = await import('../src/mode-rewards.ts');
  const { settleSkirmishMatch } = await import('../src/skirmish.ts');
  for (const refuse of [false, true]) {
    const env = environment(); const original = globalThis.fetch;
    let now = Date.now(); const clock = Date.now; Date.now = () => now;
    for (const schema of kpSchema) await env.DB.prepare(schema).run();
    await ensureModeRewards(env as never);
    await env.DB.prepare('INSERT INTO kp_accounts(guild,puuid,user,riot,linked_at) VALUES(?,?,?,?,0)').bind('100000000000000100', 'user-1', '100000000000000101', 'player#JP1').run();
    await env.DB.prepare('INSERT INTO kp_wallets(guild,user) VALUES(?,?)').bind('100000000000000100', '100000000000000101').run();
    let games: unknown[] = [];
    const posts: Array<{ url: string; body: { content: string; components?: { components: { custom_id: string }[] }[] } }> = [];
    globalThis.fetch = async (url, init) => {
      if (String(url).includes('/account/')) return Response.json({ data: { puuid: 'user-1', region: 'ap' } });
      if (String(url).includes('/matches/')) return Response.json({ data: games });
      const body = JSON.parse(String(init?.body)); posts.push({ url: String(url), body });
      if (refuse && body.components?.length) return new Response('{"message":"Invalid Form Body"}', { status: 400 });
      return Response.json({ id: '1' });
    };
    try {
      const config = [{ riotId: 'player#JP1', name: 'たろう' }];
      await monitor(env, config);
      now += 60_000; games = [match('sk1', 'skirmish_2v2', true, now)];
      await settleSkirmishMatch(env as never, { guild: '100000000000000100', puuid: 'user-1', user: '100000000000000101', match: 'sk1', start: now - 1000, end: now, win: true, now });
      await monitor(env, config);
      const sent = posts.filter(p => p.url.includes('/webhooks/123/'));
      assert.match(sent[0].url, /with_components=true/);
      assert.deepEqual(sent[0].body.components?.[0].components.map(c => c.custom_id.split(':')[3]), ['cash', 'continue']);
      if (refuse) {
        assert.equal(sent.length, 2, 'resent once without buttons');
        assert.deepEqual(sent[1].body.components, []);
        assert.ok((await env.DB.prepare("SELECT value FROM monitor_state WHERE key='skirmish_buttons_off_until'").first<{ value: string }>())!.value > String(now));
      } else assert.equal(sent.length, 1);
    } finally { globalThis.fetch = original; Date.now = clock; }
  }
});

test('posts without a Skirmish game never ask for components', async () => {
  const env = environment(); const original = globalThis.fetch;
  let now = Date.now(); const clock = Date.now; Date.now = () => now;
  let games: unknown[] = []; const urls: string[] = [], bodies: Record<string, unknown>[] = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/account/')) return Response.json({ data: { puuid: 'user-1', region: 'ap' } });
    if (String(url).includes('/matches/')) return Response.json({ data: games });
    urls.push(String(url)); bodies.push(JSON.parse(String(init?.body))); return Response.json({ id: '1' });
  };
  try {
    const config = [{ riotId: 'player#JP1', name: 'たろう' }];
    await monitor(env, config); now += 60_000; games = [match('c1', 'competitive', true, now)]; await monitor(env, config);
    assert.equal(urls.length, 1); assert.doesNotMatch(urls[0], /with_components/); assert.equal('components' in bodies[0], false);
  } finally { globalThis.fetch = original; Date.now = clock; }
});
