import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {URL as NodeURL} from 'node:url';
import {readFileSync,readdirSync} from 'node:fs';
import {initializeKp,syncKpAccounts} from '../src/kp.ts';
import type {KpMapping} from '../src/kp.ts';
import {operateKp,readKpState} from '../src/kp-api.ts';
import {ML_DATA,parseOfficialResults,parseOfficialCards,storeCards,mlData,refreshMlCards,matchFixture,pollMlResults,settleMl,queueMlPosts,mlResults} from '../src/mleague.ts';
import type {PostEnv} from '../src/racing-posts.ts';
import {runKpCommand,mlDay} from '../src/kp-slash.ts';
// @ts-expect-error Shared browser engine.
import {mlCard} from '../../../js/mleague.js';
const guild='100000000000000100',one='100000000000000101',two='100000000000000102';
const mapping:KpMapping={guildId:guild,accounts:[{riotId:'One#JP1',discordUserId:one},{riotId:'Two#JP1',discordUserId:two}]};
const jst=(t:string)=>Date.parse(t+'+09:00');
const game1=ML_DATA.fixtures.find(f=>f.date==='2026-10-27'&&f.table===1&&f.game===1)!;
const game2=ML_DATA.fixtures.find(f=>f.date==='2026-10-27'&&f.table===1&&f.game===2)!;
const card=mlCard(ML_DATA,game1) as Array<{no:number;name:string;team:string}>;
// One player from each team, in the finishing order used below.
const order=game1.teams.map(t=>card.find(p=>p.team===t)!.name);
const official=(id:string)=>ML_DATA.teams.find(t=>t.id===id)!.official;
/** The official monthly calendar: one list item per table, team names in the logo alt text. */
function calendar(date:string,tables:string[][]){
 const [,m,d]=date.split('-').map(Number);
 return tables.map(teams=>`<li class="p-gamesSchedule2__list"><a href="https://abema.tv/now-on-air/mahjong"><p class="p-gamesSchedule2__data">${m}<span class="p-gamesSchedule2__slash">/</span>${d}<span class="p-gamesSchedule2__dayWeek">（火）</span></p><ul class="p-gamesSchedule2__logos">${teams.map(t=>`<li><img src="x.png" alt="${official(t)}"></li>`).join('')}</ul></a></li>`).join('');
}
const tables=ML_DATA.fixtures.filter(f=>f.date==='2026-10-27'&&f.game===1).sort((a,b)=>a.table-b.table).map(f=>f.teams);
/** The official page's structure (class names as on m-league.jp), with only what the parser reads. */
function officialPage(date:string,games:Array<{game:number;names:string[];points:number[]}>){
 const column=(g:{game:number;names:string[];points:number[]})=>`<div class="p-gamesResult__column"><div class="p-gamesResult__number">第${g.game}回戦</div><ol class="p-gamesResult__rank-list">`+
  g.names.map((n,i)=>`<li><div class="p-gamesResult__rank-item"><div class="p-gamesResult__rank-badge is-${i+1}">${i+1}</div><div class="p-gamesResult__name-wrap"><div class="p-gamesResult__name">${n}</div><div class="p-gamesResult__point">\n\t\t${g.points[i]<0?'▲':''}${Math.abs(g.points[i])}pt\n</div></div></div></li>`).join('')+'</ol></div>';
 return calendar(date,tables)+`<div class="c-modal2" id="js-modal-key年0000-試合番号" hidden><div class="p-gamesResult__number">第1回戦</div></div><div class="c-modal2" id="js-modal-key${date.replaceAll('-','')}-47" hidden><div class="p-gamesResult">${games.map(column).join('')}</div></div>`;
}
async function fixture(){
 const sql=new DatabaseSync(':memory:');
 for(const file of readdirSync(new NodeURL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new NodeURL('../migrations/'+file,import.meta.url),'utf8'));
 class Query{text:string;values:unknown[];constructor(text:string,values:unknown[]=[]){this.text=text;this.values=values;}bind(...values:unknown[]){return new Query(this.text,values);}first(){return sql.prepare(this.text).get(...this.values as never[])??null;}all(){return {results:sql.prepare(this.text).all(...this.values as never[])};}run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.values as never[]).changes)}};}}
 const env:PostEnv={KP_BOOTSTRAP_PRIVATE_KEY:'fixture-key',KP_EARNINGS_WEBHOOK_URL:'https://discord.com/api/webhooks/1/token',DB:{prepare:(text:string)=>new Query(text),batch:(queries:Query[])=>{sql.exec('BEGIN');try{const rows=queries.map(q=>q.run());sql.exec('COMMIT');return rows;}catch(error){sql.exec('ROLLBACK');throw error;}}}as unknown as D1Database};
 sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('One#JP1','p-one','ap',0);sql.prepare('INSERT INTO tracked_players VALUES(?,?,?,?)').run('Two#JP1','p-two','ap',0);
 await initializeKp(env,mapping);await syncKpAccounts(env,mapping);
 sql.prepare("INSERT INTO kp_ledger VALUES('test-credit',?,?,100000,'test',0)").run(guild,one);
 sql.prepare("INSERT INTO kp_ledger VALUES('test-credit-2',?,?,100000,'test',0)").run(guild,two);
 const balance=(user:string)=>Number(sql.prepare('SELECT balance FROM kp_wallets WHERE user=?').get(user)!.balance);
 const posts=()=>(sql.prepare("SELECT body FROM kp_posts WHERE id LIKE 'ml-%' ORDER BY at,id").all() as Array<{body:string}>).map(r=>JSON.parse(r.body).content as string);
 return {env,sql,balance,posts};
}
let n=0;const op=()=>`ml-operation-${String(++n).padStart(6,'0')}`;
const page=officialPage('2026-10-27',[{game:1,names:order,points:[60.2,10.1,-20.3,-50]}]);

