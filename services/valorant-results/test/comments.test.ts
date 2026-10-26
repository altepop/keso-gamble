import test from 'node:test';
import assert from 'node:assert/strict';
import legacy from '../taunts.json' with { type: 'json' };
import catalogue from '../meme-quotes.json' with { type: 'json' };
import { commentTones, commentToneNames, commentPools, memeQuotes, resultComment, selectedTone } from '../src/comments.ts';
import type { CommentGroup, Tone } from '../src/comments.ts';

const groups = Object.keys(commentTones) as CommentGroup[];

test('all situations keep the original catalogue and separate authored lines from sourced memes', () => {
  // Count distinct wording, not repeated mappings of one quotation to several situations.
  assert.equal(new Set(Object.values(commentPools).flat()).size, 748);
  assert.deepEqual([...commentToneNames].sort(), ['dry', 'hot', 'meme', 'net', 'normal', 'roast']);
  for (const group of groups) {
    assert.deepEqual(Object.keys(commentTones[group]).sort(), [...commentToneNames].sort());
    for (const tone of ['dry', 'hot', 'normal', 'roast'] as Tone[]) assert.equal(commentTones[group][tone].length, 5);
    assert.ok(commentTones[group].net.length >= 9);
    assert.ok(commentTones[group].meme.length > 0);
    for (const line of (legacy as Record<string, string[]>)[group] ?? []) assert.ok(commentPools[group].includes(line));
  }
});

test('every tone and line can be selected within its eligible situation', () => {
  for (const group of groups) {
    const seen = new Map<Tone, Set<string>>();
    for (let n = 0; n < 4000; n++) {
      const id = 'tone-coverage-' + n, tone = selectedTone(id, 'test-player');
      const text = resultComment(id, 'test-player', group, 7).slice('\n💬 '.length);
      const allowed = [...commentTones[group][tone], ...(tone === 'normal' ? ((legacy as Record<string, string[]>)[group] ?? []) : [])];
      assert.ok(allowed.some(line => line.replaceAll('{streak}', '7') === text), group + ':' + tone);
      if (!seen.has(tone)) seen.set(tone, new Set());
      seen.get(tone)!.add(text);
    }
    for (const tone of commentToneNames) for (const line of commentTones[group][tone]) {
      assert.ok(seen.get(tone)?.has(line.replaceAll('{streak}', '7')), group + ':' + tone + ':' + line);
    }
  }
});

test('tone and wording remain stable on refetches and authored streaks use actual counts', () => {
  for (const group of ['losing_streak', 'long_losing_streak', 'winning_streak', 'long_winning_streak'] as CommentGroup[]) {
    for (let n = 0; n < 30; n++) {
      const id = 'same-match-' + n;
      const first = resultComment(id, 'same-player', group, 6);
      assert.equal(resultComment(id, 'same-player', group, 6), first);
      if (selectedTone(id, 'same-player') !== 'meme') assert.match(first, /6連/);
      assert.doesNotMatch(first, /\{streak\}|@everyone|@here/);
    }
  }
  const completion = resultComment('same-match', '@everyone', 'completed');
  assert.doesNotMatch(completion, /@everyone|@here|<@|\d+連勝|\d+連敗/);
});

test('meme quotations have traceable evidence and invented continuations are absent from all pools', () => {
  assert.equal(catalogue.schemaVersion, 1);
  assert.equal(new Set(memeQuotes.map(quote => quote.id)).size, memeQuotes.length);
  assert.equal(new Set(memeQuotes.map(quote => quote.text)).size, memeQuotes.length);
  assert.deepEqual(memeQuotes.filter(quote => quote.source === 'yokatta').map(quote => quote.text), [
    '良かったこの距離で', '兄さん…あかーん！', 'やめろ！そこは…', 'しばくぞ！', 'そこはあかんゆーとるやろ',
  ]);
  for (const quote of memeQuotes) {
    const source = (catalogue.sources as Record<string, { url: string; verification: string; note: string }>)[quote.source];
    assert.ok(source, quote.id);
    assert.match(source.url, /^https:\/\//);
    assert.ok(['secondary-transcription', 'secondary-usage-record'].includes(source.verification));
    assert.ok(source.note.length > 0);
    assert.doesNotMatch(quote.text, /\{streak\}|[\r\n]|https?:\/\/|<@|@everyone|@here/);
    assert.ok(quote.groups.length > 0);
    for (const group of quote.groups) assert.ok(groups.includes(group as CommentGroup));
  }
  const plainQuotes = new Set(memeQuotes.map(quote => quote.text));
  for (const line of Object.values(commentPools).flat()) {
    if (line.includes('良かったこの距離で') || line.includes('うおw')) assert.ok(plainQuotes.has(line), line);
  }
});

test('selected meme messages stay verbatim even during streaks, with no count, extra line or authored suffix', () => {
  const seen = new Set<string>();
  for (const group of groups) for (let n = 0; n < 1000; n++) {
    const id = 'verbatim-' + n;
    if (selectedTone(id, 'test-player') !== 'meme') continue;
    const text = resultComment(id, 'test-player', group, 99);
    const quote = memeQuotes.find(candidate => text === '\n💬 ' + candidate.text);
    assert.ok(quote, text);
    assert.ok(quote.groups.includes(group));
    assert.equal(resultComment(id, 'test-player', group, 100), text);
    seen.add(quote.id);
  }
  assert.deepEqual([...seen].sort(), memeQuotes.map(quote => quote.id).sort());
});
