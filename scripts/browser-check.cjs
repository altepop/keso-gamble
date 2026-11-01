// Optional tooling: npm install --no-save playwright
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {existsSync}=require('node:fs');
const path=require('node:path');
const key='keso-exchange-v0.2';
const server=spawn('python3',['-m','http.server','8765','--bind','127.0.0.1'],{cwd:path.join(__dirname,'..'),stdio:'ignore'});
let browser;
const mediaCalls=[];
async function auditMedia(context){
 await context.exposeBinding('__recordMediaUse',(_source,method)=>mediaCalls.push(method));
 await context.addInitScript(()=>{
  const pending=[];
  const record=method=>{const call=window.__recordMediaUse(method);pending.push(call);return call;};
  window.__flushMediaAudit=()=>Promise.all(pending);
  const forbidden=method=>function(){record(method);throw Error('Unexpected media activation: '+method);};
  const session={get type(){return 'auto';},set type(_value){record('audioSession.type=');}};
  Object.defineProperty(navigator,'audioSession',{configurable:true,get(){record('navigator.audioSession');return session;}});
  for(const name of ['Audio','AudioContext','webkitAudioContext','RTCPeerConnection'])
   Object.defineProperty(window,name,{configurable:true,value:forbidden(name)});
  HTMLMediaElement.prototype.play=forbidden('HTMLMediaElement.play');
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{
   getUserMedia:forbidden('getUserMedia'),getDisplayMedia:forbidden('getDisplayMedia'),
  }});
  Object.defineProperty(navigator,'mediaSession',{configurable:true,get(){record('navigator.mediaSession');return {};}});
 });
}
(async()=>{
 for(let i=0;i<50;i++){try{const r=await fetch('http://127.0.0.1:8765');if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const executablePath=process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
 browser=await chromium.launch({executablePath,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await auditMedia(context);
 const errors=[];
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 const a=await context.newPage();await a.goto('http://127.0.0.1:8765');assert.match(await a.locator('h1').innerText(),/KESO PLAY/);await a.locator('.title-start').click();
 await a.locator('.nav-btn[data-screen=race]').click();await a.locator('.sub-tab[data-screen=market]').click();
 await a.locator('[data-open]').first().focus();await a.keyboard.press('Enter');await a.locator('[role=dialog]').waitFor();
 const ma=a.locator('[data-action=toggle-ma]');await ma.click();await assert.equal(await ma.getAttribute('aria-pressed'),'false');assert.equal(await a.locator('.chart-panel path').count(),0);
 await a.keyboard.press('Escape');assert.equal(await a.locator('[role=dialog]').count(),0);
 await a.locator('#trade-qty').fill('4');assert.match(await a.locator('#trade-estimate').innerText(),/4,848 KP/);
 const b=await context.newPage();await b.goto('http://127.0.0.1:8765');await b.locator('.title-start').click();await b.locator('.nav-btn[data-screen=race]').click();await b.locator('.sub-tab[data-screen=market]').click();await b.locator('#trade-qty').fill('4');
 await Promise.all([a.locator('[data-action=trade]').click(),b.locator('[data-action=trade]').click()]);
 await a.waitForFunction(k=>JSON.parse(localStorage.getItem(k))?.trades.length===2,key,{timeout:8000}).catch(async e=>{console.error({errors,stored:await a.evaluate(k=>localStorage.getItem(k),key),toast:await a.locator('.toast').innerText(),other:await b.locator('.toast').innerText()});throw e});
 let saved=await a.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);assert.equal(saved.cash,304);assert.equal(saved.holdings.keso,8);
 await a.locator('#trade-qty').fill('');await a.locator('[data-action=trade]').click();await a.locator('.toast').filter({hasText:'株数は'}).waitFor();saved=await a.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);assert.equal(saved.trades.length,2);
 for(const x of [a,b])await x.locator('.nav-btn[data-screen=assets]').click(); // the demo top-up is on 資産
 await a.locator('summary').click();await b.locator('summary').click();
 await Promise.all([a.locator('[data-action=salary]').click(),b.locator('[data-action=salary]').click()]);await a.waitForFunction(k=>JSON.parse(localStorage.getItem(k))?.salaryClaims===1,key);
 saved=await a.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);assert.equal(saved.cash,904);
 await a.locator('.nav-btn[data-screen=race]').click();await a.locator('.sub-tab[data-screen=market]').click();await a.locator('[data-screen=casino]').click();assert.equal(await a.locator('[data-number]').count(),37);assert.equal(await a.locator('[data-pocket]').count(),37);assert.equal(await a.locator('.number-cell.selected').count(),18);await a.locator('[data-bet=column2]').click();assert.equal(await a.locator('.number-cell.selected').count(),12);assert.equal(await a.locator('.wheel-pocket.selected').count(),12);await a.locator('[data-number="0"]').click();await a.locator('[data-number="7"]').click();await a.locator('#number-stake-0').fill('200');await a.locator('#number-stake-7').fill('300');assert.equal(await a.locator('#number-bet-total').textContent(),'500 KP');assert.equal(await a.locator('.number-cell.selected').count(),2);assert.equal(await a.locator('.wheel-pocket.selected').count(),2);await a.locator('[data-action=spin]').click();await a.waitForFunction(k=>JSON.parse(localStorage.getItem(k))?.spins.length===1,key);assert.deepEqual(await a.evaluate(k=>JSON.parse(localStorage.getItem(k)).spins[0].bets,key),[{number:0,amount:200},{number:7,amount:300}]);await a.waitForTimeout(1900);
 await a.clock.install();await a.locator('.nav-btn[data-screen=race]').click();await a.locator('.sub-tab[data-screen=market]').click();await a.locator('#trade-qty').fill('3');await a.clock.fastForward(75000);assert.equal(await a.locator('#trade-qty').inputValue(),'3');
 for(const width of [320,390,1280]){await a.setViewportSize({width,height:844});assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 const blocked=await browser.newContext();await auditMedia(blocked);const p=await blocked.newPage();p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw Error('blocked')}}));await p.goto('http://127.0.0.1:8765');await p.locator('.title-start').click();await p.locator('.nav-btn[data-screen=assets]').click();await p.locator('summary').click();await p.locator('[data-action=salary]').click();await p.locator('.toast').filter({hasText:'テスト用KP'}).waitFor();await p.locator('.nav-btn[data-screen=race]').click();await p.locator('.sub-tab[data-screen=market]').click();await p.locator('#trade-qty').fill('1');await p.locator('[data-action=trade]').click();await p.locator('.toast').filter({hasText:'買付した'}).waitFor();
 const gameContext=await browser.newContext({viewport:{width:390,height:844}});await auditMedia(gameContext);const g=await gameContext.newPage();g.on('pageerror',e=>errors.push(e.message));await g.goto('http://127.0.0.1:8765');await g.locator('.title-start').click();
 // Luxury is discoverable in demo mode, but purchases never touch the demo wallet.
 await g.locator('.nav-btn[data-screen=directives]').click();
 await g.locator('.sub-tab[data-screen=shop]').click();
 assert.equal(await g.locator('.screen').getAttribute('data-view'),'shop');
 assert.equal(await g.locator('[data-action=luxury]').count(),7);
 assert.equal(await g.locator('[data-action=luxury]:disabled').count(),7);
 assert.match(await g.locator('.asset-card').innerText(),/商品一覧のプレビュー/);
 await g.locator('.sub-tab[data-screen=directives]').click();
 assert.equal(await g.locator('.screen').getAttribute('data-view'),'directives');
 await g.locator('.nav-btn[data-screen=home]').click();
 assert.match(await g.locator('#app').innerText(),/保有KP[\s\S]*発令中の指令/);assert.doesNotMatch(await g.locator('#app').innerText(),/日経|TOPIX/);
 await g.locator('.nav-btn[data-screen=play]').click();await g.locator('#claim-reference').fill('match-001');await g.locator('[data-action=submit-claim]').click();await g.locator('[data-approve]').waitFor();
 let gameState=await g.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);assert.equal(gameState.cash,10000);await g.locator('[data-approve]').click();await g.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).cash===10500,key);
 await g.locator('#claim-activity').selectOption('steam');await g.locator('#claim-game').fill('Portal 2');await g.locator('#claim-achievement').fill('<img src=x onerror=alert(1)>');await g.locator('#claim-reference').fill('proof-001');await g.locator('[data-action=submit-claim]').click();await g.locator('[data-approve]').click();await g.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).cash===11300,key);assert.equal(await g.locator('.history-entry img').count(),0);
 await g.locator('.nav-btn[data-screen=directives]').click();await g.locator('#directive-target').selectOption('riso');await g.locator('#directive-task').selectOption('unrated');await g.locator('[data-action=issue-directive]').click();await g.locator('[data-complete]').waitFor();gameState=await g.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);assert.equal(gameState.cash,8800);assert.equal(gameState.directives[0].status,'active');
 await g.locator('[data-complete]').click();await g.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).directives[0].status==='completed',key);await g.reload();await g.locator('.title-start').click();await g.locator('.nav-btn[data-screen=directives]').click();assert.match(await g.locator('#app').innerText(),/達成済み/);
 for(const screen of ['home','play','race','directives','assets']){await g.locator(`.nav-btn[data-screen=${screen}]`).click();await g.setViewportSize({width:320,height:844});assert.equal(await g.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,screen);}
 await g.locator('.nav-btn[data-screen=assets]').click();await g.locator('.title-back').click();await g.locator('.title-screen').waitFor();assert.equal((await g.evaluate(k=>JSON.parse(localStorage.getItem(k)),key)).cash,8800);await g.locator('.title-start').click();
 const resetContext=await browser.newContext();await auditMedia(resetContext);const resetPage=await resetContext.newPage();resetPage.on('pageerror',e=>errors.push(e.message));await resetPage.goto('http://127.0.0.1:8765');await resetPage.locator('.title-start').click();await resetPage.locator('.nav-btn[data-screen=race]').click();await resetPage.locator('.sub-tab[data-screen=market]').click();await resetPage.locator('#trade-qty').fill('3');await resetPage.locator('.nav-btn[data-screen=assets]').click();resetPage.once('dialog',dialog=>dialog.accept());await resetPage.locator('[data-action=reset]').click();await resetPage.locator('.nav-btn[data-screen=race]').click();await resetPage.locator('.sub-tab[data-screen=market]').click();await resetPage.waitForFunction(()=>document.querySelector('#trade-qty')?.value==='1');
 const raceContext=await browser.newContext({viewport:{width:390,height:844}});await auditMedia(raceContext);const r=await raceContext.newPage();r.on('pageerror',e=>errors.push(e.message));
 await r.clock.install({time:new Date('2026-10-27T12:05:30Z')});await r.goto('http://127.0.0.1:8765');await r.locator('.title-start').click();await r.locator('.nav-btn[data-screen=race]').click();await r.locator('.sub-tab[data-screen=market]').click();await r.locator('.sub-tab[data-screen=race]').click();
 assert.match(await r.locator('.race-card h3').innerText(),/21:15発走/);assert.equal(await r.locator('[data-race-horse]').count(),8);assert.match(await r.locator('.race-stage').innerText(),/メインレース/);
 await r.locator('[data-race-horse="3"]').click();await r.locator('#race-amount').fill('150');await r.locator('[data-action=race-bet]').click();await r.locator('.toast').filter({hasText:'100 KP単位'}).waitFor();
 await r.locator('#race-amount').fill('1000');assert.match(await r.locator('#race-preview').innerText(),/当たれば/);await r.locator('[data-action=race-bet]').click();await r.locator('.toast').filter({hasText:'馬券を買いました'}).waitFor();
 let raceState=await r.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);assert.equal(raceState.cash,9000);assert.equal(raceState.raceBets[0].status,'pending');assert.equal(raceState.raceBets[0].horse,3);
 await r.clock.fastForward(9*60000+45000);await r.locator('#race-canvas').waitFor();assert.match(await r.locator('#race-clock').innerText(),/発走から/);
 await r.clock.fastForward(60000);await r.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).raceBets[0].status!=='pending',key);
 raceState=await r.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);assert.equal(raceState.cash,9000+raceState.raceBets[0].payout);assert.match(await r.locator('.race-result').innerText(),/着順/);
 await r.clock.fastForward(15*60000);await r.locator('.race-stage').filter({hasText:'21:30発走'}).waitFor(); // the next race (a named night race runs even without bets)
 for(const width of [320,390,1280]){await r.setViewportSize({width,height:844});assert.equal(await r.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'race '+width);}
 assert.deepEqual(errors,[]);
 // Confirm the probe is active, so a missing instrumentation hook cannot pass silently.
 for(const ctx of browser.contexts())for(const page of ctx.pages())await page.evaluate(()=>window.__flushMediaAudit());
 await g.evaluate(async()=>{const session=navigator.audioSession;session.type='ambient';await window.__flushMediaAudit();});
 assert.deepEqual(mediaCalls.splice(-2),['navigator.audioSession','audioSession.type=']);
 assert.deepEqual(mediaCalls,[],'Game flows must not read/change audio sessions, create playback/capture, or open WebRTC');
 console.log('Browser checks passed: no audio-session access, media playback/capture or WebRTC during game flows; play claims and payouts, Steam text escaping, directives and completion persistence, concurrent orders/salaries, race bets and settlement, storage failure, drafts, chart toggles, keyboard, spin persistence, mobile layouts.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
