import test from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, redactContent, discordGet, makeRecords, run } from '../scripts/export-kesotown-history.mjs';

const guild = '100000000000000100';
const a = '100000000000000110', b = '100000000000000120';
const user = '100000000000000130', bot = '100000000000000140';
const now = new Date().toISOString();

test('requires explicit channel allowlist; no export-all or arbitrary options',()=>{
  const args = parseArgs(['export','--guild',guild,'--channels',a+','+b,'--days','365']);
  assert.equal(args.mode,'export');
  assert.deepEqual(args.channels,[a,b]);
  assert.equal(args.days,365);
  assert.throws(()=>parseArgs(['export','--guild',guild]),/Explicit --channels/);
  assert.throws(()=>parseArgs(['export','--guild',guild,'--all']),/Unknown/);
  assert.throws(()=>parseArgs(['export','--guild',guild,'--channels','invalid']),/unique channel IDs/);
  assert.throws(()=>parseArgs(['export','--guild',guild,'--channels',a,'--total','1000000']),/Invalid/);
  assert.equal(parseArgs(['list','--guild',guild]).mode,'list');
});

test('redacts PII and mentions while keeping KP and meme language',()=>{
  const text = redactContent('100 KP <@'+user+'> <#'+a+'> https://example.com/path test@example.com 12345678901234567890');
  assert.match(text,/100 KP/);
  assert.doesNotMatch(text,/https:|example.com|12345678901234567890/);
  assert.match(text,/@member/);
  assert.match(text,/#[c]hannel/);
  assert.match(text,/\[EMAIL\]/);
});

test('anonymizes users and bots without saving IDs or URLs',()=>{
  const author = new Map();
  const data = makeRecords([
    { author:{id:user,bot:false}, timestamp:now,content:'決闘で100KP！ https://test.com/'},
    { author:{id:bot,bot:true}, timestamp:now,content:'アカンbot速報'},
    { author:{id:user,bot:false}, timestamp:now,content:'もう一周'},
    { author:{id:user,bot:false}, timestamp:now,content:''}
  ],'稼ぎ',author);
  assert.deepEqual(data.map(d=>d.author),['member_001','bot_002','member_001']);
  assert.equal(data.length,3);
  assert.equal(JSON.stringify(data).includes(user),false);
  assert.equal(JSON.stringify(data).includes('https:'),false);
});

test('export only accesses allowlisted ordinary channels and paginates once',async()=>{
  const seen=[];
  const old = new Date(Date.now()-200*86400000).toISOString();
  const opts=parseArgs(['export','--guild',guild,'--channels',a,'--days','180','--total','1000']);
  const result=await run(opts,'unused',{get:async path=>{
    seen.push(path);
    if(path.startsWith('/guilds/')) return [{id:a,name:'稼ぎ',type:0},{id:b,name:'secret',type:4}];
    if(path==='/channels/'+a+'/messages?limit=100') return [
      { id:'100000000000000150', timestamp:now, author:{id:user},content:'KP増えた！' },
      { id:'100000000000000149', timestamp:old, author:{id:user},content:'old message' }
    ];
    throw new Error('Unexpected API request: '+path);
  }});
  assert.equal(result.records.length,1);
  assert.equal(result.records[0].content,'KP増えた！');
  assert.equal(result.summary.fetched,2);
  assert.equal(seen.length,2);
  assert.ok(!JSON.stringify(result.records).includes(user));
  assert.ok(!seen.some(s=>s.includes(b)));
});

test('rejects attempting to export non-text channels even when IDs are listed',async()=>{
  const opts=parseArgs(['export','--guild',guild,'--channels',b]);
  await assert.rejects(()=>run(opts,'unused',{get:async()=>[{id:b,name:'private',type:4}]}),/not a text/);
});

test('list mode displays candidate text channels, not messages',async()=>{
  const opts=parseArgs(['list','--guild',guild]);
  const requests=[];
  const result=await run(opts,'unused',{get:async path=>{
    requests.push(path);
    return [{id:a,name:'一般',type:0},{id:b,name:'archive',type:5},{id:user,name:'voice',type:2}];
  }});
  assert.deepEqual(result.channels.map(x=>x.id),[a,b]);
  assert.deepEqual(requests,['/guilds/'+guild+'/channels']);
});

test('rate limits are respected, writes never sent, unauthorized paths rejected',async()=>{
  const waits=[],calls=[];
  let count=0;
  const response=await discordGet('/guilds/'+guild+'/channels','secret',async (url,options)=>{
    calls.push({url,method:options.method});
    if(++count===1)return {status:429,headers:{get:()=> '0.01'},json:async()=>({retry_after:0.01})};
    return {status:200,ok:true,headers:{get:()=>null},json:async()=>[{id:a,type:0}]};
  },async ms=>{waits.push(ms);});
  assert.equal(response.length,1);
  assert.ok(waits.some(ms=>ms>=1000));
  assert.ok(calls.every(c=>c.method==='GET'));
  await assert.rejects(()=>discordGet('/channels/'+a+'/messages/delete','secret'),/Only approved/);
});

test('empty content after Discord content restrictions fails explicitly',async()=>{
  const opts=parseArgs(['export','--guild',guild,'--channels',a]);
  await assert.rejects(()=>run(opts,'unused',{get:async path=>{
    if(path.startsWith('/guilds/')) return [{id:a,name:'一般',type:0}];
    return [{id:'100000000000000150',timestamp:now,author:{id:user},content:''}];
  }}),/No readable text/);
});
