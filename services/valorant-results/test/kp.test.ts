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
test('activation starts at zero, preserves first linking and cutoff, excludes old matches, and nine wins buy an 8000 KP directive',async()=>{
 const f=await fixture();assert.equal((await readKpState(f.env,mapping,one)).cash,0);
 assert.equal(await collectKpMatch(f.env,mapping,game('old'),'p-one'),null);
 const linked=f.sql.prepare('SELECT linked_at FROM kp_accounts WHERE user=?').get(one)!.linked_at;
 await initializeKp(f.env,mapping);await syncKpAccounts(f.env,mapping);assert.equal(f.sql.prepare('SELECT linked_at FROM kp_accounts WHERE user=?').get(one)!.linked_at,linked);
 f.enableHistory();for(let n=0;n<9;n++)assert.equal(await collectKpMatch(f.env,mapping,game('win-'+n),'p-one'),900);
 assert.equal((await readKpState(f.env,mapping,one)).cash,8100);
 await operateKp(f.env,mapping,one,'directive-operation-001','directive',{target:two,task:'competitive'});
 assert.equal((await readKpState(f.env,mapping,one)).cash,100);assert.equal(f.sql.prepare('SELECT cost FROM kp_directives').get()!.cost,8000);
 assert.equal((await readKpState(f.env,mapping,two)).cash,0);
});
test('repeated and concurrent match collection pays once, aliases normalize, and unknown results earn nothing',async()=>{
 const f=await fixture();f.enableHistory();const raw=game('same');
 await Promise.all(Array.from({length:5},()=>collectKpMatch(f.env,mapping,raw,'p-one')));
 assert.equal((await readKpState(f.env,mapping,one)).cash,900);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_events').get()!.n,1);
 assert.equal(await collectKpMatch(f.env,mapping,game('loss','competitive',false),'p-one'),-100);
 assert.equal(await collectKpMatch(f.env,mapping,game('tdm','hurm'),'p-one'),70);
 assert.equal(await collectKpMatch(f.env,mapping,game('escalation','ggteam'),'p-one'),70);
 const unknown=game('unknown','swiftplay');unknown.teams=[];assert.equal(await collectKpMatch(f.env,mapping,unknown,'p-one'),0);
 const before=(await readKpState(f.env,mapping,one)).cash;
 for(const mode of ['custom','unsupported'])assert.equal(await collectKpMatch(f.env,mapping,game('hold-'+mode,mode),'p-one'),null);
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
 const f=await fixture();seed(f.sql,one,20000);seed(f.sql,two,20000);
 await operateKp(f.env,mapping,one,'first-directive-001','directive',{target:two,task:'competitive'});
 const before=(await readKpState(f.env,mapping,one)).cash;
 await assert.rejects(operateKp(f.env,mapping,one,'second-directive-01','directive',{target:two,task:'competitive'}));
 assert.equal((await readKpState(f.env,mapping,one)).cash,before);
 await assert.rejects(operateKp(f.env,mapping,two,'self-directive-001','directive',{target:two,task:'competitive'}),/相手/);
 assert.throws(()=>f.sql.prepare('UPDATE kp_accounts SET user=? WHERE puuid=?').run(two,'p-one'));
});
test('login codes expire and are one-use; sessions are hashed and can be invalidated',async()=>{
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
 const {flushKpDirectives}=await import('../src/kp.ts');const f=await fixture();f.enableHistory();seed(f.sql,one,8000);
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

test('sessions remain valid years later; valid legacy sessions upgrade but expired and revoked sessions cannot return',async()=>{
 const {revokeKpSession,kpHash}=await import('../src/kp.ts');const f=await fixture();
 const token=await exchangeKpCode(f.env,(await issueKpCode(f.env,mapping,one))!);
 const clock=Date.now,now=clock();
 try{Date.now=()=>now+100*365*86400000;assert.equal((await kpSession(f.env,token))!.user,one);}
 finally{Date.now=clock;}
 f.sql.prepare('UPDATE kp_sessions SET expires=?').run(now+30*86400000);
 assert.equal((await kpSession(f.env,token))!.user,one);assert.equal(f.sql.prepare('SELECT expires FROM kp_sessions').get()!.expires,-1);
 await revokeKpSession(f.env,token);assert.equal(await kpSession(f.env,token),null);
 f.sql.prepare('INSERT INTO kp_sessions VALUES(?,?,?,?)').run(await kpHash(token),guild,one,now-1);assert.equal(await kpSession(f.env,token),null);assert.notEqual(f.sql.prepare('SELECT expires FROM kp_sessions').get()!.expires,-1);
});
test('authenticated logout revokes only that device session and does not touch any KP',async()=>{
 const f=await fixture();seed(f.sql,one,900);const a=await exchangeKpCode(f.env,(await issueKpCode(f.env,mapping,one))!),b=await exchangeKpCode(f.env,(await issueKpCode(f.env,mapping,one))!);
 const request=(token:string)=>new Request('https://worker.example/api/kp/logout',{method:'POST',headers:{Authorization:'Bearer '+token}});
 assert.equal((await kpApi(request('b'.repeat(48)),f.env,mapping)).status,401);
 assert.equal((await kpApi(request(a),f.env,mapping)).status,200);assert.equal(await kpSession(f.env,a),null);assert.equal((await kpSession(f.env,b))!.user,one);assert.equal((await readKpState(f.env,mapping,one)).cash,900);
});

async function activityFixture(){
 const f=await fixture();f.env.DISCORD_CLIENT_SECRET='fixture-only-oauth-secret';const module=await import('../src/discord-activity-auth.ts'),config=(await import('../discord-config.json',{with:{type:'json'}})).default;
 const verifier='v'.repeat(43),challenge=await module.pkceChallenge(verifier);
 return {...f,module,applicationId:config.applicationId,verifier,async input(){const {nonce}=await module.createActivityChallenge(f.env,challenge,'fixture-ip');return{nonce,code:'fixture-oauth-code',codeVerifier:verifier};}};
}
test('Activity OAuth requires one-use PKCE, verifies the app, scopes and actual Discord user, and never trusts a supplied userId',async()=>{
 const f=await activityFixture(),original=globalThis.fetch;let exchanges=0;
 globalThis.fetch=async(url,init)=>{
  if(String(url).endsWith('/oauth2/token')){exchanges++;const body=new URLSearchParams(String(init?.body));assert.equal(body.get('client_id'),f.applicationId);assert.equal(body.get('client_secret'),f.env.DISCORD_CLIENT_SECRET);assert.equal(body.get('code_verifier'),f.verifier);assert.equal(body.has('redirect_uri'),false);return Response.json({access_token:'sensitive-discord-access',token_type:'Bearer'});}
  if(String(url).endsWith('/oauth2/@me'))return Response.json({application:{id:f.applicationId},scopes:['identify']});
  assert.ok(String(url).endsWith('/users/@me'));return Response.json({id:one});
 };
 try{
 const input={...await f.input(),userId:two};await assert.rejects(f.module.authenticateActivity(f.env,mapping,{...input,codeVerifier:'x'.repeat(43)},'fixture-ip'),/期限切れか使用済み/);
 const attempts=await Promise.allSettled([f.module.authenticateActivity(f.env,mapping,input,'fixture-ip'),f.module.authenticateActivity(f.env,mapping,input,'fixture-ip')]);assert.equal(attempts.filter(a=>a.status==='fulfilled').length,1);assert.equal(exchanges,1);
 const result=(attempts.find(a=>a.status==='fulfilled')as PromiseFulfilledResult<{token:string;userId:string;accessToken:string}>).value;assert.equal(result.userId,one);assert.equal((await kpSession(f.env,result.token))!.user,one);assert.equal(result.accessToken,'sensitive-discord-access');
 const sensitive=JSON.stringify(['kp_activity_challenges','kp_activity_limits','kp_sessions'].map(table=>f.sql.prepare('SELECT * FROM '+table).all()));assert.ok(!sensitive.includes(result.accessToken)&&!sensitive.includes(result.token)&&!sensitive.includes(input.code));assert.equal((await readKpState(f.env,mapping,one)).cash,0);
 await f.module.authenticateActivity(f.env,mapping,await f.input(),'fixture-ip',result.token);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_sessions').get()!.n,1,'Matching permanent sessions are reused');
 const origin='https://'+f.applicationId+'.discordsays.com',headers={'Content-Type':'application/json',Origin:origin,Authorization:'Bearer '+result.token};
 const challengeResponse=await kpApi(new Request('https://worker.example/api/kp/activity/challenge',{method:'POST',headers,body:JSON.stringify({codeChallenge:await f.module.pkceChallenge(f.verifier)})}),f.env,mapping);
 assert.equal(challengeResponse.status,200);const fresh=await challengeResponse.json()as{nonce:string};
 const http=await kpApi(new Request('https://worker.example/api/kp/activity/auth',{method:'POST',headers,body:JSON.stringify({...fresh,code:'another-fixture-code',codeVerifier:f.verifier,userId:two})}),f.env,mapping);
 assert.equal(http.status,200);assert.equal(http.headers.get('Access-Control-Allow-Origin'),origin);assert.equal(http.headers.get('Cache-Control'),'no-store');const connected=await http.json()as{token:string;userId:string};assert.equal(connected.userId,one);assert.equal(connected.token,result.token);

 }finally{globalThis.fetch=original;}
});
test('Activity authentication fails closed for another app, missing identity scope, unknown account, provider failure and expired challenge',async()=>{
 const original=globalThis.fetch;
 try{for(const failure of['app','scope','user','provider','expired']){
  const f=await activityFixture(),input=await f.input();let calls=0;
  if(failure==='expired')f.sql.exec('UPDATE kp_activity_challenges SET expires=0');
  globalThis.fetch=async url=>{calls++;if(failure==='provider')return new Response('never return this secret',{status:500});if(String(url).endsWith('/oauth2/token'))return Response.json({access_token:'private-access',token_type:'Bearer'});if(String(url).endsWith('/oauth2/@me'))return Response.json({application:{id:failure==='app'?'other-app':f.applicationId},scopes:failure==='scope'?[]:['identify']});return Response.json({id:'100000000000000999'});};
  await assert.rejects(f.module.authenticateActivity(f.env,mapping,input,'fixture-ip'));assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_sessions').get()!.n,0);if(failure==='expired')assert.equal(calls,0);
 }}finally{globalThis.fetch=original;}
});
test('Activity login is optional, rejects untrusted origins, and rate limits challenges without disabling code login',async()=>{
 const f=await fixture();const config=await kpApi(new Request('https://worker.example/api/kp/activity/config'),f.env,mapping);assert.equal((await config.json()as{available:boolean}).available,false);
 const module=await import('../src/discord-activity-auth.ts');await assert.rejects(module.createActivityChallenge(f.env,'x'.repeat(43),'ip'),/設定待ち/);
 f.env.DISCORD_CLIENT_SECRET='fixture-only-secret';for(let i=0;i<30;i++)await module.createActivityChallenge(f.env,'x'.repeat(43),'ip');await assert.rejects(module.createActivityChallenge(f.env,'x'.repeat(43),'ip'),/1分/);
 await module.createActivityChallenge(f.env,'x'.repeat(43),'another-ip');
 const bad=await kpApi(new Request('https://worker.example/api/kp/activity/challenge',{method:'POST',headers:{Origin:'https://wrong.example'},body:JSON.stringify({codeChallenge:'x'.repeat(43)})}),f.env,mapping);assert.equal(bad.status,403);
 const code=await issueKpCode(f.env,mapping,one);assert.ok(code);assert.ok(await exchangeKpCode(f.env,code));
});
test('premium solo orders charge once and require verified solo parties and death reservation',async()=>{
 const f=await fixture();f.enableHistory();seed(f.sql,two,120000);
 await operateKp(f.env,mapping,two,'premium-solo-order','directive',{target:one,task:'solo_competitive'});
 await operateKp(f.env,mapping,two,'premium-solo-order','directive',{target:one,task:'solo_competitive'});
 assert.equal((await readKpState(f.env,mapping,two)).cash,70000,'solo competitive costs 50,000');
 f.sql.exec('UPDATE kp_directives SET at=0');
 const m=game('solo-check') as ReturnType<typeof game>&{players:Array<{puuid:string;team_id:string;party_id?:string}>};
 await collectKpMatch(f.env,mapping,m,'p-one');assert.equal(f.sql.prepare('SELECT status FROM kp_directives').get()!.status,'active');
 m.players[0].party_id='party';m.players.push({puuid:'friend',team_id:'red',party_id:'party'});
 await collectKpMatch(f.env,mapping,m,'p-one');assert.equal(f.sql.prepare('SELECT status FROM kp_directives').get()!.status,'active');
 m.players.pop();await collectKpMatch(f.env,mapping,m,'p-one');assert.equal(f.sql.prepare('SELECT status FROM kp_directives').get()!.status,'completed');
 await operateKp(f.env,mapping,two,'premium-death-order','directive',{target:one,task:'solo_death_unrated'});
 assert.equal((await readKpState(f.env,mapping,two)).cash,10000,'solo death unrated costs 60,000');f.sql.exec('UPDATE kp_directives SET at=0');
 const u={...m,metadata:{...m.metadata,match_id:'death-solo',queue:{id:'unrated'}}};
 await collectKpMatch(f.env,mapping,u,'p-one');assert.equal(f.sql.prepare("SELECT status FROM kp_directives WHERE task='solo_death_unrated'").get()!.status,'active');
 f.sql.prepare('INSERT INTO death_unrated_sessions VALUES(?,?,?,?,?,?)').run('One#JP1','premium',1,Date.now()+10000,'death-solo',null);
 await collectKpMatch(f.env,mapping,u,'p-one');assert.equal(f.sql.prepare("SELECT status FROM kp_directives WHERE task='solo_death_unrated'").get()!.status,'completed');
});
test('multi-number roulette settles one atomic basket and retries return the same draw without charging again',async()=>{
 const f=await fixture();seed(f.sql,one,20000);
 const args={type:'numbers',bets:[{number:0,amount:200},{number:7,amount:300}]};
 const a=await operateKp(f.env,mapping,one,'multi-roulette-001','spin',args);
 assert.deepEqual(await operateKp(f.env,mapping,one,'multi-roulette-001','spin',args),a);
 const r=a.result as {outcome:number;payout:number};assert.equal(r.payout,r.outcome===0?7200:r.outcome===7?10800:0);
 const balance=(await readKpState(f.env,mapping,one)).cash;assert.equal(balance,19500+r.payout);
 await assert.rejects(operateKp(f.env,mapping,one,'multi-invalid-001','spin',{type:'numbers',bets:[{number:1,amount:100},{number:1,amount:100}]}));
 assert.equal((await readKpState(f.env,mapping,one)).cash,balance);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_operations').get()!.n,1);
});
test('signed quiz completions fund newcomers once per mode and JST 09:00 day, and their wallet is usable',async()=>{
 const {receiveQuizKp,isKpParticipant}=await import('../src/quiz-kp.ts');
 const {createKpSession}=await import('../src/kp.ts');
 const {sign}=await import('node:crypto');const keys=generateKeyPairSync('ed25519');
 const publicKey=keys.publicKey.export({type:'spki',format:'der'}).toString('base64');
 const f=await fixture(),user='100000000000000199';
 const request=(mode:string,day:string,gameId:string,slot?:number)=>{const completedAt=Date.parse(day+'T00:00:01Z'),body=JSON.stringify({kind:'quiz.daily.completed',version:1,discordUserId:user,mode,day,gameId,completedAt,...(slot===undefined?{}:{slot})}),time=String(Date.now());return new Request('https://worker/api/kp/quiz/reward',{method:'POST',headers:{'X-Quiz-Time':time,'X-Quiz-Signature':sign(null,Buffer.from(time+'.'+body),keys.privateKey).toString('base64')},body});};
 for(const [mode,day,game]of [['DAILY','2026-10-25','daily-1'],['DAILY','2026-10-25','daily-1'],['DAILY','2026-10-25','daily-2'],['SOLO','2026-10-25','solo-1'],['DAILY','2026-10-26','daily-1'],['DAILY','2026-10-26','daily-3']])assert.equal((await receiveQuizKp(request(mode!,day!,game!),f.env,mapping,publicKey)).status,200);
 assert.equal((await readKpState(f.env,mapping,user)).cash,250);
 assert.equal(await isKpParticipant(f.env,mapping,user),true);
 const token=await createKpSession(f.env,guild,user);const response=await kpApi(new Request('https://worker/api/kp/state',{headers:{Authorization:'Bearer '+token}}),f.env,mapping);assert.equal(response.status,200);
 assert.equal((await response.json() as {cash:number}).cash,250);
 const tampered=request('SOLO','2026-10-25','forged');tampered.headers.set('X-Quiz-Time','1000000000000');assert.equal((await receiveQuizKp(tampered,f.env,mapping,publicKey)).status,401);
 const badSignature=request('SOLO','2026-10-25','forged');badSignature.headers.set('X-Quiz-Signature','A'.repeat(86)+'==');assert.equal((await receiveQuizKp(badSignature,f.env,mapping,publicKey)).status,401);
 assert.equal((await readKpState(f.env,mapping,user)).cash,250);
 f.sql.exec("CREATE TRIGGER fail_quiz_credit BEFORE INSERT ON kp_ledger WHEN NEW.kind='quiz' BEGIN SELECT RAISE(ABORT,'fixture rollback'); END");
 await assert.rejects(receiveQuizKp(request('RANKED','2026-10-26','ranked-retry'),f.env,mapping,publicKey));
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM kp_quiz_events WHERE mode='RANKED'").get()!.n,0);assert.equal((await readKpState(f.env,mapping,user)).cash,250);
 f.sql.exec('DROP TRIGGER fail_quiz_credit');await receiveQuizKp(request('RANKED','2026-10-26','ranked-retry'),f.env,mapping,publicKey);assert.equal((await readKpState(f.env,mapping,user)).cash,350);
 for(let slot=2;slot<=10;slot++){
  const req=()=>request('RANKED','2026-10-26','ranked-'+slot,slot);
  assert.equal((await receiveQuizKp(req(),f.env,mapping,publicKey)).status,200);
  assert.equal((await receiveQuizKp(req(),f.env,mapping,publicKey)).status,200);
 }
 assert.equal((await readKpState(f.env,mapping,user)).cash,1250);
 assert.equal((await receiveQuizKp(request('RANKED','2026-10-26','eleventh',11),f.env,mapping,publicKey)).status,400);
 await receiveQuizKp(request('RANKED','2026-10-26','ranked-retry',2),f.env,mapping,publicKey);
 await receiveQuizKp(request('RANKED','2026-10-25','ranked-2'),f.env,mapping,publicKey);
 assert.equal((await readKpState(f.env,mapping,user)).cash,1250);
 assert.equal((await receiveQuizKp(request('SOLO','2026-10-26','bad-solo',2),f.env,mapping,publicKey)).status,400);
 await receiveQuizKp(request('RANKED','2026-10-25','new-reset-day',2),f.env,mapping,publicKey);
 assert.equal((await readKpState(f.env,mapping,user)).cash,1350);
});
test('voice slots pay once with a daily cap, keep accounts usable, and roll back failed payments',async()=>{
 const {creditVoiceSlot}=await import('../src/voice-rewards.ts');const {ensureQuizKp}=await import('../src/quiz-kp.ts');
 const f=await fixture();await ensureQuizKp(f.env);const user='100000000000000188',day='2026-10-27';
 for(let slot=1;slot<=48;slot++){await creditVoiceSlot(f.env,guild,user,day,slot,Date.now());await creditVoiceSlot(f.env,guild,user,day,slot,Date.now());}
 assert.equal((await readKpState(f.env,mapping,user)).cash,720,'48 slots of 15 KP (5 + 10 bonus)');
 await assert.rejects(creditVoiceSlot(f.env,guild,user,day,49,Date.now()));assert.equal((await readKpState(f.env,mapping,user)).cash,720);
 f.sql.exec("CREATE TRIGGER voice_fixture_fail BEFORE INSERT ON kp_ledger WHEN NEW.kind='voice' BEGIN SELECT RAISE(ABORT,'fixture'); END");
 await assert.rejects(creditVoiceSlot(f.env,guild,user,'2026-10-28',1,Date.now()));assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM kp_voice_events WHERE day='2026-10-28'").get()!.n,0);
 f.sql.exec('DROP TRIGGER voice_fixture_fail');await creditVoiceSlot(f.env,guild,user,'2026-10-28',1,Date.now());assert.equal((await readKpState(f.env,mapping,user)).cash,735);
});
test('monitor records the agent of each new result for mastery, once',async()=>{
 const {monitor}=await import('../src/index.ts');const f=await fixture();f.enableHistory();const original=globalThis.fetch;
 const env={...f.env,HENRIK_API_KEY:'fixture',DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/1/fixture'};
 const raw=game('monitor-agent');(raw.players[0] as {agent?:{name:string}}).agent={name:'ジェット'};
 globalThis.fetch=async url=>String(url).includes('api.henrikdev.xyz')?Response.json({data:[raw]}):Response.json({id:'100000000000000099'});
 try{
  for(let i=0;i<2;i++){await monitor(env,[{riotId:'One#JP1',name:'One'},{riotId:'Two#JP1',name:'Two'}]);f.sql.exec("DELETE FROM monitor_state WHERE key='discord_after'");}
  assert.deepEqual(f.sql.prepare('SELECT riot_id,match_id,agent,outcome FROM agent_plays').all().map(r=>({...r})),[{riot_id:'One#JP1',match_id:'monitor-agent',agent:'ジェット',outcome:'win'}]);
 }finally{globalThis.fetch=original;}
});

test('a loss costs a little and the bottom of a full team more, capped at the balance; ties count, gaps do not',async()=>{
 const f=await fixture();f.enableHistory();
 const team=(id:string,scores:Array<number|undefined>,win=false,queue='competitive')=>{const raw=game(id,queue,win) as ReturnType<typeof game>&{players:Array<{puuid:string;team_id:string;stats?:{score?:number}}>};
  raw.players=scores.map((score,i)=>({puuid:i?'mate-'+i:'p-one',team_id:'red',stats:score===undefined?{}:{score}}));return raw;};
 seed(f.sql,one,1000);
 assert.equal(await collectKpMatch(f.env,mapping,team('bottom',[1000,3000,4000,5000,6000]),'p-one'),-300,'competitive bottom: −300');
 assert.equal((await readKpState(f.env,mapping,one)).cash,700);
 assert.equal(await collectKpMatch(f.env,mapping,team('bottom',[1000,3000,4000,5000,6000]),'p-one'),-300,'replays do not charge twice');
 assert.equal((await readKpState(f.env,mapping,one)).cash,700);
 assert.equal(await collectKpMatch(f.env,mapping,team('tie',[2000,2000,4000,5000,6000]),'p-one'),-300,'a shared bottom counts');
 assert.equal(await collectKpMatch(f.env,mapping,team('unrated',[1000,3000,4000,5000,6000],false,'unrated'),'p-one'),-200);
 assert.equal(await collectKpMatch(f.env,mapping,team('middle',[4000,3000,1000,5000,6000]),'p-one'),-100,'not the bottom: the plain loss');
 assert.equal(await collectKpMatch(f.env,mapping,team('won-bottom',[1000,3000,4000,5000,6000],true),'p-one'),900,'a win is never charged');
 assert.equal(await collectKpMatch(f.env,mapping,team('gap',[1000,3000,undefined,5000,6000]),'p-one'),-100,'missing stats: the plain loss');
 assert.equal(await collectKpMatch(f.env,mapping,team('short',[1000,3000,4000]),'p-one'),-100,'an incomplete team: the plain loss');
 const cash=(await readKpState(f.env,mapping,one)).cash;
 f.sql.prepare("INSERT INTO kp_ledger VALUES('drain',?,?,?,'test-only',0)").run(guild,one,-cash);
 assert.equal(await collectKpMatch(f.env,mapping,team('broke',[1000,3000,4000,5000,6000]),'p-one'),0,'nothing to take from an empty wallet');
 assert.equal((await readKpState(f.env,mapping,one)).cash,0);
});
test('the match line shows the net KP, negative included, and a rewrite replaces it',()=>{
 assert.match(kpCreditLine('結果',-300),/🪙 この試合 −300 KP/);
 assert.equal(kpCreditLine(kpCreditLine('結果',-300),900),'結果\n🪙 この試合 +900 KP');
});

test('deathmatch: K/D below 1 costs 15, first place wins 500 on a fair coin fixed per match, everything else is 0',async()=>{
 const f=await fixture();f.enableHistory();seed(f.sql,one,1000);
 const dm=(id:string,me:{kills?:number;deaths?:number},others:number[]=[10,20])=>{const raw=game(id,'deathmatch') as ReturnType<typeof game>&{players:Array<{puuid:string;team_id:string;stats?:{kills?:number;deaths?:number}}>};
  raw.teams=[];raw.players=[{puuid:'p-one',team_id:'p-one',stats:me},...others.map((k,i)=>({puuid:'x'+i,team_id:'x'+i,stats:{kills:k,deaths:10}}))];return raw;};
 assert.equal(await collectKpMatch(f.env,mapping,dm('dm-low',{kills:9,deaths:10}),'p-one'),-15);
 assert.equal(await collectKpMatch(f.env,mapping,dm('dm-even',{kills:10,deaths:10}),'p-one'),0,'exactly 1.0 is not below');
 assert.equal(await collectKpMatch(f.env,mapping,dm('dm-good',{kills:15,deaths:5}),'p-one'),0,'second place with a good K/D');
 assert.equal(await collectKpMatch(f.env,mapping,dm('dm-gap',{kills:15}),'p-one'),0,'missing stats are 0');
 // First place: about half of matches pay 500; the rest fall back to the K/D rule. The draw never changes on replay.
 const firsts=await Promise.all(Array.from({length:40},(_,i)=>collectKpMatch(f.env,mapping,dm('dm-top-'+i,{kills:30,deaths:10}),'p-one')));
 const won=firsts.filter(v=>v===500).length;assert.ok(won>=10&&won<=30,`won ${won} of 40`);assert.ok(firsts.every(v=>v===500||v===0));
 assert.equal(await collectKpMatch(f.env,mapping,dm('dm-top-0',{kills:30,deaths:10}),'p-one'),firsts[0]);
 const tiedLow=await collectKpMatch(f.env,mapping,dm('dm-tie-low',{kills:20,deaths:25}),'p-one');assert.ok(tiedLow===500||tiedLow===-15,'a shared first that misses the draw still has a K/D below 1');
});

test('a competitive demotion is posted with the roast and costs 500 KP once; a promotion is praised and pays 100 KP once',async()=>{
 const {monitor}=await import('../src/index.ts');const f=await fixture();f.enableHistory();seed(f.sql,one,2000);const original=globalThis.fetch;
 const env={...f.env,HENRIK_API_KEY:'fixture',DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/1/fixture'};
 const lost=game('rank-down','competitive',false),won=game('rank-up');won.players[0].puuid='p-two';
 const histories:Record<string,unknown>={'p-one':{history:[{match_id:'rank-down',tier:{id:14}},{match_id:'older',tier:{id:15}}]},'p-two':{history:[{match_id:'rank-up',tier:{id:12}},{match_id:'older',tier:{id:11}}]}};
 let historyCalls=0;
 globalThis.fetch=async url=>{const u=String(url);
  if(u.includes('/mmr-history/')){historyCalls++;return Response.json({data:histories[decodeURIComponent(u.split('/').at(-1)!)]});}
  if(u.includes('api.henrikdev.xyz'))return Response.json({data:u.includes('p-two')?[won]:u.includes('p-one')?[lost]:[]});
  return Response.json({id:'100000000000000099'});};
 try{
  for(let i=0;i<3;i++){await monitor(env,[{riotId:'One#JP1',name:'One'},{riotId:'Two#JP1',name:'Two'}]);f.sql.exec("DELETE FROM monitor_state WHERE key='discord_after'");}
  const message=(match:string)=>String(f.sql.prepare('SELECT message FROM notifications WHERE match_id=?').get(match)!.message);
  assert.match(message('rank-down'),/🔻 \*\*降格\*\* プラチナ1 → ゴールド3（−500 KP）/);assert.equal((message('rank-down').match(/^💀 /gm)??[]).length,5);
  assert.match(message('rank-up'),/🔺 \*\*昇格\*\* シルバー3 → ゴールド1（\+100 KP）/);
  assert.deepEqual(f.sql.prepare("SELECT user,delta FROM kp_ledger WHERE id LIKE 'rank-up:%'").all().map(r=>[r.user,r.delta]),[[two,100]]);
  assert.equal(f.sql.prepare("SELECT delta FROM kp_ledger WHERE id LIKE 'rank-down:%'").get()!.delta,-500);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM kp_ledger WHERE id LIKE 'rank-down:%'").get()!.n,1,'charged once across runs');
  assert.equal(historyCalls,2,'once found, the history is not read again');
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='mahjong_watch_posts'").get()!.n===0||f.sql.prepare("SELECT COUNT(*) n FROM mahjong_watch_posts").get()!.n===0,true,'found with the first post: no separate re-announcement');
 }finally{globalThis.fetch=original;}
});

test('a later monitor run shows a loss as its net negative KP, not the zero stored on the event',async()=>{
 const {prepareKpRun}=await import('../src/kp.ts');const f=await fixture();f.enableHistory();seed(f.sql,one,1000);
 assert.equal(await collectKpMatch(f.env,mapping,game('cached-loss','competitive',false),'p-one'),-100);
 const run=await prepareKpRun(f.env,mapping);
 assert.equal(run.credits.get([...run.credits.keys()].find(k=>k.includes('cached-loss'))!),-100);
});

test('a rank change that reaches the history late is still caught on a later run, and the post is updated',async()=>{
 const {monitor}=await import('../src/index.ts');const f=await fixture();f.enableHistory();seed(f.sql,one,2000);const original=globalThis.fetch;
 const env={...f.env,HENRIK_API_KEY:'fixture',DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/1/fixture'};
 const lost=game('late-down','competitive',false);let ready=false,historyCalls=0;
 globalThis.fetch=async url=>{const u=String(url);
  if(u.includes('/mmr-history/')){historyCalls++;return Response.json({data:{history:ready?[{match_id:'older',tier:{id:15},date:'2026-10-28T13:00:00Z'},{match_id:'late-down',tier:{id:14},date:'2026-10-28T14:00:00Z'}]:[{match_id:'older',tier:{id:15},date:'2026-10-28T13:00:00Z'}]}});}
  if(u.includes('api.henrikdev.xyz'))return Response.json({data:u.includes('p-one')?[lost]:[]});
  return Response.json({id:'100000000000000099'});};
 try{
  const run=async()=>{await monitor(env,[{riotId:'One#JP1',name:'One'},{riotId:'Two#JP1',name:'Two'}]);f.sql.exec("DELETE FROM monitor_state WHERE key='discord_after'");};
  await run();await run();
  assert.doesNotMatch(String(f.sql.prepare("SELECT message FROM notifications WHERE match_id='late-down'").get()!.message),/降格/);
  ready=true;await run();
  assert.match(String(f.sql.prepare("SELECT message FROM notifications WHERE match_id='late-down'").get()!.message),/🔻 \*\*降格\*\* プラチナ1 → ゴールド3/);
  assert.equal(f.sql.prepare("SELECT delta FROM kp_ledger WHERE id LIKE 'rank-down:late-down:%'").get()!.delta,-500);
  const calls=historyCalls;await run();assert.equal(historyCalls,calls,'found: not read again');
  const repost=JSON.parse(String(f.sql.prepare("SELECT body FROM mahjong_watch_posts WHERE id LIKE 'rank:rank2:late-down:%'").get()!.body));
  assert.match(repost.content,/^📢 \*\*Oneのランク速報\*\*（\d\d:\d\d 終了のコンペ）\n🔻 \*\*降格\*\* プラチナ1 → ゴールド3/);assert.deepEqual(repost.allowed_mentions,{parse:[]});
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM mahjong_watch_posts WHERE id LIKE 'rank:%'").get()!.n,1,'re-announced once');
 }finally{globalThis.fetch=original;}
});
