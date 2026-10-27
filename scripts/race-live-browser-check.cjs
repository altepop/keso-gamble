// Live-wallet racing in the browser against a mocked Worker API: betting, seed reveal and hash proof.
const {chromium}=require('playwright');const assert=require('node:assert/strict');const {spawn}=require('node:child_process');const {existsSync}=require('node:fs');const {createHash}=require('node:crypto');
const server=spawn('python3',['-m','http.server','8767','--bind','127.0.0.1'],{stdio:'ignore'});let browser;
(async()=>{
 const {createInitialState}=await import('../js/engine.js');const R=await import('../js/racing.js');
 const T0=Date.parse('2026-10-27T16:05:30+09:00'),RACE=Date.parse('2026-10-27T16:15:00+09:00');
 const seed='server-seed-for-browser-check',hash=createHash('sha256').update(seed).digest('hex'),nextHash='f'.repeat(64);
 const state={...createInitialState(T0),cash:5000,serverWallet:true,selfUserId:'one',members:[{id:'one',name:'本人'}],claims:[],directives:[],racing:{open:{id:RACE,hash,crown:'本人戦犯レース'},watch:{id:RACE-R.RACE_INTERVAL,runs:false}},roastLevel:'full'};
 const bodies=[];const errors=[];let stateCalls=0;
 for(let n=0;n<40;n++){try{if((await fetch('http://127.0.0.1:8767')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:390,height:844}});
 await ctx.addInitScript(()=>{for(const name of ['Audio','AudioContext','RTCPeerConnection'])Object.defineProperty(window,name,{value:()=>{throw Error('media requested')}});});
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await ctx.route('https://valorant-results.tealeaforest.workers.dev/api/kp/**',async route=>{
  const path=new URL(route.request().url()).pathname;let result;
  if(path.endsWith('auth'))result={token:'a'.repeat(48)};
  else if(path.endsWith('state')){stateCalls++;result=state;}
  else{const body=route.request().postDataJSON();bodies.push(body);if(body.action==='roast-level'){state.roastLevel=body.args.level;result={result:{roastLevel:body.args.level}};}else{assert.equal(body.action,'race-bet');result={result:{bet:R.placeRaceBet(state,body.args,T0+1000)}};}}
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.clock.install({time:T0});
 await page.goto('http://127.0.0.1:8767');await page.locator('#kp-connect-code').fill('c'.repeat(48));await page.locator('[data-action=connect-kp]').click();await page.locator('.kp-connection').waitFor();
 await page.locator('.nav-btn[data-screen=market]').click();await page.locator('.sub-tab[data-screen=race]').click();
 assert.match(await page.locator('.race-card').innerText(),new RegExp(hash.slice(0,16)));
 assert.match(await page.locator('.race-card h3').innerText(),/本人戦犯レース/);
 assert.equal(await page.locator('[data-action=roast-level][aria-pressed=true]').getAttribute('data-level'),'full');
 await page.locator('[data-action=roast-level][data-level=normal]').click();await page.locator('.toast').filter({hasText:'煽りレベル'}).waitFor();
 const roast=bodies.shift();assert.equal(roast.action,'roast-level');assert.deepEqual(roast.args,{level:'normal'});
 assert.equal(await page.locator('[data-action=roast-level][aria-pressed=true]').getAttribute('data-level'),'normal');
 assert.match(await page.locator('.race-stage').innerText(),/不成立/);
 await page.locator('[data-race-horse="2"]').click();await page.locator('[data-race-type=place]').click();await page.locator('#race-amount').fill('500');await page.locator('[data-action=race-bet]').click();
 await page.locator('.toast').filter({hasText:'馬券を買いました'}).waitFor();
 assert.deepEqual(bodies.map(b=>b.args),[{raceId:RACE,type:'place',horse:2,amount:500}]);
 assert.match(await page.locator('.badge').first().innerText(),/4,500/);
 assert.equal(await page.evaluate(()=>localStorage.getItem('keso-exchange-v0.2')),null);
 // The race starts: the server now reveals the seed for it.
 state.racing={open:{id:RACE+R.RACE_INTERVAL,hash:nextHash},watch:{id:RACE,runs:true,hash,seed}};
 const calls=stateCalls;await page.clock.fastForward(RACE-T0+5000);
 await page.locator('#race-canvas').waitFor();assert.ok(stateCalls>calls,'a new race triggers an immediate refresh');
 await page.locator('.race-proof').filter({hasText:'一致'}).waitFor();
 assert.doesNotMatch(await page.locator('.race-proof').innerText(),/一致しません/);
 // Settlement by the cron arrives with the next refresh.
 const result=R.raceResult(R.raceCard(RACE),seed);R.settleRaceBets(state,RACE+R.RUN_MS,()=>seed);
 await page.clock.fastForward(R.RUN_MS+20000);await page.locator('[data-action=refresh-kp]').click();
 await page.locator('.race-result').waitFor();
 assert.match(await page.locator('.history-entry').first().innerText(),result.order.slice(0,3).includes(2)?/的中/:/外れ/);
 // A seed that does not match its published hash is reported, not silently trusted.
 state.racing.watch={...state.racing.watch,hash:'0'.repeat(64)};await page.locator('[data-action=refresh-kp]').click();
 await page.locator('.race-proof').filter({hasText:'一致しません'}).waitFor();
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 assert.deepEqual(errors,[]);console.log('Live racing flow passed: server bet request, no demo save, hash shown before close, immediate seed fetch at the start, verified proof, settlement display, tampered seed warning, mobile layout.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.kill()});
