import test from 'node:test';
import assert from 'node:assert/strict';
import {changeActivityEntryPoint} from '../services/valorant-results/scripts/activity-entry-handler.mjs';
const applicationId='1556902772362969088',commandId='1556902772362969089',token='example-private-token-is-never-logged';
function fixture(handler=2,entries=1){
 let commands=[{id:commandId,application_id:applicationId,name:'launch',description:'Launch VCT QUIZ',type:4,handler},
  {id:'1556902772362969090',application_id:applicationId,name:'kp',type:1,description:'KP'}];
 if(entries===2)commands.push({...commands[0],id:'1556902772362969091'});
 if(entries===0)commands=commands.filter(x=>x.type!==4);
 const calls=[];
 const request=async(url,init={})=>{
  const method=init.method??'GET';calls.push({method,url,body:init.body??null});
  if(url.endsWith('/commands')&&method==='GET')return Response.json(commands);
  if(url.endsWith('/'+commandId)&&method==='PATCH'){
   const patch=JSON.parse(init.body);
   assert.deepEqual(Object.keys(patch),['handler'],'do not overwrite any command fields');
   commands[0]={...commands[0],handler:patch.handler};
   return Response.json(commands[0]);
  }
  if(url.endsWith('/'+commandId)&&method==='GET')return Response.json(commands[0]);
  throw Error('unexpected Discord API operation '+method+' '+url);
 };
 return {request,calls,commands:()=>commands};
}
test('GET global commands and PATCH only the existing entry handler from 2 to 1',async()=>{
 const f=fixture();
 const result=await changeActivityEntryPoint({applicationId,botToken:token,mode:'apply',request:f.request});
 assert.deepEqual({from:result.before,to:result.after,updated:result.updated},{from:2,to:1,updated:true});
 assert.deepEqual(f.calls.map(c=>c.method),['GET','PATCH','GET']);
 assert.deepEqual(f.commands().map(c=>[c.name,c.type,c.handler]),[['launch',4,1],['kp',1,undefined]]);
 assert.equal(f.calls[1].url,'https://discord.com/api/v10/applications/'+applicationId+'/commands/'+commandId);
 assert.ok(!JSON.stringify(f.calls).includes(token),'token must not be part of URLs or submitted payload');
});
test('idempotent apply does not PATCH and explicit rollback restores handler 2',async()=>{
 const f=fixture(1);
 const noChange=await changeActivityEntryPoint({applicationId,botToken:token,mode:'apply',request:f.request});
 assert.equal(noChange.updated,false);
 assert.deepEqual(f.calls.map(c=>c.method),['GET']);
 const restored=await changeActivityEntryPoint({applicationId,botToken:token,mode:'rollback',request:f.request});
 assert.equal(restored.after,2);assert.equal(restored.updated,true);
 assert.deepEqual(f.calls.map(c=>c.method),['GET','GET','PATCH','GET']);
});
test('status checks without PATCH; absent or multiple global launch commands refuse destructive changes',async()=>{
 const f=fixture();
 const status=await changeActivityEntryPoint({applicationId,botToken:token,mode:'status',request:f.request});
 assert.equal(status.after,2);assert.equal(status.updated,false);
 assert.deepEqual(f.calls.map(c=>c.method),['GET']);
 for(const count of [0,2]){
  const bad=fixture(2,count);
  await assert.rejects(changeActivityEntryPoint({applicationId,botToken:token,mode:'apply',request:bad.request}),/Exactly one/);
  assert.deepEqual(bad.calls.map(c=>c.method),['GET']);
 }
});
test('missing token, invalid app ID or unsafe mode fails before HTTP',async()=>{
 const f=fixture();
 for(const opts of [{applicationId:'bad',botToken:token,mode:'apply'},{applicationId,botToken:'',mode:'apply'},{applicationId,botToken:token,mode:'delete'}]){
  await assert.rejects(changeActivityEntryPoint({...opts,request:f.request}));
 }
 assert.equal(f.calls.length,0);
});
