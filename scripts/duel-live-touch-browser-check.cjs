// Production Activity's actual click handler, with a mocked KP Worker. Never touches D1.
const {chromium,webkit}=require('playwright');
const {spawn}=require('node:child_process');
const {existsSync}=require('node:fs');
const {resolve}=require('node:path');
const assert=require('node:assert/strict');
const engine=process.argv[2]==='webkit'?'webkit':'chromium';
const port=8890,root=resolve(__dirname,'..');
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
let browser;
(async()=>{
 const {createInitialState}=await import('../js/engine.js');
 const {initialDuelBoard,playDuelMove}=await import('../js/duel-rules.js');
 const state={...createInitialState(),cash:20000,serverWallet:true,selfUserId:'one',members:[{id:'one',name:'自分'},{id:'two',name:'対戦相手'}],claims:[],directives:[]};
 let room={id:'duel-gomoku-test',guild:'test',user_a:'one',user_b:'two',black_user:'one',turn_user:'one',game:'gomoku',stake:1000,status:'active',
  board:initialDuelBoard('gomoku'),winner:null,version:0,deadline_at:Date.now()+600000};
 const operations=[],errors=[];
 for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:'+port+'/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{}:{executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:engine==='webkit',hasTouch:true,reducedMotion:'reduce'});
 await ctx.addInitScript(()=>{localStorage.setItem('keso-kp-session-v1','a'.repeat(48));});
 await ctx.route('https://valorant-results.tealeaforest.workers.dev/api/kp/**',async route=>{
  const p=new URL(route.request().url()).pathname;
  let response;
  if(p.endsWith('/state'))response=state;
  else if(p.endsWith('/pulse'))response={pulse:'test'};
  else if(p.endsWith('/feed'))response={entries:[]};
  else if(p.endsWith('/duels')){
   if(route.request().method()==='POST'){
    const body=route.request().postDataJSON();operations.push(body);
    assert.equal(body.action,'move');assert.equal(body.version,room.version);
    assert.equal(body.cell,112);
    const next=playDuelMove('gomoku',room.board,'B',body.cell);
    room={...room,board:next.board,turn_user:'two',version:room.version+1};
    response={match:room};
   }else response={matches:[room],members:state.members,games:{gomoku:{name:'五目並べ'}}};
  }else throw Error('Unexpected KP endpoint: '+p);
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'domcontentloaded'});
 await page.locator('.title-start').click();
 await page.locator('.nav-btn[data-screen=race]').click();
 await page.locator('.sub-tab[data-screen=duels]').click();
 await page.locator('[data-duel-board-scroll]').waitFor();
 assert.equal(await page.locator('.screen').getAttribute('data-view'),'duels');
 assert.equal(await page.locator('.community-feed').count(),0,'no global feed above the board');
 assert.equal(await page.locator('.duel-current').count(),1);
 assert.equal(await page.locator('.duel-create-collapse').count(),1);
 assert.equal(await page.locator('.duel-create-collapse').evaluate(el=>el.open),false);
 const viewport=page.locator('[data-duel-board-scroll]');
 const before=await viewport.evaluate(el=>({left:el.scrollLeft,top:el.scrollTop}));
 assert.ok(before.left>0&&before.top>0,'pan viewport starts centered');
 const cell=page.locator('[data-duel-cell="112"]');
 assert.ok((await cell.boundingBox()).width>=42,'44px touch target');
 await cell.click();
 assert.equal(operations.length,0,'tap must not spend KP or send a move');
 assert.equal(await page.locator('.duel-preview-cell').count(),1);
 assert.match(await page.locator('.duel-gomoku-selection').innerText(),/8行 8列/);
 const after=await viewport.evaluate(el=>({left:el.scrollLeft,top:el.scrollTop}));
 assert.ok(Math.abs(before.left-after.left)<3&&Math.abs(before.top-after.top)<3,'render preserves pan');
 await page.locator('[data-duel-cancel-cell]').click();
 assert.equal(operations.length,0,'cancel never sends a move');
 assert.equal(await page.locator('.duel-preview-cell').count(),0);
 await page.locator('[data-duel-cell="112"]').click();
 await page.locator('[data-duel-confirm-cell="112"]').click();
 await page.locator('.duel-square.black[data-duel-cell="112"]').waitFor();
 assert.equal(operations.length,1,'one confirmation means exactly one server operation');
 assert.equal(room.version,1);
 assert.equal(room.board[112],'B');
 assert.equal(await page.locator('.duel-gomoku-selection [data-duel-confirm-cell]').count(),0,'new turn clears preview');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');
 assert.deepEqual(errors,[],'no browser errors');
 console.log('PRODUCTION DUEL GOMOKU OK ('+engine+'): no request on preview/cancel, one server-authoritative move on confirm, scroll stable, active room first.');
 await ctx.close();
})().catch(e=>{console.error('PRODUCTION DUEL GOMOKU FAILED ('+engine+')',e);process.exitCode=1}).finally(async()=>{await browser?.close();server.kill();});
