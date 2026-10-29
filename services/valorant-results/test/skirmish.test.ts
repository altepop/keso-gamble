import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {kpSchema} from '../src/kp.ts';import type {KpEnv} from '../src/kp.ts';
import {ensureModeRewards} from '../src/mode-rewards.ts';
import {ensureSkirmish,settleSkirmishMatch,skirmishState,skirmishPrompt,decideSkirmish,skirmishResultButtons,withoutSkirmishButtons} from '../src/skirmish.ts';
const guild='100000000000000100',user='100000000000000101',other='100000000000000102';
async function fixture(){
 const sql=new DatabaseSync(':memory:');for(const schema of kpSchema)sql.exec(schema);
 sql.prepare('INSERT INTO kp_wallets(guild,user,balance) VALUES(?,?,500)').run(guild,user);
 class Q{text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...v:unknown[]){return new Q(this.text,v);}first(){return sql.prepare(this.text).get(...this.values as never[])??null;}run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}}
 const env={DB:{prepare:(s:string)=>new Q(s),batch:(qs:Q[])=>{sql.exec('BEGIN');try{const result=qs.map(q=>q.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}}}as unknown as KpEnv;
 await ensureModeRewards(env);await ensureSkirmish(env);
 const game=(id:string,start:number,win=true)=>settleSkirmishMatch(env,{guild,user,puuid:'p1',match:id,start,end:start+100,win,now:start+200});
 const state=()=>skirmishState(env,guild,user);const balance=()=>Number(sql.prepare('SELECT balance FROM kp_wallets').get()!.balance);
 const choose=async(action='continue',now=300)=>{const s=(await state())!;return decideSkirmish(env,guild,user,`sk:${user}:${s.version}:${action}`,now);};
 return {env,sql,game,state,balance,choose};
}
test('four wins require three explicit continues and pay exactly once; duplicate games cannot change it',async()=>{
 const f=await fixture();
 for(let n=1;n<=4;n++){
  const t=n*1000;await Promise.all([f.game('m'+n,t),f.game('m'+n,t)]);
  const s=(await f.state())!;
  if(n<4){assert.equal(s.pot,[0,50,250,600][n]);assert.equal(s.phase,'choice');assert.equal(f.balance(),500);await f.choose('continue',t+300);}
 }
 assert.equal(f.balance(),2000);assert.equal((await f.state())!.pot,0);
 await f.game('m4',4000);assert.equal(f.balance(),2000);
});
test('cashout and continue race cannot both win; stale and foreign buttons do not change another wallet',async()=>{
 const f=await fixture();await f.game('first',1000);const s=(await f.state())!,cash=`sk:${user}:${s.version}:cash`,go=`sk:${user}:${s.version}:continue`;
 assert.match((await decideSkirmish(f.env,guild,other,cash,1500)).content,/本人/);
 await Promise.all([decideSkirmish(f.env,guild,user,cash,1500),decideSkirmish(f.env,guild,user,go,1500)]);
 assert.equal(f.balance(),550);assert.equal((await f.state())!.phase,'ready');
 await decideSkirmish(f.env,guild,user,cash,1500);assert.equal(f.balance(),550);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM skirmish_receipts WHERE kind='cash'").get()!.n,1);
});
test('an unchosen or already-started next game cannot be selected retrospectively',async()=>{
 const f=await fixture();await f.game('win1',1000);await f.game('ignored',2000);
 assert.equal((await f.state())!.pot,50);assert.equal((await f.state())!.wins,1);
 await f.choose('continue',3000);await f.game('started-before-choice',2900);
 assert.equal((await f.state())!.phase,'armed');assert.equal((await f.state())!.pot,50);
 await f.game('after-choice',4000);assert.equal((await f.state())!.pot,250);
});
test('losing a continued game clears only pending winnings; no wallet loss or luck draw',async()=>{
 const f=await fixture();await f.game('win',1000);await f.choose('continue',1500);await f.game('loss',2000,false);
 assert.equal(f.balance(),500);assert.equal((await f.state())!.pot,0);assert.equal((await f.state())!.wins,0);
 const result=await f.game('loss',2000,false);assert.match(result.note,/口座のKPは減りません/);
});
test('cashout ledger failure rolls state and receipt back so the same choice can be retried',async()=>{
 const f=await fixture();await f.game('win',1000);const before=await f.state();
 f.sql.exec("CREATE TRIGGER fail_sk BEFORE INSERT ON kp_ledger WHEN NEW.kind='skirmish' BEGIN SELECT RAISE(ABORT,'fixture'); END");
 await assert.rejects(f.choose('cash',1500),/fixture/);assert.deepEqual(await f.state(),before);assert.equal(f.balance(),500);
 f.sql.exec('DROP TRIGGER fail_sk');await f.choose('cash',1600);assert.equal(f.balance(),550);
});
test('fourth win ledger failure rolls back the match receipt and streak, retry pays once',async()=>{
 const f=await fixture();for(let n=1;n<=3;n++){await f.game('m'+n,n*1000);await f.choose('continue',n*1000+300);}
 const before=await f.state();f.sql.exec("CREATE TRIGGER fail_auto BEFORE INSERT ON kp_ledger WHEN NEW.kind='match' AND NEW.delta>0 BEGIN SELECT RAISE(ABORT,'fixture'); END");
 await assert.rejects(f.game('m4',4000),/fixture/);assert.deepEqual(await f.state(),before);assert.equal(f.balance(),500);
 f.sql.exec('DROP TRIGGER fail_auto');await f.game('m4',4000);assert.equal(f.balance(),2000);
});
test('prompt contains owner-bound buttons and shows pending money separately from wallet money',async()=>{
 const f=await fixture();await f.game('first',1000);const prompt=skirmishPrompt(await f.state());assert.match(prompt.content,/50 KP保留/);
 assert.equal(prompt.components[0].components.length,2);assert.match(prompt.components[0].components[1].custom_id,new RegExp('^sk:'+user+':'));
 await f.choose('continue',1500);assert.equal(skirmishPrompt(await f.state()).components.length,0);
});

test('only verified public queues and confirmed completed outcomes can pass readiness',async()=>{
 const queues=(await import('../skirmish-queues.json',{with:{type:'json'}})).default;
 const {assessRewardReadiness}=await import('../src/reward-readiness.ts');
 const fixtureQueue='fixture_skirmish_public';(queues.publicQueues as string[]).push(fixtureQueue,'custom');
 try{
  const raw={metadata:{match_id:'fixture',queue:{id:fixtureQueue},is_completed:true,started_at:new Date(1000).toISOString(),game_length_in_ms:100},players:[{puuid:'p1',team_id:'red'}],teams:[{team_id:'red',won:true,rounds:{won:10}},{team_id:'blue',won:false,rounds:{won:9}}]};
  assert.deepEqual(assessRewardReadiness(raw,'p1'),{status:'ready',mode:'skirmish',outcome:'win'});
  raw.teams[1].won=true;assert.equal(assessRewardReadiness(raw,'p1').status,'hold');raw.teams[1].won=false;
  raw.metadata.is_completed=false;assert.equal(assessRewardReadiness(raw,'p1').status,'hold');raw.metadata.is_completed=true;
  raw.teams[0].won=false;assert.equal(assessRewardReadiness(raw,'p1').status,'hold');raw.teams[0].won=true;
  raw.metadata.queue.id='custom';assert.equal(assessRewardReadiness(raw,'p1').status,'hold');
  raw.metadata.queue.id='unknown_skirmish';assert.equal(assessRewardReadiness(raw,'p1').status,'hold');
 }finally{queues.publicQueues.splice((queues.publicQueues as string[]).indexOf(fixtureQueue),2);}
});
test('signed button handler rejects a different user before opening a reply or touching D1',async()=>{
 const {discordInteractions}=await import('../src/discord-interactions.ts');
 const pair=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']) as CryptoKeyPair;
 const publicKey=Buffer.from(await crypto.subtle.exportKey('raw',pair.publicKey)).toString('hex'),timestamp=String(Math.floor(Date.now()/1000));
 const config={applicationId:'100000000000000199',guildId:guild,publicKey};
 const body=JSON.stringify({id:'100000000000000190',application_id:config.applicationId,type:3,guild_id:guild,token:'fixture',member:{user:{id:other}},data:{custom_id:`sk:${user}:1:cash`}});
 const signature=Buffer.from(await crypto.subtle.sign('Ed25519',pair.privateKey,new TextEncoder().encode(timestamp+body))).toString('hex');
 let touches=0;const env={DB:{prepare(){touches++;throw Error('forbidden');}}}as unknown as import('../src/index.ts').Env;const tasks:Promise<unknown>[]=[];
 const r=await discordInteractions(new Request('https://worker/interactions',{method:'POST',body,headers:{'X-Signature-Timestamp':timestamp,'X-Signature-Ed25519':signature}}),env,{waitUntil:(p:Promise<unknown>)=>tasks.push(p)}as unknown as ExecutionContext,config);
 assert.deepEqual(await r.json(),{type:4,data:{content:'本人だけが選べます。',flags:64,allowed_mentions:{parse:[]}}});assert.equal(touches,0);assert.equal(tasks.length,0);
});
test('the result of a win that opened a choice carries the buttons until the member chooses; 稼ぎch tells the challenge',async()=>{
 const f=await fixture();f.sql.prepare('INSERT INTO kp_accounts(guild,puuid,user,riot,linked_at) VALUES(?,?,?,?,0)').run(guild,'p1',user,'One#JP1');
 const notice=[{riot_id:'one#jp1',mode:'skirmish_2v2'},{riot_id:'Two#JP1',mode:'skirmish_2v2'}],names=new Map([['one#jp1','ワン']]);
 assert.deepEqual(await skirmishResultButtons(f.env,'w1',[{riot_id:'One#JP1',mode:'competitive'}]),[],'other modes never look');
 await f.game('w1',1000);
 let rows=await skirmishResultButtons(f.env,'w1',notice,names) as {components:{label:string;custom_id:string}[]}[];
 assert.equal(rows.length,1,'only the member with an open choice');
 const v=(await f.state())!.version;
 assert.deepEqual(rows[0].components.map(c=>[c.label,c.custom_id]),[['ワン：50 KPで降りる',`sk:${user}:${v}:cash`],['ワン：続行（次勝てば250 KP）',`sk:${user}:${v}:continue`]]);
 assert.deepEqual(withoutSkirmishButtons([...rows,{type:1,components:[{type:2,custom_id:`sk:${other}:1:cash`}]}],user),[{type:1,components:[{type:2,custom_id:`sk:${other}:1:cash`}]}],'a press removes only the presser\'s buttons');
 await f.choose('continue',1300);
 assert.deepEqual(await skirmishResultButtons(f.env,'w1',notice,names),[],'chosen: no buttons on later edits');
 await f.game('w2',2000);await f.choose('cash',2300);
 await f.game('w3',3000);await f.choose('continue',3300);await f.game('l4',4000,false);
 const posts=(f.sql.prepare('SELECT body FROM kp_posts ORDER BY at,id').all() as {body:string}[]).map(r=>JSON.parse(r.body));
 assert.deepEqual(posts.map(p=>p.content),[
  `🔥 <@${user}> スカーミッシュ1勝、**50 KP** を蹴って続行や！ 次勝ったら 250 KP、負けたら全部パー。`,
  `💰 <@${user}> スカーミッシュ2勝で降りた。**250 KP**、手堅く回収や。`,
  `🔥 <@${user}> スカーミッシュ1勝、**50 KP** を蹴って続行や！ 次勝ったら 250 KP、負けたら全部パー。`,
  `💥 <@${user}> スカーミッシュ2勝目ならず…保留してた **50 KP** は全部パーや。`,
 ]);
 assert.ok(posts.every(p=>p.allowed_mentions.parse.length===0),'mentions never ping');
});
test('a four-win run is announced once',async()=>{
 const f=await fixture();
 for(let n=1;n<=4;n++){await f.game('m'+n,n*1000);if(n<4)await f.choose('continue',n*1000+300);}
 await f.game('m4',4000);
 assert.deepEqual((f.sql.prepare("SELECT body FROM kp_posts WHERE id LIKE 'sk-post:match%'").all() as {body:string}[]).map(r=>JSON.parse(r.body).content),[`👑 <@${user}> スカーミッシュ4連勝！ **1,500 KP** 持っていきよった！`]);
});
