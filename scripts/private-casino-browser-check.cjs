const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{existsSync}=require('node:fs');
const server=spawn('python3',['-m','http.server','8794','--bind','127.0.0.1'],{cwd:require('node:path').join(__dirname,'..'),stdio:'ignore'});let browser;
(async()=>{
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:8794')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const {createInitialState}=await import('../js/engine.js');const state={...createInitialState(),serverWallet:true,privateCasino:true,cash:10000,selfUserId:'owner',members:[],ledger:[]};
 const engine=process.argv[2]||'chromium';browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{}:{executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});await ctx.addInitScript(()=>localStorage.setItem('keso-kp-session-v1','fixture'));
 let ops=0,rejectNextShock=false,failNextState=false;const errors=[],bodies=[],shocks=[];
 await ctx.route('https://valorant-results.tealeaforest.workers.dev/api/kp/**',async route=>{
  const path=new URL(route.request().url()).pathname;let result;
  if(path.endsWith('/state')){if(failNextState){failNextState=false;await route.fulfill({status:503,json:{error:'一時的に更新できません',retryable:true}});return;}result=state;}
  else if(path.endsWith('/pulse'))result={pulse:'fixed'};
  else if(path.endsWith('/feed'))result={entries:[]};
  else if(path.endsWith('/private/race')){
   result={id:Date.now()+600000,name:'確認用レース',closeAt:Date.now()+500000,hash:'fixture',order:[{number:3,name:'<img src=x onerror=alert(1)>',win:34,place:15},{number:1,name:'馬1',win:25,place:13}]};
  }else if(path.endsWith('/operation')){
   const body=route.request().postDataJSON();
   if(body.action==='stock-shock'){
    if(rejectNextShock){rejectNextShock=false;await route.fulfill({status:403,json:{error:'操作権限を確認できません',retryable:false}});return;}
    const {symbol,direction,strength}=body.args;shocks.push({...body.args,id:body.id});
    const before=state.prices[symbol],after=Math.round(before*(direction==='up'?1+strength/100:1-strength/100));
    state.prices[symbol]=after;
    await route.fulfill({json:{result:{symbol,direction,strength,before,after,version:shocks.length,headline:body.args.headline??(body.args.eventId==='keso-down-1'?'本社の唯一のWi-Fiが電子レンジに敗北、決算発表中断':'架空ニュース'),replayed:false}}});return;
   }
   assert.equal(body.action,'private-casino');bodies.push(body.args);if(body.args.game!=='roulette'){state.cash+=124500;await route.fulfill({json:{result:{hand:null,done:{game:'video-poker',bet:500,hand:'royal',payout:125000,net:124500}},operationSource:'owner-casino'}});return;}assert.deepEqual(body.args,{game:'roulette',amount:500,number:7});ops++;await new Promise(r=>setTimeout(r,250));state.cash+=17500;result={result:{type:'number',choice:7,outcome:7,amount:500,payout:18000},operationSource:'owner-casino'};
  }else throw Error('Unexpected API '+path);
  await route.fulfill({json:result});
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));let nativeDialogs=0;page.on('dialog',d=>{nativeDialogs++;d.accept();});await page.goto('http://127.0.0.1:8794');await page.locator('.title-start').click();await page.locator('.nav-btn[data-screen=assets]').click();
 await page.locator('.private-casino summary').click();await page.locator('#private-amount').fill('500');await page.locator('#private-number').fill('7');
 const button=page.locator('[data-action=private-round]');await button.evaluate(el=>{el.click();el.click();});await page.waitForFunction(()=>document.querySelector('.wallet-strip').textContent.includes('27,500'));assert.equal(ops,1);
 assert.equal(await page.locator('#private-amount').inputValue(),'500');assert.equal(await page.locator('#private-number').inputValue(),'7');
 await page.locator('[data-action=private-race]').click();await page.locator('.private-casino').filter({hasText:'確認用レース'}).waitFor();assert.match(await page.locator('.private-casino').innerText(),/3番 <img/);assert.equal(await page.locator('.private-casino img').count(),0);
 // A hand from the table: the game switch shows that game's hands and sends only the chosen one.
 await page.locator('#private-game').selectOption('poker');await page.locator('#private-hand').waitFor();
 assert.equal(await page.locator('#private-number').count(),0);assert.equal(await page.locator('#private-hand option').count(),9);
 await page.locator('#private-hand').selectOption('royal');await page.locator('[data-action=private-round]').click();
 await page.waitForFunction(()=>document.querySelector('.wallet-strip').textContent.includes('152,000'));
 assert.deepEqual(bodies.at(-1),{game:'poker',amount:500,hand:'royal'});
 await page.locator('#private-game').selectOption('chinchiro');assert.match(await page.locator('#private-hand').innerText(),/ピンゾロ[\s\S]*シゴロ/);
 // Owner-only stock operator in the same private area: actual click, request and shared price refresh.
 await page.locator('details.asset-card.rules').filter({hasText:'裏モード：株価オペレーター'}).locator('summary').click();
 assert.equal(await page.locator('#admin-stock-symbol option').count(),12);
 await page.locator('#admin-stock-symbol').selectOption('keso');
 await page.locator('#admin-stock-direction').selectOption('down');
 await page.locator('#admin-stock-strength').selectOption('50');
 await page.locator('#admin-stock-news').selectOption('keso-down-1');
 assert.match(await page.locator('.stock-story-preview').first().innerText(),/電子レンジ/);
 await page.locator('[data-action=stock-shock]').click();
 await page.locator('.stock-shock-confirmation').waitFor();
 assert.equal(shocks.length,0,'first tap must not send a stock mutation');
 assert.equal(nativeDialogs,0,'stock action must not trigger native confirm in Discord iOS');
 assert.match(await page.locator('.stock-shock-confirmation').innerText(),/50%急落/);
 assert.match(await page.locator('.stock-shock-confirmation').innerText(),/Wi-Fi/);
 await page.locator('[data-action=stock-shock-cancel]').click();
 assert.equal(await page.locator('.stock-shock-confirmation').count(),0,'cancel must not send a stock mutation');
 assert.equal(shocks.length,0);
 await page.locator('[data-action=stock-shock]').click();
 await page.locator('[data-action=stock-shock-approve]').click();
 await page.waitForFunction(()=>document.querySelector('#stock-shock-notice')?.textContent?.includes('株価操作を受け付けました'));

 assert.match(await page.locator('#stock-shock-notice').innerText(),/50%下落.*1,200 KP → 600 KP/);
 assert.equal(await page.locator('#stock-shock-direction').count(),0,'the operator should use the admin-stock-direction field');
 assert.equal(await page.locator('#admin-stock-direction').inputValue(),'down');
 assert.equal(await page.locator('#admin-stock-strength').inputValue(),'50');
 assert.deepEqual(shocks.map(({id,...args})=>args),[{symbol:'keso',direction:'down',strength:50,eventId:'keso-down-1'}]);
 assert.match(await page.locator('#stock-shock-notice').innerText(),/Wi-Fi/);
 assert.equal(state.cash,152000,'admin stock action cannot credit the wallet');
 // Success should remain readable even after the 1.8-second toast disappears.
 await page.waitForTimeout(2000);
 assert.match(await page.locator('#stock-shock-notice').innerText(),/株価操作を受け付けました/);
 // Definitively rejected operations must never show a new success acknowledgement.
 await page.locator('#admin-stock-direction').selectOption('up');
 await page.locator('#admin-stock-strength').selectOption('10');
 rejectNextShock=true;
 await page.locator('[data-action=stock-shock]').click();
 await page.locator('[data-action=stock-shock-approve]').click();
 await page.waitForFunction(()=>document.querySelector('#stock-shock-notice')?.textContent?.includes('受け付けられませんでした'));
 assert.equal(await page.locator('#stock-shock-notice').evaluate(el=>el.classList.contains('error')),true);
 assert.equal(state.prices.keso,600,'rejected operation cannot change the market');
 // Operation success followed by a failed state refresh must still be acknowledged.
 failNextState=true;
 await page.locator('[data-action=stock-shock]').click();
 await page.locator('[data-action=stock-shock-approve]').click();
 await page.waitForFunction(()=>document.querySelector('#stock-shock-notice')?.textContent?.includes('再取得に失敗しました'));
 assert.match(await page.locator('#stock-shock-notice').innerText(),/株価操作を受け付けました/);
 assert.equal(state.prices.keso,660);
 assert.equal(await page.locator('#stock-shock-notice').evaluate(el=>el.classList.contains('warning')),true);
 // Custom absurd bulletin is sent only once and its text survives confirmation.
 await page.locator('#admin-stock-news').selectOption('custom');
 await page.locator('#admin-stock-headline').fill('リソ寿司、月面で回転寿司を開業');
 await page.locator('#admin-stock-body').fill('月面に寿司レーンを設置したところ、皿が無重力で飛び回り、宇宙飛行士に大人気となった。');
 await page.locator('#admin-stock-symbol').selectOption('riso');
 await page.locator('#admin-stock-news').selectOption('custom');
 await page.locator('#admin-stock-headline').fill('リソ寿司、月面で回転寿司を開業');
 await page.locator('#admin-stock-body').fill('月面に寿司レーンを設置したところ、皿が無重力で飛び回り、宇宙飛行士に大人気となった。');
 await page.locator('[data-action=stock-shock]').click();
 await page.waitForFunction(()=>document.querySelector('.stock-shock-confirmation')?.textContent?.includes('月面で回転寿司'));
 await page.locator('[data-action=stock-shock-approve]').click();
 await page.waitForFunction(()=>document.querySelector('#stock-shock-notice')?.textContent?.includes('月面で回転寿司'));
 assert.deepEqual(shocks.at(-1).headline,'リソ寿司、月面で回転寿司を開業');
 assert.equal(shocks.at(-1).eventId,'custom');
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:844});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 delete state.privateCasino;state.selfUserId='other';await page.reload();await page.locator('.title-start').click();await page.locator('.nav-btn[data-screen=assets]').click();assert.equal(await page.locator('.private-casino').count(),0);assert.equal(await page.locator('#private-number').count(),0);assert.equal(await page.locator('[data-action=stock-shock]').count(),0);assert.deepEqual(errors,[]);
 console.log('Private casino passed ('+engine+'): owner controls, exact request, double-click guard, draft preservation, escaped race preview, no menu for other users, mobile/desktop. Fixture balances only.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.kill();});
