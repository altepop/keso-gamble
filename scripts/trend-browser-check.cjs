// 資産 → メンバーのKP推移 against a mocked Worker API: loads on demand, 7日/30日, sort by person (and reverse),
// highlight a member, tap a day for everyone's KP, 借KP below 0, names escaped, and no overflow at 320/390/1280.
const {chromium}=require('playwright');const assert=require('node:assert/strict');const {spawn}=require('node:child_process');const {existsSync}=require('node:fs');const path=require('node:path');
const port=18771,server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:path.join(__dirname,'..'),stdio:'ignore'});let browser;
(async()=>{
 const {createInitialState}=await import('../js/engine.js');
 const state={...createInitialState(),cash:5000,serverWallet:true,selfUserId:'101',members:[],claims:[],directives:[]};
 const days=n=>Array.from({length:n},(_,i)=>`10/${31-n+i}`);
 const members=n=>[
  {id:'101',name:'アルテ',balance:5000,debt:0,points:Array.from({length:n},(_,i)=>1000+i*500)},
  {id:'102',name:'<b>ばく</b>',balance:0,debt:400,points:Array.from({length:n},(_,i)=>i===n-1?-400:300)},
  {id:'103',name:'こみち',balance:9000,debt:0,points:Array.from({length:n},()=>9000)},
 ];
 const calls=[];
 for(let i=0;i<40;i++){try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await ctx.addInitScript(()=>{localStorage.setItem('keso-kp-session-v1','a'.repeat(48));for(const name of ['Audio','AudioContext','RTCPeerConnection'])Object.defineProperty(window,name,{value:()=>{throw Error('media requested')}});});
 await ctx.route('https://valorant-results.tealeaforest.workers.dev/api/kp/**',async route=>{
  const url=new URL(route.request().url()),p=url.pathname;let result;
  if(p.endsWith('/feed'))result={entries:[]};
  else if(p.endsWith('/state'))result=state;
  else if(p.endsWith('/pulse'))result={pulse:'p1'};
  else if(p.endsWith('/trend')){const n=Number(url.searchParams.get('days'));calls.push(n);result={days:days(n),members:members(n),at:Date.parse('2026-10-29T21:00:00+09:00')};}
  else return route.fulfill({status:404,json:{error:'unexpected '+p}});
  await route.fulfill({json:result});
 });
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(8000);
 await page.goto(`http://127.0.0.1:${port}`);await page.locator('.title-start').click();
 await page.locator('.nav-btn[data-screen=assets]').click();
 await page.locator('.trend-card').waitFor();
 assert.equal(calls.length,0,'nothing is loaded until a period is chosen');
 await page.locator('[data-action=load-trend][data-days="7"]').click();
 await page.locator('.trend-chart').waitFor();assert.deepEqual(calls,[7]);
 assert.equal(await page.locator('.trend-chart polyline').count(),3);
 const names=async()=>page.locator('.trend-row .trend-name').evaluateAll(els=>els.map(e=>e.childNodes[0].textContent.trim()));
 // 今のKP, largest first; 借KP counts below 0 and is shown with the name; the name is text, not markup.
 assert.deepEqual(await names(),['こみち','アルテ','<b>ばく</b>']);
 assert.match(await page.locator('.trend-row').nth(2).innerText(),/借KP 400 KP[\s\S]*−400 KP/);
 assert.equal(await page.locator('.trend-row b').count(),0);
 // Sort by change, then reverse it by tapping the same key; by name.
 await page.locator('[data-trend-sort=change]').click();assert.deepEqual(await names(),['アルテ','こみち','<b>ばく</b>']);
 assert.match(await page.locator('.trend-row').first().innerText(),/\+3,000/);
 await page.locator('[data-trend-sort=change]').click();assert.deepEqual(await names(),['<b>ばく</b>','こみち','アルテ']);
 assert.match(await page.locator('[data-trend-sort=change]').innerText(),/↑/);
 await page.locator('[data-trend-sort=name]').click();assert.equal((await names()).length,3);
 // Colors follow the member, not the order: re-sorting keeps each line's color.
 const keyOf=async name=>page.locator('.trend-row',{hasText:name}).locator('.trend-key').evaluate(e=>e.style.background);
 const before=await keyOf('こみち');await page.locator('[data-trend-sort=now]').click();assert.equal(await keyOf('こみち'),before);
 // Highlight one member; tapping again clears it.
 await page.locator('.trend-row',{hasText:'アルテ'}).click();
 assert.equal(await page.locator('.trend-row.active').count(),1);assert.equal(await page.locator('.trend-chart polyline[opacity="0.22"]').count(),2);
 await page.locator('.trend-row',{hasText:'アルテ'}).click();assert.equal(await page.locator('.trend-row.active').count(),0);
 // Tap a day on the chart: everyone's KP that day.
 const box=await page.locator('.trend-chart').boundingBox();
 await page.mouse.click(box.x+box.width*(44+268/6)/320,box.y+box.height/2);
 await page.locator('.trend-readout strong').waitFor();
 assert.match(await page.locator('.trend-readout').innerText(),/10\/25の終わり[\s\S]*こみち 9,000 KP[\s\S]*アルテ 1,500 KP[\s\S]*ばく<\/b> 300 KP/);
 // 30日.
 await page.locator('[data-action=load-trend][data-days="30"]').click();
 await page.locator('.trend-range button.active[data-days="30"]').waitFor();await page.locator('.trend-chart').waitFor();
 assert.deepEqual(calls,[7,30]);assert.match(await page.locator('.trend-chart').getAttribute('aria-label'),/10\/1〜10\/30/);
 for(const width of [320,390,1280]){
  await page.setViewportSize({width,height:844});
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`no overflow at ${width}px`);
  const chart=await page.locator('.trend-chart').boundingBox(),card=await page.locator('.trend-card').boundingBox();
  assert.ok(chart.x>=card.x&&chart.x+chart.width<=card.x+card.width+0.5,`chart inside the card at ${width}px`);
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('.trend-card').screenshot({path:process.env.TREND_SHOT||path.join(require('node:os').tmpdir(),'trend-card.png')});
 assert.deepEqual(errors,[]);
 console.log('KP trend passed: on-demand load, 7/30 days, sort by now/change/name and reverse, stable colors, highlight, day readout, escaped names, 320/390/1280 widths.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.kill()});
