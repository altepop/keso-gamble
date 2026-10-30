import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {URL as NodeURL} from 'node:url';
import {readFileSync,readdirSync} from 'node:fs';
import {initializeKp,syncKpAccounts} from '../src/kp.ts';
import type {KpEnv,KpMapping} from '../src/kp.ts';
import {operateKp,readKpState,casinoPost} from '../src/kp-api.ts';
import {settleRankChange} from '../src/rank-change.ts';
import {DEBT_BLOCKED} from '../src/kp-debt.ts';
const guild='100000000000000100',one='100000000000000101',two='100000000000000102';
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:one},{riotId:'Two#JP1',discordUserId:two}]};
const MIN=60_000,T0=Date.parse('2026-10-28T12:10:00+09:00');
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


test('チンチロ：サーバーがサイコロを振り、勝ち負けが口座に反映される。再送しても1回だけ',async()=>{
 const f=await fixture();f.credit('c1',10000);
 const r=await operateKp(f.env,mapping,one,'chinchiro-operation-01','chinchiro',{amount:1000}) as {result:{net:number;amount:number}};
 assert.equal(r.result.amount,1000);assert.equal(f.balance(),10000+r.result.net);
 const again=await operateKp(f.env,mapping,one,'chinchiro-operation-01','chinchiro',{amount:1000}) as {result:{net:number}};
 assert.equal(again.result.net,r.result.net);assert.equal(f.balance(),10000+r.result.net);
 assert.equal((await readKpState(f.env,mapping,one)).chinchiro.length,1);
 await assert.rejects(operateKp(f.env,mapping,one,'chinchiro-operation-02','chinchiro',{amount:5000}),/5倍/);
});
test('ブラックジャック：配ると賭け金が引かれ、見えるのは自分の札とディーラーの1枚だけ。止めると精算',async()=>{
 const f=await fixture();f.credit('c1',10000);
 const start=await operateKp(f.env,mapping,one,'blackjack-operation-1','bj-start',{amount:1000}) as {result:{hand:{dealer:unknown[]}|null;done:{net:number}|null}};
 if(start.result.hand){
  assert.equal(f.balance(),9000);
  const seen=await readKpState(f.env,mapping,one);assert.equal(seen.blackjack.dealer.length,1);assert.equal(seen.blackjack.player.length,2);
  await assert.rejects(operateKp(f.env,mapping,one,'blackjack-operation-2','bj-start',{amount:1000}),/勝負中/);
  const end=await operateKp(f.env,mapping,one,'blackjack-operation-3','bj-stand',{}) as {result:{done:{net:number;payout:number}}};
  assert.equal(f.balance(),9000+end.result.done.payout);
 }else assert.equal(f.balance(),10000+start.result.done!.net,'a natural settles at once');
 assert.equal((await readKpState(f.env,mapping,one)).blackjack,null);
});
test('借KPがある間はカジノもルーレットも賭けられない（勝つ目でも抽選前に止める）。株を売るのはできる',async()=>{
 const f=await fixture();f.credit('c1',10000);
 await operateKp(f.env,mapping,one,'trade-before-the-debt','trade',{symbol:'keso',side:'buy',quantity:1,pricingVersion:1,limit:Number.MAX_SAFE_INTEGER});
 f.sql.prepare("INSERT INTO kp_debt_events VALUES('borrow:x',?,?,500,'borrow',0)").run(guild,one);
 for(let i=0;i<20;i++)await assert.rejects(operateKp(f.env,mapping,one,'spin-while-owing-'+String(i).padStart(3,'0'),'spin',{type:'red',amount:100,choice:0}),{message:DEBT_BLOCKED});
 assert.ok(await operateKp(f.env,mapping,one,'sell-while-owing-001','trade',{symbol:'keso',side:'sell',quantity:1,pricingVersion:1,limit:0}));
 await assert.rejects(operateKp(f.env,mapping,one,'chinchiro-operation-03','chinchiro',{amount:1000}),{message:DEBT_BLOCKED});
 await assert.rejects(operateKp(f.env,mapping,one,'blackjack-operation-4','bj-start',{amount:1000}),{message:DEBT_BLOCKED});
});
test('稼ぎchに流すのは大きな場面だけ',()=>{
 const roll=(kind:string)=>({hand:{kind}});
 assert.match(casinoPost(one,'chinchiro',{net:5000,oya:roll('me'),ko:roll('pinzoro')})!,/\*\*ピンゾロ\*\*！ 親から \+5,000 KP/);
 assert.match(casinoPost(one,'chinchiro',{net:-2500,oya:roll('pinzoro'),ko:null})!,/親のピンゾロを食らって −2,500 KP/);
 assert.equal(casinoPost(one,'chinchiro',{net:1000,oya:roll('me'),ko:roll('me')}),null);
 assert.match(casinoPost(one,'bj-start',{done:{result:'blackjack',net:1500}})!,/ブラックジャック！ \+1,500 KP/);
 assert.equal(casinoPost(one,'bj-hit',{done:null}),null);
 assert.match(casinoPost(one,'bj-stand',{done:{result:'lose',net:-8000}})!,/−8,000 KP 溶かした/);
});

