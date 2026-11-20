import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {verifyCoachDiscordSignature} from '../src/coach-discord-signature.ts';
test('E2 Ed25519 verifies exact raw body and rejects modified payloads and stale replay',async()=>{
 const key=await webcrypto.subtle.generateKey('Ed25519',true,['sign','verify']);
 const publicKey=Buffer.from(await webcrypto.subtle.exportKey('raw',key.publicKey)).toString('hex');
 const timestamp='1795220000',rawBody='{"type":1}';
 const data=new TextEncoder().encode(timestamp+rawBody);
 const sig=Buffer.from(await webcrypto.subtle.sign('Ed25519',key.privateKey,data)).toString('hex');
 const base={publicKeyHex:publicKey,signatureHex:sig,timestamp,rawBody,nowSeconds:1795220001};
 assert.equal(await verifyCoachDiscordSignature(base,webcrypto.subtle),true);
 for(const patch of [{rawBody:'{"type":2}'},{timestamp:'1795220001'},{signatureHex:'00'.repeat(64)},
  {publicKeyHex:'bad'},{nowSeconds:1795220400},{nowSeconds:1795219999}]){
  assert.equal(await verifyCoachDiscordSignature({...base,...patch},webcrypto.subtle),false,JSON.stringify(patch));
 }
});