test('the official page is read per game in rank order; the template and broken blocks are skipped', () => {
 const parsed=parseOfficialResults(page);
 assert.deepEqual(parsed,[{date:'2026-10-27',game:1,names:order,points:[60.2,10.1,-20.3,-50]}]);
 assert.equal(matchFixture(parsed[0])?.id,game1.id);
 assert.equal(matchFixture({...parsed[0],names:[...order.slice(0,3),'知らない人']}),null,'every name must be on the roster');
 assert.equal(matchFixture({...parsed[0],game:2}),game2.teams.every(t=>game1.teams.includes(t))?game2:null);
 assert.deepEqual(parseOfficialResults(page.replace('is-3','is-4')),[],'rank badges must read 1-4');
});

test('the official calendar replaces a mistaken matchup; until it is read, nothing is open', async t => {
 const f=await fixture();
 const swapped=[tables[1],tables[0]];
 assert.deepEqual(parseOfficialCards(calendar('2026-10-27',swapped),2026).map(c=>[c.table,c.teams]),[[1,tables[1]],[2,tables[0]]]);
 assert.deepEqual(parseOfficialCards(calendar('2026-10-27',[['earth-jets','konami','abemas','abemas']]),2026),[],'four distinct known teams');
 assert.equal((await mlData(f.env)).fixtures.find(x=>x.id===game1.id)!.confirmed,false);
 t.mock.timers.enable({apis:['Date'],now:jst('2026-10-27T18:00:00')});
 await assert.rejects(operateKp(f.env,mapping,one,op(),'ml-bet',{match:game1.id,player:1,type:'top',amount:100}),/公式の対戦カードを確認中/);
 const urls:string[]=[];
 const request=(async(url:string)=>{urls.push(url);return new Response(calendar('2026-10-27',swapped)+calendar('2026-10-28',[]));}) as unknown as typeof fetch;
 assert.equal(await refreshMlCards(f.env,Date.now(),request),1,'today needs the card; 10/28 has no games');assert.deepEqual(urls,['https://m-league.jp/games/?mlm=10&mly=2026']);
 await refreshMlCards(f.env,Date.now()+60000,request);assert.equal(urls.length,1,'at most every 30 minutes');
 const d=await mlData(f.env);
 assert.deepEqual(d.fixtures.find(x=>x.id===game1.id)!.teams,tables[1],'the official teams win');
 assert.equal(d.fixtures.find(x=>x.id===game1.id)!.confirmed,true);
});

