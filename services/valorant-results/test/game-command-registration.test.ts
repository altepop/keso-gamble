import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureGameCommands,gameCommandStatus,GAME_COMMAND_KEY,GAME_COMMAND_VERSION} from '../src/game-command-registration.ts';
import discord from '../discord-config.json' with {type:'json'};
function fixture(){
 const values=new Map<string,string>();
 const db={prepare:(sql:string)=>({
  bind(...args:string[]){return {
   async first(){return values.has(args[0])?{value:values.get(args[0])}:null;},
   async run(){values.set(args[0],args[1]);return {meta:{changes:1}};},
  };},
 })} as unknown as D1Database;
 return {values,db};
}
test('game commands registered individually, no bulk overwrite; retries skip after version marker',async()=>{
 const {values,db}=fixture(),calls:Array<{url:string;method:string;body:string}>=[];
 const fake=async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input),body=String(init?.body??'');
  calls.push({url,method:String(init?.method),body});
  if(url.endsWith('/oauth2/token'))return Response.json({access_token:'fake-short-lived',token_type:'Bearer'});
  const sent=JSON.parse(body);
  return Response.json({id:'100000000000000199',application_id:discord.applicationId,
   guild_id:discord.guildId,name:sent.name,type:sent.type});
 };
 const waits:number[]=[];
 const env={DB:db,DISCORD_CLIENT_SECRET:'fake-secret'};
 assert.equal(await ensureGameCommands(env,fake as typeof fetch,async n=>{waits.push(n);}),true);
 assert.deepEqual(calls.map(c=>c.method),['POST','POST','POST','POST']);
 assert.deepEqual(calls.slice(1).map(c=>JSON.parse(c.body).name),['play','duel','recruit']);
 assert.ok(calls.slice(1).every(c=>/\/guilds\/\d+\/commands$/.test(c.url)));
 assert.deepEqual(waits,[1500,1500]);
 assert.equal(values.get(GAME_COMMAND_KEY),GAME_COMMAND_VERSION);
 assert.deepEqual(await gameCommandStatus(db),{registered:true,version:GAME_COMMAND_VERSION,commands:['play','duel','recruit']});
 assert.equal(await ensureGameCommands(env,fake as typeof fetch),true);
 assert.equal(calls.length,4);
});
test('no credentials and failed Discord upsert never store registration marker',async()=>{
 const {values,db}=fixture();
 assert.equal(await ensureGameCommands({DB:db}),false);
 assert.equal(values.size,0);
 const fake=async(input:RequestInfo|URL)=>{
  if(String(input).endsWith('/oauth2/token'))return Response.json({access_token:'fake',token_type:'Bearer'});
  return new Response('',{status:403});
 };
 await assert.rejects(ensureGameCommands({DB:db,DISCORD_CLIENT_SECRET:'fake'},fake as typeof fetch,async()=>{}),/403/);
 assert.equal(values.size,0);
});
