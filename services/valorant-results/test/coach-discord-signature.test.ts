import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verifyCoachDiscordSignature} from '../src/coach-discord-signature.ts';
test('E2 Ed25519 verifies exact raw body and rejects modified payloads and stale replay',async()=>{
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 // Ed25519 SubjectPublicKeyInfo DER has a 12-byte RFC 8410 prefix followed by 32 raw bytes.
 const spki=publicKey.export({type:'spki',format:'der'});
 const prefix=Buffer.from('302a300506032b6570032100','hex');
 assert.equal(spki.length,44);
 assert.equal(spki.subarray(0,12).toString('hex'),prefix.toString('hex'));
 const publicKeyHex=spki.subarray(12).toString('hex');
 const timestamp='1795220000',rawBody='{"type":1}';
 const data=Buffer.from(timestamp+rawBody,'utf8');
 const signatureHex=sign(null,data,privateKey).toString('hex');
 const base={publicKeyHex,signatureHex,timestamp,rawBody,nowSeconds:1795220001};
 assert.equal(await verifyCoachDiscordSignature(base),true);
 for(const patch of [{rawBody:'{"type":2}'},{timestamp:'1795220001'},{signatureHex:'00'.repeat(64)},
  {publicKeyHex:'bad'},{nowSeconds:1795220400},{nowSeconds:1795219999}]){
  assert.equal(await verifyCoachDiscordSignature({...base,...patch}),false,JSON.stringify(patch));
 }
});
