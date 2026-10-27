import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {URL as NodeURL} from 'node:url';
import {readFileSync,readdirSync} from 'node:fs';
import {initializeKp,syncKpAccounts} from '../src/kp.ts';
import type {KpEnv,KpMapping} from '../src/kp.ts';
import {runKpCommand,slashRace} from '../src/kp-slash.ts';
import {registerKpCommands,kpCommands,isKpRanking} from '../src/kp-command.ts';
const guild='100000000000000100',one='100000000000000101',two='100000000000000102',newUser='100000000000000103';
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:one},{riotId:'Two#JP1',discordUserId:two}]};
const T0=Date.parse('2026-10-27T16:05:30+09:00');
const id=(at:number,n=1)=>String((BigInt(at)-1420070400000n)<<22n|BigInt(n));
const interaction=(name:string,user=one,options:Array<{name:string;value:unknown}>=[])=>({id:id(T0),guild_id:guild,member:{user:{id:user}},data:{name,options}});
async function fixture(){
 const sql=new DatabaseSync(':memory:');
 for(const file of readdirSync(new NodeURL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new NodeURL('../migrations/'+file,import.meta.url),'utf8'));
 class Query{text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...values:unknown[]){return new Query(this.text,values);}first(){return sql.prepare(this.text).get(...this.values as never[])??null;}all(){return {results:sql.prepare(this.text).all(...this.values as never[])};}run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}}
 const env:KpEnv={KP_BOOTSTRAP_PRIVATE_KEY:'fixture-key',DB:{prepare:(text:string)=>new Query(text),batch:(queries:Query[])=>{sql.exec('BEGIN');try{const rows=queries.map(q=>q.run());sql.exec('COMMIT');return rows;}catch(error){sql.exec('ROLLBACK');throw error;}}}as unknown as D1Database};
 sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('One#JP1','p-one','ap',0);sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('Two#JP1','p-two','ap',0);
 await initializeKp(env,mapping);await syncKpAccounts(env,mapping);
 sql.prepare("INSERT INTO kp_ledger VALUES('test-credit',?,?,10000,'test',0)").run(guild,one);
 return {env,sql};
}

test('slash balance is private to the guild member; newcomers get zero and no starting credit',async()=>{
 const f=await fixture();assert.match(await runKpCommand(f.env,interaction('kp'),mapping),/10,000 KP/);
 assert.match(await runKpCommand(f.env,interaction('kp',newUser),mapping),/0 KP/);
 assert.equal(f.sql.prepare('SELECT balance FROM kp_wallets WHERE user=?').get(newUser)?.balance,0);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM kp_ledger WHERE user=?').get(newUser)?.n,0);
 assert.match(await runKpCommand(f.env,{...interaction('kp'),guild_id:'100000000000000199'},mapping),/このサーバー/);
 assert.match(await runKpCommand(f.env,{...interaction('kp'),member:undefined},mapping),/このサーバー/);
});
test('slash race card uses the real entries and never leaks a race seed',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T0});const f=await fixture();
 const message=await runKpCommand(f.env,interaction('keiba'),mapping);
 assert.match(message,/16:15発走／16:14締切/);assert.match(message,/1番/);assert.match(message,/8番/);
 const seed=f.sql.prepare('SELECT seed FROM kp_races ORDER BY id DESC LIMIT 1').get()?.seed;
 if(seed)assert.equal(message.includes(String(seed)),false);
 assert.match(message,/race:16:15/);
});
test('slash bet uses the shared wallet, rejects stale races and invalid stakes, and retries one debit',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T0});const f=await fixture();
 const opts=[{name:'race',value:'16:15'},{name:'horse',value:2},{name:'amount',value:100},{name:'type',value:'win'}];
 const bet=interaction('bet',one,opts);
 assert.match(await runKpCommand(f.env,bet,mapping),/馬券を購入/);
 t.mock.timers.setTime(T0+20*60000);
 assert.match(await runKpCommand(f.env,bet,mapping),/馬券を購入/,'same interaction returns original receipt after deadline');
 assert.equal(f.sql.prepare('SELECT balance FROM kp_wallets WHERE user=?').get(one)?.balance,9900);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM kp_operations').get()?.n,1);
 const stale={...bet,id:id(T0+20*60000)};
 assert.doesNotMatch(await runKpCommand(f.env,stale,mapping),/馬券を購入/);
 t.mock.timers.setTime(T0);
 const bad={...bet,id:id(T0,2),data:{name:'bet',options:opts.map(o=>o.name==='amount'?{...o,value:150}:o)}};
 assert.doesNotMatch(await runKpCommand(f.env,bad,mapping),/馬券を購入/);
 assert.equal(f.sql.prepare('SELECT balance FROM kp_wallets WHERE user=?').get(one)?.balance,9900);
});
test('race clocks cross JST midnight safely and are stable on replay',()=>{
 const at=Date.parse('2026-10-27T23:55:00+09:00');
 assert.equal(slashRace('00:00',id(at)),Date.parse('2026-10-28T00:00:00+09:00'));
 assert.throws(()=>slashRace('24:00',id(at)));assert.throws(()=>slashRace(0,id(at)));
});
test('command registration never bulk-replaces other commands and refuses a foreign name collision',async()=>{
 const calls:Array<{path:string;method?:string;body?:any}>=[];
 const api=async(path:string,method?:string,body?:unknown)=>{calls.push({path,method,body});return path==='/users/@me'?{id:one,bot:true}:method==='POST'?{...(body as object),id:one}:[{name:'death'},{name:'valo'},{name:'launch',type:4}];};
 assert.equal(await registerKpCommands(one,guild,api),3);
 assert.deepEqual(calls.filter(c=>c.method==='POST').map(c=>c.body.name),['kp','keiba','bet']);
 assert.ok(calls.every(c=>c.method!=='PUT'));assert.equal(kpCommands[2].options?.filter(o=>o.required).length,4);
 let writes=0;await assert.rejects(registerKpCommands(one,guild,async(path,method)=>{if(method)writes++;return path==='/users/@me'?{id:one,bot:true}:[{name:'bet',description:'Another bot command'}];}),/conflict/);assert.equal(writes,0);
 await assert.rejects(registerKpCommands(one,guild,async()=>({id:two,bot:true})),/mismatch/);
});

