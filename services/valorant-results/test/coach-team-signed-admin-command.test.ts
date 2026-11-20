import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {parseSignedCoachAdminChannelCommand} from '../src/coach-team-signed-admin-command.ts';
const expectedGuildId='123456789012345678',expectedApplicationId='234567890123456789';
const timestamp='1795220000';
const body=(permissions='8')=>JSON.stringify({
 type:2,application_id:expectedApplicationId,guild_id:expectedGuildId,
 member:{permissions,user:{id:'345678901234567890'}},
 data:{name:'coach_notice_channel',options:[
  {name:'channel',type:7,value:'456789012345678901'},
  {name:'enabled',type:5,value:false},
  {name:'expected_version',type:4,value:0}
 ]}
});
test('E2 accepts only signed administrator Discord interactions, no unsigned flags',async()=>{
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const spki=publicKey.export({type:'spki',format:'der'});
 assert.equal(spki.subarray(0,12).toString('hex'),'302a300506032b6570032100');
 const publicKeyHex=spki.subarray(12).toString('hex');
 const request=(rawBody:string)=>({
  publicKeyHex,signatureHex:sign(null,Buffer.from(timestamp+rawBody,'utf8'),privateKey).toString('hex'),
  rawBody,timestamp,expectedGuildId,expectedApplicationId,nowSeconds:1795220001
 });
 const valid=request(body());
 assert.deepEqual(await parseSignedCoachAdminChannelCommand(valid),{
  channelId:'456789012345678901',enabled:false,expectedVersion:0
 });
 assert.equal(await parseSignedCoachAdminChannelCommand({...valid,rawBody:body('0')}),null);
 assert.equal(await parseSignedCoachAdminChannelCommand(request(body('0'))),null);
 assert.equal(await parseSignedCoachAdminChannelCommand({...valid,nowSeconds:1795220400}),null);
 assert.equal(await parseSignedCoachAdminChannelCommand({...valid,expectedGuildId:'111111111111111111'}),null);
});
