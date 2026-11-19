import test from 'node:test';
import assert from 'node:assert/strict';
import {describeDuelIssue} from '../duel-quality/duel-status-help.js';

test('normal connected state never advertises a verified server sync',()=>{
 assert.equal(describeDuelIssue(),null);
});
test('unknown preceding action always takes priority, never triggers auto retry',()=>{
 const state=describeDuelIssue({retry:true,error:true,loading:true,noOpponent:true});
 assert.equal(state.kind,'retry');
 assert.match(state.message,/新しい着手・招待を送らず/);
});
test('visible errors call for reading error and manual confirmed-status check',()=>{
 const state=describeDuelIssue({error:true});
 assert.equal(state.kind,'error');
 assert.match(state.message,/連続送信せず/);
});
test('initial loading and refresh have distinct, non-optimistic copy',()=>{
 const initial=describeDuelIssue({loading:true,hasSynced:false});
 const refresh=describeDuelIssue({loading:true,hasSynced:true});
 assert.equal(initial.kind,'initial');assert.equal(refresh.kind,'refresh');
 assert.match(refresh.message,/届いたとは限らない/);
});
test('no opponents does not invent a match or new refresh API',()=>{
 const state=describeDuelIssue({noOpponent:true});
 assert.equal(state.kind,'empty');
 assert.match(state.message,/画面内の「更新」/);
});
