import test from 'node:test';
import assert from 'node:assert/strict';
import { syncValoCommand } from '../scripts/sync-valo-command.mjs';
import { valoCommand } from '../src/valo-command.ts';
const config={applicationId:'123456789012345678',guildId:'234567890123456789'};
const reply=(body,status=200)=>({ok:status===200,status,json:async()=>body});
test('coach登録は既存の/valoだけを更新し、他のコマンドを触らない',async()=>{
 const calls=[];
 const request=async(url,opts)=>{calls.push({url,opts});return calls.length===1?reply([{name:'valo',type:1,id:'345678901234567890',options:[]},{name:'death',type:1,id:'456789012345678901'}]):reply({...valoCommand(),application_id:config.applicationId});};
 assert.equal(await syncValoCommand({config,token:'bot-token',request}),'updated');
 assert.equal(calls[0].opts.method,'GET');
 assert.equal(calls[1].opts.method,'PATCH');
 assert.match(calls[1].url,/\/commands\/345678901234567890$/);
 assert.equal(calls.length,2);
 const cmd=JSON.parse(calls[1].opts.body);
 assert.equal(cmd.options.filter(x=>x.name==='coach').length,1);
 assert.ok(cmd.options.some(x=>x.name==='status'));
});
test('登録済みなら再書き込みを行わない',async()=>{
 let count=0;const request=async()=>{count++;return reply([{...valoCommand(),id:'345678901234567890',type:1}]);};
 assert.equal(await syncValoCommand({config,token:'bot-token',request}),'unchanged');assert.equal(count,1);
});
test('トークン欠落ならDiscordへ一切アクセスしない',async()=>{
 let count=0;await assert.rejects(syncValoCommand({config,token:'',request:async()=>{count++;return reply([])}}));assert.equal(count,0);
});
