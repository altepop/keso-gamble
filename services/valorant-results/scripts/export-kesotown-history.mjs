/**
 * KESOTOWN: one-time, local, read-only Discord message export for music research.
 * No Discord Gateway, no Workers, no D1, no posts/edits, no GitHub artifacts.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const ID = /^\d{15,22}$/;
const OUT_DIR = fileURLToPath(new URL('../.private/', import.meta.url));
const TYPES = new Set([0, 5]); // ordinary text and announcement channels only
const API = 'https://discord.com/api/v10';

export function parseArgs(argv) {
  const [mode, ...tokens] = argv;
  if (!['list', 'export'].includes(mode)) throw new Error('Use "list" or "export".');
  const opts = { mode, guild: '', channels: [], days: 180, perChannel: 3000, total: 20000, includeBots: true };
  const keys = { '--guild': 'guild', '--channels': 'channels', '--days': 'days',
    '--per-channel': 'perChannel', '--total': 'total' };
  for (let i = 0; i < tokens.length; i++) {
    const key = tokens[i];
    if (key === '--no-bots') { opts.includeBots = false; continue; }
    if (!Object.hasOwn(keys, key) || !tokens[i + 1]) throw new Error('Unknown or incomplete option: ' + key);
    opts[keys[key]] = tokens[++i];
  }
  if (!ID.test(opts.guild)) throw new Error('--guild must be a valid server ID.');
  if (typeof opts.channels === 'string') {
    opts.channels = opts.channels.split(',').map(s => s.trim());
    if (opts.channels.length > 50 || new Set(opts.channels).size !== opts.channels.length ||
        opts.channels.some(s => !ID.test(s))) throw new Error('--channels needs 1-50 unique channel IDs.');
  }
  if (mode === 'export' && !opts.channels.length) throw new Error('Explicit --channels is required. There is NO export-all mode.');
  for (const [name, max] of [['days', 1095], ['perChannel', 10000], ['total', 50000]]) {
    const value = Number(opts[name]);
    if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error('Invalid --' + name + ', max ' + max);
    opts[name] = value;
  }
  return opts;
}

export function redactContent(input) {
  return String(input || '')
    .replace(/https?:\/\/\S+/gi, '[URL]')
    .replace(/(?:[A-Z0-9._%+-]+)@(?:[A-Z0-9.-]+\.[A-Z]{2,})/gi, '[EMAIL]')
    .replace(/<@!?\d+>|<@&\d+>/g, '@member')
    .replace(/<#\d+>/g, '#channel')
    .replace(/(?:^|[^\d])(?:0\d{9,10})(?!\d)/g, '[PHONE]')
    .replace(/\b\d{15,22}\b/g, '[ID]')
    .trim()
    .slice(0, 2000);
}

export async function discordGet(path, token, fetcher = fetch, sleep = ms => new Promise(r => setTimeout(r, ms))) {
  if (!token || /\s/.test(token)) throw new Error('Bot Token is missing or malformed.');
  if (!/^\/(?:guilds\/\d{15,22}\/channels|channels\/\d{15,22}\/messages(?:\?.*)?)$/.test(path)) {
    throw new Error('Only approved read-only Discord API routes are permitted.');
  }
  for (let attempt = 0; attempt <= 5; attempt++) {
    await sleep(750); // conservative request pacing; never share API budget with runtime jobs
    const response = await fetcher(API + path, {
      method: 'GET', headers: { Authorization: 'Bot ' + token },
      signal: AbortSignal.timeout(20000)
    });
    if (response.status === 429) {
      if (attempt === 5) throw new Error('Discord rate limit persisted; aborting.');
      const data = await response.json().catch(() => ({}));
      const header = Number(response.headers.get('retry-after'));
      const seconds = Number.isFinite(header) && header > 0 ? header : Number(data.retry_after);
      await sleep(Math.max(1000, Math.min(300000, (Number.isFinite(seconds) ? seconds : 10) * 1000 + 300)));
      continue;
    }
    if (!response.ok) throw new Error('Discord HTTP ' + response.status + '. Check server membership, channel permissions and Bot Token.');
    return response.json();
  }
  throw new Error('Discord request attempts exhausted.');
}

export function makeRecords(messages, channelLabel, authors, includeBots = true) {
  const records = [];
  for (const message of messages) {
    if (!message || !message.author || (!includeBots && message.author.bot)) continue;
    const content = redactContent(message.content);
    if (!content) continue; // no embeds, attachments, voice, or hidden message content
    const authorId = String(message.author.id || '');
    if (!ID.test(authorId)) continue;
    if (!authors.has(authorId)) {
      const n = authors.size + 1;
      authors.set(authorId, (message.author.bot ? 'bot_' : 'member_') + String(n).padStart(3, '0'));
    }
    records.push({
      channel: channelLabel, author: authors.get(authorId),
      at: String(message.timestamp || ''), content
    });
  }
  return records;
}

async function getToken() {
  if (process.env.DISCORD_BOT_TOKEN) return process.env.DISCORD_BOT_TOKEN.trim();
  if (!process.stdin.isTTY) throw new Error('DISCORD_BOT_TOKEN is not set; a local interactive terminal is required.');
  let muted = false;
  const output = new Writable({ write(chunk, _, next) {
    if (!muted) process.stdout.write(chunk);
    next();
  } });
  const input = createInterface({ input: process.stdin, output, terminal: true });
  try {
    process.stdout.write('Bot Token (hidden, kept in memory only): ');
    muted = true;
    const token = (await input.question('')).trim();
    muted = false;
    process.stdout.write('\n');
    return token;
  } finally { muted = false; input.close(); }
}

export async function run(opts, token, deps = {}) {
  const get = deps.get || ((path) => discordGet(path, token));
  const channels = await get('/guilds/' + opts.guild + '/channels');
  if (!Array.isArray(channels)) throw new Error('Discord channel list was invalid.');
  const readable = channels.filter(c => TYPES.has(c.type) && ID.test(String(c.id || '')));
  if (opts.mode === 'list') return { channels: readable.map(c => ({ id: c.id, name: c.name })) };

  const index = new Map(readable.map(c => [String(c.id), c]));
  for (const id of opts.channels) if (!index.has(id)) {
    throw new Error('Channel ' + id + ' is not a text/announcement channel in the selected server.');
  }

  const cutoff = Date.now() - opts.days * 86400000;
  const authors = new Map(), records = [], summaries = [];
  let fetchedTotal = 0;
  for (const id of opts.channels) {
    const channel = index.get(id);
    const label = String(channel.name || 'text-channel').slice(0, 80);
    let before, fetched = 0, included = 0, done = false;
    while (!done && fetched < opts.perChannel && fetchedTotal < opts.total) {
      const limit = Math.min(100, opts.perChannel - fetched, opts.total - fetchedTotal);
      const path = '/channels/' + id + '/messages?limit=' + limit + (before ? '&before=' + before : '');
      const batch = await get(path);
      if (!Array.isArray(batch)) throw new Error('Invalid Discord message response for channel ' + id);
      if (!batch.length) break;
      fetched += batch.length; fetchedTotal += batch.length;
      const recent = [];
      for (const msg of batch) {
        const ts = Date.parse(msg.timestamp);
        if (!Number.isFinite(ts) || ts < cutoff) { done = true; continue; }
        recent.push(msg);
      }
      const made = makeRecords(recent.reverse(), label, authors, opts.includeBots);
      records.push(...made); included += made.length;
      const oldest = batch[batch.length - 1]?.id;
      if (!ID.test(String(oldest || '')) || oldest === before || batch.length < limit) break;
      before = oldest;
    }
    summaries.push({ channel: label, fetched, included });
  }
  if (fetchedTotal > 0 && records.length === 0) {
    throw new Error('No readable text messages. Verify Message Content Intent and selected channels.');
  }
  return {
    records: records.sort((a,b) => a.at.localeCompare(b.at)),
    summary: { guild: 'KESOTOWN (ID omitted)', days: opts.days,
      fetched: fetchedTotal, included: records.length,
      anonymizedAuthors: authors.size, channels: summaries,
      notice: 'Private research export. Do not publish to GitHub. Names, mentions, URLs, emails and long numeric IDs have been redacted; review content manually before sharing.' }
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const token = await getToken();
  const result = await run(options, token);
  if (options.mode === 'list') {
    console.log('Readable candidate channels (choose IDs explicitly; exclude private or sensitive topics):');
    for (const c of result.channels) console.log(c.name + ': ' + c.id);
    return;
  }
  await mkdir(OUT_DIR, { recursive: true, mode: 0o700 });
  const stem = 'kesotown-music-' + new Date().toISOString().replace(/[:.]/g,'-');
  const textPath = resolve(OUT_DIR, stem + '.jsonl');
  const infoPath = resolve(OUT_DIR, stem + '-summary.json');
  await writeFile(textPath, result.records.map(x => JSON.stringify(x)).join('\n') + '\n', { mode: 0o600, flag: 'wx' });
  await writeFile(infoPath, JSON.stringify(result.summary, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.log('Saved locally (never to D1/GitHub): ' + textPath);
  console.log('Report: ' + infoPath);
  console.log('Messages: ' + result.summary.included + ', anonymous authors: ' + result.summary.anonymizedAuthors);
  console.log('Review the JSONL before sharing excerpts. Do not share private conversations or third-party personal details.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(e => { console.error('KESOTOWN export failed: ' + e.message); process.exitCode = 1; });
}
