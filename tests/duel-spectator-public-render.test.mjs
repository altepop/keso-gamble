import assert from 'node:assert/strict';
import test from 'node:test';
import {spectatorBoardPreview} from '../js/duel-view.js';

test('P10 spectator board is read-only, contains 64 public squares, and has no action buttons',()=>{
 const html=spectatorBoardPreview({game:'othello',publicState:{board:'.'.repeat(64)}});
 assert.equal((html.match(/role="gridcell"/g)??[]).length,64);
 assert.doesNotMatch(html,/<button|data-duel-act|on(click|error)=/i);
});
test('P10 spectator view suppresses malformed boards, and hides poker hands',()=>{
 const secret='<img src=x onerror=alert(1)>';
 assert.doesNotMatch(spectatorBoardPreview({game:'othello',publicState:{board:secret}}),/onerror/);
 assert.doesNotMatch(spectatorBoardPreview({game:'poker',publicState:{private_hand:secret}}),/onerror/);
});
test('P10 spectator history escapes strings supplied by an earlier untrusted state',()=>{
 const secret='<img src=x onerror=alert(1)>';
 const html=spectatorBoardPreview({game:'hitblow',publicState:{history:[{by:'a',guess:secret,hit:1,blow:2}]}});
 assert.ok(html.includes('&lt;img'));
 assert.ok(!html.includes('<img'));
});
