import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {kpSchema} from '../src/kp.ts';
import type {KpEnv} from '../src/kp.ts';
import {receiveLoopKp} from '../src/loop-kp.ts';
import {ledgerHistory} from '../src/kp-history.ts';
const guild='100000000000000001',user='200000000000000001',mapping={guildId:guild,accounts:[]};
const pair=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']) as CryptoKeyPair;
const b64=(buffer:ArrayBuffer)=>Buffer.from(buffer).toString('base64');
const publicKey=b64(await crypto.subtle.exportKey('spki',pair.publicKey) as ArrayBuffer);
function fixture(){
 const sql=new DatabaseSync(':memory:');for(const s of kpSchema)sql.exec(s);
 class Q{text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...v:unknown[]){return new Q(this.text,v);}async first(){return sql.prepare(this.text).get(...this.values as never[])??null;}async all(){return {results:sql.prepare(this.text).all(...this.values as never[])};}async run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}}
 const DB={prepare:(s:string)=>new Q(s),batch:async(qs:Q[])=>{sql.exec('BEGIN');try{const rows=[];for(const q of qs)rows.push(await q.run());sql.exec('COMMIT');return rows;}catch(e){sql.exec('ROLLBACK');throw e;}}} as unknown as D1Database;
 const config={enabled:true,startsAt:Date.now()-60000,publicKey,rates:{'chapter.1':1000,'achievement.first_clear':100}};
 return {sql,config,env:{DB,KP_LOOP_REWARDS_CONFIG:JSON.stringify(config)} as KpEnv};
}
const event=(extra={})=>({kind:'loop.milestone.completed',version:1,guildId:guild,discordUserId:user,milestone:'chapter.1',evidenceId:'run_123',completedAt:Date.now(),...extra});
async function request(e:unknown,timestamp=String(Date.now()),key=pair.privateKey){
 const body=typeof e==='string'?e:JSON.stringify(e);
 const signature=b64(await crypto.subtle.sign('Ed25519',key,new TextEncoder().encode(timestamp+'.'+body)));
 return new Request('https://worker.example/api/kp/loop/reward',{method:'POST',headers:{'X-Loop-Time':timestamp,'X-Loop-Signature':signature},body});
}
const balance=(sql:DatabaseSync)=>sql.prepare('SELECT balance FROM kp_wallets WHERE guild=? AND user=?').get(guild,user)?.balance??0;
test('LOOP is unavailable without an explicitly valid receiver configuration',async()=>{
 const f=fixture();for(const config of [undefined,'{}','bad',JSON.stringify({...f.config,enabled:false}),JSON.stringify({...f.config,rates:{'chapter.1':null}}),JSON.stringify({...f.config,rates:{'chapter.1':-1}})]){
 f.env.KP_LOOP_REWARDS_CONFIG=config;assert.equal((await receiveLoopKp(await request(event()),f.env,mapping)).status,503);
 }assert.equal(balance(f.sql),0);
});
test('verified achievement creates an account for a new member and a normal LOOP ledger entry',async()=>{
 const f=fixture();const r=await receiveLoopKp(await request(event({amount:999999})),f.env,mapping);assert.equal(r.status,200);assert.equal((await r.json() as {amount:number}).amount,1000);assert.equal(balance(f.sql),1000);
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_participants').get()!.n,1);
 const history=await ledgerHistory(f.env,guild,user);assert.equal(history[0]!.label,'KESO LOOP');assert.equal(history[0]!.delta,1000);
});
test('new run IDs and configuration changes never re-award the same milestone',async()=>{
 const f=fixture();await receiveLoopKp(await request(event()),f.env,mapping);
 f.config.rates['chapter.1']=5000;f.env.KP_LOOP_REWARDS_CONFIG=JSON.stringify(f.config);
 const r=await receiveLoopKp(await request(event({evidenceId:'new_run',slot:3})),f.env,mapping);
 assert.equal((await r.json() as {amount:number}).amount,1000);assert.equal(balance(f.sql),1000);
 await receiveLoopKp(await request(event({milestone:'achievement.first_clear'})),f.env,mapping);assert.equal(balance(f.sql),1100);
});
test('each Discord account receives its own milestone once',async()=>{
 const f=fixture();for(const id of [user,'200000000000000002'])assert.equal((await receiveLoopKp(await request(event({discordUserId:id})),f.env,mapping)).status,200);
 assert.equal(f.sql.prepare('SELECT sum(balance) AS n FROM kp_wallets').get()!.n,2000);
});
test('unsigned, expired, wrong-key and altered-body submissions cannot award KP',async()=>{
 const f=fixture();assert.equal((await receiveLoopKp(new Request('https://worker.example',{method:'POST',body:JSON.stringify(event())}),f.env,mapping)).status,401);
 assert.equal((await receiveLoopKp(await request(event(),String(Date.now()-300001)),f.env,mapping)).status,401);
 const other=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']) as CryptoKeyPair;assert.equal((await receiveLoopKp(await request(event(),String(Date.now()),other.privateKey),f.env,mapping)).status,401);
 const original=await request(event());assert.equal((await receiveLoopKp(new Request(original.url,{method:'POST',headers:original.headers,body:JSON.stringify(event({discordUserId:'200000000000000002'}))}),f.env,mapping)).status,401);assert.equal(balance(f.sql),0);
});
test('invalid, old, future, wrong-guild and unknown milestones are rejected',async()=>{
 const f=fixture();for(const extra of [{guildId:'100000000000000002'},{discordUserId:200000000000000001},{milestone:'achievement.fake'},{milestone:'__proto__'},{completedAt:f.config.startsAt-1},{completedAt:Date.now()+120000},{evidenceId:'bad:run'},{version:2}])assert.equal((await receiveLoopKp(await request(event(extra)),f.env,mapping)).status,400);
 assert.equal((await receiveLoopKp(await request('null'),f.env,mapping)).status,400);assert.equal((await receiveLoopKp(await request('{'),f.env,mapping)).status,400);assert.equal(balance(f.sql),0);
});
test('oversized streamed payload is rejected even without Content-Length',async()=>{
 const f=fixture();assert.equal((await receiveLoopKp(await request('a'.repeat(4097)),f.env,mapping)).status,413);assert.equal(balance(f.sql),0);
});
test('ledger failure rolls back the event and account creation, and a retry can succeed',async()=>{
 const f=fixture();f.sql.exec("CREATE TRIGGER reject_loop BEFORE INSERT ON kp_ledger WHEN NEW.kind='loop' BEGIN SELECT RAISE(ABORT,'test failure'); END");
 await assert.rejects(receiveLoopKp(await request(event()),f.env,mapping));assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_loop_events').get()!.n,0);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kp_wallets').get()!.n,0);
 f.sql.exec('DROP TRIGGER reject_loop');assert.equal((await receiveLoopKp(await request(event()),f.env,mapping)).status,200);assert.equal(balance(f.sql),1000);
});
