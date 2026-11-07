// Reproduce real Othello auto-pass via UI clicks on mobile Chromium/WebKit.
// Starts from a normal invitation and plays full legal sequences without
// injecting private match state or bypassing any production click handlers.
const {chromium,webkit}=require('playwright');
const {spawn}=require('node:child_process');
const {existsSync}=require('node:fs');
const {resolve}=require('node:path');
const assert=require('node:assert/strict');
const engine=process.argv[2]==='webkit'?'webkit':'chromium';
const port=8897,root=resolve(__dirname,'..'),url='http://127.0.0.1:'+port+'/duel-demo.html?cpu=0';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
let browser;
function seeded(seed){
 let x=seed*65777;
 return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};
}
(async()=>{
 const {initialDuelBoard,duelLegalMoves,playDuelMove}=await import('../js/duel-rules.js');
 for(let i=0;i<75;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{}:
  {executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:engine==='webkit',reducedMotion:'reduce'});
 const page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 for(const scenario of [{seed:2,color:'B'},{seed:14,color:'W'}]){
  await page.goto(url,{waitUntil:'networkidle'});
  await page.locator('[data-duel-target-toggle]').click();
  await page.locator('[data-duel-target-option]').first().click();
  await page.locator('[data-duel-act=create]').click();
  await page.locator('[data-demo-view=b]').click();
  await page.locator('[data-duel-act=accept]').click();
  let board=initialDuelBoard('othello'),color='B',count=0,passed=false;
  const random=seeded(scenario.seed);
  for(;count<62;count++){
   const legal=duelLegalMoves('othello',board,color);
   assert.ok(legal.length,'active side must have legal moves at turn '+count);
   const cell=legal[Math.floor(random()*legal.length)];
   const seat=color==='B'?'a':'b';
   await page.locator('[data-demo-view='+seat+']').click();
   const selected=page.locator('[data-duel-cell="'+cell+'"]');
   assert.equal(await selected.isEnabled(),true,'must allow mover '+color+' at move '+count);
   await selected.click();
   const after=playDuelMove('othello',board,color,cell);
   board=after.board;
   if(after.passed){
    assert.equal(color,scenario.color,'seed must exercise intended pass direction');
    assert.equal(after.nextColor,color,'same color must play after a pass');
    await page.locator('[data-demo-view='+seat+']').click();
    assert.match(await page.locator('#demo-feedback').innerText(),/自動パス/);
    assert.match(await page.locator('.duel-turn').innerText(),/あなたの番/);
    const options=duelLegalMoves('othello',board,color);
    assert.ok(options.length>0,'mover retains at least one legal cell');
    const continued=page.locator('[data-duel-cell="'+options[0]+'"]');
    assert.equal(await continued.isEnabled(),true,'no lock after '+color+' auto-pass');
    await continued.click();
    const continuedResult=playDuelMove('othello',board,color,options[0]);
    assert.equal(await page.locator('.duel-counts').count(),1);
    assert.equal((await page.locator('.duel-square.black').count())+(await page.locator('.duel-square.white').count()),
     continuedResult.board.length-continuedResult.board.split('.').length+1);
    passed=true;
    break;
   }
   if(after.winner)throw Error('Game finished before '+scenario.color+' pass');
   color=after.nextColor;
  }
  assert.ok(passed,'pass scenario must be reached for '+scenario.color);
  console.log('PASS '+scenario.color+' ('+engine+'): '+(count+1)+' turns, continued same-side move succeeded');
 }
 // CPU practice: inject only a late-game test fixture into this test's HTTP
 // response. The production source has NO debug hooks and no server requests.
 // The live move/scheduler logic must remain unmodified.
 await page.route('**/duel-preview/demo.js*',async route=>{
  const response=await route.fetch();
  const original=await response.text();
  const hook=`
window.__duelPassTest={
 simulate(board){
  restart('othello');match.board=board;match.turn_user=USERS.b;
  render();move({cell:7},USERS.b);
  return this.snapshot();
 },
 snapshot(){return {version:match?.version,status:match?.status,turn:match?.turn_user,
  cpu:USERS.b,error:lastError,passNotice};}
};`
  await route.fulfill({response,body:original+'\n'+hook});
 });
 await page.goto(url.replace('cpu=0','cpu=1'),{waitUntil:'networkidle'});
 await page.waitForFunction(()=>!!window.__duelPassTest,{timeout:10000});
 const first=await page.evaluate(()=>window.__duelPassTest.simulate('.WWWW.B.BBBBBBBBBBBWBBBBBBWBWBBBBBBWWWBBBBWWWWWBBBWWBWBBBBBBBBWW'));
 assert.equal(first.version,2,'CPU made the first white move');
 assert.equal(first.turn,first.cpu,'black must be passed and white CPU keeps the turn');
 assert.match(first.passNotice,/黒は置ける場所がないため自動パス/);
 await page.waitForFunction(()=>window.__duelPassTest.snapshot().version>=3,null,{timeout:12000});
 const second=await page.evaluate(()=>window.__duelPassTest.snapshot());
 assert.ok(second.version>=3,'CPU must automatically take another turn');
 assert.equal(second.error,'','consecutive CPU turns must not throw');
 console.log('CPU WHITE CONTINUATION ('+engine+'): version '+first.version+' → '+second.version);
 assert.deepEqual(errors,[],'browser must have no uncaught exceptions');
 await ctx.close();
})().catch(err=>{console.error('OTHELLO PASS FAILED ('+engine+')',err);process.exitCode=1;})
 .finally(async()=>{await browser?.close();server.kill();});
