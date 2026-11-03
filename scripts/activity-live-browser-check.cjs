// Live-wallet Activity screens against a mocked Worker API: the Mリーグ prediction with its confirmation, the full
// 入出金履歴 with signs, and the light 15-second polling (a tiny pulse; the full state only on a change or each minute).
const {chromium}=require('playwright');const assert=require('node:assert/strict');const {spawn}=require('node:child_process');const {existsSync,readFileSync}=require('node:fs');const path=require('node:path');
const server=spawn('python3',['-m','http.server','8768','--bind','127.0.0.1'],{cwd:path.join(__dirname,'..'),stdio:'ignore'});let browser;
(async()=>{
 const {createInitialState}=await import('../js/engine.js');const M=await import('../js/mleague.js');
 const data=JSON.parse(readFileSync(path.join(__dirname,'../services/valorant-results/mleague-2026-27.json'),'utf8'));
 const T0=Date.parse('2026-10-27T18:00:00+09:00'),day='2026-10-27';
 const fixtures=data.fixtures.filter(f=>f.date===day).sort((a,b)=>a.table-b.table||a.game-b.game);
 const view=(f,status,extra={})=>({id:f.id,date:f.date,table:f.table,game:f.game,start:M.mlStart(f),teams:f.teams.map(id=>data.teams.find(t=>t.id===id).name),status,
  players:M.mlCard(data,f).map(p=>({no:p.no,name:p.name,teamName:p.teamName,odds:M.mlOdds(p).last,sitting:null})),...extra});
 const card1=M.mlCard(data,fixtures[0]);
 const state={...createInitialState(T0),cash:20000,serverWallet:true,selfUserId:'one',members:[{id:'one',name:'本人'}],claims:[],directives:[],rewardRates:{competitive:{win:900,loss:-200,bottom:-400}},
  mleague:{day,fixtures:[view(fixtures[0],'result',{result:{names:card1.slice(0,4).map(p=>p.name),points:[60.2,10.1,-20.3,-50]}}),view(fixtures[1],'open'),view(fixtures[2],'closed')]},
  ledger:[{id:'a',kind:'mahjong',label:'雀魂',detail:'',delta:-600,time:T0-1000},{id:'b',kind:'unite',label:'ポケモンユナイト',detail:'',delta:200,time:T0-2000},{id:'c',kind:'grant',label:'手動調整<b>x</b>',detail:'',delta:5000,time:T0-3000},{id:'d',kind:'match',label:'VALORANT コンペ',detail:'match-1',delta:-200,time:T0-4000}]};
 const errors=[],ops=[],seen=[];let pulse='p1';
 for(let n=0;n<40;n++){try{if((await fetch('http://127.0.0.1:8768')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:390,height:844}});
 await ctx.addInitScript(()=>{localStorage.setItem('keso-kp-session-v1','a'.repeat(48));for(const name of ['Audio','AudioContext','RTCPeerConnection'])Object.defineProperty(window,name,{value:()=>{throw Error('media requested')}});});
 await ctx.route('https://valorant-results.tealeaforest.workers.dev/api/kp/**',async route=>{
  if(new URL(route.request().url()).pathname.endsWith('/feed'))return route.fulfill({json:{entries:[]}});
  const p=new URL(route.request().url()).pathname;let result;
  assert.equal(route.request().headers().authorization,'Bearer '+'a'.repeat(48));
  if(p.endsWith('/state')){seen.push('S');result=state;}
  else if(p.endsWith('/pulse')){seen.push('p');result={pulse};}
  else if(p.endsWith('/health')){seen.push('h');result={at:T0,features:[{feature:'mleague',label:'Mリーグの結果・精算',status:'failing',lastOk:T0-3600000,lastError:T0-60000,error:'Error: timeout',failures:2},{feature:'voice',label:'通話の計測',status:'ok',lastOk:T0,lastError:null,error:null,failures:0}],backlog:{mleagueBets:1,mleagueMatches:1,raceBets:0,mahjongClaims:0,debts:0,earningsPosts:0,alertPosts:0,kpInbox:0}};}
  else if(p.endsWith('/operation')){const body=route.request().postDataJSON();ops.push(body);assert.equal(body.action,'ml-bet');
   const pick=state.mleague.fixtures[1].players.find(x=>x.name===body.args.player);
   if(body.args.odds!==pick.odds){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'倍率が変わったので購入していません。'})});return;}
   state.cash-=body.args.amount;state.mlBets=[{id:'ml-1',match:body.args.match,player:pick.name,type:'last',amount:body.args.amount,odds:pick.odds,status:'pending',payout:0,time:T0},...(state.mlBets??[])];
   result={result:{bet:{player:pick.name,odds:pick.odds,amount:body.args.amount}}};}
  else throw Error('Unexpected endpoint '+p);
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:T0});
 await page.goto('http://127.0.0.1:8768');await page.locator('.title-start').click();
 // 入出金履歴: every kind with its own sign and badge; labels are escaped.
 await page.locator('.nav-btn[data-screen=play]').click();
 const history=await page.locator('.panel').filter({hasText:'入出金履歴'}).innerText();
 assert.match(history,/減額\s*雀魂[\s\S]*−600 KP/);assert.match(history,/入金\s*ポケモンユナイト[\s\S]*\+200 KP/);assert.match(history,/手動調整<b>x<\/b>[\s\S]*\+5,000 KP/);assert.match(history,/VALORANT コンペ[\s\S]*match-1[\s\S]*−200 KP/);
 assert.doesNotMatch(history,/\+-|支給済み/);
 // Mリーグ: result, open and closed games; choose a player, enter an amount, confirm, buy at the shown odds.
 await page.locator('.nav-btn[data-screen=race]').click();await page.locator('.sub-tab[data-screen=mleague]').click();
 assert.match(await page.locator('.ml-card').first().innerText(),/1着 /);assert.equal(await page.locator('.ml-card').filter({hasText:'締め切りました'}).count(),1);
 const pick=state.mleague.fixtures[1].players[2];
 await page.locator(`.ml-pick[data-ml-player="${pick.name}"]`).click();await page.locator('#ml-amount').fill('500');
 assert.match(await page.locator('#ml-preview').innerText(),/当たれば [\d,]+ KP/);
 await page.locator('[data-action=ml-confirm]').click();
 const confirm=await page.locator('.ml-order').innerText();assert.match(confirm,/購入の確認/);assert.match(confirm,/19,500 KP/,'balance after');
 assert.equal(ops.length,0,'nothing is bought before 購入する');
 await page.locator('[data-action=ml-cancel]').click();assert.equal(await page.locator('[data-action=ml-buy]').count(),0);assert.equal(ops.length,0);
 await page.locator('[data-action=ml-confirm]').click();await page.locator('[data-action=ml-buy]').click();
 await page.locator('.toast').filter({hasText:`${pick.name}のラスを買いました`}).waitFor();
 assert.deepEqual(ops.map(o=>o.args),[{match:state.mleague.fixtures[1].id,player:pick.name,type:'last',amount:500,odds:pick.odds}]);
 assert.match(await page.locator('.asset-card').filter({hasText:'自分の予想'}).innerText(),new RegExp(`${pick.name}のラス 500 KP[\\s\\S]*結果待ち`));
 // A changed price is refused by the server and the confirmation closes on the fresh odds.
 const other=state.mleague.fixtures[1].players[3];
 await page.locator(`.ml-pick[data-ml-player="${other.name}"]`).click();await page.locator('#ml-amount').fill('300');await page.locator('[data-action=ml-confirm]').click();
 state.mleague.fixtures[1].players[3]={...other,odds:other.odds+3};
 await page.locator('[data-action=ml-buy]').click();await page.locator('.toast').filter({hasText:'倍率が変わった'}).waitFor();
 assert.equal(await page.locator('[data-action=ml-buy]').count(),0);assert.equal(state.cash,19500,'the refused order cost nothing');
 // Polling: 15-second pulses; the full state only when the pulse changes or a minute has passed.
 const start=seen.length,tick=async()=>{const before=seen.length;await page.clock.runFor(15000);await new Promise(r=>setTimeout(r,300));return seen.slice(before).join('')||'-';};
 const ticks=[];for(let i=1;i<=8;i++){if(i===6)pulse='p2';ticks.push(await tick());}
 assert.equal(seen.slice(start).filter(x=>x==='p').length,8,ticks.join(' '));
 const full=seen.slice(start).filter(x=>x==='S').length;assert.ok(full>=2&&full<=3,'full refreshes: once a minute and on the change, not every 15 s: '+ticks.join(' '));
 assert.ok(ticks[5].includes('S'),'a changed pulse fetches the state at once');
 // 資産 → システムの状態: loaded only when asked for.
 await page.locator('.nav-btn[data-screen=assets]').click();assert.equal(seen.filter(x=>x==='h').length,0);
 await page.locator('[data-action=load-health]').click();await page.locator('.health-card').filter({hasText:'1件の処理に問題があります'}).waitFor();
 assert.match(await page.locator('.health-card').innerText(),/Mリーグの結果・精算\s*失敗中[\s\S]*連続失敗 2回[\s\S]*Mリーグの未精算の予想\s*1件/);
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'width '+width);}
 assert.deepEqual(errors,[]);
 console.log('Live Activity passed: full ledger history with signs and escaping, Mリーグ result/open/closed games, confirm-then-buy at the shown odds, refused price change, own predictions, pulse polling ('+ticks.join(' ')+'), システムの状態, mobile layouts.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.kill()});
