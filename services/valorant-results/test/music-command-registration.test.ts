import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureMusicCommand,musicCommandStatus,MUSIC_REGISTRATION_KEY,MUSIC_REGISTRATION_VERSION}
 from '../src/music-command-registration.ts';
import {MUSIC_COMMAND} from '../src/music-command.ts';
import discord from '../discord-config.json' with {type:'json'};
function fixture(){
 const values=new Map<string,string>();
 const db={prepare:(_sql:string)=>({bind(...args:string[]){
  return {async first(){return values.has(args[0])?{value:values.get(args[0])}:null;},
   async run(){values.set(args[0],args[1]);return {meta:{changes:1}};}};}})} as unknown as D1Database;
 return {values,db};
}
test('the nine-song /music guild command is upserted once, leaving other commands untouched',async()=>{
 const {values,db}=fixture(),calls:Array<{url:string;method:string;body:string}>=[];
 const request=async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input),body=String(init?.body??'');
  calls.push({url,method:String(init?.method),body});
  if(url.endsWith('/oauth2/token'))return Response.json({access_token:'temporary',token_type:'Bearer'});
  const sent=JSON.parse(body);
  return Response.json({id:'100000000000000198',application_id:discord.applicationId,
   guild_id:discord.guildId,name:sent.name,type:sent.type,options:sent.options});
 };
 const env={DB:db,DISCORD_CLIENT_SECRET:'test-secret'};
 assert.equal(await ensureMusicCommand(env,request as typeof fetch),true);
 assert.equal(calls.length,2);
 assert.deepEqual(calls.map(x=>x.method),['POST','POST']);
 assert.match(calls[1].url,/\/guilds\/\d+\/commands$/);
 assert.equal(JSON.parse(calls[1].body).name,'music');
 assert.equal(JSON.parse(calls[1].body).options[0].options[0].choices.length,9);
 assert.ok(JSON.parse(calls[1].body).options[0].options[0].choices
  .some((x:{value:string;name:string})=>x.value==='makekowa'&&x.name==='負け怖'));
 assert.equal(values.get(MUSIC_REGISTRATION_KEY),MUSIC_REGISTRATION_VERSION);
 assert.deepEqual(await musicCommandStatus(db),
  {registered:true,version:MUSIC_REGISTRATION_VERSION,tracks:9});
 assert.equal(await ensureMusicCommand(env,request as typeof fetch),true);
 assert.equal(calls.length,2,'already registered version should skip Discord network');
});
test('missing credentials or failed registration never sets the version marker',async()=>{
 const {values,db}=fixture();
 assert.equal(await ensureMusicCommand({DB:db}),false);
 assert.equal(values.size,0);
 const oauth=async(input:RequestInfo|URL)=>{
  if(String(input).endsWith('/oauth2/token'))
   return Response.json({access_token:'temporary',token_type:'Bearer'});
  return new Response('forbidden',{status:403});
 };
 await assert.rejects(ensureMusicCommand({DB:db,DISCORD_CLIENT_SECRET:'test'},
  oauth as typeof fetch),/403/);
 assert.equal(values.size,0);
});
test('partial Discord command registration is not considered complete',async()=>{
 const {values,db}=fixture();
 const fake=async(input:RequestInfo|URL)=>{
  if(String(input).endsWith('/oauth2/token'))
   return Response.json({access_token:'temporary',token_type:'Bearer'});
  return Response.json({id:'100000000000000198',application_id:discord.applicationId,
   guild_id:discord.guildId,name:'music',type:1,options:[]});
 };
 await assert.rejects(ensureMusicCommand({DB:db,DISCORD_CLIENT_SECRET:'test'},
  fake as typeof fetch),/unconfirmed/);
 assert.equal(values.size,0);
 assert.equal(MUSIC_COMMAND.options[0].options[0].choices.length,9);
});
