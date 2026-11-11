import test from 'node:test';
import assert from 'node:assert/strict';
import {discordInteractions} from '../src/discord-interactions.ts';
import type {Env} from '../src/index.ts';
const app='100000000000000201',guild='100000000000000100';
test('signed game center button opens private game detail without a DB call or outgoing post',async()=>{
 const pair=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']) as CryptoKeyPair;
 const publicKey=Buffer.from(await crypto.subtle.exportKey('raw',pair.publicKey)).toString('hex');
 const config={applicationId:app,guildId:guild,publicKey};
 const payload={id:'100000000000000204',application_id:app,guild_id:guild,type:3,token:'test-only-interaction-token',
  member:{user:{id:'100000000000000202'}},data:{custom_id:'gc:choose:othello'}};
 const body=JSON.stringify(payload),timestamp=String(Math.floor(Date.now()/1000));
 const signed=Buffer.from(await crypto.subtle.sign('Ed25519',pair.privateKey,new TextEncoder().encode(timestamp+body))).toString('hex');
 const request=new Request('https://fixture.example/interactions',{method:'POST',body,headers:{
  'X-Signature-Ed25519':signed,'X-Signature-Timestamp':timestamp,
 }});
 let scheduled=0;
 const ctx={waitUntil(){scheduled++;}} as unknown as ExecutionContext;
 const env={DB:{prepare(){throw Error('Game menu must not touch D1');}}} as unknown as Env;
 const result=await discordInteractions(request,env,ctx,config);
 assert.equal(result.status,200);
 const obj=await result.json() as {type:number;data:{flags:number;components:unknown[]}};
 assert.equal(obj.type,4);
 assert.equal(obj.data.flags,32768|64);
 assert.match(JSON.stringify(obj.data.components),/オセロ/);
 assert.match(JSON.stringify(obj.data.components),/Activity/);
 assert.equal(scheduled,0);
});
