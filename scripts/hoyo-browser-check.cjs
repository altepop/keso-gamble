const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const server=spawn('python3',['-m','http.server','8814','--bind','127.0.0.1'],{cwd:require('node:path').join(__dirname,'..'),stdio:'ignore'});let browser;
(async()=>{
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:8814')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const {createInitialState}=await import('../js/engine.js');
 const state={...createInitialState(),serverWallet:true,cash:1234,selfUserId:'fixture-member',members:[],ledger:[]};
 const engine=process.argv[2]||'chromium';browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{}:{...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{channel:'chromium'}),args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 await ctx.addInitScript(()=>localStorage.setItem('keso-kp-session-v1','fixture-wallet-secret'));
 let profiles=[],links=0,failLink=true,operations=0,upstream=0;
 await ctx.route('https://enka.network/**',async route=>{upstream++;await route.abort();});
 await ctx.route('https://valorant-results.tealeaforest.workers.dev/api/kp/**',async route=>{
  const path=new URL(route.request().url()).pathname;let result;
  assert.equal(route.request().headers().authorization,'Bearer fixture-wallet-secret');
  if(path.endsWith('/state'))result=state;
  else if(path.endsWith('/pulse'))result={pulse:'fixed'};
  else if(path.endsWith('/feed'))result={entries:[]};
  else if(path.endsWith('/hoyo/link')){
   links++;const body=route.request().postDataJSON();assert.equal(body.game,'genshin');assert.equal(body.uid,'618285856');
   if(failLink){failLink=false;await route.fulfill({status:400,json:{error:'公開プロフィールを取得できません。'}});return;}
   profiles=[{game:'genshin',uid:body.uid,snapshot:{nickname:'Fixture <img src=x onerror=alert(1)>',accountLevel:60,achievements:123,characters:[]},changes:[],updatedAt:Date.now(),nextAt:Date.now()+600000}];result={profiles};
  }else if(path.endsWith('/hoyo/unlink')){assert.equal(route.request().postDataJSON().game,'genshin');profiles=[];result={profiles};}
  else if(path.endsWith('/hoyo/status'))result={profiles,rewardsEnabled:false,ownershipVerified:false};
  else if(path.endsWith('/operation')){operations++;throw Error('Hoyo never changes wallet');}
  else throw Error('Unexpected API '+path);
  await route.fulfill({json:result});
 });
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8814');await page.locator('.title-start').click();await page.locator('.nav-btn[data-screen=play]').click();
 await page.locator('[data-action=hoyo-status]').click();await page.locator('#hoyo-uid-genshin').fill('618285856');
 await page.locator('[data-action=hoyo-link][data-game=genshin]').click();await page.getByText('公開プロフィールを取得できません。',{exact:true}).waitFor();
 assert.equal(await page.locator('#hoyo-uid-genshin').inputValue(),'618285856','failed lookup keeps the UID for retry');
 await page.locator('[data-action=hoyo-link][data-game=genshin]').click();await page.getByText('Fixture <img src=x onerror=alert(1)>',{exact:false}).waitFor();
 assert.equal(await page.locator('[data-action=hoyo-refresh][data-game=genshin]').isDisabled(),true);assert.equal(await page.locator('.history-entry img').count(),0);
 await page.locator('.nav-btn[data-screen=home]').click();await page.locator('.nav-btn[data-screen=play]').click();
 await page.getByText('Fixture <img src=x onerror=alert(1)>',{exact:false}).waitFor();
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 await page.locator('[data-action=hoyo-unlink][data-game=genshin]').click();await page.locator('[data-action=hoyo-refresh][data-game=genshin]').waitFor({state:'detached'});assert.equal(await page.locator('[data-action=hoyo-refresh][data-game=genshin]').count(),0);
 assert.equal(links,2);assert.equal(upstream,0);assert.equal(operations,0);assert.equal(state.cash,1234);assert.deepEqual(errors,[]);
 console.log('Hoyo browser passed ('+engine+'): mobile navigation, registration error/retry, escaped profile, cache controls, unlink and no wallet mutation.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.kill();});