test('signed KP commands acknowledge privately for ordinary members; tampered requests cannot dispatch',async t=>{
 const {discordInteractions}=await import('../src/discord-interactions.ts');
 const pair=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']) as CryptoKeyPair;
 const publicKey=Buffer.from(await crypto.subtle.exportKey('raw',pair.publicKey)).toString('hex');
 const config={applicationId:one,guildId:guild,publicKey};
 const payload={...interaction('kp'),application_id:one,type:2,token:'fixture-callback-not-persisted',member:{permissions:'0',user:{id:newUser}}};
 const body=JSON.stringify(payload),timestamp=String(Math.floor(Date.now()/1000));
 const signature=Buffer.from(await crypto.subtle.sign('Ed25519',pair.privateKey,new TextEncoder().encode(timestamp+body))).toString('hex');
 const request=(text=body)=>new Request('https://worker/interactions',{method:'POST',body:text,headers:{'X-Signature-Ed25519':signature,'X-Signature-Timestamp':timestamp}});
 const tasks:Promise<unknown>[]=[],replies:any[]=[];const ctx={waitUntil:(p:Promise<unknown>)=>tasks.push(p)} as unknown as ExecutionContext;
 let queries=0;const env={DB:{prepare(){queries++;throw Error('No unsigned writes');}}} as unknown as import('../src/index.ts').Env;
 t.mock.method(globalThis,'fetch',async(_url:unknown,init:{body:string})=>{replies.push(JSON.parse(init.body));return new Response(null,{status:204});});
 assert.equal((await discordInteractions(request(body+' '),env,ctx,config)).status,401);assert.equal(queries,0);assert.equal(tasks.length,0);
 assert.deepEqual(await (await discordInteractions(request(),env,ctx,config)).json(),{type:5,data:{flags:64}});
 await Promise.all(tasks);assert.deepEqual(replies[0].allowed_mentions,{parse:[]});assert.equal(queries,0);
 const rankingBody=JSON.stringify({...payload,data:{name:'kp',options:[{type:1,name:'ranking'}]}});
 const rankingSignature=Buffer.from(await crypto.subtle.sign('Ed25519',pair.privateKey,new TextEncoder().encode(timestamp+rankingBody))).toString('hex');
 const rankingRequest=new Request('https://worker/interactions',{method:'POST',body:rankingBody,headers:{'X-Signature-Ed25519':rankingSignature,'X-Signature-Timestamp':timestamp}});
 assert.deepEqual(await (await discordInteractions(rankingRequest,env,ctx,config)).json(),{type:5,data:{flags:0}});
 await Promise.all(tasks);assert.deepEqual(replies.at(-1).allowed_mentions,{parse:[]});assert.equal(queries,0);
});

test('public ranking is one guild snapshot, ties share rank, only top ten are returned and viewing does not open a wallet',async()=>{
 const f=await fixture();
 const newcomers=Array.from({length:12},(_,i)=>String(100000000000000200n+BigInt(i)));
 for(const user of newcomers)f.sql.prepare('INSERT INTO kp_wallets(guild,user,balance) VALUES(?,?,100)').run(guild,user);
 f.sql.prepare("INSERT INTO kp_ledger VALUES('tie-credit',?,?,10000,'test',0)").run(guild,two);
 f.sql.prepare('INSERT INTO kp_wallets(guild,user,balance) VALUES(?,?,999999)').run('100000000000000199','100000000000000999');
 const request={...interaction('kp',newUser),data:{name:'kp',options:[{type:1,name:'ranking'}]}};
 const before=f.sql.prepare('SELECT COUNT(*) AS n FROM kp_wallets').get()?.n;
 const text=await runKpCommand(f.env,request,mapping);
 assert.match(text,new RegExp(`1位　<@${one}>`));assert.match(text,new RegExp(`1位　<@${two}>`));assert.match(text,/3位/);
 assert.equal(text.includes('999999'),false);assert.equal(text.includes('100000000000000999'),false);
 assert.equal(text.split('\n').filter(line=>/^\d+位/.test(line)).length,10);assert.match(text,/全14人/);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM kp_wallets').get()?.n,before);
 assert.equal(f.sql.prepare('SELECT balance FROM kp_wallets WHERE user=?').get(one)?.balance,10000);
});
test('only the exact ranking subcommand is public; balance, legacy KP and malformed options stay private',()=>{
 assert.equal(isKpRanking({data:{name:'kp',options:[{type:1,name:'ranking'}]}}),true);
 for(const data of [{name:'kp'},{name:'kp',options:[{type:1,name:'balance'}]},{name:'bet',options:[{type:1,name:'ranking'}]},{name:'kp',options:[{type:3,name:'ranking'}]},{name:'kp',options:[{type:1,name:'ranking',options:[{}]}]},{name:'kp',options:[{type:1,name:'ranking'},{type:1,name:'balance'}]}])assert.equal(isKpRanking({data}),false);
 assert.deepEqual(kpCommands[0].options?.map(o=>o.name),['balance','ranking']);
});
