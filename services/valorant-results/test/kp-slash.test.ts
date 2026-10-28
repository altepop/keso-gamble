import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {URL as NodeURL} from 'node:url';
import {readFileSync,readdirSync} from 'node:fs';
import {initializeKp,syncKpAccounts} from '../src/kp.ts';
import type {KpEnv,KpMapping} from '../src/kp.ts';
import {runKpCommand,slashRace,betChoices} from '../src/kp-slash.ts';
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
 assert.match(message,/16:15発走・\d+頭｜締切 16:14/);assert.match(message,/` 1` /);assert.match(message,/` 8` /);
 const seed=f.sql.prepare('SELECT seed FROM kp_races ORDER BY id DESC LIMIT 1').get()?.seed;
 if(seed)assert.equal(message.includes(String(seed)),false);
 assert.match(message,/`\/bet` と打って、horse で馬を一覧から選び/);
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
 assert.equal(await registerKpCommands(one,guild,api,async()=>{}),11);
 assert.deepEqual(calls.filter(c=>c.method==='POST').map(c=>c.body.name),['kp','keiba','bet','horsename','mleague','mbet','mclose','kpgrant','unitelink','paifulink','paifu']);
 assert.ok(calls.every(c=>c.method!=='PUT'));assert.deepEqual(kpCommands[2].options?.filter(o=>o.required).map(o=>o.name),['horse','amount']);
 // Unchanged commands are not written again, and writes are spaced out.
 const waits:number[]=[],posted:string[]=[];
 const stored=[{...kpCommands[0],id:'1',application_id:one,version:'9',description_localizations:null,options:kpCommands[0].options.map(o=>({...o,required:false}))},{...kpCommands[1],id:'2'},{name:'death'}];
 assert.equal(await registerKpCommands(one,guild,async(path,method,body)=>{if(method==='POST'){posted.push((body as {name:string}).name);return {...(body as object),id:one};}return path==='/users/@me'?{id:one,bot:true}:stored;},async ms=>{waits.push(ms);}),9);
 assert.deepEqual(posted,['bet','horsename','mleague','mbet','mclose','kpgrant','unitelink','paifulink','paifu']);assert.deepEqual(waits,[5000,5000,5000,5000,5000,5000,5000,5000],'a gap between writes, none before the first');
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

test('public command metadata contains definitions only and does not need or expose wallet configuration',async()=>{
 const {kpApi}=await import('../src/kp-api.ts');
 let queries=0;
 const response=await kpApi(new Request('https://worker/api/kp/commands'),{DB:{prepare(){queries++;throw Error('No DB reads');}},KP_BOOTSTRAP_PRIVATE_KEY:'fixture-secret-must-not-leak'} as unknown as KpEnv);
 const body=await response.json() as {version:string;commands:unknown[]};
 assert.equal(response.status,200);assert.equal(body.version,'kp-slash-v11-horsename');assert.equal(body.commands.length,11);assert.equal(queries,0);
 assert.equal(JSON.stringify(body).includes('fixture-secret'),false);assert.equal(response.headers.get('Cache-Control'),'no-store');
});

