import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {applySilentEntryWithOAuth,migrateSilentEntryPoint,silentEntryStatus} from '../src/discord-silent-entry.ts';
import type {Env} from '../src/index.ts';
import discord from '../discord-config.json' with {type:'json'};
const app='1556902772362969088',entry='1556902772362969089',secret='fixture-client-secret';
function network({handler=2,scope='applications.commands.update',fail=false,appId=app}={}){
 let current=handler;const calls:Array<{method:string;url:string;body:string}>=[];
 const request=(async(url:string|URL|Request,init:RequestInit={})=>{
  const target=String(url),method=init.method??'GET',body=String(init.body??'');
  calls.push({method,url:target,body});
  if(target.endsWith('/oauth2/token')){
   assert.equal(method,'POST');assert.equal(new URLSearchParams(body).get('scope'),'applications.commands.update');
   return Response.json({token_type:'Bearer',access_token:'oauth-fixture-access',scope});
  }
  if(target.endsWith('/applications/'+appId+'/commands')&&method==='GET'){
   return Response.json([{id:entry,application_id:appId,type:4,handler:current,name:'launch'},{id:'1556902772362969090',application_id:appId,type:1,name:'kp'}]);
  }
  if(target.endsWith('/commands/'+entry)&&method==='PATCH'){
   assert.deepEqual(JSON.parse(body),{handler:1});
   if(fail)return Response.json({message:'not allowed'},{status:403});
   current=1;
   return Response.json({id:entry,type:4,application_id:app,handler:current});
  }
  if(target.endsWith('/commands/'+entry)&&method==='GET')
   return Response.json({id:entry,type:4,application_id:app,handler:current});
  throw Error('unexpected mocked request');
 }) as typeof fetch;
 return {request,calls,current:()=>current};
}
function db(){
 const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE monitor_state(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
 let ops=0;
 class Query{
  values:unknown[]=[];
  constructor(readonly command:string){}
  bind(...values:unknown[]){const q=new Query(this.command);q.values=values;return q;}
  async first(){ops++;return sql.prepare(this.command).get(...this.values as never[])??null;}
  async run(){ops++;return {meta:{changes:Number(sql.prepare(this.command).run(...this.values as never[]).changes)}};}
 }
 const env={DB:{prepare:(query:string)=>new Query(query)},DISCORD_CLIENT_SECRET:secret} as unknown as Pick<Env,'DB'|'DISCORD_CLIENT_SECRET'>;
 return {sql,env,count:()=>ops,close:()=>sql.close()};
}
test('OAuth client credentials update only existing global Primary Entry Point, no Bot token',async()=>{
 const n=network(),result=await applySilentEntryWithOAuth(app,secret,n.request);
 assert.equal(result.handler,1);assert.equal(result.updated,true);
 assert.deepEqual(n.calls.map(x=>x.method),['POST','GET','PATCH','GET']);
 assert.deepEqual(JSON.parse(n.calls[2].body),{handler:1});
 assert.equal(n.current(),1);
 assert.ok(n.calls.every(x=>!x.url.includes(secret)&&!x.body.includes(secret)));
});
test('existing APP_HANDLER is idempotent; wrong OAuth scope is refused without a PATCH',async()=>{
 const already=network({handler:1});
 const out=await applySilentEntryWithOAuth(app,secret,already.request);
 assert.equal(out.updated,false);assert.deepEqual(already.calls.map(x=>x.method),['POST','GET']);
 const wrong=network({scope:'identify'});
 await assert.rejects(applySilentEntryWithOAuth(app,secret,wrong.request),/grant command update scope/);
 assert.deepEqual(wrong.calls.map(x=>x.method),['POST']);
});
test('one-shot scheduled migration persists completion and avoids extra D1 reads on same isolate',async()=>{
 const f=db(),n=network({appId:discord.applicationId}),now=Date.parse('2026-11-04T21:00:00+09:00');
 const result=await migrateSilentEntryPoint(f.env,now,n.request);
 assert.equal(result,'activated');assert.equal((await silentEntryStatus(f.env)).handlerConfirmed,true);
 const before=f.count();const count=n.calls.length;
 await migrateSilentEntryPoint(f.env,now+60000,n.request);
 assert.equal(f.count(),before);assert.equal(n.calls.length,count);
 f.close();
});
test('failed Discord PATCH is retried only after durable backoff, no repeated changes to game tables',async()=>{
 const f=db(),n=network({fail:true,appId:discord.applicationId}),now=Date.parse('2026-11-04T21:00:00+09:00');
 assert.equal(await migrateSilentEntryPoint(f.env,now,n.request),'pending');
 const row=f.sql.prepare('SELECT value FROM monitor_state').get() as {value:string};
 assert.equal(Number(row.value),now+3600000);
 const fake={...f.env,DB:{prepare:(query:string)=>f.env.DB.prepare(query)}} as Pick<Env,'DB'|'DISCORD_CLIENT_SECRET'>;
 const before=n.calls.length;
 assert.equal(await migrateSilentEntryPoint(fake,now+60000,n.request),'backoff');
 assert.equal(n.calls.length,before);
 f.close();
});
test('when no Worker OAuth Secret exists, cron migration touches neither D1 nor Discord',async()=>{
 const env={DISCORD_CLIENT_SECRET:undefined,DB:{prepare:()=>{throw Error('must not read DB');}}} as unknown as Pick<Env,'DB'|'DISCORD_CLIENT_SECRET'>;
 assert.equal(await migrateSilentEntryPoint(env), 'unavailable');
});
