import test from 'node:test';
import { URL as NodeURL } from 'node:url';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {readFileSync,readdirSync}from'node:fs';
import {generateKeyPairSync,randomBytes,createCipheriv,publicEncrypt}from'node:crypto';
import {initializeKp,syncKpAccounts,collectKpMatch,drainKpInbox,issueKpCode,exchangeKpCode,kpSession,decryptKpMapping,kpCreditLine}from'../src/kp.ts';
import type{KpEnv,KpMapping}from'../src/kp.ts';
import {readKpState,operateKp,kpApi}from'../src/kp-api.ts';
const guild='100000000000000100',one='100000000000000101',two='100000000000000102';
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:one},{riotId:'Two#JP1',discordUserId:two}]};
async function fixture(){
 let queryCount=0;
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync(new NodeURL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new NodeURL('../migrations/'+file,import.meta.url),'utf8'));
 class Query{text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...values:unknown[]){return new Query(this.text,values);}first(){queryCount++;return sql.prepare(this.text).get(...this.values as never[])??null;}all(){queryCount++;return {results:sql.prepare(this.text).all(...this.values as never[])};}run(){queryCount++;return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}}
 const env:KpEnv={KP_BOOTSTRAP_PRIVATE_KEY:'fixture-key',DB:{prepare:(text:string)=>new Query(text),batch:(queries:Query[])=>{sql.exec('BEGIN');try{const rows=queries.map(q=>q.run());sql.exec('COMMIT');return rows;}catch(error){sql.exec('ROLLBACK');throw error;}}}as unknown as D1Database};
 sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('One#JP1','p-one','ap',0);sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('Two#JP1','p-two','ap',0);
 await initializeKp(env,mapping);await syncKpAccounts(env,mapping);
 return {env,sql,resetQueries(){queryCount=0;},queries(){return queryCount;},enableHistory(){sql.exec("UPDATE kp_settings SET value='0' WHERE key='starts_at';UPDATE kp_accounts SET linked_at=0;");}};
}
function game(id:string,queue='competitive',win=true){return {metadata:{match_id:id,is_completed:true,queue:{id:queue},started_at:new Date(Date.now()-10000).toISOString(),game_length_in_ms:1000},players:[{puuid:'p-one',team_id:'red'}],teams:[{team_id:'red',won:win},{team_id:'blue',won:!win}]};}
function seed(sql:DatabaseSync,user:string,amount:number){sql.prepare('INSERT INTO kp_ledger VALUES(?,?,?,?,?,?)').run('test-'+user,guild,user,amount,'test-only',Date.now());}
test('activation starts at zero, preserves first linking and cutoff, excludes old matches, and three wins buy a 2500 KP directive',async()=>{
 const f=await fixture();assert.equal((await readKpState(f.env,mapping,one)).cash,0);
 assert.equal(await collectKpMatch(f.env,mapping,game('old'),'p-one'),null);
 const linked=f.sql.prepare('SELECT linked_at FROM kp_accounts WHERE user=?').get(one)!.linked_at;
 await initializeKp(f.env,mapping);await syncKpAccounts(f.env,mapping);assert.equal(f.sql.prepare('SELECT linked_at FROM kp_accounts WHERE user=?').get(one)!.linked_at,linked);
 f.enableHistory();for(let n=0;n<3;n++)assert.equal(await collectKpMatch(f.env,mapping,game('win-'+n),'p-one'),900);
 assert.equal((await readKpState(f.env,mapping,one)).cash,2700);
 await operateKp(f.env,mapping,one,'directive-operation-001','directive',{target:two,task:'competitive'});
 assert.equal((await readKpState(f.env,mapping,one)).cash,200);assert.equal(f.sql.prepare('SELECT cost FROM kp_directives').get()!.cost,2500);
 assert.equal((await readKpState(f.env,mapping,two)).cash,0);
});
test('repeated and concurrent match collection pays once, aliases normalize, and unknown wins never get a bonus',async()=>{
 const f=await fixture();f.enableHistory();const raw=game('same');
 await Promise.all(Array.from({length:5},()=>collectKpMatch(f.env,mapping,raw,'p-one')));
 assert.equal((await readKpState(f.env,mapping,one)).cash,900);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_events').get()!.n,1);
 assert.equal(await collectKpMatch(f.env,mapping,game('loss','competitive',false),'p-one'),300);
 assert.equal(await collectKpMatch(f.env,mapping,game('tdm','hurm'),'p-one'),45);
 assert.equal(await collectKpMatch(f.env,mapping,game('escalation','ggteam'),'p-one'),45);
 const unknown=game('unknown','swiftplay');unknown.teams=[];assert.equal(await collectKpMatch(f.env,mapping,unknown,'p-one'),60);
 const before=(await readKpState(f.env,mapping,one)).cash;
 for(const mode of ['custom','deathmatch','unsupported'])assert.equal(await collectKpMatch(f.env,mapping,game('hold-'+mode,mode),'p-one'),null);
 const unfinished=game('unfinished');unfinished.metadata.is_completed=false;assert.equal(await collectKpMatch(f.env,mapping,unfinished,'p-one'),null);
 assert.equal((await readKpState(f.env,mapping,one)).cash,before);
});
test('ledger failure rolls back the credit and leaves a durable retry; recovery edits the existing notice without duplicate minting',async()=>{
 const f=await fixture();f.enableHistory();const raw=game('retry');
 f.sql.exec("CREATE TRIGGER kp_test_fail BEFORE INSERT ON kp_ledger BEGIN SELECT RAISE(ABORT,'test failure'); END;");
 assert.equal(await collectKpMatch(f.env,mapping,raw,'p-one'),null);
 assert.equal((await readKpState(f.env,mapping,one)).cash,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_events').get()!.n,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_inbox').get()!.n,1);
 f.sql.prepare('INSERT INTO notifications(riot_id,match_id,message,ended_at,mode,sent) VALUES(?,?,?,?,?,?)').run('One#JP1','retry','Result\n💬 line',Date.now(),'competitive',1);
 f.sql.exec('DROP TRIGGER kp_test_fail');await drainKpInbox(f.env);await drainKpInbox(f.env);
 assert.equal((await readKpState(f.env,mapping,one)).cash,900);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_ledger').get()!.n,1);
 assert.match(String(f.sql.prepare('SELECT message FROM notifications').get()!.message),/900 KP\n💬 line/);
 assert.equal(f.sql.prepare('SELECT sent FROM notifications').get()!.sent,0);
 assert.equal(kpCreditLine(kpCreditLine('Result\n💬 line',900),900),'Result\n🪙 この試合 +900 KP\n💬 line');
});
test('operations cannot double spend, reuse IDs with new inputs, set balances, or manufacture the roulette outcome',async()=>{
 const f=await fixture();seed(f.sql,one,1500);
 const responses=await Promise.allSettled(['trade-operation-one','trade-operation-two'].map(id=>operateKp(f.env,mapping,one,id,'trade',{symbol:'keso',side:'buy',quantity:1})));
 assert.equal(responses.filter(r=>r.status==='fulfilled').length,1);const state=await readKpState(f.env,mapping,one);assert.equal(state.cash,288);assert.equal(state.holdings.keso,1);
 const row=f.sql.prepare('SELECT id FROM kp_operations').get()!;
 await operateKp(f.env,mapping,one,String(row.id),'trade',{symbol:'keso',side:'buy',quantity:1});assert.equal((await readKpState(f.env,mapping,one)).cash,288);
 await assert.rejects(operateKp(f.env,mapping,one,String(row.id),'trade',{symbol:'keso',side:'buy',quantity:2}),/同じ操作ID/);
 await assert.rejects(operateKp(f.env,mapping,one,'salary-operation-1','salary',{cash:100000}),/本番口座/);
 const played=await operateKp(f.env,mapping,one,'roulette-operation','spin',{type:'number',amount:100,choice:3,outcome:3,cash:999999});
 const result=played.result as {outcome:number;payout:number};assert.ok(Number.isInteger(result.outcome)&&result.outcome>=0&&result.outcome<=36);assert.equal(result.payout,result.outcome===3?3600:0);
 assert.equal((await readKpState(f.env,mapping,one)).cash,188+result.payout);
});
test('a duplicate active directive rolls back payment for all issuers and ownership cannot silently change',async()=>{
 const f=await fixture();seed(f.sql,one,6000);seed(f.sql,two,6000);
 await operateKp(f.env,mapping,one,'first-directive-001','directive',{target:two,task:'competitive'});
 const before=(await readKpState(f.env,mapping,one)).cash;
 await assert.rejects(operateKp(f.env,mapping,one,'second-directive-01','directive',{target:two,task:'competitive'}));
 assert.equal((await readKpState(f.env,mapping,one)).cash,before);
 await assert.rejects(operateKp(f.env,mapping,two,'self-directive-001','directive',{target:two,task:'competitive'}),/相手/);
 assert.throws(()=>f.sql.prepare('UPDATE kp_accounts SET user=? WHERE puuid=?').run(two,'p-one'));
});
test('login codes and sessions are hashed, expire, and a code can only be exchanged once',async()=>{
 const f=await fixture();const code=(await issueKpCode(f.env,mapping,one))!;
 assert.ok(code&&!JSON.stringify(f.sql.prepare('SELECT * FROM kp_codes').all()).includes(code));
 const tokens=await Promise.allSettled([exchangeKpCode(f.env,code),exchangeKpCode(f.env,code)]);assert.equal(tokens.filter(x=>x.status==='fulfilled').length,1);
 const token=(tokens.find(x=>x.status==='fulfilled')as PromiseFulfilledResult<string>).value;
 assert.equal((await kpSession(f.env,token))!.user,one);
 assert.ok(!JSON.stringify(f.sql.prepare('SELECT * FROM kp_sessions').all()).includes(token));
 f.sql.exec('UPDATE kp_sessions SET expires=0');assert.equal(await kpSession(f.env,token),null);
 assert.equal(await issueKpCode(f.env,mapping,'100000000000000999'),null);
 const expired=(await issueKpCode(f.env,mapping,one))!;f.sql.exec('UPDATE kp_codes SET expires=0');await assert.rejects(exchangeKpCode(f.env,expired));
});
test('wallet HTTP requires authenticated identity and rejects other origins and arbitrary user IDs',async()=>{
 const f=await fixture();seed(f.sql,one,900);
 const request=(path:string,init:RequestInit={})=>new Request('https://worker.example/api/kp/'+path,init);
 assert.equal((await kpApi(request('state'),f.env,mapping)).status,401);
 assert.equal((await kpApi(request('state',{headers:{Origin:'https://attacker.example'}}),f.env,mapping)).status,403);
 const code=(await issueKpCode(f.env,mapping,one))!;
 const auth=await kpApi(request('auth',{method:'POST',body:JSON.stringify({code})}),f.env,mapping);assert.equal(auth.status,200);
 const {token}=await auth.json()as{token:string};const state=await kpApi(request('state?user='+two,{headers:{Authorization:'Bearer '+token}}),f.env,mapping);
 assert.equal((await state.json()as{cash:number}).cash,900);assert.equal(state.headers.get('Cache-Control'),'no-store');
});
test('hybrid bootstrap decrypts only with the server-held key and detects ciphertext tampering',async()=>{
 const pair=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}),key=randomBytes(32),iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);
 const ciphertext=Buffer.concat([c.update(JSON.stringify(mapping)),c.final(),c.getAuthTag()]).toString('base64');
 const envelope={version:1,keyFingerprint:'fixture',iv:iv.toString('base64'),wrappedKey:publicEncrypt({key:pair.publicKey,oaepHash:'sha256'},key).toString('base64'),ciphertext};
 assert.deepEqual(await decryptKpMapping(pair.privateKey,envelope),mapping);
 const corrupted=Buffer.from(ciphertext,'base64');corrupted[0]^=1;await assert.rejects(decryptKpMapping(pair.privateKey,{...envelope,ciphertext:corrupted.toString('base64')}));
});
test('monitor credits despite a Discord failure; retry edits the notice without paying again',async()=>{
 const {monitor}=await import('../src/index.ts');const f=await fixture();f.enableHistory();const original=globalThis.fetch;const sent:string[]=[];let fail=true;
 const env={...f.env,HENRIK_API_KEY:'fixture',DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/1/fixture'};
 globalThis.fetch=async(url,init)=>{if(String(url).includes('api.henrikdev.xyz'))return Response.json({data:[game('monitor-live')]});sent.push(JSON.parse(String(init?.body)).content);return fail?new Response('',{status:500}):Response.json({id:'100000000000000099'});};
 try{await monitor(env,[{riotId:'One#JP1',name:'One'},{riotId:'Two#JP1',name:'Two'}]);assert.equal((await readKpState(f.env,mapping,one)).cash,900);assert.match(sent[0],/900 KP/);
 fail=false;f.sql.exec("DELETE FROM monitor_state WHERE key='discord_after'");await monitor(env,[{riotId:'One#JP1',name:'One'},{riotId:'Two#JP1',name:'Two'}]);assert.equal((await readKpState(f.env,mapping,one)).cash,900);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_events').get()!.n,1);assert.equal(f.sql.prepare('SELECT sent FROM notifications').get()!.sent,1);
 }finally{globalThis.fetch=original;}
});
test('funded directives reach the target, complete only on the selected subsequent mode, and notify once per status',async()=>{
 const {flushKpDirectives}=await import('../src/kp.ts');const f=await fixture();f.enableHistory();seed(f.sql,one,2700);
 await operateKp(f.env,mapping,one,'directive-notice-001','directive',{target:two,task:'competitive'});
 assert.equal((await readKpState(f.env,mapping,two)).directives.length,1);
 const sent:Array<{content:string;allowed_mentions:{parse:string[];users:string[]}}>=[],original=globalThis.fetch;
 globalThis.fetch=async(_url,init)=>{sent.push(JSON.parse(String(init?.body)));return new Response(null,{status:204});};
 const env={...f.env,DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/1/fixture'};
 try{await flushKpDirectives(env,mapping);await flushKpDirectives(env,mapping);assert.equal(sent.length,1);assert.deepEqual(sent[0].allowed_mentions,{parse:[],users:[two]});
 const raw=game('target-next','swiftplay');raw.players[0].puuid='p-two';raw.metadata.started_at=new Date(Date.now()+1).toISOString();await collectKpMatch(f.env,mapping,raw,'p-two');assert.equal(f.sql.prepare('SELECT status FROM kp_directives').get()!.status,'active');
 raw.metadata.queue.id='competitive';raw.metadata.match_id='target-comp';await collectKpMatch(f.env,mapping,raw,'p-two');assert.equal(f.sql.prepare('SELECT status FROM kp_directives').get()!.status,'completed');
 await flushKpDirectives(env,mapping);await flushKpDirectives(env,mapping);assert.equal(sent.length,2);assert.match(sent[1].content,/指令達成/);assert.deepEqual(sent[1].allowed_mentions.users,[]);
 }finally{globalThis.fetch=original;}
});

test('four players with cached five-match histories avoid repeating wallet setup and stay within the normal D1 query allowance',async()=>{
 const {monitor}=await import('../src/index.ts');const f=await fixture(),original=globalThis.fetch;
 const names=['One','Two','Three','Four'],puuids=['p-one','p-two','p-three','p-four'];
 for(let i=2;i<4;i++)f.sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run(names[i]+'#JP1',puuids[i],'ap',0);
 const histories=new Map<string,ReturnType<typeof game>[]>();
 for(let i=0;i<4;i++){const games=Array.from({length:5},(_,n)=>{const raw=game('cached-'+i+'-'+n);raw.players[0].puuid=puuids[i];f.sql.prepare('INSERT INTO notifications(riot_id,match_id,message,ended_at,mode,sent) VALUES(?,?,?,?,?,1)').run(names[i]+'#JP1',raw.metadata.match_id,'fixture',Date.now()-9000,'competitive');return raw;});histories.set(puuids[i],games);}
 globalThis.fetch=async url=>{const target=String(url).split('/').at(-1)!.split('?')[0];return Response.json({data:histories.get(target)??[]});};
 try{f.resetQueries();await monitor({...f.env,HENRIK_API_KEY:'fixture',DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/1/fixture'},names.map(name=>({riotId:name+'#JP1'})));assert.ok(f.queries()+3<=50,`queries including three cold-initialization reads: ${f.queries()+3}`);}
 finally{globalThis.fetch=original;}
});
