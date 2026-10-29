const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{existsSync}=require('node:fs');
const server=spawn('python3',['-m','http.server','8813','--bind','127.0.0.1'],{cwd:require('node:path').join(__dirname,'..'),stdio:'ignore'});let browser;
(async()=>{
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:8813')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const {createInitialState}=await import('../js/engine.js');const state={...createInitialState(),serverWallet:true,cash:0,selfUserId:'fixture-member',members:[],ledger:[]};
 const engine=process.argv[2]||'chromium';browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{}:{executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});await ctx.addInitScript(()=>localStorage.setItem('keso-kp-session-v1','fixture-wallet-secret'));
 const status={available:true,enabled:false,account:null,apps:[{id:123,title:'Game <img src=x onerror=alert(1)>'}],games:[]};const link={state:'fixture-state',url:'https://steamcommunity.com/openid/login?fixture=1'};let verified=false,operations=0,failGame=true;
 await ctx.route('https://steamcommunity.com/**',async route=>{assert(!route.request().headers().authorization);assert(!route.request().url().includes('fixture-wallet-secret'));await route.fulfill({contentType:'text/html',body:'Steam login fixture'});});
 await ctx.route('https://valorant-results.tealeaforest.workers.dev/api/kp/**',async route=>{
  const path=new URL(route.request().url()).pathname;let result;
  assert.equal(route.request().headers().authorization,'Bearer fixture-wallet-secret');
  if(path.endsWith('/state'))result=state;
  else if(path.endsWith('/pulse'))result={pulse:'fixed'};
  else if(path.endsWith('/feed'))result={entries:[]};
  else if(path.endsWith('/steam/status'))result=status;
  else if(path.endsWith('/steam/link'))result=link;
  else if(path.endsWith('/steam/pending'))result={verified,steamId:verified?'76561198000000001':null,confirmed:false};
  else if(path.endsWith('/steam/confirm')){assert.equal(route.request().postDataJSON().state,link.state);status.account={steamId:'76561198000000001',active:true};result=status;}
  else if(path.endsWith('/steam/game')){if(failGame){failGame=false;await route.fulfill({status:400,json:{error:'Steamのゲーム詳細を公開してください。'}});return;}const body=route.request().postDataJSON();assert.equal(body.app,123);status.games=[{app:123,active:body.active,lastChecked:Date.now(),error:null}];result=status;}
  else if(path.endsWith('/steam/disconnect')){status.account.active=false;status.games[0].active=false;result={disconnected:true};}
  else if(path.endsWith('/operation')){operations++;throw Error('Steam never places a casino bet');}
  else throw Error('Unexpected API '+path);
  await route.fulfill({json:result});
 });
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.goto('http://127.0.0.1:8813');await page.locator('.title-start').click();await page.locator('.nav-btn[data-screen=play]').click();
 await page.locator('[data-action=steam-status]').click();await page.getByText('現在は入金されません。',{exact:false}).waitFor();await page.locator('[data-action=steam-link]').click();
 const popupPromise=page.waitForEvent('popup');await page.locator('[data-action=steam-open]').click();const popup=await popupPromise;await popup.waitForLoadState();assert.match(popup.url(),/^https:\/\/steamcommunity.com\/openid\/login/);await popup.close();assert.match(page.url(),/^http:\/\/127\.0\.0\.1/);
 // Recover the outstanding challenge across a mobile Activity reload.
 await page.reload();await page.locator('.title-start').click();await page.locator('.nav-btn[data-screen=play]').click();verified=true;await page.locator('[data-action=steam-status]').click();await page.locator('[data-action=steam-confirm]').click();await page.locator('[data-action=steam-game]').waitFor();
 await page.locator('[data-action=steam-game]').click();await page.getByText('Steamのゲーム詳細を公開してください。',{exact:true}).waitFor();await page.locator('[data-action=steam-game]').click();await page.getByText('監視中',{exact:false}).waitFor();assert.equal(await page.locator('.history-entry img').count(),0);
 status.enabled=true;state.cash=5000;state.ledger=[{id:'fixture-entry',kind:'steam',label:'Steam実績',detail:'Test achievement',delta:5000,time:Date.now()}];await page.locator('.nav-btn[data-screen=assets]').click();await page.locator('[data-action=refresh-kp]').click();await page.locator('.nav-btn[data-screen=play]').click();await page.getByText('Test achievement',{exact:false}).waitFor();
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await page.locator('[data-action=steam-status]').click();await page.locator('[data-action=steam-disconnect]').click();await page.locator('[data-action=steam-link]').waitFor();assert.equal(state.cash,5000);assert.equal(operations,0);assert.deepEqual(errors,[]);
 console.log('Steam browser passed ('+engine+'): external login, reload recovery, explicit confirmation, game selection, error/retry, ledger, mobile widths and disconnect without wallet changes.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.kill();});
