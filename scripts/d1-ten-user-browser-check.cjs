// Controlled, ZERO-D1 load regression: ten real Activity browsers against
// in-memory Worker API fixtures. This does not contact a live Cloudflare DB.
// It checks network growth and freshness while keeping purchase semantics
// tested in the existing browser/Worker suites.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {existsSync}=require('node:fs');
const {join}=require('node:path');
const server=spawn('python3',['-m','http.server','8797','--bind','127.0.0.1'],{cwd:join(__dirname,'..'),stdio:'ignore'});
let browser;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:8797')).ok)break;}catch{}await sleep(100);}
 const {createInitialState}=await import('../js/engine.js');
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 const contexts=[],pages=[],counters=[],identities=[];
 const baseTime=Date.parse('2026-11-01T13:00:00+09:00');
 for(let i=0;i<10;i++){
  const id=String(100000000000000101n+BigInt(i)),token=String(i).padStart(48,'a');
  const state={...createInitialState(baseTime),serverWallet:true,cash:15000+i*1000,selfUserId:id,claims:[],directives:[],ledger:[],members:[]};
  const item={id,token,state,pulse:'version-1',stateReads:0,pulseReads:0,feedReads:0,ops:0,errors:[]};
  identities.push(item);
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  contexts.push(context);
  await context.addInitScript(t=>localStorage.setItem('keso-kp-session-v1',t),token);
  await context.route('https://valorant-results.tealeaforest.workers.dev/api/kp/**',async route=>{
   assert.equal(route.request().headers().authorization,'Bearer '+token,'separate member sessions cannot mix');
   const endpoint=new URL(route.request().url()).pathname;
   if(endpoint.endsWith('/state')){item.stateReads++;return route.fulfill({json:item.state});}
   if(endpoint.endsWith('/pulse')){item.pulseReads++;return route.fulfill({json:{pulse:item.pulse}});}
   if(endpoint.endsWith('/feed')){item.feedReads++;return route.fulfill({json:{entries:[],revision:0}});}
   if(endpoint.endsWith('/operation')){item.ops++;throw Error('No real or fake purchases allowed in load test');}
   throw Error('Unexpected API '+endpoint);
  });
  const page=await context.newPage();pages.push(page);
  page.on('pageerror',error=>item.errors.push(error.message));
  await page.clock.install({time:baseTime});
  await page.goto('http://127.0.0.1:8797');
  await page.locator('.title-start').click();
  await page.locator('[data-screen=market]').first().click();
  assert.equal(await page.locator('.screen').getAttribute('data-view'),'market','market remains interactive');
  assert.equal(await page.locator('.community-feed').getAttribute('open'),null,'background market feed starts collapsed');
  counters.push({atStart:item.stateReads,feedAtStart:item.feedReads});
 }
 // All ten sessions remain visible. A static pulse should not cause ten
 // heavy full-state snapshots on each 15-second tick.
 await Promise.all(pages.map(page=>page.clock.runFor(30_000)));
 for(let i=0;i<10;i++){
  const member=identities[i];
  assert.ok(member.pulseReads>=2&&member.pulseReads<=3,'2 fifteen-second pulses per active client: '+i+' actual '+member.pulseReads);
  assert.ok(member.stateReads-counters[i].atStart<=2,'no state fetch on every pulse, member '+i);
  assert.equal(member.feedReads,counters[i].feedAtStart,'a closed optional community history does not poll in market');
  assert.deepEqual(member.errors,[],'page '+i+' must not error');
 }
 // Change the wallet of just one user and verify a single fresh full state.
 // Unchanged other users must never inherit that member's balance revision.
 const before=identities.map(m=>m.stateReads);
 identities[0].state.cash+=500;
 identities[0].pulse='version-2';
 await Promise.all(pages.map(page=>page.clock.runFor(15_000)));
 assert.equal(identities[0].stateReads,before[0]+1,'external wallet change is reflected by next 15-second pulse');
 for(let i=1;i<10;i++)assert.equal(identities[i].stateReads,before[i],'unchanged member '+i+' does not reload');
 for(const size of [1,3,5,10]){
  const selection=identities.slice(0,size);
  const total=(key)=>selection.reduce((n,m)=>n+m[key],0);
  const initial=counters.slice(0,size).reduce((n,c)=>n+c.atStart,0);
  console.log('D1_LOAD_FIXTURE clients='+size+' pulses='+total('pulseReads')+' full_states_after_initial='+(total('stateReads')-initial)+' optional_feed_reads_during_market=0 operations='+total('ops'));
 }
 assert.equal(identities.reduce((n,m)=>n+m.ops,0),0,'no write endpoints in synthetic load test');
 console.log('D1 ten-client Activity regression passed: real browser tabs, 15s per-member wallet freshness, no unnecessary heavy state or community feed, zero production D1 calls.');
})().catch(err=>{console.error(err);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
