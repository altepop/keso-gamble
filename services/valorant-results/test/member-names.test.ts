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


test('Nagoya and Chiba Yuya names bind only to the two supplied exact Discord IDs',async()=>{
 const nagoya='590461900907872266',chiba='1237302193938370576';
 const base=new Map([
  [nagoya,'Discord nickname'],
  [chiba,'Discord nickname'],
  ['100000000090787226','同じ末尾の別人'],
  ['100000000083837057','異なるDiscordメンバー'],
 ]);
 const env={DB:{prepare:()=>{throw Error('Exact-ID names must not add D1 reads');}}} as unknown as KpEnv;
 const config={guildId:discord.guildId,names:[]};
 const aliases=await memberNames(env,discord.guildId,base,config);
 assert.equal(MEMBER_NAME_OVERRIDES[nagoya],'名古屋');
 assert.equal(MEMBER_NAME_OVERRIDES[chiba],'千葉ゆうや');
 assert.equal(aliases.get(nagoya),'名古屋');
 assert.equal(aliases.get(chiba),'千葉ゆうや');
 assert.equal(aliases.get('100000000090787226'),'同じ末尾の別人');
 assert.equal(aliases.get('100000000083837057'),'異なるDiscordメンバー');
 // An old encrypted alias must not overwrite the owner-verified exact ID.
 const outdated=await memberNames(env,discord.guildId,base,{guildId:discord.guildId,names:[
  {userId:nagoya,name:'古い名前'}, {userId:chiba,name:'千葉祐也'}
 ]});
 assert.equal(outdated.get(nagoya),'名古屋');
 assert.equal(outdated.get(chiba),'千葉ゆうや');
 const elsewhere=await memberNames(env,'100000000000000999',base);
 assert.equal(elsewhere.get(nagoya),'Discord nickname','no aliases on other guilds');
 assert.equal(elsewhere.get(chiba),'Discord nickname','no aliases on other guilds');
});
