import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {URL as NodeURL} from 'node:url';
import {readFileSync,readdirSync} from 'node:fs';
import {initializeKp,syncKpAccounts} from '../src/kp.ts';
import type {KpEnv,KpMapping} from '../src/kp.ts';
import {operateKp,readKpState} from '../src/kp-api.ts';
import {runKpCommand} from '../src/kp-slash.ts';
import {settleRankChange} from '../src/rank-change.ts';
import {ensureMahjongClaims} from '../src/mahjong-claims.ts';
import {DEBT_BLOCKED,debtOf,settleDebts,queueDebtPosts} from '../src/kp-debt.ts';
import {ensurePosts} from '../src/racing-posts.ts';
const guild='100000000000000100',one='100000000000000101',two='100000000000000102';
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:one},{riotId:'Two#JP1',discordUserId:two}]};
const MIN=60_000,DAY=1440*MIN,T0=Date.parse('2026-10-28T12:10:00+09:00');
async function fixture(){
 const sql=new DatabaseSync(':memory:');
 for(const file of readdirSync(new NodeURL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new NodeURL('../migrations/'+file,import.meta.url),'utf8'));
 class Query{text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...values:unknown[]){return new Query(this.text,values);}first(){return sql.prepare(this.text).get(...this.values as never[])??null;}all(){return {results:sql.prepare(this.text).all(...this.values as never[])};}run(){const r=sql.prepare(this.text).run(...this.values as never[]);return {meta:{changes:Number(r.changes)}};}}
 const env:KpEnv={KP_BOOTSTRAP_PRIVATE_KEY:'fixture-key',DB:{prepare:(text:string)=>new Query(text),batch:(queries:Query[])=>{sql.exec('BEGIN');try{const rows=queries.map(q=>q.run());sql.exec('COMMIT');return rows;}catch(error){sql.exec('ROLLBACK');throw error;}}}as unknown as D1Database};
 sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('One#JP1','p-one','ap',0);sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('Two#JP1','p-two','ap',0);
 await initializeKp(env,mapping);await syncKpAccounts(env,mapping);
 const balance=(user=one)=>Number(sql.prepare('SELECT balance FROM kp_wallets WHERE guild=? AND user=?').get(guild,user)?.balance);
 const credit=(id:string,amount:number,user=one)=>sql.prepare("INSERT INTO kp_ledger VALUES(?,?,?,?,'test',0)").run(id,guild,user,amount);
 return {env,sql,balance,credit};
}