test('results are fetched only while a started game lacks one, at most every minute', async t => {
 const f=await fixture(),urls:string[]=[];
 const request=(async(url:string)=>{urls.push(String(url));return new Response(page);}) as unknown as typeof fetch;
 assert.equal(await pollMlResults(f.env,jst('2026-10-27T18:00:00'),request),0);assert.equal(urls.length,0,'before the start nothing is fetched');
 assert.equal(await pollMlResults(f.env,jst('2026-10-27T21:10:00'),request),1);
 assert.deepEqual(urls,['https://m-league.jp/games/?mlm=10&mly=2026']);
 assert.equal(await pollMlResults(f.env,jst('2026-10-27T21:10:30'),request),0);assert.equal(urls.length,1,'one-minute gap');
 await pollMlResults(f.env,jst('2026-10-27T21:11:00'),request);assert.equal(urls.length,2,'game 2 is still awaited');
 assert.deepEqual((await mlResults(f.env)).get(game1.id)?.names,order);
 t.mock.method(console,'warn',()=>{});
 await pollMlResults(f.env,jst('2026-10-27T21:20:00'),(async()=>new Response('',{status:503})) as unknown as typeof fetch);
});

test('a prediction is bought through the wallet, settled from the official order and posted', async t => {
 t.mock.timers.enable({apis:['Date'],now:jst('2026-10-27T18:30:00')});
 const f=await fixture();await storeCards(f.env,parseOfficialCards(page,2026),Date.now());
 const top=await operateKp(f.env,mapping,one,op(),'ml-bet',{match:game1.id,player:card.find(p=>p.name===order[0])!.no,type:'top',amount:1000}) as {result:{bet:{odds:number}}};
 await operateKp(f.env,mapping,two,op(),'ml-bet',{match:game1.id,player:card.find(p=>p.name===order[0])!.no,type:'last',amount:500});
 const benched=card.find(p=>!order.includes(p.name))!;
 await operateKp(f.env,mapping,two,op(),'ml-bet',{match:game1.id,player:benched.no,type:'top',amount:300});
 assert.equal(f.balance(one),99000);assert.equal(f.balance(two),99200);
 assert.equal((await readKpState(f.env,mapping,one)).raceWeek.spent,1000,'shares the weekly limit with racing');
 await queueMlPosts(f.env,mapping,jst('2026-10-27T18:30:00'));
 assert.match(f.posts()[0],/Mリーグ予想.*10\/27 19:00開始/);assert.match(f.posts()[0],/1卓/);assert.match(f.posts()[0],/2卓/);
 t.mock.timers.setTime(jst('2026-10-27T19:00:00'));
 await assert.rejects(operateKp(f.env,mapping,one,op(),'ml-bet',{match:game1.id,player:1,type:'top',amount:100}),/締め切りました/);
 await operateKp(f.env,mapping,one,op(),'ml-bet',{match:game2.id,player:1,type:'top',amount:100});
 t.mock.timers.setTime(jst('2026-10-27T21:10:00'));
 await pollMlResults(f.env,Date.now(),(async()=>new Response(page)) as unknown as typeof fetch);
 await assert.rejects(operateKp(f.env,mapping,one,op(),'ml-bet',{match:game2.id,player:1,type:'top',amount:100}),/締め切りました/,'game 1 has a result');
 assert.equal(await settleMl(f.env,mapping),3);assert.equal(await settleMl(f.env,mapping),0);
 assert.equal(f.balance(one),99000-100+Math.floor(1000*top.result.bet.odds/10));
 assert.equal(f.balance(two),99200+300,'the benched player is refunded; the wrong last loses');
 await queueMlPosts(f.env,mapping,Date.now());
 const result=f.posts().find(p=>p.includes('第1試合 結果'))!;
 assert.match(result,new RegExp(`1着 ${order[0]} 60.2pt`));assert.match(result,/4着 .* ▲50pt/);
 assert.match(result,new RegExp(`💰 <@${one}> ${order[0]}のトップ的中`));
 assert.match(result,new RegExp(`↩️ <@${two}> ${benched.name}のトップは不出場で返金`));
 assert.match(result,new RegExp(`💸 <@${two}> ${order[0]}のラスは外れ`));
});

