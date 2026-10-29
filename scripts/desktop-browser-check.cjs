// Exercise the actual Activity at desktop widths and after narrowing the same window.
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {existsSync,mkdirSync}=require('node:fs');
const {spawn}=require('node:child_process');
const {resolve}=require('node:path');
const root=resolve(__dirname,'..'),port=8792;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
let browser;
(async()=>{
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:'+port)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const {createInitialState}=await import('../js/engine.js');
 const base=createInitialState(),state={...base,serverWallet:true,cash:24000,selfUserId:'one',members:[{id:'one',name:'本人'},{id:'two',name:'相手'}],ledger:[],voiceRewards:{enabled:true,connected:true,amount:15,dailyCap:720,earned:0},quizRates:{DAILY:100,SOLO:50},quizCompleted:[],rewardRates:{competitive:{win:900,loss:-200,bottom:-400}},mleague:{day:'2026-10-29',fixtures:[1,2].map(table=>({id:'layout-'+table,date:'2026-10-29',table,game:1,start:Date.now()+3600000,status:'open',teams:['チームA','チームB'],players:[1,2,3,4].map(n=>({name:'選手'+table+'-'+n,teamName:'チームA',odds:40,sitting:true}))}))}};
 const errors=[],engineName=process.argv[2]||process.env.PLAYWRIGHT_BROWSER||'chromium';
 browser=await (engineName==='webkit'?webkit:chromium).launch(engineName==='webkit'?{}:{executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await ctx.addInitScript(()=>localStorage.setItem('keso-kp-session-v1','desktop-layout-fixture'));
 let operations=0;
 await ctx.route('https://valorant-results.tealeaforest.workers.dev/api/kp/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/operation')){operations++;throw Error('Layout verification must not charge a wallet');}
  const result=path.endsWith('/state')?state:path.endsWith('/pulse')?{pulse:'fixed'}:null;
  assert.ok(result,'Unexpected API '+path);await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+port);await page.locator('.title-start').filter({hasText:'24,000'}).click();
 const capture=process.env.LAYOUT_SCREENSHOTS;if(capture)mkdirSync(capture,{recursive:true});
 const bounds=selector=>page.locator(selector).first().boundingBox();
 async function fit(view,width){
  await page.setViewportSize({width,height:1000});
  await page.waitForFunction(width=>{
   const screen=document.querySelector('.screen'),nav=document.querySelector('.bottom-inner');
   const expected=width>=1024?'none':width>=720?'680px':'520px';
   return innerWidth===width&&getComputedStyle(screen).maxWidth===expected&&Math.abs(screen.getBoundingClientRect().width-nav.getBoundingClientRect().width)<2;
  },width);
  const sizes=await page.evaluate(()=>({screen:document.querySelector('.screen').getBoundingClientRect().width,nav:document.querySelector('.bottom-inner').getBoundingClientRect().width,client:document.documentElement.clientWidth,overflow:document.documentElement.scrollWidth>innerWidth}));
  if(width>=1024)assert.ok(Math.abs(sizes.screen-sizes.client)<2,view+' fills desktop width '+width);
  else assert.ok(sizes.screen<=(width<720?520:680)+1,view+' keeps its narrow layout');
  assert.equal(sizes.overflow,false,view+' horizontal overflow '+width);
 }
 async function sideBySide(left,right,label){const a=await bounds(left),b=await bounds(right);assert.ok(a&&b,label+' exists');assert.ok(Math.abs(b.x-a.x-a.width-18)<2&&Math.abs(b.y-a.y)<2,label+' has adjacent desktop columns');}
 for(const view of ['home','play','race','mleague','market','casino','directives','stable','shop','assets']){
  const direct=page.locator(`.nav-btn[data-screen="${view}"]`);
  if(await direct.count())await direct.click();else{
   const group=['stable','shop'].includes(view)?'directives':'race';await page.locator(`.nav-btn[data-screen="${group}"]`).click();await page.locator(`.sub-tab[data-screen="${view}"]`).click();
  }
  await page.locator(`.screen[data-view="${view}"]`).waitFor();
  for(const width of [320,390,768,1023,1024,1440,1920])await fit(view,width);
  await page.setViewportSize({width:1440,height:1000});
  if(view==='play')await sideBySide('.screen>.panel:nth-of-type(1)','.screen>.panel:nth-of-type(2)','reward cards');
  if(view==='race')await sideBySide('.race-stage','.screen>.trade-box','race and betting');
  if(view==='market'){
   await sideBySide('.screen>.list','.screen>.trade-box','stocks and order');
   await page.locator('#trade-qty').fill('7');await page.setViewportSize({width:390,height:1000});assert.equal(await page.locator('#trade-qty').inputValue(),'7');
   await page.setViewportSize({width:1440,height:1000});assert.equal(await page.locator('#trade-qty').inputValue(),'7');
   await page.locator('.row[data-open]').first().click();const sheet=await bounds('.sheet');assert.ok(sheet.width>680&&sheet.x>=0&&sheet.x+sheet.width<=1440);await page.locator('[data-close]').first().click();
  }
  if(view==='mleague'){
   await sideBySide('.ml-card:nth-child(1)','.ml-card:nth-child(2)','M-League fixtures');
   await page.locator('.ml-pick').first().click();await sideBySide('.ml-order','.ml-order+.asset-list','prediction and history');
  }
  if(view==='directives')await sideBySide('.screen>.trade-box','.screen>.panel','directive and history');
  if(view==='casino'){
   await sideBySide('.center-panel','.number-table','roulette and numbers');
   for(const game of ['chinchiro','blackjack','mines','slot','poker','baccarat']){
    await page.locator(`[data-casino-game="${game}"]`).click();await sideBySide('.casino-arena','.casino-controls',game+' and controls');
    await fit(game,390);await fit(game,1440);
   }
  }
  if(capture&&['home','market','casino'].includes(view))await page.screenshot({path:resolve(capture,view+'-'+engineName+'.png'),fullPage:true});
 }
 assert.equal(operations,0);assert.deepEqual(errors,[]);
 console.log('Wide layout passed ('+engineName+'): ten screens, all seven casino games, 320–1920px, desktop columns, modal, resize without losing input, no charges.');
 await ctx.close();
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.kill();});
