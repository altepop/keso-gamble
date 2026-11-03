// Live-wallet racing in the browser against a mocked Worker API: betting, seed reveal and hash proof.
const {chromium}=require('playwright');const assert=require('node:assert/strict');const {spawn}=require('node:child_process');const {existsSync}=require('node:fs');const {createHash}=require('node:crypto');
const server=spawn('python3',['-m','http.server','8767','--bind','127.0.0.1'],{stdio:'ignore'});let browser;
(async()=>{
 const {createInitialState}=await import('../js/engine.js');const R=await import('../js/racing.js');
 const T0=Date.parse('2026-10-27T16:05:30+09:00'),RACE=Date.parse('2026-10-27T16:15:00+09:00');
 const seed='server-seed-for-browser-check',hash=createHash('sha256').update(seed).digest('hex'),nextHash='f'.repeat(64);
 const state={...createInitialState(T0),cash:5000,serverWallet:true,selfUserId:'one',members:[{id:'one',name:'本人'},{id:'two',name:'相手'}],luxury:{title:null,convicts:[{user:'two',name:'相手<b>x</b>'}],billboard:{horseName:'看板<i>馬</i>',ownerName:'本人',until:T0+86400000},statues:[]},claims:[],directives:[],racing:{open:{id:RACE,hash,crown:'本人戦犯レース',entries:[{horseId:'person-two',name:'相手号',ability:-0.9,style:3,owner:'two',ownerName:'相手',person:true},{horseId:'horse-1',name:'<img src=x onerror=alert(1)>号',ability:0.4,style:2,owner:'one',ownerName:'本人',nickname:'歩く戦犯'}]},watch:{id:RACE-R.RACE_INTERVAL,runs:false}},roastLevel:'full',horses:[],exchange:{day:R.exchangeDay(T0),count:1}};
 const bodies=[];const errors=[];let stateCalls=0;
 for(let n=0;n<40;n++){try{if((await fetch('http://127.0.0.1:8767')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:390,height:844}});
 await ctx.addInitScript(()=>{for(const name of ['Audio','AudioContext','RTCPeerConnection'])Object.defineProperty(window,name,{value:()=>{throw Error('media requested')}});});
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await ctx.route('https://valorant-results.tealeaforest.workers.dev/api/kp/**',async route=>{
  if(new URL(route.request().url()).pathname.endsWith('/feed'))return route.fulfill({json:{entries:[]}});
  const path=new URL(route.request().url()).pathname;let result;
  if(path.endsWith('auth'))result={token:'a'.repeat(48)};
  else if(path.endsWith('state')){stateCalls++;result=state;}
  else if(path.endsWith('pulse'))result={pulse:JSON.stringify([state.cash,state.roastLevel,state.horses?.length,state.racing?.open?.id,state.racing?.watch?.id,state.raceBets?.length])};
  else{const body=route.request().postDataJSON();bodies.push(body);if(body.action==='roast-level'){state.roastLevel=body.args.level;result={result:{roastLevel:body.args.level}};}else if(body.action==='horse-buy'){const horse={id:'horse-2',name:body.args.name,grade:0,gradeLabel:'下級',style:1,races:0,wins:0,seconds:0,thirds:0,earnings:0,sellValue:600,racesLeft:20,retired_at:null};state.horses.push(horse);state.cash-=3000;state.exchange.count++;result={result:{horse}};}else if(body.action==='luxury'){state.cash-=50000;state.exchange.count++;result={result:{luxury:{id:'lux-1',item:body.args.item,target:body.args.target}}};}else if(body.action==='horse-sell'){state.horses=state.horses.filter(h=>h.id!==body.args.horseId);state.cash+=600;result={result:{sold:{id:body.args.horseId,refund:600}}};}else{assert.equal(body.action,'race-bet');result={result:{bet:R.placeRaceBet(state,body.args,T0+1000,state.racing.open.entries)}};}}
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.clock.install({time:T0});
 await page.goto('http://127.0.0.1:8767');await page.locator('#kp-connect-code').fill('c'.repeat(48));// dispatchEvent: the faked clock freezes animation frames, so Playwright's "stable" wait and pointer clicks are unreliable.
 const go=async(nav,sub)=>{await page.locator(`.nav-btn[data-screen=${nav}]`).dispatchEvent('click');if(sub)await page.locator(`.sub-tab[data-screen=${sub}]`).dispatchEvent('click');};
 const toRace=()=>go('race','race'),toStable=()=>go('directives','stable'),toShop=()=>go('directives','shop'),toAssets=()=>go('assets');
 // The account controls (残高を更新) live on 資産; come back to where the check continues.
 const refresh=async back=>{await toAssets();await page.locator('[data-action=refresh-kp]').dispatchEvent('click');await new Promise(r=>setTimeout(r,200));if(back)await back();}; // real-time wait: the page clock is faked
 await page.locator('[data-action=connect-kp]').click();await page.locator('.home-summary').waitFor();
 assert.match(await page.locator('.luxury-banner').innerText(),/本日の戦犯: 相手<b>x<\/b>[\s\S]*今週の看板馬: 看板<i>馬<\/i>（馬主 本人）/);assert.equal(await page.locator('.luxury-banner b, .luxury-banner i').count(),0);
 await toRace();
 assert.match(await page.locator('.race-card').innerText(),new RegExp(hash.slice(0,16)));
 assert.match(await page.locator('.race-card h3').innerText(),/本人戦犯レース/);
 assert.match(await page.locator('.race-card').innerText(),/馬主 本人 ·「歩く戦犯」/);assert.match(await page.locator('.race-card').innerText(),/相手号\s*本人の名前の馬（見舞金つき）/);assert.equal(await page.locator('.race-card img').count(),0,'owner-chosen names are escaped');
 const ownedNumber=R.raceCard(RACE,R.PUBLIC_SALT,state.racing.open.entries).horses.find(h=>h.horseId==='horse-1').number;
 assert.match(await page.locator(`[data-race-horse="${ownedNumber}"]`).innerText(),/onerror/);
 await toStable();
 assert.match(await page.locator('.asset-card').filter({hasText:'ボックスを開けると'}).innerText(),/今日の交換はあと2回/);
 await page.locator('#horse-name').fill('ケソ号');await page.locator('[data-action=horse-buy][data-box=normal]').click();await page.locator('.toast').filter({hasText:'仲間入り'}).waitFor();
 assert.deepEqual(bodies.shift().args,{box:'normal',name:'ケソ号'});
 assert.match(await page.locator('.asset-card').filter({hasText:'ボックスを開けると'}).innerText(),/ケソ号（下級/);assert.match(await page.locator('.asset-card').filter({hasText:'ボックスを開けると'}).innerText(),/今日の交換はあと1回/);
 // Discord iOS can swallow window.confirm. The horse sale must never need it.
 await page.evaluate(()=>{window.confirm=()=>{throw Error('native confirm is unavailable in Discord iOS');};});
 await page.locator('[data-action=horse-sell]').click();
 await page.locator('.horse-sale-confirmation').waitFor();
 assert.match(await page.locator('.horse-sale-confirmation').innerText(),/ケソ号.*600 KP.*取り消せません/s);
 assert.equal(bodies.length,0,'review must not submit a sale');
 await page.locator('[data-action=horse-sell-cancel]').click();
 assert.equal(await page.locator('.horse-sale-confirmation').count(),0);
 assert.equal(bodies.length,0,'cancel must not submit a sale');
 await page.locator('[data-action=horse-sell]').click();
 await page.locator('[data-action=horse-sell-approve]').click();
 await page.locator('.toast').filter({hasText:'売却'}).waitFor();
 assert.equal(await page.locator('.horse-sale-confirmation').count(),0);
 assert.equal(await page.locator('[data-action=horse-sell]').count(),0,'sold horse disappears');
 const sale=bodies.shift();assert.equal(sale.action,'horse-sell');assert.deepEqual(sale.args,{horseId:'horse-2'});
 await page.evaluate(()=>{window.confirm=()=>true;}); // Other purchase dialogs remain unchanged.
 state.cash=100000;await refresh(toShop);
 await page.locator('#lux-target').selectOption('two');page.once('dialog',d=>d.accept());await page.locator('[data-action=luxury][data-item=convict]').click();await page.locator('.toast').filter({hasText:'戦犯認定を買いました'}).waitFor();
 const lux=bodies.shift();assert.equal(lux.action,'luxury');assert.equal(lux.args.item,'convict');assert.equal(lux.args.target,'two');
 await toAssets();
 assert.equal(await page.locator('[data-action=roast-level][aria-pressed=true]').getAttribute('data-level'),'full');
 await page.locator('[data-action=roast-level][data-level=normal]').click();await page.locator('.toast').filter({hasText:'煽りレベル'}).waitFor();
 const roast=bodies.shift();assert.equal(roast.action,'roast-level');assert.deepEqual(roast.args,{level:'normal'});
 assert.equal(await page.locator('[data-action=roast-level][aria-pressed=true]').getAttribute('data-level'),'normal');
 await toRace();
 assert.match(await page.locator('.race-stage').innerText(),/不成立/);
 await page.locator('[data-race-horse="2"]').click();await page.locator('[data-race-type=place]').click();await page.locator('#race-amount').fill('500');await page.locator('[data-action=race-bet]').click();
 await page.locator('.toast').filter({hasText:'馬券を買いました'}).waitFor();
 assert.deepEqual(bodies.map(b=>b.args),[{raceId:RACE,type:'place',horse:2,amount:500}]);
 assert.match(await page.locator('.badge').first().innerText(),/49,500/,'100,000 - convict 50,000 - bet 500');
 assert.equal(await page.evaluate(()=>localStorage.getItem('keso-exchange-v0.2')),null);
 // The race starts: the server now reveals the seed for it.
 state.racing={open:{id:RACE+R.RACE_INTERVAL,hash:nextHash},watch:{id:RACE,runs:true,hash,seed}};
 const calls=stateCalls;await page.clock.fastForward(RACE-T0+5000);
 await page.locator('#race-canvas').waitFor();assert.ok(stateCalls>calls,'a new race triggers an immediate refresh');
 await page.locator('.race-proof').filter({hasText:'一致'}).waitFor();
 assert.doesNotMatch(await page.locator('.race-proof').innerText(),/一致しません/);
 // Settlement by the cron arrives with the next refresh.
 const result=R.raceResult(R.raceCard(RACE),seed);R.settleRaceBets(state,RACE+R.RUN_MS,()=>seed);
 await page.clock.fastForward(R.RUN_MS+20000);await refresh(toRace);
 await page.locator('.race-result').waitFor();
 assert.match(await page.locator('.history-entry').first().innerText(),result.order.slice(0,3).includes(2)?/的中/:/外れ/);
 // A seed that does not match its published hash is reported, not silently trusted.
 state.racing.watch={...state.racing.watch,hash:'0'.repeat(64)};await refresh(toRace);
 await page.locator('.race-proof').filter({hasText:'一致しません'}).waitFor();
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 assert.deepEqual(errors,[]);console.log('Live racing flow passed: server bet request, no demo save, hash shown before close, immediate seed fetch at the start, verified proof, settlement display, tampered seed warning, owner names escaped, box purchase and sale, luxury purchase and banners, mobile layout.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.kill()});
