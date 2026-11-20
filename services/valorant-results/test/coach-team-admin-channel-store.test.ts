import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {saveSignedCoachChannelDisabled} from '../src/coach-team-admin-channel-store.ts';
const guild='123456789012345678',app='234567890123456789',timestamp='1795220000';
test('E2 signed admin persistence is disable-only, signed, and version-guarded',async()=>{
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const spki=publicKey.export({type:'spki',format:'der'});
 const publicKeyHex=spki.subarray(12).toString('hex');
 let query='',bindValues:unknown[]=[];
 const receipts=new Set<string>();
 const db={prepare(sql:string){
  query=sql;return {bind(...values:unknown[]){bindValues=values;return {
   async first(){
    if(sql.includes('coach_team_admin_interaction_receipts')){
     const id=String(values[1]);
     if(receipts.has(id))return null;
     receipts.add(id);return {interaction_id:id};
    }
    return {version:sql.includes('INSERT')?1:2};
   }
  };}};
 }} as unknown as D1Database;
 const request=(enabled:boolean,expectedVersion:number,permissions='8',interactionId='345678901234567890')=>{
  const rawBody=JSON.stringify({id:interactionId,type:2,application_id:app,guild_id:guild,
   member:{permissions,user:{id:'456789012345678901'}},
   data:{name:'coach_notice_channel',options:[
    {name:'channel',type:7,value:'567890123456789012'},
    {name:'enabled',type:5,value:enabled},
    {name:'expected_version',type:4,value:expectedVersion}
   ]}
  });
  return {publicKeyHex,signatureHex:sign(null,Buffer.from(timestamp+rawBody),privateKey).toString('hex'),
   timestamp,rawBody,expectedGuildId:guild,expectedApplicationId:app,nowSeconds:1795220001};
 };
 assert.deepEqual(await saveSignedCoachChannelDisabled(db,request(false,0)),{version:1});
 assert.match(query,/INSERT OR IGNORE/);assert.match(query,/RETURNING version/);
 assert.deepEqual(bindValues,[guild,'567890123456789012','456789012345678901',1795220001000]);
 assert.deepEqual(await saveSignedCoachChannelDisabled(db,request(false,0)),null);
 assert.deepEqual(await saveSignedCoachChannelDisabled(db,request(false,1,'8','345678901234567891')),{version:2});
 assert.match(query,/WHERE guild=\? AND team_id='coach-roster-v1' AND version=\?/);
 assert.deepEqual(await saveSignedCoachChannelDisabled(db,request(true,1)),null);
 assert.deepEqual(await saveSignedCoachChannelDisabled(db,request(false,1,'0')),null);
 assert.equal(receipts.size,2);
});