test('/mleague lists numbered players with odds; /mbet buys by table-game code and player number', async t => {
 t.mock.timers.enable({apis:['Date'],now:jst('2026-10-27T18:00:00')});
 const f=await fixture();
 const before=await runKpCommand(f.env,{id:String((BigInt(Date.now())-1420070400000n)<<22n|9n),guild_id:guild,member:{user:{id:one}},data:{name:'mleague'}},mapping);
 assert.match(before,/公式の対戦カードを確認中/);
 await storeCards(f.env,parseOfficialCards(page,2026),Date.now());
 assert.equal(mlDay(jst('2026-10-27T18:00:00')),'2026-10-27');assert.equal(mlDay(jst('2026-10-28T00:00:00')),ML_DATA.fixtures.map(x=>x.date).sort().find(d=>d>'2026-10-27'));
 const snowflake=String((BigInt(Date.now())-1420070400000n)<<22n|1n);
 const view=await runKpCommand(f.env,{id:snowflake,guild_id:guild,member:{user:{id:one}},data:{name:'mleague'}},mapping);
 assert.match(view,/1卓.*第1試合 受付中/);assert.match(view,new RegExp(`1\\. ${card[0].name}（.+）トップ \\d+\\.\\d倍／ラス \\d+\\.\\d倍`));
 assert.ok(view.length<2000,'fits one Discord message');
 const reply=await runKpCommand(f.env,{id:snowflake,guild_id:guild,member:{user:{id:one}},data:{name:'mbet',options:[{name:'match',value:'1-1'},{name:'player',value:3},{name:'type',value:'last'},{name:'amount',value:200}]}},mapping);
 assert.match(reply,new RegExp(`1卓 第1試合・${card[2].name}のラス`));assert.equal(f.balance(one),99800);
 assert.match(await runKpCommand(f.env,{id:String(BigInt(snowflake)+1n),guild_id:guild,member:{user:{id:one}},data:{name:'mbet',options:[{name:'match',value:'3-1'},{name:'player',value:3},{name:'type',value:'last'},{name:'amount',value:200}]}},mapping),/その試合はありません/);
});

test('/mclose: a member reports the start; betting stops and later bets are refunded at settlement', async t => {
 t.mock.timers.enable({apis:['Date'],now:jst('2026-10-27T21:30:00')});
 const f=await fixture();await storeCards(f.env,parseOfficialCards(page,2026),Date.now());
 const at=(time:string,n:number)=>String((BigInt(jst('2026-10-27T'+time))-1420070400000n)<<22n|BigInt(n));
 const close=(user:string,time:string,n:number,options:Array<{name:string;value:string}>=[])=>runKpCommand(f.env,{id:at(time,n),guild_id:guild,member:{user:{id:user}},data:{name:'mclose',options:[{name:'match',value:'1-2'},...options]}},mapping);
 await operateKp(f.env,mapping,one,op(),'ml-bet',{match:game2.id,player:card.find(p=>p.name===order[0])!.no,type:'top',amount:1000});
 t.mock.timers.setTime(jst('2026-10-27T21:45:00'));
 await operateKp(f.env,mapping,two,op(),'ml-bet',{match:game2.id,player:card.find(p=>p.name===order[0])!.no,type:'top',amount:500});
 assert.match(await close('100000000000000199','21:50:00',1),/登録メンバーだけ/);
 assert.match(await close(one,'21:50:00',2,[{name:'at',value:'25:00'}]),/21:42 の形/);
 assert.match(await close(one,'21:50:00',3,[{name:'at',value:'21:55'}]),/今までの時刻/);
 assert.match(await close(one,'21:50:00',4,[{name:'at',value:'21:42'}]),/21:42 開始として締め切りました/);
 assert.match(await close(two,'21:51:00',5,[{name:'at',value:'21:48'}]),/21:42 開始/,'the earliest stated start is kept');
 t.mock.timers.setTime(jst('2026-10-27T21:52:00'));
 await assert.rejects(operateKp(f.env,mapping,one,op(),'ml-bet',{match:game2.id,player:1,type:'top',amount:100}),/開始を報告/);
 const view=await runKpCommand(f.env,{id:at('21:52:00',6),guild_id:guild,member:{user:{id:one}},data:{name:'mleague'}},mapping);
 assert.match(view,/第2試合 締切（開始報告）/);
 const game2Page=officialPage('2026-10-27',[{game:2,names:order,points:[60.2,10.1,-20.3,-50]}]);
 t.mock.timers.setTime(jst('2026-10-27T23:40:00'));
 await pollMlResults(f.env,Date.now(),(async()=>new Response(game2Page)) as unknown as typeof fetch);
 await settleMl(f.env,mapping);
 assert.ok(f.balance(one)>99000,'bought before the start: settled normally');
 assert.equal(f.balance(two),100000,'bought after the reported start: refunded');
 assert.ok(f.posts().some(p=>/⏰ <@100000000000000101> が 1卓 第2試合の開始（21:42）を報告/.test(p)));
});
