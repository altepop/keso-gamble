import test from 'node:test';
import assert from 'node:assert/strict';
import {validCoachAdminChannelConfiguration,COACH_ADMIN_MAX_AGE_MS} from '../src/coach-team-admin-channel-policy.ts';
const base=()=>({signatureVerified:true,administratorPermissionVerified:true,
 guildId:'123456789012345678',expectedGuildId:'123456789012345678',
 channelId:'234567890123456789',timestampMs:1_000_000,nowMs:1_000_000,
 expectedVersion:0,enabled:false});
test('admin configuration fails closed on missing signature and missing admin permission',()=>{
 assert.equal(validCoachAdminChannelConfiguration(base()),true);
 for(const patch of [{signatureVerified:false},{administratorPermissionVerified:false},
  {guildId:'345678901234567890'},{channelId:'invalid'},{expectedVersion:-1},
  {nowMs:base().nowMs+COACH_ADMIN_MAX_AGE_MS+1},
  {timestampMs:base().timestampMs+1},{timestampMs:NaN}]){
  assert.equal(validCoachAdminChannelConfiguration({...base(),...patch}),false,JSON.stringify(patch));
 }
});
test('explicit disable uses same security requirements',()=>{
 assert.equal(validCoachAdminChannelConfiguration({...base(),enabled:false}),true);
 assert.equal(validCoachAdminChannelConfiguration({...base(),enabled:false,signatureVerified:false}),false);
 assert.equal(validCoachAdminChannelConfiguration({...base(),enabled:true}),true);
});
