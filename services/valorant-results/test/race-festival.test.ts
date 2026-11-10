// @ts-expect-error Shared festival rules.
import {FESTIVAL_FROM,festivalRace,FESTIVAL_PRICE,festivalFactor,RUN_MS as FESTIVAL_RUN_MS} from '../../../js/racing.js';
import {festivalTerms,publicFestival,publicFestivalResponse} from '../src/race-festival.ts';
import {createKpSession} from '../src/kp.ts';
function findFestival(){for(let t=FESTIVAL_FROM;t<FESTIVAL_FROM+70*86400000;t+=900000)if(festivalRace(t))return t;throw Error('no fixture');}
import test from 'node:test';
import { URL as NodeURL } from 'node:url';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash,generateKeyPairSync,randomBytes,createCipheriv,publicEncrypt } from 'node:crypto';
import { initializeKp, syncKpAccounts } from '../src/kp.ts';
import type { KpEnv, KpMapping } from '../src/kp.ts';
import { readKpState, operateKp } from '../src/kp-api.ts';
import { settleKpRaces } from '../src/racing-kp.ts';
// @ts-expect-error The shared pure browser engine has no TypeScript declarations.
import { RUN_MS, RACE_INTERVAL, CLOSE_BEFORE, raceCard, raceOdds, raceResult, payoutFor } from '../../../js/racing.js';
const guild='100000000000000100',one='100000000000000101',two='100000000000000102';
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:one},{riotId:'Two#JP1',discordUserId:two}]};
// Use the first deterministic festival after launch; buy two minutes before it.
const RACE=findFestival(),T0=RACE-120000;
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
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
const balance=(sql:DatabaseSync,user:string)=>Number(sql.prepare('SELECT balance FROM kp_wallets WHERE guild=? AND user=?').get(guild,user)!.balance);


import {kpApi} from '../src/kp-api.ts';
import {ensureFestival} from '../src/race-festival.ts';
import {ensureRacing,racingView} from '../src/racing-kp.ts';
const args={raceId:RACE,type:'win',horse:1,amount:FESTIVAL_PRICE};

test('server payout commitment is immutable and not revealed before the goal, even after the ordinary run seed is public',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T0});const f=await fixture();
 const privateTerms=(await festivalTerms(f.env,guild,RACE))!;
 const publicTerms=(await publicFestival(f.env,guild,RACE,T0))!;
 assert.deepEqual(publicTerms,{hash:privateTerms.hash});assert.equal(sha(privateTerms.seed),publicTerms.hash);
 const secondBinding={...f.env,DB:{...f.env.DB} as D1Database};
 assert.deepEqual(await festivalTerms(secondBinding,guild,RACE),privateTerms);
 const during=await racingView(f.env,mapping,RACE+1000);assert.equal('seed' in during.watch.festival!,false);assert(during.watch.seed);
 const revealed=(await publicFestival(f.env,guild,RACE,RACE+FESTIVAL_RUN_MS))!;
 assert.equal(revealed.seed,privateTerms.seed);assert.equal(revealed.factor,festivalFactor(privateTerms.seed));
});

test('API receipts, retries and wallet snapshots hide actual odds; same operation returns the same one ticket',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T0});const f=await fixture();const token=await createKpSession(f.env,guild,one);
 const request=(path:string,body?:unknown)=>kpApi(new Request('https://worker/api/kp/'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),f.env,mapping);
 const body={id:'f0000000000000000000000000000000',action:'race-bet',args};
 const first=await request('operation',body);assert.equal(first.status,200);const receipt:any=await first.json();assert.equal(receipt.result.bet.odds,null);
 const again:any=await(await request('operation',body)).json();assert.deepEqual(again,receipt);
 const state:any=await(await request('state')).json();assert.equal(state.raceBets[0].odds,null);assert.equal(state.racing.open.festival.seed,undefined);assert.equal(state.racing.open.festival.factor,undefined);
 const stored=JSON.parse(String(f.sql.prepare('SELECT response FROM kp_operations WHERE id=?').get(body.id)!.response));assert(Number.isSafeInteger(stored.result.bet.odds));
 const nested={state:{raceBets:[stored.result.bet]},result:{bet:stored.result.bet}};
 assert.equal((publicFestivalResponse(nested,T0) as any).result.bet.odds,null);
 assert.equal((publicFestivalResponse(nested,RACE+FESTIVAL_RUN_MS) as any).result.bet.odds,stored.result.bet.odds);
 assert.equal(balance(f.sql,one),9000);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM kp_festival_tickets').get()!.n,1);
});

test('one ticket is enforced by the database even if the wallet JSON is missing its ticket; rejection rolls every debit back',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T0});const f=await fixture();
 await operateKp(f.env,mapping,one,'f1000000000000000000000000000000','race-bet',args);
 f.sql.prepare("UPDATE kp_state SET data=json_remove(data,'$.raceBets') WHERE guild=? AND user=?").run(guild,one);
 const before=f.sql.prepare('SELECT COUNT(*) AS n FROM kp_ledger').get()!.n;
 await assert.rejects(operateKp(f.env,mapping,one,'f2000000000000000000000000000000','race-bet',{...args,horse:2}),/1人1枚/);
 assert.equal(balance(f.sql,one),9000);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM kp_ledger').get()!.n,before);
 assert.equal(f.sql.prepare("SELECT id FROM kp_operations WHERE id='f2000000000000000000000000000000'").get(),undefined);
});

