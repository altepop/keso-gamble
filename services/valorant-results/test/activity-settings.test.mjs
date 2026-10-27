import test from'node:test';import assert from'node:assert/strict';import{mkdtempSync,writeFileSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{provisionActivityAuth}from'../scripts/provision-activity-auth.mjs';
function fixture(t){const directory=mkdtempSync(join(tmpdir(),'activity-secret-'));writeFileSync(join(directory,'wrangler.jsonc'),JSON.stringify({name:'fixture-worker'}));t.after(()=>rmSync(directory,{recursive:true,force:true}));return directory;}
const env={CLOUDFLARE_API_TOKEN:'fixture-cf-token',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),DISCORD_CLIENT_SECRET:'fixture-client-secret'};
test('missing optional repository Secret does not change the Worker',async t=>{await provisionActivityAuth(fixture(t),{},async()=>{throw Error('must not call')});});
test('an existing Worker Secret is retained; plaintext bindings fail closed',async t=>{
 const directory=fixture(t);let calls=0;await provisionActivityAuth(directory,env,async()=>{calls++;return Response.json({success:true,result:{bindings:[{type:'secret_text',name:'DISCORD_CLIENT_SECRET'}]}});});assert.equal(calls,1);
 await assert.rejects(provisionActivityAuth(directory,env,async()=>Response.json({success:true,result:{bindings:[{type:'plain_text',name:'DISCORD_CLIENT_SECRET'}]}})),/secret binding/);
});
test('only an explicitly supplied repository Secret is written to the intended Worker and failures contain no secret',async t=>{
 const directory=fixture(t);let calls=0;
 await provisionActivityAuth(directory,env,async(url,init)=>{calls++;assert.ok(url.includes('/workers/scripts/fixture-worker/'));if(calls===1)return Response.json({success:true,result:{bindings:[]}});assert.equal(init.method,'PUT');assert.deepEqual(JSON.parse(init.body),{name:'DISCORD_CLIENT_SECRET',type:'secret_text',text:env.DISCORD_CLIENT_SECRET});return Response.json({success:true});});assert.equal(calls,2);
 await assert.rejects(provisionActivityAuth(directory,env,async()=>new Response(env.DISCORD_CLIENT_SECRET,{status:403})),error=>!error.message.includes(env.DISCORD_CLIENT_SECRET)&&/403/.test(error.message));
});