test('/kpgrant credits anyone once per interaction, and a negative grant takes no more than the balance',async()=>{
 const f=await fixture(),cat='100000000000000104';
 const grant=(n:number,user:string,amount:number,reason='雀魂 10/28 4位')=>runKpCommand(f.env,{...interaction('kpgrant',one,[{name:'user',value:user},{name:'amount',value:amount},{name:'reason',value:reason}]),id:id(T0,n)},mapping);
 assert.match(await grant(1,`<@${cat}>`,100),/<@100000000000000104> に \+100 KP（雀魂 10\/28 4位）。残高 100 KP/);
 assert.match(await grant(1,cat,100),/残高 100 KP/,'a redelivered interaction does not pay twice');
 assert.match(await grant(2,cat,-500,'取り消し'),/−100 KP（取り消し）。残高 0 KP/);
 assert.match(await grant(3,cat,0),/0以外/);assert.match(await grant(4,'@cat',100),/相手/);assert.match(await grant(5,cat,100,' '),/理由/);
 assert.deepEqual(f.sql.prepare("SELECT delta,kind FROM kp_ledger WHERE user=? ORDER BY id").all(cat).map(r=>[r.delta,r.kind]),[[100,'grant'],[-100,'grant']]);
});
test('/paifulink links a game account to a member, replacing an earlier link of either side',async()=>{
 const f=await fixture(),cat='100000000000000104';
 const link=(n:number,user:unknown,account:unknown)=>runKpCommand(f.env,{...interaction('paifulink',one,[{name:'user',value:user},{name:'account',value:account}]),id:id(T0,n)},mapping);
 assert.match(await link(1,`<@!${two}>`,104608016),/<@100000000000000102> を雀魂アカウント 104608016 と結び付けました/);
 assert.match(await link(2,cat,104608016),/<@100000000000000104>/,'a wrong link is fixed by linking again');
 assert.match(await link(3,cat,555),/555/);
 assert.match(await link(4,'ねこ',1),/指定してください/);assert.match(await link(5,cat,0),/指定してください/);
 assert.deepEqual(f.sql.prepare('SELECT user,account FROM kp_mahjong_links ORDER BY user').all().map(r=>[r.user,Number(r.account)]),[[cat,555]]);
});
test('/kpgrant and /paifulink are refused before any work for members without admin or manage-server',async t=>{
 const {discordInteractions}=await import('../src/discord-interactions.ts');
 const pair=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']) as CryptoKeyPair;
 const config={applicationId:one,guildId:guild,publicKey:Buffer.from(await crypto.subtle.exportKey('raw',pair.publicKey)).toString('hex')};
 for(const body of [JSON.stringify({...interaction('kpgrant',two,[{name:'user',value:two},{name:'amount',value:100000},{name:'reason',value:'x'}]),application_id:one,type:2,token:'t',member:{permissions:'0',user:{id:two}}}),JSON.stringify({...interaction('paifulink',two,[{name:'user',value:two},{name:'account',value:1}]),application_id:one,type:2,token:'t',member:{permissions:'0',user:{id:two}}})]){
 const timestamp=String(Math.floor(Date.now()/1000));
 const signature=Buffer.from(await crypto.subtle.sign('Ed25519',pair.privateKey,new TextEncoder().encode(timestamp+body))).toString('hex');
 const tasks:Promise<unknown>[]=[];let queries=0;
 const env={DB:{prepare(){queries++;throw Error('No writes');}}} as unknown as import('../src/index.ts').Env;
 const response=await discordInteractions(new Request('https://worker/interactions',{method:'POST',body,headers:{'X-Signature-Ed25519':signature,'X-Signature-Timestamp':timestamp}}),env,{waitUntil:(p:Promise<unknown>)=>tasks.push(p)} as unknown as ExecutionContext,config);
 assert.match(JSON.stringify(await response.json()),/管理者/);assert.equal(tasks.length,0);assert.equal(queries,0);
 }
});

test('/bet needs only a horse and an amount: the open race and a win bet are assumed, and the receipt names the horse',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T0});const f=await fixture();
 const choices=await betChoices(f.env,{...interaction('bet',one,[{name:'horse',value:'',focused:true} as never]),guild_id:guild},mapping);
 assert.ok(choices.length>=8&&choices.every(c=>c.name.length<=100&&/^\d+番 .+　1着 \d+\.\d倍・\d着内 \d+\.\d倍｜16:15発走$/.test(c.name)),JSON.stringify(choices[0]));
 const typed=await betChoices(f.env,{...interaction('bet',one,[{name:'horse',value:'2',focused:true} as never])},mapping);
 assert.deepEqual(typed.map(c=>c.value),[2],'typing a number narrows the list');
 const receipt=await runKpCommand(f.env,interaction('bet',one,[{name:'horse',value:2},{name:'amount',value:500}]),mapping);
 assert.match(receipt,/馬券を購入しました/);assert.match(receipt,/16:15発走/);assert.match(receipt,new RegExp(`\\*\\*2番 ${choices[1].name.split('　')[0].replace(/^2番 /,'')}\\*\\* の1着当て`));
 assert.match(receipt,/掛け金 500 KP × 確定倍率 \d+\.\d倍 ＝ 当たれば [\d,]+ KP/);
 assert.equal(f.sql.prepare('SELECT balance FROM kp_wallets WHERE user=?').get(one)?.balance,9500);
});
test('the horse list is answered right away as an autocomplete result, and never as a command',async()=>{
 const {discordInteractions}=await import('../src/discord-interactions.ts');
 const pair=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']) as CryptoKeyPair;
 const config={applicationId:one,guildId:guild,publicKey:Buffer.from(await crypto.subtle.exportKey('raw',pair.publicKey)).toString('hex')};
 const call=async(name:string)=>{const body=JSON.stringify({...interaction(name,one,[{name:'horse',value:'',focused:true} as never]),application_id:one,type:4,token:'t',member:{permissions:'0',user:{id:one}}}),timestamp=String(Math.floor(Date.now()/1000));
  const signature=Buffer.from(await crypto.subtle.sign('Ed25519',pair.privateKey,new TextEncoder().encode(timestamp+body))).toString('hex');
  const tasks:Promise<unknown>[]=[];const env={DB:{prepare(){throw Error('unavailable');}}} as unknown as import('../src/index.ts').Env;
  const response=await discordInteractions(new Request('https://worker/interactions',{method:'POST',body,headers:{'X-Signature-Ed25519':signature,'X-Signature-Timestamp':timestamp}}),env,{waitUntil:(p:Promise<unknown>)=>tasks.push(p)} as unknown as ExecutionContext,config);
  return {json:await response.json(),tasks:tasks.length};};
 assert.deepEqual(await call('bet'),{json:{type:8,data:{choices:[]}},tasks:0},'an unavailable list is empty, not an error');
 assert.deepEqual(await call('kp'),{json:{type:8,data:{choices:[]}},tasks:0});
});
