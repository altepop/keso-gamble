import test from 'node:test';
import assert from 'node:assert/strict';
import {MUSIC_COMMAND,MUSIC_BUTTON,parseMusic,runMusic,musicControls} from '../src/music-command.ts';
import discord from '../discord-config.json' with {type:'json'};
const guild='100000000000000100',user='100000000000000101',id='100000000000000102';
const config={MUSIC_VOICE_URL:'https://keso-music.onrender.com',
 MUSIC_BRIDGE_TOKEN:'z'.repeat(64)};
const command=(name:string,value?:string|number)=>({
 id,guild_id:guild,member:{user:{id}},data:{name:'music',options:[{name,type:1,
  options:value===undefined?[]:[{name:name==='play'?'song':name==='volume'?'percent':'mode',type:3,value}]}]},
});
test('/music only offers eight existing authorized tracks with controls',()=>{
 assert.equal(MUSIC_COMMAND.options.length,9);
 const choices=MUSIC_COMMAND.options[0].options[0].choices;
 assert.equal(choices.length,8);
 assert.equal(new Set(choices.map(x=>x.value)).size,8);
 assert.match('ms:skip',MUSIC_BUTTON);
 assert.equal(musicControls()[0].components.length,5);
 assert.deepEqual(parseMusic(command('play','mou')).track,'mou');
 assert.equal(parseMusic({id,guild_id:guild,member:{user:{id:user}},data:{custom_id:'ms:pause'}}).action,'pause');
 assert.throws(()=>parseMusic(command('play','youtube:abc')),/曲/);
 assert.throws(()=>parseMusic(command('volume',200)),/音量/);
 assert.throws(()=>parseMusic(command('loop','unknown')),/リピート/);
});
test('unconfigured service is safely disabled with no network activity',async()=>{
 let calls=0;const request=async()=>{calls++;throw Error('must not run');};
 const message=await runMusic({},command('play','mou'),request as typeof fetch);
 assert.match(message,/接続されていない/);assert.equal(calls,0);
});
test('sleeping server only receives health checks; command cannot accidentally enqueue',async()=>{
 const calls:string[]=[];
 const request=async(url:RequestInfo|URL)=>{
  calls.push(String(url));
  return Response.json({status:'starting'});
 };
 const message=await runMusic(config,command('play','mou'),request as typeof fetch);
 assert.match(message,/起動中/);
 assert.equal(calls.length,1);assert.match(calls[0],/health$/);
});
test('verified ready server gets exactly one authenticated command',async()=>{
 const calls:Array<{url:string;init?:RequestInit}>=[];
 const request=async(url:RequestInfo|URL,init?:RequestInit)=>{
  calls.push({url:String(url),init});
  return String(url).endsWith('/health')?Response.json({status:'ready'}):
   Response.json({ok:true,message:'🎵 もう一周 を再生する。'});
 };
 const message=await runMusic(config,command('play','mou'),request as typeof fetch);
 assert.match(message,/再生する/);
 assert.equal(calls.length,2);
 assert.equal(calls[1].init?.method,'POST');
 assert.equal(new Headers(calls[1].init?.headers).get('Authorization'),'Bearer '+'z'.repeat(64));
 assert.deepEqual(JSON.parse(String(calls[1].init?.body)),{
  guildId:guild,userId:id,requestId:id,applicationId:discord.applicationId,action:'play',track:'mou'});
});
test('non-HTTPS or non-allowlisted control servers cannot receive secrets',async()=>{
 let calls=0;
 const message=await runMusic({...config,MUSIC_VOICE_URL:'http://127.0.0.1:10000'},
  command('skip'),(async()=>{calls++;return Response.json({status:'ready'});}) as typeof fetch);
 assert.match(message,/接続設定/);assert.equal(calls,0);
});
