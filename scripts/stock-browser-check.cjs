// Optional local tooling: Playwright and Chromium.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {existsSync,mkdirSync}=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..'),port=18766;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});let browser;
(async()=>{
 for(let i=0;i<40;i++){try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844}}),errors=[];
 await context.addInitScript(()=>localStorage.setItem('keso-kp-session-v1','fixture-session'));
 const page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error('browser:',e.message);});let fixture;
 await page.route('https://valorant-results.tealeaforest.workers.dev/api/kp/**',async route=>{
  if(new URL(route.request().url()).pathname.endsWith('/feed'))return route.fulfill({json:{entries:[]}});
  if(route.request().url().includes('/state'))return route.fulfill({json:fixture,headers:{'Access-Control-Allow-Origin':'*'}});
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});
  return route.fulfill({json:{error:'fixture: no paid operations'},status:400,headers:{'Access-Control-Allow-Origin':'*'}});
 });
 // Build the real default shape once without touching any real wallet.
 const setup=await context.newPage();await setup.route('https://valorant-results.tealeaforest.workers.dev/**',route=>route.abort());await setup.goto(`http://127.0.0.1:${port}`);
 fixture=await setup.evaluate(async()=>{const {createInitialState}=await import('/js/engine.js');const s=createInitialState();s.cash=100000;s.serverWallet=true;s.holdings.keso=50;s.members=[{id:'100000000000000002',name:'テスト相手'}];s.selfUserId='100000000000000001';s.stockBenefits={percent:5,eligibleValue:60000};s.stockMarket={at:Date.now(),dividends:[{day:'2026-10-29',amount:500}],news:[{symbol:'keso',label:'VALORANTで勝利',bps:40,at:Date.now()}],ticks:[{at:Date.now()-300000,prices:{...s.prices,keso:1200}},{at:Date.now(),prices:{...s.prices,keso:1210}}]};s.prices.keso=1210;s.luxury={};s.horses=[];return s;});await setup.close();
 await page.goto(`http://127.0.0.1:${port}`);await page.locator('.title-start').filter({hasText:'100,000'}).waitFor();await page.locator('.title-start').click();await page.locator('[data-screen=market]').click();
 assert.match(await page.locator('.stock-panel').first().innerText(),/共通相場/);assert.match(await page.locator('.stock-panel').first().innerText(),/5%割引/);await page.locator('.stock-panel details summary').click();assert.match(await page.locator('.stock-panel').first().innerText(),/500 KP/);
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'stocks '+width);}
 await page.setViewportSize({width:390,height:844});if(process.env.STOCK_SCREENSHOTS){mkdirSync(process.env.STOCK_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.STOCK_SCREENSHOTS,'market.png'),fullPage:true});}
 await page.locator('[data-open=keso]').click();await page.locator('[role=dialog]').waitFor({timeout:5000}).catch(async e=>{console.error('toast:',await page.locator('.toast').innerText());throw e;});assert.match(await page.locator('[role=dialog]').innerText(),/共通相場の履歴/);assert.equal(await page.locator('.depth-section').count(),0);await page.keyboard.press('Escape');
 await page.locator('[data-screen=directives]').first().click();assert.match(await page.locator('#app').innerText(),/7,600 KP/);assert.match(await page.locator('#app').innerText(),/株主優待/);
 await page.locator('[data-screen=shop]').click();assert.match(await page.locator('#app').innerText(),/19,000 KP/);
 let question;page.once('dialog',async d=>{question=d.message();await d.dismiss();});await page.locator('[data-action=luxury][data-item=title]').click();assert.match(question,/19,000/);
 assert.deepEqual(errors,[]);console.log('Stock UI passed: live shared quotes, dividends, discounts, actual history, no fake order book, 320/390/1280 widths. No paid operations.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