test('マインズ：開始で賭け金を引き、開けたマスと結果だけを保存（地雷の位置は勝負中どこにも無い）。降りれば払戻し',async()=>{
 const f=await fixture();f.credit('m1',10000);
 await operateKp(f.env,mapping,one,'mines-start-operation-1','mines-start',{amount:1000,mines:3});assert.equal(f.balance(),9000);
 assert.doesNotMatch(String(f.sql.prepare('SELECT data FROM kp_state WHERE user=?').get(one)!.data),/bombs/);
 await assert.rejects(operateKp(f.env,mapping,one,'mines-start-operation-2','mines-start',{amount:1000,mines:3}),/勝負中/);
 const pick=await operateKp(f.env,mapping,one,'mines-pick-operation-01','mines-pick',{cell:12}) as {result:{done:{net:number}|null}};
 const done=pick.result.done??(await operateKp(f.env,mapping,one,'mines-cash-operation-1','mines-cashout',{}) as {result:{done:{net:number}}}).result.done;
 assert.equal(f.balance(),10000+done.net);assert.ok(done.net===-1000||done.net===Math.floor(1000*1.1)-1000);
 assert.equal((await readKpState(f.env,mapping,one)).mines,null);
});
test('スロット：💎💎💎で共有ジャックポット。同時に当たっても同じプールを二重に払わない',async t=>{
 const f=await fixture();f.credit('s1',50000);f.credit('s2',50000,two);
 const before=(await readKpState(f.env,mapping,one)).jackpot;assert.equal(before.amount,10000);
 t.mock.method((globalThis as unknown as {crypto:Crypto}).crypto,'getRandomValues',((a:Uint32Array)=>{a.fill(20);return a;}) as never); // 20 of 21: 💎 on every reel
 const [a,b]=await Promise.all([operateKp(f.env,mapping,one,'slot-operation-one-01','slot',{amount:1000}),operateKp(f.env,mapping,two,'slot-operation-two-01','slot',{amount:1000})]) as {result:{done:{jackpot:number;payout:number}}}[];
 t.mock.restoreAll();
 const won=[a.result.done.jackpot,b.result.done.jackpot].sort((x,y)=>x-y);
 assert.equal(won[0],10000,'the first winner takes the pool');assert.equal(won[1],10030,'the second wins the pool refilled after the first');
 const pool=f.sql.prepare('SELECT amount,version FROM casino_jackpots').get()!;assert.equal(pool.version,2);assert.equal(pool.amount,10030);
 assert.equal(f.balance()+f.balance(two),100000-2000+2*300000+won[0]+won[1]);
 assert.match(casinoPost(one,'slot',a.result)!,/ジャックポット/);
 // An ordinary spin adds its 3% to the pool.
 await operateKp(f.env,mapping,one,'slot-operation-one-02','slot',{amount:1000});
 assert.equal(f.sql.prepare('SELECT amount FROM casino_jackpots').get()!.amount,10060);
});
test('ビデオポーカー・バカラ：サーバーが配り、交換は借KP中でもできる（新しい勝負はできない）',async()=>{
 const f=await fixture();f.credit('v1',10000);
 const dealt=await operateKp(f.env,mapping,one,'vp-deal-operation-001','vp-deal',{amount:500}) as {result:{hand:{cards:unknown[]}}};
 assert.equal(dealt.result.hand.cards.length,5);assert.equal(f.balance(),9500);
 f.sql.prepare("INSERT INTO kp_debt_events VALUES('borrow:fixture',?,?,500,'borrow',0)").run(guild,one);
 const drawn=await operateKp(f.env,mapping,one,'vp-draw-operation-001','vp-draw',{hold:[true,false,true,false,true]}) as {result:{done:{net:number;cards:unknown[]}}};
 assert.equal(drawn.result.done.cards.length,5);
 await assert.rejects(operateKp(f.env,mapping,one,'baccarat-operation-01','baccarat',{amount:500,side:'banker'}),new RegExp(DEBT_BLOCKED.slice(0,6)));
 f.sql.exec('DELETE FROM kp_debt_events');f.sql.exec('DELETE FROM kp_debts');
 const before=f.balance();
 const bac=await operateKp(f.env,mapping,one,'baccarat-operation-02','baccarat',{amount:500,side:'player'}) as {result:{done:{net:number;winner:string}}};
 assert.equal(f.balance(),before+bac.result.done.net);assert.ok(['player','banker','tie'].includes(bac.result.done.winner));
});
