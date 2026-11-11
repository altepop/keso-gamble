import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {approvedEscalationPress,escalationPressStatus,ESCA_PRESS_BODY,ESCA_PRESS_START,ESCA_PRESS_END} from '../src/escalation-press.ts';
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE monitor_state(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
 const make=()=>({DB:{prepare:(sql:string)=>({bind:(...args:any[])=>({run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}}),first:async()=>db.prepare(sql).get(...args)??null})})},KP_EARNINGS_WEBHOOK_URL:'https://discord.com/api/webhooks/123456789012345678/fixture-secret-must-not-leak'}) as any;
 return {db,make};
}
const ack=()=>Response.json({id:'234567890123456789',channel_id:'345678901234567890',webhook_id:'123456789012345678',content:ESCA_PRESS_BODY,mention_everyone:true});
test('approved press contains the exact full mode name, explicit everyone and remains within one Discord message',()=>{
 assert(ESCA_PRESS_BODY.startsWith('@everyone\n'));assert(ESCA_PRESS_BODY.length<2000);assert.equal(ESCA_PRESS_BODY.match(/@everyone/g)!.length,1);assert(!ESCA_PRESS_BODY.includes('@here'));assert(ESCA_PRESS_BODY.includes('KP報酬は引き続きあります。'));assert(ESCA_PRESS_BODY.includes('エスカレーションもコンペ方式'));
});
test('one existing earnings webhook message is confirmed, only everyone may be mentioned and another isolate never resends',async()=>{
 const f=fixture(),env=f.make();let calls=0;
 const request=async(input:any,options:any)=>{calls++;const url=new URL(String(input));assert.equal(url.host,'discord.com');assert.equal(url.searchParams.get('wait'),'true');const body=JSON.parse(options.body);assert.deepEqual(body,{content:ESCA_PRESS_BODY,allowed_mentions:{parse:['everyone']}});return ack();};
 assert.equal(await approvedEscalationPress(env,ESCA_PRESS_START+1,request as any),true);assert.equal(await approvedEscalationPress(env,ESCA_PRESS_START+2,request as any),false);assert.equal(await approvedEscalationPress(f.make(),ESCA_PRESS_START+3,request as any),false);assert.equal(calls,1);
 const status=await escalationPressStatus(env);assert(status.posted&&status.mentionEveryone&&status.contentVerified);assert.match(status.bodyHash,/^[a-f0-9]{64}$/);const json=JSON.stringify(status);for(const hidden of ['fixture-secret','345678901234567890','234567890123456789','webhooks/'])assert(!json.includes(hidden));
});
test('network ambiguity, server failure and malformed receipts never cause a second automatic attempt',async()=>{
 for(const mode of ['throw','server','malformed']){
  const f=fixture();let calls=0;const request=async()=>{calls++;if(mode==='throw')throw Error('unknown');if(mode==='server')return new Response('',{status:503});return Response.json({id:'invalid'});};
  assert.equal(await approvedEscalationPress(f.make(),ESCA_PRESS_START+1,request as any),false);assert.equal(await approvedEscalationPress(f.make(),ESCA_PRESS_START+2,request as any),false);assert.equal(calls,1);assert.equal((await escalationPressStatus(f.make())).state,'unknown');
 }
});
test('missing permission or mention acknowledgement is reported without claiming notification success',async()=>{
 const f=fixture();assert.equal(await approvedEscalationPress(f.make(),ESCA_PRESS_START+1,(async()=>new Response('',{status:403})) as any),false);assert.equal((await escalationPressStatus(f.make())).state,'rejected');
 const g=fixture();assert.equal(await approvedEscalationPress(g.make(),ESCA_PRESS_START+1,(async()=>Response.json({...await ack().json() as Record<string,unknown>,mention_everyone:false})) as any),false);const s=await escalationPressStatus(g.make());assert.equal(s.posted,true);assert.equal(s.mentionEveryone,false);
});
test('before/after the bounded release window and without the existing webhook no database write or HTTP request occurs',async()=>{
 const env={DB:{prepare(){throw Error('No DB request');}}} as any,request=async()=>{throw Error('No HTTP request');};
 for(const now of [ESCA_PRESS_START-1,ESCA_PRESS_END])assert.equal(await approvedEscalationPress({...env,KP_EARNINGS_WEBHOOK_URL:'https://discord.com/api/webhooks/123/x'},now,request as any),false);
 assert.equal(await approvedEscalationPress(env,ESCA_PRESS_START+1,request as any),false);
});
test('concurrent isolates share the durable claim and send only one message',async()=>{
 const f=fixture();let calls=0;const request=async()=>{calls++;return ack();};
 const results=await Promise.all([approvedEscalationPress(f.make(),ESCA_PRESS_START+1,request as any),approvedEscalationPress(f.make(),ESCA_PRESS_START+1,request as any)]);
 assert.equal(results.filter(Boolean).length,1);assert.equal(calls,1);
});
test('a DB failure after Discord accepted the message leaves a durable claim and prevents another ping',async()=>{
 const f=fixture(),env=f.make(),prepare=env.DB.prepare;let calls=0;
 env.DB.prepare=(sql:string)=>{if(sql.startsWith('UPDATE'))throw Error('DB unavailable');return prepare(sql);};
 const request=async()=>{calls++;return ack();};await assert.rejects(approvedEscalationPress(env,ESCA_PRESS_START+1,request as any));
 assert.equal(await approvedEscalationPress(f.make(),ESCA_PRESS_START+2,request as any),false);assert.equal(calls,1);assert.equal((await escalationPressStatus(f.make())).state,'claimed');
});