test('simultaneous different operation IDs buy at most one ticket, while another member may buy their own',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T0});const f=await fixture();
 const results=await Promise.allSettled([operateKp(f.env,mapping,one,'f3000000000000000000000000000000','race-bet',args),operateKp(f.env,mapping,one,'f4000000000000000000000000000000','race-bet',{...args,horse:2})]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(balance(f.sql,one),9000);
 f.sql.prepare("INSERT INTO kp_ledger VALUES('test-two',?,?,10000,'test',0)").run(guild,two);
 await operateKp(f.env,mapping,two,'f5000000000000000000000000000000','race-bet',args);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM kp_festival_tickets').get()!.n,2);
});

test('a committed jackpot pays the advertised maximum once and releases the payout proof only after the finish',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T0});const f=await fixture();await ensureRacing(f.env);await ensureFestival(f.env);
 const card=raceCard(RACE),odds=raceOdds(card);let payoutSeed='',runSeed='',horse=0;
 for(let i=0;i<10000;i++){const seed='payout-fixture-'+i;if(festivalFactor(seed)===10000){payoutSeed=seed;break;}}
 for(let i=0;i<10000;i++){const seed='result-fixture-'+i,n=raceResult(card,seed).order[0];if(odds.win[n]>=100){runSeed=seed;horse=n;break;}}
 assert(payoutSeed&&runSeed&&horse);
 f.sql.prepare('INSERT INTO kp_festival_seeds VALUES(?,?,?,?)').run(guild,RACE,payoutSeed,sha(payoutSeed));
 f.sql.prepare('INSERT INTO kp_races VALUES(?,?,?,?,?)').run(guild,RACE,runSeed,sha(runSeed),T0);
 await operateKp(f.env,mapping,one,'f6000000000000000000000000000000','race-bet',{...args,horse});
 t.mock.timers.setTime(RACE+FESTIVAL_RUN_MS);assert.equal(await settleKpRaces(f.env,mapping),1);assert.equal(balance(f.sql,one),100009000);
 assert.equal(await settleKpRaces(f.env,mapping),0);assert.equal(balance(f.sql,one),100009000);
 const saved=JSON.parse(String(f.sql.prepare('SELECT data FROM kp_state WHERE guild=? AND user=?').get(guild,one)!.data)).raceBets[0];
 assert.equal(saved.payout,100000000);assert.equal(saved.status,'won');
 assert.equal((await publicFestival(f.env,guild,RACE,Date.now()))!.seed,payoutSeed);
});

import {runKpCommand,betChoices,betFallbackChoices} from '../src/kp-slash.ts';
import {cardPost,queueRacePosts} from '../src/racing-posts.ts';
import {raceShow,liveRacePost} from '../src/racing-broadcast.ts';
const interaction=(name:string,n:number,amount=FESTIVAL_PRICE)=>({id:String((BigInt(T0)-1420070400000n)<<22n|BigInt(n)),guild_id:guild,member:{user:{id:one}},data:{name,options:name==='bet'?[{name:'horse',value:1},{name:'amount',value:amount}]:[]}});
test('slash commands, autocomplete, card and live broadcast do not advertise base odds as festival odds; explicit amounts are never silently increased',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T0});const f=await fixture();
 const keiba=await runKpCommand(f.env,interaction('keiba',1),mapping);assert.match(keiba,/非公開/);assert.doesNotMatch(keiba,/[0-9]+\.[0-9]倍/);
 const choices=await betChoices(f.env,interaction('bet',2),mapping,T0);assert(choices.length);assert(choices.every(c=>c.name.includes('非公開')));
 assert(betFallbackChoices(T0).every(c=>c.name.includes('ゴール後')));
 const card=raceCard(RACE),post=cardPost(card,'a'.repeat(64),'b'.repeat(64));assert.match(post,/1人1枚/);assert.doesNotMatch(post,/[0-9]+\.[0-9]倍/);
 const show=raceShow(card,'fixture-run');assert.doesNotMatch(liveRacePost(show,T0).content,/[0-9]+\.[0-9]倍/);
 const rejected=await runKpCommand(f.env,interaction('bet',3,100),mapping);assert.match(rejected,/1,000/);assert.equal(balance(f.sql,one),10000);
 const accepted=await runKpCommand(f.env,interaction('bet',4),mapping);assert.match(accepted,/ゴールまで内緒/);assert.doesNotMatch(accepted,/確定倍率|当たれば/);
 const bets=await runKpCommand(f.env,{...interaction('kp',6),data:{name:'kp',options:[{name:'bets',type:1}]}},mapping);assert.match(bets,/ゴールまで非公開/);assert.doesNotMatch(bets,/当たれば|[0-9]+\.[0-9]倍/);
 const duplicate=await runKpCommand(f.env,interaction('bet',5),mapping);assert.match(duplicate,/1人1枚/);assert.equal(balance(f.sql,one),9000);
});


test('festival preview is denied even to a configured private owner',async t=>{
 t.mock.timers.enable({apis:['Date'],now:T0});const f=await fixture();
 const pair=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}),key=randomBytes(32),iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);
 const ciphertext=Buffer.concat([c.update(JSON.stringify({enabled:true,guildId:guild,ownerId:one})),c.final(),c.getAuthTag()]).toString('base64');
 f.env.KP_BOOTSTRAP_PRIVATE_KEY=pair.privateKey;f.env.KP_PRIVATE_CASINO_CONFIG=JSON.stringify({version:1,keyFingerprint:'fixture',iv:iv.toString('base64'),wrappedKey:publicEncrypt({key:pair.publicKey,oaepHash:'sha256'},key).toString('base64'),ciphertext});
 const token=await createKpSession(f.env,guild,one);
 const response=await kpApi(new Request('https://worker/api/kp/private/race',{headers:{Authorization:'Bearer '+token}}),f.env,mapping);
 assert.equal(response.status,403);assert.match(JSON.stringify(await response.json()),/先読みできません/);
});
