import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {spectatorPublicSnapshot,type SpectatorSource} from '../src/duel-spectator-public.ts';
import {compareSpectatorRevision} from '../src/duel-spectator-admission.ts';
import {boardDuelParticipantPreview} from '../src/board-duels.ts';
const source:SpectatorSource={id:'8b6cff46-df7a-42d2-a4c9-bc2a6b8bde10',guild:'guild',game:'hitblow',status:'active',user_a:'a',user_b:'b',turn_user:'a',winner:null,version:7,updated_at:1,board:JSON.stringify({history:[],privateA:'SECRET_VALUE',secret:'SECRET_VALUE'})};
test('participant preview uses public projection only',()=>{
 const view=compareSpectatorRevision(spectatorPublicSnapshot({...source,private_hand:'SECRET_VALUE'} as SpectatorSource),null);
 assert.equal(view.kind,'snapshot');
 assert.doesNotMatch(JSON.stringify(view),/SECRET_VALUE|private_hand|privateA/);
 assert.deepEqual(compareSpectatorRevision(spectatorPublicSnapshot(source),7),{kind:'no_change',version:7});
});
test('participant preview wiring remains behind existing KP bearer owner and scoped match lookup',()=>{
 const api=readFileSync(new URL('../src/kp-api.ts',import.meta.url).pathname,'utf8');
 const duels=readFileSync(new URL('../src/board-duels.ts',import.meta.url).pathname,'utf8');
 assert.match(api,/path==='\/api\/kp\/duels\/spectator-preview'/);
 assert.match(api,/boardDuelParticipantPreview\(env,mapping\.guildId,owner\.user/);
 assert.match(duels,/FROM kp_board_duels WHERE guild=\\? AND id=\\? AND \\(user_a=\\? OR user_b=\\?\\)/);
 assert.match(duels,/const snapshot=spectatorPublicSnapshot\(match\)/);
});

test('participant preview avoids private secrets SQL while retaining ownership and no-change responses',async()=>{
 const sqls:string[]=[];
 const db={
  prepare(sql:string){
   sqls.push(sql);
   assert.doesNotMatch(sql,/kp_board_duel_secrets|json_extract/i);
   return {
    first:async()=>{
     if(sql.includes('FROM kp_settings'))return {value:'3'};
     throw Error('expected bound query');
    },
    bind(...args:unknown[]){
     assert.deepEqual(args,['guild',source.id,'a','a']);
     return {first:async()=>source};
    }
   };
  }
 };
 const env={DB:db} as never;
 const view=await boardDuelParticipantPreview(env,'guild','a',source.id,null);
 assert.equal(view.kind,'snapshot');
 assert.doesNotMatch(JSON.stringify(view),/SECRET_VALUE|private_hand|privateA/);
 assert.deepEqual(await boardDuelParticipantPreview(env,'guild','a',source.id,7),
  {kind:'no_change',version:7});
 assert.equal(sqls.filter(sql=>sql.includes('FROM kp_board_duels')).length,2);
 await assert.rejects(()=>boardDuelParticipantPreview(env,'guild','a','invalid',null),/対戦ID/);
});

test('participant preview retains fail-closed guild and caller checks',async()=>{
 const db={
  prepare(sql:string){
   if(sql.includes('FROM kp_settings'))return {first:async()=>({value:'3'})};
   return {bind(...args:unknown[]){
    assert.deepEqual(args,['other-guild',source.id,'unrelated','unrelated']);
    return {first:async()=>null};
   }};
  }
 };
 await assert.rejects(
  ()=>boardDuelParticipantPreview({DB:db} as never,'other-guild','unrelated',source.id,null),
  /対戦が見つかりません/);
});
