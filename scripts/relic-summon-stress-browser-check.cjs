// Reproduces a user's 30 rapid paid summon taps. A click burst may settle at most one charge.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const {resolve}=require('node:path');
const {existsSync}=require('node:fs');
const root=resolve(__dirname,'..');
const server=spawn('python3',['-m','http.server','8772','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
let browser;
(async()=>{
 for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:8772')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const {createInitialState}=await import('../js/engine.js');
 const state={...createInitialState(),cash:500000,serverWallet:true,selfUserId:'member-one',
  relics:{totalSummons:0,items:{},equipped:[],summonHistory:[]}};
 const seen=[],bills=new Map();
 const errors=[];
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(()=>localStorage.setItem('keso-kp-session-v1','b'.repeat(48)));
 const page=await context.newPage();
 page.on('pageerror',err=>errors.push(err.message));
 await page.route('https://valorant-results.tealeaforest.workers.dev/api/kp/**',async route=>{
  const url=new URL(route.request().url());
  const endpoint=url.pathname;
  const reply=async data=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  if(endpoint.endsWith('/state'))return reply(state);
  if(endpoint.endsWith('/pulse'))return reply({pulse:String(state.cash)});
  if(endpoint.endsWith('/feed'))return reply({entries:[],revision:0});
  if(endpoint.endsWith('/relics'))return reply({catalog:[],unite:[],previews:[],ratesByLevel:[],milestones:[0,300,750,1350,2100,3000,4050,5250,6600,8100]});
  if(endpoint.endsWith('/operation')){
   const body=route.request().postDataJSON();
   assert.equal(body.action,'relic-summon');
   if(!bills.has(body.id)){
    seen.push(body);
    await new Promise(r=>setTimeout(r,250));
    const count=body.args.count,cost=count*200;
    state.cash-=cost;state.relics.totalSummons+=count;
    const result={count,cost,summary:{uncommon:count},highlights:[],mutations:[],foils:[],start:state.relics.totalSummons-count+1,end:state.relics.totalSummons};
    state.relics.summonHistory.unshift(result);
    bills.set(body.id,{result});
   }
   return reply(bills.get(body.id));
  }
  throw Error('Unexpected endpoint '+endpoint);
 });
 await page.goto('http://127.0.0.1:8772');
 await page.locator('.title-start').filter({hasText:'500,000'}).click();
 await page.locator('.nav-btn[data-screen=directives]').click();
 await page.locator('.sub-tab[data-screen=relics]').click();
 await page.locator('[data-action=relic-tab][data-tab=summon]').click();
 const target='[data-action="relic-summon"][data-count="10"]';
 await page.locator(target).waitFor();
 await page.evaluate(sel=>{
  for(let i=0;i<30;i++)document.querySelector(sel)?.click();
 },target);
 await page.getByText('召喚を処理中', {exact:false}).waitFor();
 assert.equal(await page.locator(target).isDisabled(),true,'purchase must lock immediately');
 await page.locator('.relic-reveal-close').waitFor();
 assert.equal(seen.length,1,'30 fast taps must send exactly one paid operation');
 assert.equal(state.cash,498000);
 assert.equal(state.relics.totalSummons,10);
 await page.evaluate(sel=>{for(let i=0;i<20;i++)document.querySelector(sel)?.click();},target);
 assert.equal(seen.length,1,'open result cannot create another charge');
 // Keep the result open longer than the gap: on a slow device the gap must still count from closing, not from the tap.
 await page.waitForTimeout(1300);
 await page.locator('.relic-reveal-close').click();
 await page.locator(target).click();
 assert.equal(seen.length,1,'the cooldown prevents an immediate repeat after closing');
 await page.waitForTimeout(1300);
 await page.locator(target).click();
 await page.locator('.relic-reveal-close').waitFor();
 assert.equal(seen.length,2,'a subsequent deliberate tap settles one more draw');
 assert.equal(state.cash,496000);
 assert.equal(state.relics.totalSummons,20);
 assert.equal(new Set(seen.map(x=>x.id)).size,2,'every charge has a distinct id');
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('Passed rapid summon stress: 30+20 taps are one charge, post-reveal cooldown, later purchase, no duplicate IDs or page errors');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
