// Run real Activity duel views against CPU in a mobile browser. No KP, Discord or D1 API.
const {chromium,webkit}=require('playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const {existsSync}=require('node:fs');
const {resolve}=require('node:path');
const engine=process.argv[2]==='webkit'?'webkit':'chromium';
const root=resolve(__dirname,'..'),port=8891,url='http://127.0.0.1:'+port+'/duel-demo.html?cpu=1';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
let browser;const errors=[],requests=[];
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await (engine==='webkit'?webkit:chromium).launch(engine==='chromium'?
  {executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']}:{});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:engine==='webkit',reducedMotion:'reduce'});
 const page=await context.newPage();
 page.on('pageerror',err=>errors.push(err.message));
 page.on('request',req=>{if(/api\/kp|\.workers\.dev|discord\.com/.test(req.url()))requests.push(req.url());});
 await page.goto(url,{waitUntil:'networkidle'});
 assert.equal(await page.locator('body.cpu-practice').count(),1);
 assert.match(await page.locator('#demo-notice').innerText(),/実KPは変動せず/);
 assert.match(await page.locator('.duel-players').innerText(),/CPU/);
 assert.equal(await page.locator('[data-duel-act=accept]').count(),0);
 assert.equal(await page.locator('.duel-create-collapse:visible').count(),0);
 async function mode(value){
  await page.locator('#demo-mode').selectOption(value);
  await page.locator('#demo-cpu-level').selectOption('strong');
  assert.match(await page.locator('.duel-arena').innerText(),/CPU/);
  assert.equal(await page.locator('#demo-app .badge').first().innerText(),'19,000 KP');
 }
 const after=async()=>page.waitForFunction(()=>!document.querySelector('#demo-feedback')?.textContent.includes('考えています'),null,{timeout:12000});
 await mode('othello');
 await page.locator('.duel-square.available').first().click();await after();
 assert.equal((await page.locator('.duel-counts').innerText()).includes('黒'),true);
 assert.equal((await page.locator('.duel-square.black').count())+(await page.locator('.duel-square.white').count()),6);
 await mode('gomoku');
 await page.locator('[data-duel-cell="112"]').click();
 await page.locator('[data-duel-confirm-cell="112"]').click();await after();
 assert.match(await page.locator('.duel-counts').innerText(),/黒 1/);
 assert.match(await page.locator('.duel-counts').innerText(),/白 1/);
 await mode('connect4');
 await page.locator('[data-duel-cell="3"]').click();await after();
 assert.equal(await page.locator('.duel-connect4-space.a').count(),1);
 assert.equal(await page.locator('.duel-connect4-space.b').count(),1);
 await mode('hitblow');
 await page.locator('#duel-guess').fill('0123');
 await page.locator('[data-duel-mini=hitblow]').click();await after();
 assert.ok((await page.locator('.duel-guess-row').count())>=1);
 await mode('bluffdice');
 await page.locator('#duel-bid-count').selectOption('10');
 await page.locator('#duel-bid-face').selectOption('6');
 await page.locator('[data-duel-mini=bid]').click();await after();
 assert.ok((await page.locator('.duel-mini-round').count())>=1);
 await mode('poker');
 await page.locator('[data-duel-mini=poker]').click();await after();
 assert.equal(await page.locator('.duel-showdown').count(),1);
 assert.match(await page.locator('.duel-showdown').innerText(),/カード公開/);
 await page.locator('#demo-reset').click();
 assert.equal(await page.locator('.duel-state').count(),1);
 assert.equal(await page.locator('.duel-showdown').count(),0);
 await page.locator('[data-demo-play=two]').click();
 assert.equal(await page.locator('body.cpu-practice').count(),0);
 assert.equal(await page.locator('#duel-game option').count(),6);
 await page.locator('[data-demo-play=cpu]').click();
 assert.equal(await page.locator('body.cpu-practice').count(),1);
 assert.deepEqual(errors,[],'console page errors');
 assert.deepEqual(requests,[],'practice never sends API requests');
 console.log('6 CPU modes passed in',engine,'with no network KP requests');
})().catch(err=>{console.error(err);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
