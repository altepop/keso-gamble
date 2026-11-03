import test from 'node:test';
import assert from 'node:assert/strict';
import {discordInteractions} from '../src/discord-interactions.ts';
import type {Env} from '../src/index.ts';
const applicationId='1556902772362969088',guildId='100000000000000100',userId='100000000000000101';
const make=async(interaction:Record<string,unknown>,key:CryptoKey)=>{
 const timestamp=String(Math.floor(Date.now()/1000)),body=JSON.stringify(interaction);
 const signature=Buffer.from(await crypto.subtle.sign('Ed25519',key,new TextEncoder().encode(timestamp+body))).toString('hex');
 return new Request('https://test.example/interactions',{method:'POST',headers:{'X-Signature-Ed25519':signature,'X-Signature-Timestamp':timestamp,'Content-Type':'application/json'},body});
};
const keys=async()=>crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']) as Promise<CryptoKeyPair>;
const config=async(pair:CryptoKeyPair)=>({applicationId,guildId,publicKey:Buffer.from(await crypto.subtle.exportKey('raw',pair.publicKey)).toString('hex')});
const event=(data:Record<string,unknown>,extra:Record<string,unknown>={})=>({id:'1556902772362969099',type:2,application_id:applicationId,guild_id:guildId,token:'signed-opaque-token',member:{user:{id:userId},permissions:'0'},data,...extra});
const ctx=()=>{const tasks:Promise<unknown>[]=[];return {waitUntil:(task:Promise<unknown>)=>{tasks.push(task);},tasks} as unknown as ExecutionContext&{tasks:Promise<unknown>[]};};
test('signed PRIMARY_ENTRY_POINT application command returns LAUNCH_ACTIVITY 12 with zero messages',async()=>{
 const pair=await keys(),configValue=await config(pair),context=ctx();
 const req=await make(event({type:4,name:'launch'}),pair.privateKey);
 const res=await discordInteractions(req,{} as Env,context,configValue);
 assert.equal(res.status,200);assert.deepEqual(await res.json(),{type:12});
 assert.equal(context.tasks.length,0,'no Discord webhook follow-up and no post');
});
test('signed Primary Entry Point launches from DM without guild_id; gameplay commands remain guild-only',async()=>{
 const pair=await keys(),cfg=await config(pair);
 const dmLaunch=event({type:4,name:'launch'},{guild_id:undefined,member:undefined,user:{id:userId}});
 const result=await discordInteractions(await make(dmLaunch,pair.privateKey),{} as Env,ctx(),cfg);
 assert.equal(result.status,200);
 assert.deepEqual(await result.json(),{type:12},'DM launch must not be blocked by the guild gate');
 const dmCommand=event({type:1,name:'unsupported'},{guild_id:undefined,member:undefined,user:{id:userId}});
 const denied=await discordInteractions(await make(dmCommand,pair.privateKey),{} as Env,ctx(),cfg);
 assert.equal(denied.status,200);
 assert.notEqual((await denied.json() as {type:number}).type,12,'other DM commands remain unavailable');
});
test('entry callback does not intercept autocomplete interaction or arbitrary chat commands',async()=>{
 const pair=await keys(),c=await config(pair);
 const res=await discordInteractions(await make(event({type:1,name:'unsupported'}),pair.privateKey),{} as Env,ctx(),c);
 assert.equal(res.status,200);
 assert.notEqual((await res.json() as {type:number}).type,12);
});
test('interaction signature/app identity/guild checks occur BEFORE silent activity launch',async()=>{
 const pair=await keys(),c=await config(pair);
 const wrongApp=await discordInteractions(await make(event({type:4,name:'launch'},{application_id:'1556902772362969002'}),pair.privateKey),{} as Env,ctx(),c);
 assert.equal(wrongApp.status,401);
 const wrongGuild=await discordInteractions(await make(event({type:4,name:'launch'},{guild_id:'100000000000000199'}),pair.privateKey),{} as Env,ctx(),c);
 assert.notEqual((await wrongGuild.json() as {type:number}).type,12);
 const forged=await make(event({type:4,name:'launch'}),pair.privateKey);
 forged.headers.set('X-Signature-Ed25519','0'.repeat(128));
 const denied=await discordInteractions(forged,{} as Env,ctx(),c);assert.equal(denied.status,401);
});
