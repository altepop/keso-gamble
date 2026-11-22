import test from 'node:test';
import assert from 'node:assert/strict';
import {duelVoiceCue,isValidDuelVoiceHost,sendDuelVoiceCue} from '../src/board-duels.ts';
import type {BoardDuel} from '../src/board-duels.ts';
const guild='606131625084059674',id='11111111-2222-4333-8444-555555555555';
const base:BoardDuel={id,guild,user_a:'111111111111111111',user_b:'222222222222222222',
 game:'othello',stake:100,status:'pending',board:'',black_user:null,turn_user:null,
 winner:null,version:0,created_at:100,updated_at:100,deadline_at:100000};
test('only server-committed start and finish are eligible for Discord voice audio',()=>{
 assert.equal(duelVoiceCue(base),null);
 assert.deepEqual(duelVoiceCue({...base,status:'active',version:1}),{kind:'started',matchId:id,version:1});
 assert.deepEqual(duelVoiceCue({...base,status:'finished',version:2}),{kind:'finished',matchId:id,version:2});
 assert.equal(duelVoiceCue({...base,status:'cancelled',version:1}),null);
 assert.equal(duelVoiceCue({...base,status:'active',version:5}),null);
});
test('music bot host is HTTPS only and cannot be redirected to an arbitrary target',()=>{
 assert.equal(isValidDuelVoiceHost('https://keso-music-voice.onrender.com/'),true);
 for(const url of ['http://keso-music-voice.onrender.com/','https://evil.example/','https://onrender.com.evil.example/',
  'https://keso-music-voice.onrender.com/subpath','https://user@keso-music-voice.onrender.com/'])
  assert.equal(isValidDuelVoiceHost(url),false);
});
test('voice bridge sends only authorized guild, version, kind and match ID, without KP',async()=>{
 const token='x'.repeat(40);let calls=0;
 const env={MUSIC_VOICE_URL:'https://keso-music-voice.onrender.com/',MUSIC_BRIDGE_TOKEN:token,DB:{}} as unknown as Parameters<typeof sendDuelVoiceCue>[0];
 const request=async(url:URL,init:RequestInit)=>{
  assert.equal(url.origin,'https://keso-music-voice.onrender.com');
  assert.equal(url.pathname,'/v1/duel-cue');
  assert.equal(init.method,'POST');
  assert.equal((init.headers as Record<string,string>).Authorization,'Bearer '+token);
  assert.deepEqual(JSON.parse(init.body as string),{guildId:guild,kind:'started',matchId:id,version:1});
  assert.doesNotMatch(init.body as string,/wallet|stake|secret|balance/i);
  calls++;return {ok:true,json:async()=>({ok:true,played:true})} as Response;
 };
 assert.equal(await sendDuelVoiceCue(env,{...base,status:'active',version:1},request as typeof fetch),true);
 assert.equal(await sendDuelVoiceCue(env,base,request as typeof fetch),false);
 assert.equal(calls,1);
});
test('unconfigured bridge or other host does not dispatch any request',async()=>{
 let calls=0;const never=async()=>{calls++;throw Error('must not dispatch')};
 const match={...base,status:'finished' as const,version:4};
 const env={DB:{},MUSIC_VOICE_URL:'https://attacker.invalid',MUSIC_BRIDGE_TOKEN:'x'.repeat(40)} as unknown as Parameters<typeof sendDuelVoiceCue>[0];
 assert.equal(await sendDuelVoiceCue(env,match,never as typeof fetch),false);
 assert.equal(calls,0);
});
