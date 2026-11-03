import test from 'node:test';
import assert from 'node:assert/strict';
import discord from '../discord-config.json' with {type:'json'};
import {memberNames,MEMBER_NAME_OVERRIDES} from '../src/member-names.ts';
import type {KpEnv} from '../src/kp.ts';
const id='827801943928995840';
test('exact Discord member 5840 is shown as 小林 without renaming similarly suffixed members',async()=>{
 const base=new Map([[id,'メンバー 5840'],['100000000000005840','別の人'],['100000000000000101','従来名']]);
 const env={DB:{prepare:()=>{throw Error('A pure exact-ID alias must not trigger D1 reads');}}} as unknown as KpEnv;
 const names=await memberNames(env,discord.guildId,base,{guildId:discord.guildId,names:[]});
 assert.equal(MEMBER_NAME_OVERRIDES[id],'小林');
 assert.equal(names.get(id),'小林');
 assert.equal(names.get('100000000000005840'),'別の人');
 assert.equal(names.get('100000000000000101'),'従来名');
 assert.equal((await memberNames(env,'100000000000000999',base)).get(id),'メンバー 5840','the alias belongs only to the configured Discord server');
});
test('public exact-ID alias remains visible if encrypted aliases cannot be decrypted',async()=>{
 const env={DB:{prepare:()=>{throw Error('no DB queries expected');}}} as unknown as KpEnv;
 const names=await memberNames(env,discord.guildId,new Map(),{guildId:discord.guildId,names:[]});
 assert.equal(names.get(id),'小林');
});
