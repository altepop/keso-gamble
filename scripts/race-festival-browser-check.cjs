// Real Activity UI with a mocked wallet; no production bets or announcements.
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process'),{createHash}=require('node:crypto');
const server=spawn('python3',['-m','http.server','8821','--bind','127.0.0.1'],{cwd:require('node:path').join(__dirname,'..'),stdio:'ignore'});let browser;
(async()=>{
 const R=await import('../js/racing.js'),{createInitialState}=await import('../js/engine.js');
 let race=R.FESTIVAL_FROM;while(!R.festivalRace(race))race+=R.RACE_INTERVAL;
 const now=race-120000,seed='festival-browser-run',payoutSeed='festival-browser-payout',hash=s=>createHash('sha256').update(s).digest('hex');
 const state={...createInitialState(now),cash:10000,serverWallet:true,selfUserId:'fixture-member',members:[],ledger:[],claims:[],directives:[],horses:[],racing:{open:{id:race,hash:hash(seed),festival:{hash:hash(payoutSeed)}},watch:{id:race-R.RACE_INTERVAL,runs:false}}};
 const errors=[],bets=[];
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:8821')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const engine=process.argv[2]||'chromium';browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{}:{...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{channel:'chromium'}),args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 await ctx.addInitScript(()=>localStorage.setItem('keso-kp-session-v1','fixture-wallet-secret'));
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await ctx.route('https://valorant-results.tealeaforest.workers.dev/api/kp/**',async route=>{
  const path=new URL(route.request().url()).pathname;let body;
  if(path.endsWith('/state'))body=state;
  else if(path.endsWith('/pulse'))body={pulse:'fixed'};
  else if(path.endsWith('/feed'))body={entries:[]};
  else if(path.endsWith('/operation')){
   const op=route.request().postDataJSON();assert.equal(op.action,'race-bet');assert.equal(bets.length,0);assert.equal(op.args.amount,1000);assert.equal(op.args.raceId,race);
   bets.push(op);const bet={id:op.id,...op.args,festival:true,odds:null,status:'pending',payout:0,time:now};state.raceBets=[bet];state.cash-=1000;body={result:{bet}};
  }else throw Error('Unexpected endpoint '+path);
  await route.fulfill({json:body});
 });
 await page.clock.install({time:now});await page.goto('http://127.0.0.1:8821');await page.locator('.title-start').dispatchEvent('click');await page.locator('.home-summary').waitFor();
 const go=async()=>{await page.locator('.nav-btn[data-screen=race]').dispatchEvent('click');await page.locator('.sub-tab[data-screen=race]').dispatchEvent('click');};await go();
 const card=page.locator('.race-card');await card.waitFor();assert.match(await card.innerText(),/一枚で億り人杯/);assert.match(await card.innerText(),/最大1億KP/);assert.equal(await page.locator('#race-amount').inputValue(),'1000');assert.equal(await page.locator('#race-amount').getAttribute('readonly'),'');
 assert.doesNotMatch(await card.innerText(),/\d+\.\d倍/);assert.equal(await page.locator('[data-race-amount]').count(),0);
 await page.locator('[data-race-horse="2"]').dispatchEvent('click');await page.locator('[data-race-type=place]').dispatchEvent('click');
 await page.locator('[data-action=race-bet]').dispatchEvent('click');await page.locator('.toast').filter({hasText:'馬券を買いました'}).waitFor();
 assert.equal(await page.locator('[data-action=race-bet]').isDisabled(),true);assert.match(await page.locator('body').innerText(),/倍率非公開/);assert.equal(bets.length,1);
 state.racing={open:{id:race+R.RACE_INTERVAL,hash:'f'.repeat(64)},watch:{id:race,runs:true,hash:hash(seed),seed,festival:{hash:hash(payoutSeed)}}};
 await page.clock.fastForward(125000);await page.locator('#race-canvas').waitFor();assert.match(await page.locator('.race-stage').innerText(),/一枚勝負/);assert.doesNotMatch(await page.locator('.race-stage').innerText(),/秘蔵倍率 ×/);
 state.racing.watch.festival={hash:hash(payoutSeed),seed:payoutSeed,factor:R.festivalFactor(payoutSeed)};
 await page.clock.fastForward(R.RUN_MS+20000);await page.locator('.race-festival-banner').filter({hasText:'秘蔵倍率'}).waitFor();await page.locator('.race-festival-banner').filter({hasText:'事前のハッシュ・抽選倍率と一致'}).waitFor();
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 assert.deepEqual(errors,[]);console.log(engine+': festival purchase, fixed stake, one ticket UI, hidden odds, goal reveal, verified commitment and responsive layout passed.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
