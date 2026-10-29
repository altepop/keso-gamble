import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {URL as NodeURL} from 'node:url';
import {readFileSync,readdirSync} from 'node:fs';
import {initializeKp,syncKpAccounts} from '../src/kp.ts';
import type {KpMapping} from '../src/kp.ts';
import {operateKp,readKpState} from '../src/kp-api.ts';
import {ML_DATA,KINMA_FEED,parseKinmaLineups,pollMlLineups,mlLineups,parseOfficialResults,parseOfficialCards,storeCards,mlData,refreshMlCards,matchFixture,pollMlResults,settleMl,queueMlPosts,mlResults} from '../src/mleague.ts';
import type {PostEnv} from '../src/racing-posts.ts';
import {runKpCommand,mlDay,mbetChoices,mbetDecide} from '../src/kp-slash.ts';
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
 await assert.rejects(operateKp(f.env,mapping,one,op(),'ml-bet',{match:game1.id,player:1,type:'last',amount:100}),/公式の対戦カードを確認中/);
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
 const won=await operateKp(f.env,mapping,one,op(),'ml-bet',{match:game1.id,player:card.find(p=>p.name===order[3])!.no,type:'last',amount:1000}) as {result:{bet:{odds:number}}};
 await operateKp(f.env,mapping,two,op(),'ml-bet',{match:game1.id,player:card.find(p=>p.name===order[0])!.no,type:'last',amount:500});
 const benched=card.find(p=>!order.includes(p.name))!;
 await operateKp(f.env,mapping,two,op(),'ml-bet',{match:game1.id,player:benched.no,type:'last',amount:300});
 await assert.rejects(operateKp(f.env,mapping,two,op(),'ml-bet',{match:game1.id,player:1,type:'top',amount:300}),/ラスだけ/);
 assert.equal(f.balance(one),99000);assert.equal(f.balance(two),99200);
 assert.equal((await readKpState(f.env,mapping,one)).raceWeek.spent,1000,'shares the weekly limit with racing');
 await queueMlPosts(f.env,mapping,jst('2026-10-27T18:30:00'));
 assert.match(f.posts()[0],/Mリーグ予想.*10\/27 19:00開始（誰がラスになるか当ててみい！）/);assert.doesNotMatch(f.posts()[0],/トップ本命/);assert.match(f.posts()[0],/1卓/);assert.match(f.posts()[0],/2卓/);
 t.mock.timers.setTime(jst('2026-10-27T19:00:00'));
 await assert.rejects(operateKp(f.env,mapping,one,op(),'ml-bet',{match:game1.id,player:1,type:'last',amount:100}),/締め切ったで/);
 await operateKp(f.env,mapping,one,op(),'ml-bet',{match:game2.id,player:1,type:'last',amount:100});
 t.mock.timers.setTime(jst('2026-10-27T21:10:00'));
 await pollMlResults(f.env,Date.now(),(async()=>new Response(page)) as unknown as typeof fetch);
 await assert.rejects(operateKp(f.env,mapping,one,op(),'ml-bet',{match:game2.id,player:1,type:'last',amount:100}),/締め切ったで/,'game 1 has a result');
 assert.equal(await settleMl(f.env,mapping),3);assert.equal(await settleMl(f.env,mapping),0);
 assert.equal(f.balance(one),99000-100+Math.floor(1000*won.result.bet.odds/10));
 assert.equal(f.balance(two),99200+300,'the benched player is refunded; the wrong last loses');
 await queueMlPosts(f.env,mapping,Date.now());
 const result=f.posts().find(p=>p.includes('第1試合 結果'))!;
 assert.match(result,new RegExp(`1着 ${order[0]} 60.2pt`));assert.match(result,/4着 .* ▲50pt/);
 assert.match(result,new RegExp(`💰 <@${one}> ${order[3]}のラス的中`));
 assert.match(result,new RegExp(`↩️ <@${two}> ${benched.name}のラスは出場せえへんかったから返金や`));
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
 assert.match(view,/1卓.*第1試合 受付中/);assert.match(view,new RegExp(`1\\. ${card[0].name}（.+）ラス \\d+\\.\\d倍$`,'m'));
 assert.ok(view.length<2000,'fits one Discord message');
 const reply=await runKpCommand(f.env,{id:snowflake,guild_id:guild,member:{user:{id:one}},data:{name:'mbet',options:[{name:'match',value:'1-1'},{name:'player',value:3},{name:'amount',value:200}]}},mapping);
 assert.match(reply,new RegExp(`1卓 第1試合・\\*\\*${card[2].name}\\*\\*のラス`));assert.match(reply,/まだ購入してへんで/);assert.equal(f.balance(one),100000,'the preview buys nothing');
 const bought=await mbetDecide(f.env,{id:String(BigInt(snowflake)+5n),guild_id:guild,member:{user:{id:one}},data:{custom_id:`mbet:buy:${snowflake}`}},mapping);
 assert.match(bought!.content,/ラス予想を購入したで/);assert.equal(f.balance(one),99800);
 assert.match(await runKpCommand(f.env,{id:String(BigInt(snowflake)+1n),guild_id:guild,member:{user:{id:one}},data:{name:'mbet',options:[{name:'match',value:'3-1'},{name:'player',value:3},{name:'amount',value:200}]}},mapping),/その試合はないで/);
});

