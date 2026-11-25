import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
test('P10.2 Activity manual preview uses authenticated KP client and never auto-polls',()=>{
 const client=readFileSync(new URL('../../../js/kp-client.js',import.meta.url).pathname,'utf8');
 const view=readFileSync(new URL('../../../js/duel-view.js',import.meta.url).pathname,'utf8');
 const app=readFileSync(new URL('../../../js/app.js',import.meta.url).pathname,'utf8');
 assert.match(client,/duelParticipantPreview:\(id,version=null\)=>api\('duels\/spectator-preview/);
 assert.match(view,/data-duel-preview="1"/);
 assert.match(view,/esc\(JSON\.stringify\(participantPreview\.publicState/);
 assert.match(app,/wallet\.duelParticipantPreview\(match\.id\)/);
 assert.match(app,/if\(t\.dataset\.duelPreview\)/);
 assert.doesNotMatch(client,/duelParticipantPreview:.*(?:setInterval|EventSource)/);
});
