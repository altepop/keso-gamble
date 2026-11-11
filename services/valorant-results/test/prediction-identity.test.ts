import test from 'node:test';
import assert from 'node:assert/strict';
import {isOwnPrediction,selfBetAliasDigest} from '../src/prediction-identity.ts';
import type {KpMapping} from '../src/kp.ts';

const guild='100000000000000100';
const primary='100000000000000101';
const secondary='100000000000000102';
const stranger='100000000000000103';
const owner='Fixture#JP1';
const other='Other#JP1';
const mapping:KpMapping={guildId:guild,accounts:[
  {riotId:owner,discordUserId:primary},
  {riotId:other,discordUserId:stranger},
]};

test('primary registered account cannot predict its own Riot match, even with different case',async()=>{
  assert.equal(await isOwnPrediction(mapping,'fIxTuRe#jp1',primary),true);
  assert.equal(await isOwnPrediction(mapping,other,primary),false);
});
test('explicit secondary account pairing blocks its owner with exact full IDs',async()=>{
  const digest=await selfBetAliasDigest(owner,secondary);
  const aliases=new Set([digest]);
  assert.match(digest,/^[a-f0-9]{64}$/);
  assert.equal(await isOwnPrediction(mapping,owner,secondary,aliases),true);
  assert.equal(await isOwnPrediction(mapping,'FIXTURE#jp1',secondary,aliases),true);
  assert.equal(await isOwnPrediction(mapping,other,secondary,aliases),false);
  assert.equal(await isOwnPrediction(mapping,owner,stranger,aliases),false);
  assert.equal(await isOwnPrediction(mapping,'Fixture#JP2',secondary,aliases),false);
});
test('unregistered user IDs never match a primary or an alternate account',async()=>{
  const aliases=new Set([await selfBetAliasDigest(owner,secondary)]);
  assert.equal(await isOwnPrediction(mapping,owner,'not-a-user-id',aliases),false);
  assert.equal(await isOwnPrediction(mapping,owner,'100000000000000999',aliases),false);
});
