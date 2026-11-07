// Mobile WebKit / Chromium walkthrough: real duel view + real rules, no wallet or D1.
const {chromium,webkit}=require('playwright');
const {spawn}=require('node:child_process');
const {existsSync,mkdirSync}=require('node:fs');
const assert=require('node:assert/strict');
const {resolve}=require('node:path');
const engine=process.argv[2]==='webkit'?'webkit':'chromium';
const port=8877,root=resolve(__dirname,'..'),url='http://127.0.0.1:'+port+'/duel-demo.html';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const shotDir=process.env.DUEL_DEMO_SHOTS||'',errors=[],requests=[];
let browser;
const modeName={othello:'オセロ',gomoku:'五目並べ',connect4:'四目並べ',hitblow:'Hit & Blow',bluffdice:'ブラフダイス',poker:'5カードポーカー'};
const a='[data-demo-view=a]',b='[data-demo-view=b]';
(async()=>{
 for(let i=0;i<80;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{}:
  {executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:engine==='webkit',hasTouch:true,reducedMotion:'reduce'});
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 page.on('request',req=>{if(/api\/kp|\.workers\.dev|discord\.com/.test(req.url()))requests.push(req.url());});
 await page.goto(url,{waitUntil:'networkidle'});
 assert.match(await page.title(),/決闘デモ/);
 assert.equal(await page.locator('#duel-game option').count(),6);
 const screenshot=async(name)=>{
  if(!shotDir)return;
  mkdirSync(shotDir,{recursive:true});
  await page.screenshot({path:resolve(shotDir,name+'-'+engine+'.png'),fullPage:true,animations:'disabled'});
 };
 async function chooseMode(mode){
  await page.locator('#demo-mode').selectOption(mode);
  assert.equal(await page.locator('#duel-game').inputValue(),mode);
  assert.equal(await page.locator('#demo-app .duel-opponent-toggle').count(),1,'opponent picker exists');
  // Native select is intentionally replaced with a touch-accessible in-page picker.
  await page.locator('[data-duel-target-toggle]').click();
  assert.equal(await page.locator('[data-duel-target-option]').count(),1);
  await page.locator('[data-duel-target-option]').click();
  await page.locator('[data-duel-act=create]').click();
  assert.match(await page.locator('.duel-history').innerText(),/招待中/);
  await page.locator(b).click();
  await page.locator('[data-duel-act=accept]').click();
  assert.equal(await page.locator('#demo-app .duel-arena').count(),1);
  assert.match(await page.locator('.duel-state').innerText(),/対戦中/);
  assert.match(await page.locator('.duel-arena').innerText(),new RegExp(modeName[mode].replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  await page.locator(a).click();
  await screenshot('01-'+mode+'-playing');
  const data=await page.locator('#demo-app .badge').first().innerText();
  assert.match(data,/19,000 KP/,mode+' escrow debited locally');
 }
 const click=async(cell)=>page.locator('[data-duel-cell="'+cell+'"]').click();
 async function turn(side){await page.locator(side==='a'?a:b).click();}
 async function checkWinner(winner){
  await turn(winner);
  assert.match(await page.locator('.duel-result').innerText(),/勝利/);
  assert.match(await page.locator('#demo-app .badge').first().innerText(),/21,000 KP/);
  await turn(winner==='a'?'b':'a');
  assert.match(await page.locator('.duel-result').innerText(),/敗北/);
  assert.match(await page.locator('#demo-app .badge').first().innerText(),/19,000 KP/);
 }
 // Othello — move, flip, then resign (the full 60-turn finish is covered by the D1 service integration suite).
 await chooseMode('othello');
 assert.equal(await page.locator('.duel-square.available').count(),4);
 await click(19);
 assert.match(await page.locator('.duel-counts').innerText(),/黒 4/);
 await turn('b');
 await page.locator('.duel-square.available').first().click();
 await page.locator('[data-duel-act=resign-preview]').click();
 await page.locator('[data-duel-act=resign]').click();
 await checkWinner('a');
 await screenshot('02-othello-result');
 // Gomoku — alternating 9 moves, five in a row wins.
 await chooseMode('gomoku');
 for(let i=0;i<9;i++){await turn(i%2?'b':'a');await click(i%2?15+Math.floor(i/2):Math.floor(i/2));}
 await checkWinner('a');
 // Connect Four — four stacked chips in one column.
 await chooseMode('connect4');
 for(let i=0;i<7;i++){await turn(i%2?'b':'a');await click(i%2?1:0);}
 assert.equal(await page.locator('.duel-connect4-space.a').count(),4);
 await checkWinner('a');
 // Hit & Blow — private digits differ per player and are not disclosed to the other viewer.
 await chooseMode('hitblow');
 const codeA=await page.locator('.duel-private strong').innerText();
 await turn('b');
 const codeB=await page.locator('.duel-private strong').innerText();
 assert.equal(codeA.length,4);assert.equal(codeB.length,4);
 await turn('a');await page.locator('#duel-guess').fill(codeB);
 await page.locator('[data-duel-mini=hitblow]').click();
 assert.match(await page.locator('.duel-guess-history').innerText(),/4 Hit/);
 await checkWinner('a');
 // Bluff dice — an impossible-to-reach ten-six bid is correctly challenged twice.
 await chooseMode('bluffdice');
 async function bluffRound(){
  await turn('a');
  await page.locator('#duel-bid-count').selectOption('10');
  await page.locator('#duel-bid-face').selectOption('6');
  await page.locator('[data-duel-mini=bid]').click();
  await turn('b');await page.locator('[data-duel-mini=challenge]').click();
 }
 await bluffRound();assert.match(await page.locator('.duel-mini-round').innerText(),/ラウンド1/);
 await bluffRound();await checkWinner('b');
 // Poker — both players can confirm their own exchange; board shows showdown only after both finish.
 await chooseMode('poker');
 assert.equal(await page.locator('.duel-card').count(),5);
 await page.locator('[data-duel-card="0"]').click();
 assert.match(await page.locator('.duel-card.selected').innerText(),/交換/);
 await page.locator('[data-duel-mini=poker]').click();
 assert.equal(await page.locator('.duel-showdown').count(),0);
 await turn('b');await page.locator('[data-duel-mini=poker]').click();
 assert.equal(await page.locator('.duel-showdown').count(),1);
 assert.equal(await page.locator('.duel-result').count(),1);
 await screenshot('02-poker-showdown');
 for(const width of [320,375,390,768,1280]){
  await page.setViewportSize({width,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'horizontal overflow '+width);
 }
 assert.deepEqual(requests,[],'demo must never call KP/Discord or Worker endpoints');
 assert.deepEqual(errors,[],'browser runtime errors');
 console.log('DUEL DEMO SUCCESS ('+engine+'): 6 modes, challenge+accept, real rules, hands/privacy, payout mock, screenshot UI, mobile widths, 0 D1 requests.');
 await ctx.close();
})().catch(e=>{console.error('DUEL DEMO FAILED ('+engine+')',e);console.error({errors,requests});process.exitCode=1}).finally(async()=>{await browser?.close();server.kill();});