test('a minus the wallet cannot cover becomes 借KP, once per match; the wallet stops at 0',async()=>{
 const f=await fixture();f.credit('c1',100);
 const change={before:12,after:11};
 await settleRankChange(f.env,mapping,one,change,'m1','p-one',T0);
 await settleRankChange(f.env,mapping,one,change,'m1','p-one',T0);
 assert.equal(f.balance(),0);assert.equal(await debtOf(f.env,guild,one),400,'500 asked, 100 taken, 400 owed; a retry does not owe twice');
 await settleRankChange(f.env,mapping,two,{before:11,after:12},'m1','p-two',T0);
 assert.equal(await debtOf(f.env,guild,two),0,'a promotion owes nothing');
});
test('借KP grows 1% a day (rounded up) from the first full day, once per day, and is repaid from KP that comes in',async()=>{
 const f=await fixture();
 await settleRankChange(f.env,mapping,one,{before:12,after:11},'m1','p-one',T0);
 assert.equal(await debtOf(f.env,guild,one),500);
 await settleDebts(f.env,guild,T0+23*60*MIN);assert.equal(await debtOf(f.env,guild,one),500,'no interest within the first day');
 await settleDebts(f.env,guild,T0+DAY);await settleDebts(f.env,guild,T0+DAY+MIN);
 assert.equal(await debtOf(f.env,guild,one),505,'one charge per day');
 await settleDebts(f.env,guild,T0+2*DAY);assert.equal(await debtOf(f.env,guild,one),511,'compounds and rounds up: 505 × 1% = 5.05 → 6');
 f.credit('c1',200);await settleDebts(f.env,guild,T0+2*DAY+MIN);
 assert.equal(f.balance(),0);assert.equal(await debtOf(f.env,guild,one),311,'all of the 200 goes to the debt');
 f.credit('c2',1000);await settleDebts(f.env,guild,T0+2*DAY+2*MIN);
 assert.equal(f.balance(),689);assert.equal(await debtOf(f.env,guild,one),0);
 await settleDebts(f.env,guild,T0+5*DAY);assert.equal(await debtOf(f.env,guild,one),0,'no interest once repaid');
 const kinds=f.sql.prepare("SELECT kind,SUM(amount) AS n FROM kp_debt_events WHERE user=? GROUP BY kind ORDER BY kind").all(one).map(r=>[r.kind,Number(r.n)]);
 assert.deepEqual(kinds,[['borrow',500],['interest',11],['repay',-511]]);
 assert.equal(Number(f.sql.prepare("SELECT SUM(delta) AS n FROM kp_ledger WHERE user=? AND kind='debt'").get(one)?.n),-511);
 await ensurePosts(f.env);await queueDebtPosts(f.env,guild,T0+2*DAY+3*MIN);await queueDebtPosts(f.env,guild,T0+2*DAY+4*MIN);
 const posts=f.sql.prepare("SELECT id,body FROM kp_posts WHERE id LIKE 'debt-%'").all() as Array<{id:string;body:string}>;
 assert.equal(posts.length,1,'paying it all back is posted once; 500 never reached the cap');
 assert.match(posts[0].id,/^debt-clear:repay:debt-repay:/);
 assert.deepEqual(JSON.parse(posts[0].body),{content:`🎉 <@${one}> が借KPを完済！やっと自由の身や。\nまた株も馬券もカジノも使えるで。`,allowed_mentions:{parse:[]}});
});
test('while 借KP is owed nothing can be bought; selling still works and the money repays the debt',async()=>{
 const f=await fixture();f.credit('c1',5000);
 await operateKp(f.env,mapping,one,'trade-before-the-debt','trade',{symbol:'keso',side:'buy',quantity:2});
 const cash=f.balance();f.credit('drain',-cash);
 await settleRankChange(f.env,mapping,one,{before:12,after:11},'m1','p-one',T0);
 assert.equal(await debtOf(f.env,guild,one),500);
 f.credit('c2',3000);
 await assert.rejects(operateKp(f.env,mapping,one,'trade-while-owing-001','trade',{symbol:'keso',side:'buy',quantity:1}),{message:DEBT_BLOCKED});
 assert.throws(()=>f.sql.prepare("INSERT INTO kp_operations(id,guild,user,request_hash,response,delta,state,at) VALUES('x',?,?,'h','{}',-1,'{}',0)").run(guild,one),/借KP/,'the database refuses it too');
 const sold=await operateKp(f.env,mapping,one,'sell-while-owing-001','trade',{symbol:'keso',side:'sell',quantity:2}) as {result:unknown};
 assert.ok(sold.result);
 await settleDebts(f.env,guild,T0+60_000);
 assert.equal(await debtOf(f.env,guild,one),0);
 assert.equal((await readKpState(f.env,mapping,one)).debt.amount,0);
});
test('while 借KP is owed a roulette bet is refused before the draw, so a winning spin cannot slip through',async()=>{
 const f=await fixture();f.credit('c1',10000);
 await settleRankChange(f.env,mapping,two,{before:12,after:11},'m1','p-two',T0);
 f.credit('c2',10000,two);
 for(let i=0;i<30;i++)await assert.rejects(operateKp(f.env,mapping,two,'spin-while-owing-'+String(i).padStart(3,'0'),'spin',{type:'red',amount:100,choice:0}),{message:DEBT_BLOCKED});
 assert.equal(f.balance(two),10000,'not a single spin went through');
 assert.ok(await operateKp(f.env,mapping,one,'spin-without-debt-001','spin',{type:'red',amount:100,choice:0}),'no debt, no block');
});
test('/kp shows 借KP and the repayment row',async()=>{
 const f=await fixture();
 await settleRankChange(f.env,mapping,one,{before:12,after:11},'m1','p-one',T0);
 const kp=()=>runKpCommand(f.env,{id:String((BigInt(T0)-1420070400000n)<<22n),guild_id:guild,member:{user:{id:one}},data:{name:'kp',options:[]}},mapping);
 assert.match(await kp(),/💸 借KP：\*\*500 KP\*\*（1日ごとに利子1%、上限1,000 KP/);
 f.credit('c1',800);await settleDebts(f.env,guild,T0+60_000);
 const after=await kp();assert.doesNotMatch(after,/💸 借KP/);assert.match(after,/借KP返済 -500 KP/);
});
test('Mahjong Soul: last place the wallet cannot cover becomes 借KP; other ranks owe nothing',async()=>{
 const f=await fixture();await ensureMahjongClaims(f.env);f.credit('c1',300);
 const claim=(id:string,rank:number,amount:number)=>{
  f.sql.prepare("INSERT INTO kp_mahjong_claims(id,guild,user,paipu,link,game,rank,amount,day,at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(id,guild,one,'p-'+id,'l','4p-jade-south',rank,amount,'2026-10-28',T0);
  f.sql.prepare("UPDATE kp_mahjong_claims SET status='approved',decided_at=? WHERE id=?").run(T0,id);
 };
 claim('a',4,1000);
 assert.equal(f.balance(),0);assert.equal(await debtOf(f.env,guild,one),700);
 claim('b',2,0);claim('c',1,500);
 assert.equal(await debtOf(f.env,guild,one),700);assert.equal(f.balance(),500);
});
test('借KP stops at 1,000: a loss, interest and other borrowing only add what fits, repayment still works, older debts come down to it',async()=>{
 const {borrowShortfall,borrowedBy,ensureDebt,DEBT_MAX}=await import('../src/kp-debt.ts');
 assert.equal(DEBT_MAX,1000);
 const f=await fixture();
 const owe=(id:string,amount:number)=>{f.sql.prepare("INSERT OR IGNORE INTO kp_ledger VALUES(?,?,?,0,'match',?)").run(id,guild,one,T0);return borrowShortfall(f.env,id,amount).run();};
 await owe('loss-1',800);assert.equal(await debtOf(f.env,guild,one),800);
 await owe('loss-2',700);assert.equal(await debtOf(f.env,guild,one),1000,'only 200 of 700 fits');
 assert.equal(await borrowedBy(f.env,'loss-2'),200,'the post says what was really borrowed');
 await owe('loss-3',500);assert.equal(await debtOf(f.env,guild,one),1000);assert.equal(await borrowedBy(f.env,'loss-3'),0,'nothing fits: no event, no note');
 await owe('loss-3',500);assert.equal(await debtOf(f.env,guild,one),1000,'a retry at the cap stays at the cap');
 await settleDebts(f.env,guild,T0+DAY);assert.equal(await debtOf(f.env,guild,one),1000,'interest stops at the cap too');
 // Repayment is not capped. The period's interest, which found no room at the cap, is charged once there is room (1% of 700).
 f.credit('in-1',300);await settleDebts(f.env,guild,T0+DAY+MIN);assert.equal(await debtOf(f.env,guild,one),707);
 await settleDebts(f.env,guild,T0+DAY+2*MIN);assert.equal(await debtOf(f.env,guild,one),707,'once per period');
 const sum=Number(f.sql.prepare('SELECT SUM(amount) n FROM kp_debt_events WHERE user=?').get(one)!.n);assert.equal(sum,707,'the events add up to the debt');
 // 稼ぎch: the cap is announced once (loss-2 reached it; the retries and the interest at the cap add nothing), and
 // reaching it again after some repayment is a new post. Nothing is posted until it is all paid back.
 await ensurePosts(f.env);
 const full=()=>(f.sql.prepare("SELECT id,body FROM kp_posts WHERE id LIKE 'debt-full:%' ORDER BY id").all() as Array<{id:string;body:string}>);
 assert.deepEqual(full(),[],'nothing is posted until the cron queues it');
 await queueDebtPosts(f.env,guild,T0+DAY+3*MIN);
 assert.deepEqual(full(),[],'a notice older than a day is not posted late');
 await queueDebtPosts(f.env,guild,T0+MIN);
 assert.deepEqual(full().map(p=>p.id),['debt-full:borrow:loss-2']);
 assert.equal(JSON.parse(full()[0].body).content,`💸 <@${one}> の借KPが上限の1,000 KPに到達！もう満タンや。\n入ったKPから自動で返すまで、株も馬券もカジノも使えへんで。`);
 await owe('loss-4',400);await queueDebtPosts(f.env,guild,T0+MIN);assert.deepEqual(full().map(p=>p.id),['debt-full:borrow:loss-2','debt-full:borrow:loss-4']);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM kp_posts WHERE id LIKE 'debt-clear:%'").get()!.n,0);
 // A debt from before the cap comes down to it when the Worker starts.
 f.sql.prepare('UPDATE kp_debts SET amount=5000 WHERE user=?').run(one);
 await ensureDebt({...f.env,DB:{prepare:f.env.DB.prepare,batch:f.env.DB.batch}} as KpEnv);
 assert.equal(await debtOf(f.env,guild,one),1000);
});
