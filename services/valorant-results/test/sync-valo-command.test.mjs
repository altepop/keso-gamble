import test from 'node:test';
import assert from 'node:assert/strict';
import {syncValoCommand} from '../scripts/sync-valo-command.mjs';
import {valoCommand} from '../src/valo-command.ts';
const config={applicationId:'123456789012345678',guildId:'987654321098765432'};
const definition=valoCommand([{name:'VDK',riotId:'Dolly#SDGs'}]);
test('unchanged /valo is not re-posted',async()=>{
 const calls=[];
 const mock=async(url,init)=>{
   calls.push({url,method:init.method});
   assert.equal(init.headers.Authorization,'Bot test-token');
   return Response.json([{...definition,id:'111'}]);
 };
 const status=await syncValoCommand(config,'test-token',mock,definition);
 assert.equal(status,'unchanged');
 assert.deepEqual(calls.map(c=>c.method),['GET']);
 assert.ok(calls[0].url.includes('/guilds/987654321098765432/commands'));
});
test('only /valo gets upserted when coach schema changes; no bulk/delete',async()=>{
 const calls=[];
 const mock=async(_url,init)=>{
   calls.push(init);
   if(init.method==='GET')return Response.json([
     {name:'valo',type:1,description:'old definition',options:[]},
     {name:'death',type:1},{name:'predict',type:1},
   ]);
   const sent=JSON.parse(init.body);
   assert.equal(sent.name,'valo');
   assert.ok(sent.options.some(o=>o.name==='coach'));
   assert.equal(sent.options.find(o=>o.name==='coach').options[0].required,false);
   return Response.json({...sent,application_id:config.applicationId,guild_id:config.guildId});
 };
 assert.equal(await syncValoCommand(config,'test-token',mock,definition),'updated');
 assert.deepEqual(calls.map(c=>c.method),['GET','POST']);
 assert.equal(JSON.parse(calls[1].body).options.some(o=>o.name==='death'),false);
});
test('missing credentials and unexpected response fail closed without mutating other commands',async()=>{
 let invoked=0;
 await assert.rejects(syncValoCommand(config,'',async()=>{invoked++;return Response.json([])},definition),/token unavailable/);
 assert.equal(invoked,0);
 const mock=async(_url,init)=>{
   if(init.method==='GET')return Response.json([]);
   return Response.json({...definition,application_id:config.applicationId,guild_id:'wrong'});
 };
 await assert.rejects(syncValoCommand(config,'test-token',mock,definition),/not confirmed/);
});
