import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VDK_PEARL_MATCH,VDK_PEARL_RECEIPT,vdkPearlPayload,findVdkPearlAccount,isVerifiedVdkPearlNotice} from '../src/vdk-pearl-roast.ts';

test('the roast is scoped to the exact Pearl match and safely mentions only one Discord user',()=>{
  assert.equal(VDK_PEARL_MATCH,'db6a45fe-7699-4fb3-b4b8-0d7499b26412');
  assert.match(VDK_PEARL_RECEIPT,/^oneoff:vdk-pearl-chamber:/);
  const payload=vdkPearlPayload('123456789012345678');
  assert.equal(payload.username,'等しいbot');
  assert.deepEqual(payload.allowed_mentions,{parse:[],users:['123456789012345678']});
  assert.match(payload.content,/<@123456789012345678>/);
  assert.match(payload.content,/ACS 86/);
  assert.match(payload.content,/ACS 367/);
  assert.ok(payload.content.length<2000,'Discord message must fit in one post');
  assert.throws(()=>vdkPearlPayload('@everyone'));
});

test('the game must be a 1-4 Pearl Chamber Spike Rush loss with 1K 5D',()=>{
  const notice={outcome:'loss',mode:'spikerush',message:'📢 VDKは1対4で負け！（スパイクラッシュ）\n🗺️ Pearl｜Chamber\n🔫 1K / 5D / 1A｜ACS 86'};
  assert.equal(isVerifiedVdkPearlNotice(notice),true);
  assert.equal(isVerifiedVdkPearlNotice({...notice,mode:'competitive'}),false);
  assert.equal(isVerifiedVdkPearlNotice({...notice,outcome:'win'}),false);
  assert.equal(isVerifiedVdkPearlNotice({...notice,message:notice.message.replace('Chamber','Jett')}),false);
  assert.equal(isVerifiedVdkPearlNotice({...notice,message:notice.message.replace('1K / 5D','7K / 1D')}),false);
  assert.equal(isVerifiedVdkPearlNotice(null),false);
});

test('mention resolution fails closed when VDK identity is missing or ambiguous',()=>{
  const base={guildId:'123456789012345678',accounts:[] as {riotId:string;discordUserId:string}[]};
  assert.equal(findVdkPearlAccount(base),null);
  const account={riotId:'fur1an#1204',discordUserId:'123456789012345678'};
  assert.deepEqual(findVdkPearlAccount({...base,accounts:[account]}),account);
  assert.equal(findVdkPearlAccount({...base,accounts:[account,{riotId:'VDK#JP1',discordUserId:'123456789012345679'}]}),null);
});
