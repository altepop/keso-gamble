// The real Activity receives other members' transactions while a betting/order form stays untouched.
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{existsSync}=require('node:fs');
const server=spawn('python3',['-m','http.server','8793','--bind','127.0.0.1'],{cwd:require('node:path').join(__dirname,'..'),stdio:'ignore'});let browser;
(async()=>{
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:8793')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const {createInitialState}=await import('../js/engine.js'),state={...createInitialState(),serverWallet:true,cash:24000,selfUserId:'one',members:[],ledger:[]};
 const engine=process.argv[2]||'chromium';browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{}:{executablePath:existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined,args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});await ctx.addInitScript(()=>localStorage.setItem('keso-kp-session-v1','a'.repeat(48)));
 let calls=0,fail=false,ops=0;const entries=[];
 await ctx.route('https://valorant-results.tealeaforest.workers.dev/api/kp/**',async route=>{
  assert.equal(route.request().headers().authorization,'Bearer '+'a'.repeat(48));const path=new URL(route.request().url()).pathname;
  let result;
  if(path.endsWith('/state'))result=state;
  else if(path.endsWith('/pulse'))result={pulse:'fixed'};
  else if(path.endsWith('/feed')){calls++;if(fail)return route.fulfill({status:503,json:{error:'一時停止'}});result={entries};}
  else{ops++;throw Error('Unexpected endpoint '+path);}
  await route.fulfill({json:result});
 });
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install();
 await page.goto('http://127.0.0.1:8793');await page.locator('.title-start').filter({hasText:'24,000'}).click();
 assert.equal(await page.locator('.community-feed').getAttribute('open'),'');
 entries.push({id:'other-1',name:'相手<img src=x onerror=alert(1)>',label:'株を購入',detail:'keso · 2株 × 1,200 KP',amount:2400,time:Date.now()});
 await page.clock.fastForward(5000);await page.locator('.community-entry').waitFor();assert.match(await page.locator('.community-entry').innerText(),/相手<img/);assert.equal(await page.locator('.community-entry img').count(),0);
 await page.locator('[data-screen=market]').first().click();await page.locator('#trade-qty').fill('7');await page.evaluate(()=>window.heldOrder=document.querySelector('#trade-qty'));
 entries.unshift({id:'other-2',name:'別の人',label:'競馬にベット',detail:'12便 · 単勝 · 3番',amount:500,time:Date.now()});
 await page.clock.fastForward(5000);await page.locator('.community-entry').filter({hasText:'別の人'}).waitFor();
 assert.equal(await page.evaluate(()=>window.heldOrder===document.querySelector('#trade-qty')),true);assert.equal(await page.locator('#trade-qty').inputValue(),'7');
 fail=true;await page.clock.fastForward(5000);await page.locator('.community-status').filter({hasText:'再接続'}).waitFor();assert.equal(await page.locator('.community-entry').count(),2);
 fail=false;await page.clock.fastForward(5000);await page.locator('.community-status').filter({hasText:'更新 '}).waitFor();
 await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,value:true}));const before=calls;await page.clock.fastForward(10000);assert.equal(calls,before);
 const resumed=page.waitForResponse(r=>r.url().endsWith('/feed'));await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await resumed;
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:844});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 assert.equal(ops,0);assert.deepEqual(errors,[]);console.log('Community feed passed ('+engine+'): other members, escaped names, 5-second updates, unchanged order input, network recovery, hidden pause, mobile/desktop, no charges.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.kill();});
