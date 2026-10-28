import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {provisionMahjongKey} from '../scripts/provision-mahjong-key.mjs';
const dir=mkdtempSync(join(tmpdir(),'mahjong-key-'));
writeFileSync(join(dir,'wrangler.jsonc'),JSON.stringify({name:'valorant-results'}));
const env={CLOUDFLARE_API_TOKEN:'token',CLOUDFLARE_ACCOUNT_ID:'0123456789abcdef0123456789abcdef',MAHJONG_INGEST_KEY:'fixture-ingest-key-0123456789'};
const api=bindings=>{const calls=[];return {calls,request:async(url,init={})=>{calls.push({url,method:init.method??'GET',body:init.body});return Response.json(url.endsWith('/settings')?{success:true,result:{bindings}}:{success:true});}};};

test('the paipu signing key is copied to the Worker once and never logged or replaced', async t => {
 const log=t.mock.method(console,'log',()=>{});
 const none=api([]);await provisionMahjongKey(dir,{...env,MAHJONG_INGEST_KEY:''},none.request);assert.equal(none.calls.length,0);
 const fresh=api([]);await provisionMahjongKey(dir,env,fresh.request);
 assert.deepEqual(fresh.calls.map(c=>c.method),['GET','PUT']);assert.equal(JSON.parse(fresh.calls[1].body).name,'MAHJONG_INGEST_KEY');
 const kept=api([{name:'MAHJONG_INGEST_KEY',type:'secret_text'}]);await provisionMahjongKey(dir,env,kept.request);assert.deepEqual(kept.calls.map(c=>c.method),['GET']);
 await assert.rejects(provisionMahjongKey(dir,{...env,MAHJONG_INGEST_KEY:'short'},api([]).request),/16 characters/);
 assert.ok(log.mock.calls.every(c=>!String(c.arguments[0]).includes(env.MAHJONG_INGEST_KEY)));
});
