import test from 'node:test';
import assert from 'node:assert/strict';
import discord from '../discord-config.json' with { type: 'json' };
import {
  ensurePredictionCommand,predictionRegistrationStatus,PREDICT_REGISTRATION_KEY,PREDICT_COMMAND_VERSION,
} from '../src/predict-registration.ts';

function fixture() {
  const records=new Map<string,string>();
  const queries:string[]=[];
  class Q {
    args: unknown[]=[];
    constructor(readonly sql:string) {queries.push(sql);}
    bind(...args:unknown[]) {this.args=args;return this;}
    async first() {return records.has(String(this.args[0])) ? {value:records.get(String(this.args[0]))} : null;}
    async run() {records.set(String(this.args[0]),String(this.args[1]));return {meta:{changes:1}};}
  }
  const db={prepare:(sql:string)=>new Q(sql)} as unknown as D1Database;
  return {db,records,queries};
}
test('OAuth command registration touches only /predict, stores only version, and is idempotent',async()=>{
  const f=fixture(),calls: Array<{url:string;method:string;authorization:string;body:string}>=[];
  const request=async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input),method=init?.method??'GET',headers=new Headers(init?.headers);
    calls.push({url,method,authorization:headers.get('Authorization')??'',body:String(init?.body??'')});
    if(url.endsWith('/oauth2/token'))return Response.json({access_token:'short-lived-fixture-credential',token_type:'Bearer'});
    if(url.endsWith('/commands')) {
      const payload=JSON.parse(String(init?.body));
      assert.equal(payload.name,'predict');
      assert.equal(payload.options[0].name,'player');
      return Response.json({id:'345678901234567890',application_id:discord.applicationId,guild_id:discord.guildId,name:'predict',type:1});
    }
    throw Error('Unexpected endpoint');
  };
  const env={DB:f.db,DISCORD_CLIENT_SECRET:'client-secret-fixture'};
  assert.equal(await ensurePredictionCommand(env,request as typeof fetch),true);
  assert.equal(calls.length,2);
  assert.match(calls[0].url,/oauth2\/token$/);
  assert.match(calls[0].body,/applications.commands.update/);
  assert.match(calls[0].authorization,/^Basic /);
  assert.match(calls[1].url,/\/guilds\/\d+\/commands$/);
  assert.equal(calls[1].method,'POST');
  assert.equal(calls[1].authorization,'Bearer short-lived-fixture-credential');
  assert.deepEqual(await predictionRegistrationStatus(f.db),{command:'predict',registered:true,version:PREDICT_COMMAND_VERSION});
  assert.equal(f.records.get(PREDICT_REGISTRATION_KEY),PREDICT_COMMAND_VERSION);
  assert.equal([...f.records.values()].join('').includes('credential'),false);
  assert.equal(await ensurePredictionCommand(env,request as typeof fetch),true);
  assert.equal(calls.length,2,'no new API calls after success');
});
test('without client credentials, no network or registration marker is created',async()=>{
  const f=fixture();
  const request=async()=>{throw Error('Network must not be called');};
  assert.equal(await ensurePredictionCommand({DB:f.db},request as unknown as typeof fetch),false);
  assert.equal(f.records.size,0);
});
test('Discord errors and unexpected responses do not claim success',async()=>{
  for(const response of [new Response(null,{status:401}),
    Response.json({access_token:'bad',token_type:'not-bearer'})]){
    const f=fixture();
    await assert.rejects(ensurePredictionCommand({DB:f.db,DISCORD_CLIENT_SECRET:'fixture'},
      (async()=>response) as typeof fetch));
    assert.equal(f.records.size,0);
  }
  const f=fixture();
  await assert.rejects(ensurePredictionCommand({DB:f.db,DISCORD_CLIENT_SECRET:'fixture'},(async()=>{
    return f.queries.length===1?Response.json({access_token:'ok',token_type:'Bearer'}):
      Response.json({id:'345678901234567890',application_id:discord.applicationId,guild_id:'invalid',name:'predict',type:1});
  }) as typeof fetch));
  assert.equal(f.records.size,0);
});
