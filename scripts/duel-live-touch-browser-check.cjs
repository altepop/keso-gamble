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
 const {connect4Board,connect4Move}=await import('../js/duel-mini-games.js');
 const state={...createInitialState(),cash:20000,serverWallet:true,selfUserId:'one',members:[{id:'one',name:'自分'},{id:'two',name:'対戦相手'}],claims:[],directives:[]};
 let room={id:'11111111-2222-4333-8444-555555555555',guild:'test',user_a:'one',user_b:'two',black_user:'one',turn_user:'one',game:'gomoku',stake:1000,status:'active',
  board:initialDuelBoard('gomoku'),winner:null,version:0,deadline_at:Date.now()+600000};
 const operations=[],errors=[];let liveHints=false,streams=0,duelReads=0,pveReads=0,pveAbandons=0,pveStarts=0;
 const pveId='22222222-3333-4333-8444-555555555555';let pveAbandoned=false,pveGame='othello',pveVersion=0,pveBoard=initialDuelBoard('othello'),pveMoves=0;
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
  else if(p.endsWith('/duels/operations/access'))response={available:false};
  else if(p.endsWith('/duels/rewards')){
   assert.equal(route.request().headers().authorization,'Bearer '+'a'.repeat(48));
   response={enabled:['pve','pvp'],skills:[{mode:'pve',game:'othello',wins:3,losses:1,draws:0}],collection:[]};
  }
  else if(p.endsWith('/duels/pve')){
   assert.equal(route.request().headers().authorization,'Bearer '+'a'.repeat(48));
   const data=route.request().method()==='GET'?null:route.request().postDataJSON();
   if(!data){pveReads++;assert.equal(new URL(route.request().url()).searchParams.get('session'),pveId);}
   else if(data.action==='abandon'){pveAbandons++;assert.equal(data.session,pveId);pveAbandoned=true;}
   else if(data.action==='move'){
    assert.equal(data.session,pveId);
    assert.equal(pveGame,'connect4');
    assert.equal(data.cell,0,'tapping the visible board sends the selected column');
    assert.equal(data.version,pveVersion);
    pveBoard=connect4Move(pveBoard,'a',0).board;
    pveBoard=connect4Move(pveBoard,'b',1).board;
    pveVersion++;pveMoves++;
   }else {
    assert.equal(data.action,'start');
    assert.ok(['othello','connect4'].includes(data.game),data.game);
    assert.equal(data.level,'normal');
    pveGame=data.game;pveVersion=0;pveBoard=pveGame==='connect4'?connect4Board():initialDuelBoard('othello');
    pveStarts++;pveAbandoned=false;
   }
   response={match:{id:pveId,game:pveGame,level:'normal',board:pveBoard,version:pveAbandoned?pveVersion+1:pveVersion,turn:pveAbandoned?'finished':'human',winner:null,humanMoves:pveMoves,cpuMoves:pveMoves,ownHand:null}};
  }
  else if(p.endsWith('/duels/history')){
    assert.equal(route.request().headers().authorization,'Bearer '+'a'.repeat(48));
    response={skills:[{mode:'pve',game:'othello',points:14,verified_games:4,wins:3},{mode:'pvp',game:'gomoku',points:7,verified_games:2,wins:1}],today:{game:'othello',level:'strong',started:1,finished:1,wins:1},history:[],sessions:[{id:pveId,game:'othello',level:'normal',updatedAt:Date.now(),status:pveAbandoned?'finished':'active'}]};
   }
   else if(p.endsWith('/duels/season/event'))response={event:{id:'2026-11-23',title:'週間ピックアップ：オセロ',game:'othello',kind:'weekly-focus',extraKp:0}};
  else if(p.endsWith('/duels/events')){
   assert.equal(route.request().headers().authorization,'Bearer '+'a'.repeat(48));
   if(!liveHints)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'SSE unavailable'})});
   streams++;
   return route.fulfill({status:200,contentType:'text/event-stream',
    body:': connected\n\ndata: '+JSON.stringify({id:room.id,version:room.version})+'\n\n'});
  }
  else if(p.endsWith('/duels')){
   if(route.request().method()==='POST'){
    const body=route.request().postDataJSON();operations.push(body);
    assert.equal(body.action,'move');assert.equal(body.version,room.version);
    assert.equal(body.cell,112);
    const next=playDuelMove('gomoku',room.board,'B',body.cell);
    room={...room,board:next.board,turn_user:'two',version:room.version+1};
    response={match:room};
   }else{duelReads++;response={matches:[room],members:state.members,games:{gomoku:{name:'五目並べ'}}};}
  }else throw Error('Unexpected KP endpoint: '+p);
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'domcontentloaded'});
 await page.locator('.title-start').click();
 await page.locator('.nav-btn[data-screen=race]').click();
 await page.locator('.sub-tab[data-screen=duels]').click();
 assert.equal(await page.locator('#duel-entry-home [data-duel-entry]').count(),3,'entry has exactly three modes');
  await page.locator('[data-duel-entry="pvp"]').click();
  await page.locator('[data-duel-board-scroll]').waitFor();
 assert.equal(await page.locator('.screen').getAttribute('data-view'),'duels');
 assert.equal(await page.locator('.community-feed').count(),0,'no global feed above the board');
 assert.equal(await page.locator('.duel-current').count(),1);
 assert.equal(await page.locator('.duel-create-collapse').count(),1);
 assert.equal(await page.locator('.duel-create-collapse').evaluate(el=>el.open),false);
 // Real Discord Activity navigation regression: PvE and rewards must stay in
 // this same document, preserving the authenticated wallet and Play categories.
 assert.equal(await page.locator('.sub-tabs .sub-tab').count(),5,'all five Play categories stay visible on duel');
 assert.equal(await page.locator('.sub-tab[data-screen=duels]').getAttribute('class').then(x=>x.includes('active')),true);
 const urlBefore=page.url();
  await page.locator('[data-duel-entry-back]').click();
  await page.locator('[data-duel-entry="pve"]').click();
  assert.equal(page.url(),urlBefore,'PvE stays in authenticated Activity');
  await page.locator('#duel-pve-section .duel-pve-stage-head').waitFor();
 await page.locator('[data-duel-pve-custom-start]').click();
 await page.locator('#duel-pve-section').getByText('サーバーでCPU戦を開始しました。').waitFor();
 assert.equal(page.url(),urlBefore,'server PvE move stays in the authenticated Activity');
 // Functional browser exercise: saved-session resume, verified discard, and a fresh start.
 await page.locator('[data-duel-history-open]').click();
 await page.locator('[data-duel-history-resume="'+pveId+'"]').click();
 await page.locator('#duel-pve-section').getByText('保存済みCPU戦を再開しました。').waitFor();
 assert.equal(pveReads,1,'history resume must actually call authenticated GET');
 await page.locator('.duel-pve-arena [data-duel-pve-abandon]').click();
 await page.locator('[data-duel-pve-confirm="yes"]').click();
 await page.locator('#duel-pve-section').getByText('進行中の対局を無報酬で破棄しました。新しいCPU戦を開始できます。').waitFor();
 assert.equal(pveAbandons,1,'discard must actually call authenticated POST');
 await page.locator('[data-duel-pve-custom-start]').click();
 await page.locator('#duel-pve-section').getByText('サーバーでCPU戦を開始しました。').waitFor();
 assert.equal(pveStarts,2,'new CPU game must remain operable after discard');
 // This is the real Activity: premium PvE Connect Four must have clickable holes,
 // and the next snapshot must come from the mocked authenticated Worker.
 await page.locator('[data-duel-sport="connect4"][data-duel-sport-mode="pve"]').click();
 await page.locator('[data-duel-pve-custom-start]').click();
 await page.locator('.duel-pve-connect4 .duel-connect4-board').waitFor();
 assert.equal(await page.locator('.duel-pve-connect4 .duel-connect4-space').count(),42);
 assert.equal(await page.locator('.duel-pve-connect4 .duel-connect4-head button').count(),7);
 await page.locator('.duel-pve-connect4 [data-duel-pve-board-col="0"]').first().click();
 await page.locator('.duel-pve-connect4 .duel-connect4-space.a').first().waitFor();
 assert.equal(pveMoves,1,'one board tap sends exactly one server move, not a UI-only animation');
 assert.equal(await page.locator('.duel-pve-connect4 .duel-connect4-space.b').count(),1,'CPU reply comes from Worker data');
 assert.equal(page.url(),urlBefore,'premium PvE stays in the authenticated Activity');


 await page.locator('details.duel-secondary summary').click();
  await page.locator('[data-duel-pve-rewards]').click();
 await page.locator('#duel-rewards-in-app').getByText('3勝 1敗 0分').waitFor();
 assert.equal(page.url(),urlBefore,'rewards must not navigate to standalone auth page');
 await page.locator('.sub-tab[data-screen=market]').click();
 await page.locator('.sub-tab[data-screen=duels]').click();
 await page.locator('[data-duel-entry="pvp"]').click();
  await page.locator('[data-duel-board-scroll]').waitFor();
 assert.equal(page.url(),urlBefore,'return via Play categories must preserve the Activity');

 const viewport=page.locator('[data-duel-board-scroll]');
 const before=await viewport.evaluate(el=>({left:el.scrollLeft,top:el.scrollTop}));
 assert.ok(before.left>0&&before.top>0,'pan viewport starts centered');
 await page.locator('[data-gomoku-zoom-action="in"]').click();
 assert.equal(operations.length,0,'zoom must not request a paid move');
 await page.waitForFunction(()=>Math.round(document.querySelector('[data-duel-board-scroll] .duel-gomoku')?.getBoundingClientRect().width||0)===780,null,{timeout:6000});
 assert.equal(await viewport.locator('.duel-gomoku').evaluate(el=>Math.round(el.getBoundingClientRect().width)),780);
 await page.locator('[data-gomoku-zoom-action="out"]').click();
 await page.waitForFunction(()=>Math.round(document.querySelector('[data-duel-board-scroll] .duel-gomoku')?.getBoundingClientRect().width||0)===660,null,{timeout:6000});
 assert.equal(operations.length,0,'zoom out cannot trigger KP');

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
 // After an initially unavailable stream, a later participant event refreshes
 // the authoritative board without sending an extra paid operation.
 const previousReads=duelReads;
 const remote=playDuelMove('gomoku',room.board,'W',111);
 room={...room,board:remote.board,turn_user:'one',version:2};
 liveHints=true;
 await page.locator('.duel-square.white[data-duel-cell="111"]').waitFor({timeout:14000});
 await page.locator('.duel-gomoku-last-confirmed[data-duel-cell="111"]').waitFor({timeout:5000});
 assert.match(await page.locator('[data-gomoku-last-status]').innerText(),/8行 7列（白）/,'remote confirmed update is clearly identified');

 assert.ok(streams>=1,'SSE reconnected after the initial unavailable endpoint');
 assert.ok(duelReads>previousReads,'SSE hint triggers an authenticated authoritative GET');
 assert.equal(operations.length,1,'SSE never submits a second move or KP charge');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');
 assert.deepEqual(errors,[],'no browser errors');
 console.log('PRODUCTION DUEL GOMOKU OK ('+engine+'): no request on preview/cancel, one server-authoritative move on confirm, scroll stable, active room first.');
 await ctx.close();
})().catch(e=>{console.error('PRODUCTION DUEL GOMOKU FAILED ('+engine+')',e);process.exitCode=1}).finally(async()=>{await browser?.close();server.kill();});
