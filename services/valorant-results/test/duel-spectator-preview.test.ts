import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {spectatorPublicSnapshot,type SpectatorSource} from '../src/duel-spectator-public.ts';
import {compareSpectatorRevision} from '../src/duel-spectator-admission.ts';
const source:SpectatorSource={id:'8b6cff46-df7a-42d2-a4c9-bc2a6b8bde10',guild:'guild',game:'hitblow',status:'active',user_a:'a',user_b:'b',turn_user:'a',winner:null,version:7,updated_at:1,board:JSON.stringify({history:[],privateA:'SECRET_VALUE',secret:'SECRET_VALUE'})};
test('participant preview uses public projection only',()=>{
 const view=compareSpectatorRevision(spectatorPublicSnapshot({...source,private_hand:'SECRET_VALUE'} as SpectatorSource),null);
 assert.equal(view.kind,'snapshot');
 assert.doesNotMatch(JSON.stringify(view),/SECRET_VALUE|private_hand|privateA/);
 assert.deepEqual(compareSpectatorRevision(spectatorPublicSnapshot(source),7),{kind:'no_change',version:7});
});
test('participant preview wiring remains behind existing KP bearer owner and scoped match lookup',()=>{
 const api=readFileSync(new URL('../src/kp-api.ts',import.meta.url),'utf8');
 const duels=readFileSync(new URL('../src/board-duels.ts',import.meta.url),'utf8');
 assert.match(api,/path==='\/api\/kp\/duels\/spectator-preview'/);
 assert.match(api,/boardDuelParticipantPreview\(env,mapping\.guildId,owner\.user/);
 assert.match(duels,/const match=await room\(env,guild,id,user\)/);
 assert.match(duels,/const snapshot=spectatorPublicSnapshot\(match\)/);
});
