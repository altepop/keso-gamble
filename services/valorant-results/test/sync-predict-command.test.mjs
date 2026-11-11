import test from 'node:test';
import assert from 'node:assert/strict';
import {syncPredictionCommand} from '../scripts/sync-predict-command.mjs';

const config={applicationId:'123456789012345678',guildId:'234567890123456789'};
const players=[{riotId:'One#JP1',name:'ワン'}];
const token='example-test-token-do-not-use';
test('guild sync upserts only the prediction command, without touching other Discord commands', async()=>{
  const calls=[];
  const result=await syncPredictionCommand({config,botToken:token,configuredPlayers:players,request:async(url,options)=>{
    calls.push({url,method:options.method,body:JSON.parse(options.body),authorization:options.headers.Authorization});
    return Response.json({id:'345678901234567890',application_id:config.applicationId,guild_id:config.guildId,name:'predict',type:1});
  }});
  assert.deepEqual(result,{name:'predict',created:true});
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/\/applications\/123456789012345678\/guilds\/234567890123456789\/commands$/);
  assert.equal(calls[0].method,'POST');
  assert.equal(calls[0].body.name,'predict');
  assert.equal(calls[0].body.options[0].choices[0].value,'One#JP1');
  assert.equal(calls[0].authorization,'Bot '+token);
});
test('unsafe config, missing token and bad acknowledgements are rejected',async()=>{
  const fail=()=>{throw Error('network must not be called')};
  await assert.rejects(syncPredictionCommand({config:{...config,sampleOnly:true},botToken:token,configuredPlayers:players,request:fail}),/configuration/);
  await assert.rejects(syncPredictionCommand({config,botToken:'',configuredPlayers:players,request:fail}),/DISCORD_BOT_TOKEN/);
  await assert.rejects(syncPredictionCommand({config,botToken:token,configuredPlayers:players,request:async()=>Response.json({id:'345678901234567890',application_id:config.applicationId,guild_id:config.guildId,name:'death',type:1})}),/confirm/);
  await assert.rejects(syncPredictionCommand({config,botToken:token,configuredPlayers:players,request:async()=>new Response(null,{status:403})}),/HTTP 403/);
});
