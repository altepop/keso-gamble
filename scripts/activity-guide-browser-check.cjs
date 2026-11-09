// Browser regression for the standalone guide: no bets or wallet writes during onboarding.
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {resolve}=require('node:path');
const {existsSync}=require('node:fs');
const root=resolve(__dirname,'..'),port=8797;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
let browser;
(async()=>{
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:'+port)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const engine=process.argv[2]==='webkit'?webkit:chromium;
 browser=await engine.launch(engine===chromium?{executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']}:{});
 const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await ctx.addInitScript(()=>{window.__kesoGuideTestTour=true;});
 const page=await ctx.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 let writes=0;
 await page.route('**/api/kp/operation',async route=>{writes++;await route.abort();});
 await page.goto('http://127.0.0.1:'+port+'/');
 await page.getByRole('button',{name:/デモで試す/}).click();
 const modal=page.locator('.keso-guide-dialog');
 await modal.waitFor();
 assert.match(await modal.textContent(),/STEP 1 \/ 5/);
 for(let step=1;step<5;step++){
  await page.locator('[data-guide-next]').click();
  assert.match(await modal.textContent(),new RegExp('STEP '+(step+1)+' \\/ 5'));
 }
 await page.locator('[data-guide-finish]').click();
 assert.match(await modal.textContent(),/まずはここから/);
 const all=await page.locator('#keso-guide-select option').allTextContents();
 assert.ok(all.some(x=>x.includes('Mリーグ')));
 assert.ok(all.some(x=>x.includes('遺物')));
 assert.ok(all.some(x=>x.includes('マインズ')));
 assert.equal(all.length,31);
 await page.locator('#keso-guide-select').selectOption('mines');
 assert.match(await modal.textContent(),/5×5の盤面/);
 await page.locator('[data-guide-go="mines"]').click();
 await page.waitForSelector('.casino-games [data-casino-game="mines"].active');
 assert.equal(await page.locator('[data-guide-overlay]').count(),0);
 await page.locator('#keso-guide-trigger').click();
 assert.match(await modal.textContent(),/地雷を避けながら/);
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('[data-guide-overlay]').count(),0);
 await page.reload();
 await page.getByRole('button',{name:/デモで試す/}).click();
 assert.equal(await page.locator('[data-guide-overlay]').count(),0,'first-run guide should be shown once per device');
 assert.equal(writes,0,'guide must not write to wallet');
 assert.deepEqual(errors,[],'guide should not throw');
 // A returning player whose browser storage was not kept (Discord does not always keep it between launches) must
 // not get the first-run tour again: their KP account already has play in it.
 const returning=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await returning.addInitScript(()=>{window.__kesoGuideTestTour=true;});
 const {createInitialState}=await import('../js/engine.js');
 await returning.route('https://valorant-results.tealeaforest.workers.dev/api/kp/**',async route=>{
  const p=new URL(route.request().url()).pathname;
  if(p.endsWith('/feed'))return route.fulfill({json:{entries:[]}});
  if(p.endsWith('/auth'))return route.fulfill({json:{token:'a'.repeat(48)}});
  if(p.endsWith('/state'))return route.fulfill({json:{...createInitialState(),cash:4200,serverWallet:true,selfUserId:'one',members:[],claims:[],directives:[]}});
  if(p.endsWith('/pulse'))return route.fulfill({json:{pulse:'p'}});
  return route.fulfill({status:404,json:{error:'unexpected'}});
 });
 const back=await returning.newPage();back.on('pageerror',error=>errors.push(error.message));
 await back.goto('http://127.0.0.1:'+port+'/');
 await back.locator('#kp-connect-code').fill('c'.repeat(48));await back.locator('[data-action=connect-kp]').click();
 await back.locator('.home-summary').waitFor();await back.waitForTimeout(300);
 assert.equal(await back.locator('[data-guide-overlay]').count(),0,'a returning KP account never gets the first-run tour');
 assert.equal(await back.evaluate(()=>localStorage.getItem('keso-guide-first-tour-20261103-v1')),'1');
 await returning.close();
 assert.deepEqual(errors,[],'guide should not throw');
 console.log('Activity guide browser smoke OK ('+(engine===webkit?'WebKit':'Chromium')+')');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
