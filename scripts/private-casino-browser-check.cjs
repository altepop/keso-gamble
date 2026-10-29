const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{existsSync}=require('node:fs');
const server=spawn('python3',['-m','http.server','8794','--bind','127.0.0.1'],{cwd:require('node:path').join(__dirname,'..'),stdio:'ignore'});let browser;
(async()=>{
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:8794')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const {createInitialState}=await import('../js/engine.js');const state={...createInitialState(),serverWallet:true,privateCasino:true,cash:10000,selfUserId:'owner',members:[],ledger:[]};
 const engine=process.argv[2]||'chromium';browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{}:{executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});await ctx.addInitScript(()=>localStorage.setItem('keso-kp-session-v1','fixture'));
 let ops=0;const errors=[],bodies=[];
 await ctx.route('https://valorant-results.tealeaforest.workers.dev/api/kp/**',async route=>{
  const path=new URL(route.request().url()).pathname;let result;
  if(path.endsWith('/state'))result=state;
  else if(path.endsWith('/pulse'))result={pulse:'fixed'};
  else if(path.endsWith('/feed'))result={entries:[]};
  else if(path.endsWith('/private/race')){
   result={id:Date.now()+600000,name:'確認用レース',closeAt:Date.now()+500000,hash:'fixture',order:[{number:3,name:'<img src=x onerror=alert(1)>',win:34,place:15},{number:1,name:'馬1',win:25,place:13}]};
  }else if(path.endsWith('/operation')){
   const body=route.request().postDataJSON();assert.equal(body.action,'private-casino');bodies.push(body.args);if(body.args.game!=='roulette'){state.cash+=124500;await route.fulfill({json:{result:{hand:null,done:{game:'video-poker',bet:500,hand:'royal',payout:125000,net:124500}},operationSource:'owner-casino'}});return;}assert.deepEqual(body.args,{game:'roulette',amount:500,number:7});ops++;await new Promise(r=>setTimeout(r,250));state.cash+=17500;result={result:{type:'number',choice:7,outcome:7,amount:500,payout:18000},operationSource:'owner-casino'};
  }else throw Error('Unexpected API '+path);
  await route.fulfill({json:result});
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8794');await page.locator('.title-start').click();await page.locator('.nav-btn[data-screen=assets]').click();
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
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:844});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 delete state.privateCasino;state.selfUserId='other';await page.reload();await page.locator('.title-start').click();await page.locator('.nav-btn[data-screen=assets]').click();assert.equal(await page.locator('.private-casino').count(),0);assert.equal(await page.locator('#private-number').count(),0);assert.deepEqual(errors,[]);
 console.log('Private casino passed ('+engine+'): owner controls, exact request, double-click guard, draft preservation, escaped race preview, no menu for other users, mobile/desktop. Fixture balances only.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.kill();});
