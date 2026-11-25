import test from 'node:test';
import assert from 'node:assert/strict';
import {describeDuelJourney} from '../duel-quality/duel-quality.js';

test('every phase explains the next action without implying a confirmed move',()=>{
 const setup=describeDuelJourney();
 assert.equal(setup.step,0);
 assert.match(setup.detail,/賭けKP/);
 assert.deepEqual(setup.phases,['招待','対戦','結果・再戦']);
 const waiting=describeDuelJourney({stage:'pending',outgoing:true});
 assert.equal(waiting.step,0);
 assert.match(waiting.title,/承諾待ち/);
 const incoming=describeDuelJourney({stage:'pending'});
 assert.match(incoming.detail,/賭けKP.*確認/);
 const mine=describeDuelJourney({stage:'active',myTurn:true});
 assert.equal(mine.step,1);
 assert.match(mine.title,/あなたの番/);
 const other=describeDuelJourney({stage:'active',myTurn:false});
 assert.match(other.title,/相手の番/);
 const over=describeDuelJourney({stage:'finished',canRematch:true});
 assert.equal(over.step,2);
 assert.match(over.detail,/準備できる/);
});
test('recovery notice takes precedence, never encouraging a second request',()=>{
 const retry=describeDuelJourney({stage:'active',myTurn:true,retry:true,refreshing:true});
 assert.match(retry.title,/未確認/);
 assert.match(retry.detail,/新しい操作を送らない/);
 assert.doesNotMatch(retry.detail,/着手する/);
 const refresh=describeDuelJourney({stage:'active',refreshing:true});
 assert.match(refresh.detail,/サーバー確定表示/);
});
test('the journey is read-only and contains no secret, bet modification or action identifiers',()=>{
 const all=['setup','pending','active','finished'].map(stage=>describeDuelJourney({stage}));
 assert.ok(all.every(s=>s.step>=0&&s.step<=2));
 assert.doesNotMatch(JSON.stringify(all),/data-duel-act|private_hand|session|accessToken|winner=/);
});
