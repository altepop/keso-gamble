import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractSettings,deploymentConfig,prepareLiveSettings } from '../scripts/live-settings.mjs';
const players=[{riotId:'Example#TEST',name:'Example'}];
const discord={applicationId:'100000000000000001',guildId:'100000000000000002',publicKey:'a'.repeat(64)};
const source=`var players_default=${JSON.stringify(players)};var discord_config_default=${JSON.stringify(discord)};`;
const settings={compatibility_date:'2026-10-24',bindings:[{type:'d1',name:'DB',id:'00000000-0000-0000-0000-000000000001'},{type:'secret_text',name:'HENRIK_API_KEY'},{type:'secret_text',name:'DISCORD_WEBHOOK_URL'}]};
const schedules=[{cron:'* * * * *'}];
test('static JSON is read without executing any downloaded JavaScript',()=>{
 assert.deepEqual(extractSettings(source+'throw Error("must never run")'),{players,discord});
 assert.throws(()=>extractSettings(source.replace(JSON.stringify(players),'runUntrustedCode()')),/static JSON/);
 assert.throws(()=>extractSettings(source+'var players_default=[];'),/Ambiguous/);
});
test('missing or malformed production configuration is rejected',()=>{
 assert.throws(()=>extractSettings('const players_default=[];'),/players/);
 assert.throws(()=>extractSettings(source.replace('"applicationId":"100000000000000001"','"applicationId":"bad"')),/Discord/);
});
test('D1 identity and schedules are preserved; secret values are never generated',()=>{
 const config=deploymentConfig(settings,schedules,'example-worker');
 assert.equal(config.d1_databases[0].database_id,settings.bindings[0].id);
 assert.deepEqual(config.triggers.crons,['* * * * *']);assert.equal(config.keep_vars,true);
 assert.doesNotMatch(JSON.stringify(config),/HENRIK_API_KEY|DISCORD_WEBHOOK_URL/);
});
test('unknown bindings and changed cron fail closed before deployment',()=>{
 assert.throws(()=>deploymentConfig({...settings,bindings:[...settings.bindings,{type:'r2_bucket',name:'FILES'}]},schedules,'example'),/Unrecognized/);
 assert.throws(()=>deploymentConfig(settings,[{cron:'0 * * * *'}],'example'),/schedule differs/);
 assert.throws(()=>deploymentConfig({...settings,bindings:settings.bindings.slice(0,1)},schedules,'example'),/secret binding/);
});
function fixture(t){const dir=mkdtempSync(join(tmpdir(),'live-settings-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));mkdirSync(join(dir,'src'));writeFileSync(join(dir,'src/index.ts'),'export default {};');writeFileSync(join(dir,'rewards-config.json'),JSON.stringify({enabled:false,startsAt:null,modes:{competitive:{participation:null,winBonus:null}}}));return dir;}
const env={CLOUDFLARE_API_TOKEN:'example-token-never-write',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),VALORANT_RESULTS_WORKER:'example-worker'};
test('live settings are written only after successful API reads and validations',async t=>{
 const dir=fixture(t);const requests=[];const request=async(url,options)=>{requests.push(url);assert.equal(options.headers.Authorization,'Bearer '+env.CLOUDFLARE_API_TOKEN);if(url.endsWith('/content/v2')){const form=new FormData();form.set('index.js',new Blob([source],{type:'application/javascript'}),'index.js');return new Response(form);}return Response.json({success:true,result:url.endsWith('/schedules')?{schedules}:settings});};
 await prepareLiveSettings(dir,env,request);assert.equal(requests.length,3);assert.ok(requests[2].endsWith('/content/v2'));
 assert.deepEqual(JSON.parse(readFileSync(join(dir,'players.json'))),players);
 assert.equal(JSON.parse(readFileSync(join(dir,'discord-config.json'))).guildId,discord.guildId);
 assert.deepEqual(JSON.parse(readFileSync(join(dir,'reward-accounts.json'))),{guildId:discord.guildId,accounts:[]});
 for(const name of ['players.json','discord-config.json','wrangler.jsonc','reward-accounts.json'])assert.ok(!readFileSync(join(dir,name),'utf8').includes(env.CLOUDFLARE_API_TOKEN));
});
test('bad Secrets, remote errors and enabled rewards stop recovery',async t=>{
 const dir=fixture(t);
 await assert.rejects(prepareLiveSettings(dir,{},()=>{throw Error('must not call');}),/Secrets/);
 await assert.rejects(prepareLiveSettings(dir,env,async()=>new Response('private response',{status:403})),/Cloudflare read failed \(403\)/);
 writeFileSync(join(dir,'rewards-config.json'),JSON.stringify({enabled:true,startsAt:null,modes:{}}));
 await assert.rejects(prepareLiveSettings(dir,env,()=>{throw Error('must not call');}),/monitor-only/);
});
test('wallet deployment requires the already-provisioned key and a matching encrypted mapping',async t=>{
 const {generateKeyPairSync,createHash,createPublicKey}=await import('node:crypto');
 const dir=fixture(t),publicKey=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'}}).publicKey;
 writeFileSync(join(dir,'src/index.ts'),"import {initializeKp} from './kp.ts';");
 writeFileSync(join(dir,'kp-bootstrap.encrypted.json'),JSON.stringify({version:1,keyFingerprint:'0'.repeat(64),ciphertext:'cipher',wrappedKey:'wrapped'}));
 await assert.rejects(prepareLiveSettings(dir,env,async()=>Response.json({success:true,result:settings})),/not provisioned/);
 const active={...settings,bindings:[...settings.bindings,{type:'plain_text',name:'KP_BOOTSTRAP_PUBLIC_KEY',text:publicKey},{type:'secret_text',name:'KP_BOOTSTRAP_PRIVATE_KEY'}]};
 await assert.rejects(prepareLiveSettings(dir,env,async()=>Response.json({success:true,result:active})),/another key/);
 const keyFingerprint=createHash('sha256').update(createPublicKey(publicKey).export({type:'spki',format:'der'})).digest('hex');
 writeFileSync(join(dir,'kp-bootstrap.encrypted.json'),JSON.stringify({version:1,keyFingerprint,ciphertext:'cipher',wrappedKey:'wrapped'}));
 await prepareLiveSettings(dir,env,async url=>{if(url.endsWith('/content/v2'))return new Response(source,{headers:{'Content-Type':'application/javascript'}});return Response.json({success:true,result:url.endsWith('/schedules')?{schedules}:active});});
 assert.equal(JSON.parse(readFileSync(join(dir,'wrangler.jsonc'))).vars.KP_BOOTSTRAP_PUBLIC_KEY,publicKey);
});