test('/mclose: a member reports the start; betting stops and later bets are refunded at settlement', async t => {
 t.mock.timers.enable({apis:['Date'],now:jst('2026-10-27T21:30:00')});
 const f=await fixture();await storeCards(f.env,parseOfficialCards(page,2026),Date.now());
 const at=(time:string,n:number)=>String((BigInt(jst('2026-10-27T'+time))-1420070400000n)<<22n|BigInt(n));
 const close=(user:string,time:string,n:number,options:Array<{name:string;value:string}>=[])=>runKpCommand(f.env,{id:at(time,n),guild_id:guild,member:{user:{id:user}},data:{name:'mclose',options:[{name:'match',value:'1-2'},...options]}},mapping);
 await operateKp(f.env,mapping,one,op(),'ml-bet',{match:game2.id,player:card.find(p=>p.name===order[3])!.no,type:'last',amount:1000});
 t.mock.timers.setTime(jst('2026-10-27T21:45:00'));
 await operateKp(f.env,mapping,two,op(),'ml-bet',{match:game2.id,player:card.find(p=>p.name===order[3])!.no,type:'last',amount:500});
 assert.match(await close('100000000000000199','21:50:00',1),/登録メンバーだけ/);
 assert.match(await close(one,'21:50:00',2,[{name:'at',value:'25:00'}]),/21:42 みたいに/);
 assert.match(await close(one,'21:50:00',3,[{name:'at',value:'21:55'}]),/今までの時刻/);
 assert.match(await close(one,'21:50:00',4,[{name:'at',value:'21:42'}]),/21:42 開始として締め切ったで/);
 assert.match(await close(two,'21:51:00',5,[{name:'at',value:'21:48'}]),/21:42 開始/,'the earliest stated start is kept');
 t.mock.timers.setTime(jst('2026-10-27T21:52:00'));
 await assert.rejects(operateKp(f.env,mapping,one,op(),'ml-bet',{match:game2.id,player:1,type:'last',amount:100}),/開始を報告/);
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

test('the four who sat are read from キンマweb after the start and announced with the predictions on them', async t => {
 t.mock.timers.enable({apis:['Date'],now:jst('2026-10-27T18:30:00')});
 const f=await fixture();await storeCards(f.env,parseOfficialCards(page,2026),Date.now());
 const benched=card.find(p=>!order.includes(p.name))!;
 await operateKp(f.env,mapping,one,op(),'ml-bet',{match:game1.id,player:card.find(p=>p.name===order[0])!.no,type:'last',amount:1000});
 await operateKp(f.env,mapping,two,op(),'ml-bet',{match:game1.id,player:benched.no,type:'last',amount:300});
 const title=(date:string,game:number,names:string[])=>`<item><title>【Mリーグ2026-27 レギュラーシーズン】${date} 第${game}試合（麻雀ch）【${names.join('・')}】テキスト速報</title><pubDate>Tue, 27 Oct 2026 10:03:35 +0000</pubDate></item>`;
 const feed=`<rss><channel>${title('10月27日',1,order)}${title('10月27日',2,['知らない人','A','B','C'])}<item><title>麻雀最強戦 テキスト速報</title><pubDate>Tue, 27 Oct 2026 10:00:00 +0000</pubDate></item></channel></rss>`;
 assert.deepEqual(parseKinmaLineups(feed).map(l=>[l.date,l.game,l.names.length]),[['2026-10-27',1,4],['2026-10-27',2,4]]);
 const urls:string[]=[];const request=(async(url:string)=>{urls.push(url);return new Response(feed);}) as unknown as typeof fetch;
 assert.equal(await pollMlLineups(f.env,mapping,jst('2026-10-27T18:59:00'),request),0);assert.equal(urls.length,0,'nothing before the start');
 assert.equal(await pollMlLineups(f.env,mapping,jst('2026-10-27T19:04:00'),request),1,'only the exact match is stored');
 assert.deepEqual(urls,[KINMA_FEED]);
 assert.equal(await pollMlLineups(f.env,mapping,jst('2026-10-27T19:05:00'),request),0);assert.equal(urls.length,1,'two-minute gap');
 assert.deepEqual((await mlLineups(f.env)).get(game1.id),order);
 const post=f.posts().find(p=>p.includes('出場決定'))!;
 assert.match(post,/10\/27 1卓 第1試合 出場決定/);assert.match(post,new RegExp(order.map(n=>`${n}（[^）]+）`).join('・')));
 assert.match(post,new RegExp(`🎯 <@${one}> ${order[0]}のラス 1,000 KP`));
 assert.match(post,new RegExp(`↩️ <@${two}> ${benched.name}のラス 300 KP：出えへんから返金予定やで`));
 const view=await runKpCommand(f.env,{id:String((BigInt(jst('2026-10-27T19:06:00'))-1420070400000n)<<22n|1n),guild_id:guild,member:{user:{id:one}},data:{name:'mleague'}},mapping);
 assert.match(view,new RegExp(`第1試合 出場：${order.join('・')}`));
});

const pickInput=(match:unknown,focused='player',typed:unknown='')=>({id:String((BigInt(Date.now())-1420070400000n)<<22n|99n),guild_id:guild,member:{user:{id:one}},data:{name:'mbet',options:[{name:'match',value:focused==='match'?typed:match,focused:focused==='match'},{name:'player',value:typed,focused:focused==='player'}]}});
test('/mbet offers confirmed open matches and player names with teams and last-place odds without spending KP',async t=>{
 t.mock.timers.enable({apis:['Date'],now:jst('2026-10-27T18:00:00')});const f=await fixture();
 assert.deepEqual(await mbetChoices(f.env,pickInput(null,'match')),[{name:'ℹ️ 公式の対戦カードを確認中や。ちょっと待って、もう一度タップしてな',value:'none'}],'unconfirmed cards are never offered; the reason is shown');
 await storeCards(f.env,parseOfficialCards(page,2026),Date.now());
 const matches=await mbetChoices(f.env,pickInput(null,'match'));assert.equal(matches.length,4);
 assert.ok(matches.every(c=>c.name.length<=100&&/10\/27 [12]卓 第[12]試合/.test(c.name)&&ML_DATA.fixtures.some(g=>g.id===c.value)));
 const choices=await mbetChoices(f.env,pickInput(game1.id));assert.equal(choices.length,16);
 assert.ok(choices.every(c=>c.name.includes('ラス')&&c.name.includes('倍')&&c.name.includes('出場未確定')&&c.name.length<=100&&card.some(p=>p.name===c.value)));
 const team=ML_DATA.teams.find(team=>team.id===game1.teams[0])!;
 assert.deepEqual((await mbetChoices(f.env,pickInput(game1.id,'player',team.name.toLowerCase()))).map(c=>c.value),team.players.map(p=>p.name));
 assert.deepEqual((await mbetChoices(f.env,pickInput(game1.id,'player',team.players[0].name.split('').join('　')))).map(c=>c.value),[team.players[0].name]);
 assert.match((await mbetChoices(f.env,pickInput(undefined)))[0].name,/先に match で試合を選んで/);assert.match((await mbetChoices(f.env,pickInput('missing')))[0].name,/見つからへん/);
 assert.match((await mbetChoices(f.env,pickInput(null,'match','存在しないチーム')))[0].name,/に合う試合がないで/);assert.match((await mbetChoices(f.env,pickInput(game1.id,'player','ああああ')))[0].name,/に合う選手がおらへんで/);
 assert.equal(f.balance(one),100000);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_operations').get()!.n,0);
});
test('/mbet narrows confirmed lineups and removes manual/automatic closures and completed games',async t=>{
 t.mock.timers.enable({apis:['Date'],now:jst('2026-10-27T18:00:00')});const f=await fixture();await storeCards(f.env,parseOfficialCards(page,2026),Date.now());
 f.sql.prepare('INSERT INTO ml_lineups VALUES(?,?,?)').run(game2.id,JSON.stringify(order),Date.now());
 assert.deepEqual((await mbetChoices(f.env,pickInput(game2.id))).map(c=>c.value).sort(),[...order].sort());
 assert.ok((await mbetChoices(f.env,pickInput(game2.id))).every(c=>c.name.includes('出場確定')));
 t.mock.timers.tick(3600000);assert.deepEqual(await mbetChoices(f.env,pickInput(game1.id)),[{name:'ℹ️ この試合は締め切ったで。match で別の試合を選んでな',value:'none'}],'game1 closes at19:00');
 assert.equal((await mbetChoices(f.env,pickInput(game2.id))).length,4,'game2 still follows the existing result-based window');
 f.sql.prepare('INSERT INTO ml_closed VALUES(?,?,?,?)').run(game2.id,Date.now(),one,Date.now());assert.match((await mbetChoices(f.env,pickInput(game2.id)))[0].name,/締め切ったで/);
 f.sql.prepare('DELETE FROM ml_closed').run();f.sql.prepare('INSERT INTO ml_results VALUES(?,?,?,?)').run(game1.id,JSON.stringify(order),JSON.stringify([50,0,-10,-40]),Date.now());
 assert.match((await mbetChoices(f.env,pickInput(game2.id)))[0].name,/締め切ったで/,'game1 result closes game2');
 assert.ok(!(await mbetChoices(f.env,pickInput(null,'match'))).some(c=>c.value===game1.id||c.value===game2.id));
});
test('/mbet named selections follow the official corrected teams, settle once and show team and gross payout',async t=>{
 t.mock.timers.enable({apis:['Date'],now:jst('2026-10-27T18:00:00')});const f=await fixture();await storeCards(f.env,parseOfficialCards(calendar('2026-10-27',[tables[1],tables[0]]),2026),Date.now());
 const d=await mlData(f.env),selectedFixture=d.fixtures.find(g=>g.id===game1.id)!,players=mlCard(d,selectedFixture),picked=players[2];
 const choices=await mbetChoices(f.env,pickInput(game1.id));assert.ok(choices.some(c=>c.value===picked.name&&c.name.includes(picked.teamName)));
 const input=pickInput(game1.id);input.data.options=[{name:'match',value:game1.id,focused:false},{name:'player',value:picked.name,focused:false},{name:'amount',value:500,focused:false}];
 const preview=await runKpCommand(f.env,input,mapping);assert.match(preview,/まだ購入してへんで/);assert.ok(preview.includes('チーム '+picked.teamName));
 const buy=()=>mbetDecide(f.env,{...input,id:String(BigInt(input.id)+7n),data:{custom_id:`mbet:buy:${input.id}`}},mapping).then(r=>r!.content);
 const message=await buy();assert.match(message,/ラス予想を購入したで/);assert.ok(message.includes('チーム '+picked.teamName));assert.match(message,/的中時の払戻し [\d,]+ KP（掛け金込み）/);
 assert.equal(f.balance(one),99500);await buy();assert.equal(f.balance(one),99500);
 const saved=JSON.parse(String(f.sql.prepare('SELECT data FROM kp_state WHERE user=?').get(one)!.data));assert.equal(saved.mlBets[0].player,picked.name);assert.equal(saved.mlBets[0].type,'last');
});
test('/mbet revalidates the selection after autocomplete; an expired game ID never becomes tomorrow game',async t=>{
 t.mock.timers.enable({apis:['Date'],now:jst('2026-10-27T18:00:00')});const f=await fixture();await storeCards(f.env,parseOfficialCards(page,2026),Date.now());
 const [choice]=await mbetChoices(f.env,pickInput(game1.id));
 t.mock.timers.tick(3600001);let input=pickInput(game1.id);input.data.options=[{name:'match',value:game1.id,focused:false},{name:'player',value:choice.value,focused:false},{name:'amount',value:500,focused:false}];
 assert.match(await runKpCommand(f.env,input,mapping),/締め切/);assert.equal(f.balance(one),100000);
 t.mock.timers.tick(86400000);input={...input,id:String((BigInt(Date.now())-1420070400000n)<<22n|100n)};assert.match(await runKpCommand(f.env,input,mapping),/締め切/);assert.equal(f.balance(one),100000);
});

test('signed /mbet autocomplete returns the named candidates immediately without invoking the purchase path',async t=>{
 t.mock.timers.enable({apis:['Date'],now:jst('2026-10-27T18:00:00')});const f=await fixture();await storeCards(f.env,parseOfficialCards(page,2026),Date.now());
 const {discordInteractions}=await import('../src/discord-interactions.ts');const pair=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']) as CryptoKeyPair;
 const config={applicationId:one,guildId:guild,publicKey:Buffer.from(await crypto.subtle.exportKey('raw',pair.publicKey)).toString('hex')};
 const body=JSON.stringify({...pickInput(game1.id),application_id:one,type:4,token:'fixture',member:{permissions:'0',user:{id:two}}});const timestamp=String(Math.floor(Date.now()/1000));
 const signature=Buffer.from(await crypto.subtle.sign('Ed25519',pair.privateKey,new TextEncoder().encode(timestamp+body))).toString('hex'),tasks:Promise<unknown>[]=[];
 const response=await discordInteractions(new Request('https://worker/interactions',{method:'POST',body,headers:{'X-Signature-Ed25519':signature,'X-Signature-Timestamp':timestamp}}),f.env as import('../src/index.ts').Env,{waitUntil:(p:Promise<unknown>)=>tasks.push(p)} as unknown as ExecutionContext,config);
 const data=await response.json() as {type:number;data:{choices:Array<{name:string;value:string}>}};assert.equal(data.type,8);assert.equal(data.data.choices.length,16);assert.ok(data.data.choices.every(c=>card.some(p=>p.name===c.value)));
 assert.equal(tasks.length,0);assert.equal(f.balance(two),100000);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM kp_operations').get()!.n,0);
});

test('長い障害の後でも、未精算の予想がある試合は結果を取りに行き、1回だけ精算・投稿する', async t => {
 t.mock.timers.enable({apis:['Date'],now:jst('2026-10-27T18:30:00')});
 const f=await fixture();await storeCards(f.env,parseOfficialCards(page,2026),Date.now());
 const won=await operateKp(f.env,mapping,one,op(),'ml-bet',{match:game1.id,player:card.find(p=>p.name===order[3])!.no,type:'last',amount:1000}) as {result:{bet:{odds:number}}};
 const urls:string[]=[],request=(async(url:string)=>{urls.push(String(url));return new Response(page);}) as unknown as typeof fetch;
 // The Worker was down from before the start until two days later.
 const back=jst('2026-10-29T12:00:00');
 assert.equal(await pollMlResults(f.env,back,request),1,'game 1 has an unsettled bet: its result is read');
 assert.equal(urls.length,1);
 assert.equal(await pollMlResults(f.env,back+60000,request),0);assert.equal(urls.length,1,'only stale games left: every 10 minutes, not every minute');
 assert.equal(await settleMl(f.env,mapping),1);assert.equal(await settleMl(f.env,mapping),0,'settled once');
 const paid=100000-1000+Math.floor(1000*won.result.bet.odds/10);assert.equal(f.balance(one),paid);
 await pollMlResults(f.env,back+600000,request);await settleMl(f.env,mapping);assert.equal(f.balance(one),paid,'a later read changes nothing');
 assert.equal(urls.length,1,'nothing unsettled any more: game 2 (no bets) is not read after its window');
 await queueMlPosts(f.env,mapping,back+60000);await queueMlPosts(f.env,mapping,back+120000);
 assert.equal(f.posts().filter(p=>p.includes('第1試合 結果')).length,1,'the late result is posted once');
});

test('61件買っても未精算は消えず、結果が出たら61件すべて精算される（6,100 KP分）', async t => {
 t.mock.timers.enable({apis:['Date'],now:jst('2026-10-27T18:30:00')});
 const f=await fixture();await storeCards(f.env,parseOfficialCards(page,2026),Date.now());
 const loser=card.find(p=>p.name===order[3])!.no;
 for(let i=0;i<61;i++){t.mock.timers.setTime(jst('2026-10-27T18:30:00')+i*1000);await operateKp(f.env,mapping,one,op(),'ml-bet',{match:game1.id,player:loser,type:'last',amount:100});}
 assert.equal(f.balance(one),100000-6100);
 assert.equal((await readKpState(f.env,mapping,one)).mlBets.filter((b:{status:string})=>b.status==='pending').length,61,'a re-read keeps all of them');
 t.mock.timers.setTime(jst('2026-10-27T21:10:00'));
 await pollMlResults(f.env,Date.now(),(async()=>new Response(page)) as unknown as typeof fetch);
 assert.equal(await settleMl(f.env,mapping),61);
 const state=await readKpState(f.env,mapping,one);
 assert.equal(state.mlBets.filter((b:{status:string})=>b.status==='pending').length,0);
 assert.equal(f.balance(one),100000-6100+61*Math.floor(100*state.mlBets[0].odds/10));
});

test('/mbet の確認：やめる・二度押し・他人の押下・期限切れ・倍率の変化・借KP', async t => {
 t.mock.timers.enable({apis:['Date'],now:jst('2026-10-27T18:00:00')});
 const f=await fixture();await storeCards(f.env,parseOfficialCards(page,2026),Date.now());
 let n=0n;const sid=()=>String((BigInt(Date.now())-1420070400000n)<<22n|(++n));
 const preview=async(amount=200,user=one)=>{const id=sid(),out:{components?:Array<{components:Array<{custom_id:string}>}>}={};const content=await runKpCommand(f.env,{id,guild_id:guild,member:{user:{id:user}},data:{name:'mbet',options:[{name:'match',value:'1-1'},{name:'player',value:3},{name:'amount',value:amount}]}},mapping,out);return {id,content,out};};
 const press=(id:string,kind:'buy'|'no',user=one)=>mbetDecide(f.env,{id:sid(),guild_id:guild,member:{user:{id:user}},data:{custom_id:`mbet:${kind}:${id}`}},mapping);
 const a=await preview();
 assert.deepEqual(a.out.components![0].components.map(c=>c.custom_id),[`mbet:buy:${a.id}`,`mbet:no:${a.id}`]);
 assert.equal(await press(a.id,'buy',two),null,'someone else cannot press it');
 assert.match((await press(a.id,'no'))!.content,/購入はやめといたで/);
 assert.match((await press(a.id,'buy'))!.content,/やめといたで/);assert.equal(f.balance(one),100000);
 const b=await preview();
 assert.match((await press(b.id,'buy'))!.content,/購入したで/);assert.match((await press(b.id,'buy'))!.content,/購入したで/);
 assert.equal(f.balance(one),99800,'a double press buys once');
 const c=await preview();t.mock.timers.setTime(Date.now()+11*60000);
 assert.match((await press(c.id,'buy'))!.content,/10分を過ぎた/);assert.equal(f.balance(one),99800);
 const d=await preview();f.sql.prepare('UPDATE ml_bet_drafts SET odds=odds+5 WHERE id=?').run(d.id);
 assert.match((await press(d.id,'buy'))!.content,/倍率が .* に変わったから買うてへんで/);assert.equal(f.balance(one),99800);
 assert.match((await preview(9999900)).content,/KPが足らへん/,'checked like a purchase');
 f.sql.prepare("INSERT INTO kp_debt_events VALUES('borrow:x',?,?,500,'borrow',0)").run(guild,one);
 assert.match((await preview()).content,/借KP/);
});

test('/kp bets：自分の未精算と最近の精算（的中・外れ・返金）を本人に見せる', async t => {
 t.mock.timers.enable({apis:['Date'],now:jst('2026-10-27T18:30:00')});
 const f=await fixture();await storeCards(f.env,parseOfficialCards(page,2026),Date.now());
 const bets=(user=one)=>runKpCommand(f.env,{id:String((BigInt(Date.now())-1420070400000n)<<22n|77n),guild_id:guild,member:{user:{id:user}},data:{name:'kp',options:[{name:'bets',type:1}]}},mapping);
 assert.match(await bets(),/未精算\*\* 0件[\s\S]*なし[\s\S]*まだありません/);
 const benched=card.find(p=>!order.includes(p.name))!;
 await operateKp(f.env,mapping,one,op(),'ml-bet',{match:game1.id,player:card.find(p=>p.name===order[3])!.no,type:'last',amount:1000});
 await operateKp(f.env,mapping,one,op(),'ml-bet',{match:game1.id,player:card.find(p=>p.name===order[0])!.no,type:'last',amount:500});
 await operateKp(f.env,mapping,one,op(),'ml-bet',{match:game1.id,player:benched.no,type:'last',amount:300});
 await operateKp(f.env,mapping,one,op(),'ml-bet',{match:game2.id,player:1,type:'last',amount:200});
 const before=await bets();
 assert.match(before,/未精算\*\* 4件・合計 2,000 KP/);assert.match(before,new RegExp(`Mリーグ 10/27 1卓 第1試合・${order[3]}のラス　1,000 KP`));
 t.mock.timers.setTime(jst('2026-10-27T21:10:00'));
 await pollMlResults(f.env,Date.now(),(async()=>new Response(page)) as unknown as typeof fetch);await settleMl(f.env,mapping);
 const after=await bets();
 assert.match(after,/未精算\*\* 1件・合計 200 KP/);
 assert.match(after,new RegExp(`✅ .*${order[3]}のラス　的中 \\+`));assert.match(after,new RegExp(`❌ .*${order[0]}のラス　外れ −500 KP`));assert.match(after,new RegExp(`↩️ .*${benched.name}のラス　返金 300 KP`));
 assert.match(await bets(two),/未精算\*\* 0件/,'only your own');
 assert.ok(after.length<2000);
});

test('/mbet の候補が出ない理由：次の開催日・受付前を案内し、理由の行を選んで送っても何も買わない', async t => {
 t.mock.timers.enable({apis:['Date'],now:jst('2026-10-28T12:00:00')});
 const f=await fixture();await storeCards(f.env,parseOfficialCards(page,2026),Date.now());
 const day=mlDay(Date.now())!;assert.ok(day>'2026-10-28','10/28 has no games');
 assert.match((await mbetChoices(f.env,pickInput(null,'match')))[0].name,new RegExp(`次の試合は ${Number(day.slice(5,7))}/${Number(day.slice(8,10))}やで。受付は当日0時から`));
 const reply=await runKpCommand(f.env,{...pickInput('none'),data:{name:'mbet',options:[{name:'match',value:'none'},{name:'player',value:'none'},{name:'amount',value:500}]}},mapping);
 assert.match(reply,/予想できる候補がないで/);assert.equal(f.balance(one),100000);
});

test('Activity の Mリーグ画面：今日の試合の状態・選手・倍率を返し、表示した倍率で買う（変わっていたら買わない）', async t => {
 t.mock.timers.enable({apis:['Date'],now:jst('2026-10-27T18:00:00')});
 const f=await fixture();
 let view=(await readKpState(f.env,mapping,one)).mleague;
 assert.equal(view.day,'2026-10-27');assert.ok(view.fixtures.every((x:{status:string})=>x.status==='unconfirmed'));
 await storeCards(f.env,parseOfficialCards(page,2026),Date.now());
 view=(await readKpState(f.env,mapping,one)).mleague;
 const g1=view.fixtures.find((x:{id:string})=>x.id===game1.id);
 assert.equal(g1.status,'open');assert.equal(g1.players.length,16);assert.ok(g1.players.every((p:{odds:number;sitting:unknown})=>Number.isInteger(p.odds)&&p.sitting===null));
 const pick=g1.players[0];
 await assert.rejects(operateKp(f.env,mapping,one,op(),'ml-bet',{match:game1.id,player:pick.name,type:'last',amount:500,odds:pick.odds+1}),/倍率が .* に変わったから買うてへんで/);
 assert.equal(f.balance(one),100000);
 await operateKp(f.env,mapping,one,op(),'ml-bet',{match:game1.id,player:pick.name,type:'last',amount:500,odds:pick.odds});
 assert.equal(f.balance(one),99500);
 const saved=JSON.parse(String(f.sql.prepare('SELECT data FROM kp_state WHERE user=?').get(one)!.data));
 assert.equal(saved.mleague,undefined,'the screen data is not saved in the wallet');
 t.mock.timers.setTime(jst('2026-10-27T21:10:00'));
 await pollMlResults(f.env,Date.now(),(async()=>new Response(page)) as unknown as typeof fetch);
 view=(await readKpState(f.env,mapping,one)).mleague;
 assert.deepEqual(view.fixtures.find((x:{id:string})=>x.id===game1.id).result.names,order);
});
