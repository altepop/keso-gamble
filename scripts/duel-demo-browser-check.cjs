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
const modeName={othello:'オセロ',gomoku:'五目並べ',connect4:'四目並べ',hitblow:'Hit & Blow',bluffdice:'ブラフダイス',poker:'5カード・ドローポーカー'};
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
 assert.equal(await page.locator('#duel-game option').count(),7);
 // Rotate the simulated mobile viewport; preserve the selected game and controls.
 await page.locator('#demo-mode').selectOption('poker');
 await page.setViewportSize({width:844,height:390});
 assert.equal(await page.locator('#duel-game').inputValue(),'poker','landscape retains selection');
 assert.equal(await page.locator('#duel-game option').count(),7,'all games available in landscape');
 assert.equal(await page.locator('[data-duel-act=create]').count(),1,'invite control survives landscape');
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('#duel-game').inputValue(),'poker','portrait restores without losing choice');
 // Phase 8: an actual 375px mobile viewport must preserve all modes and the
 // invite control. This is visual/layout coverage, not live 2-account latency.
 await page.setViewportSize({width:375,height:812});
 assert.equal(await page.locator('#duel-game option').count(),7,'375px retains seven available duel modes');
 assert.equal(await page.locator('[data-duel-act=create]').isVisible(),true,'375px invite action visible');
 assert.ok(await page.locator('[data-duel-act=create]').evaluate(el=>el.getBoundingClientRect().height>=44),'375px invite touch target at least 44px');
 await page.setViewportSize({width:390,height:844});

 await page.locator('#demo-mode').selectOption('othello');
 // Simulate only a visible error label in the mock Activity. No API or wallet call.
 await page.evaluate(()=>{
   const warn=document.createElement('div');
   warn.className='duel-error';warn.setAttribute('role','alert');
   warn.dataset.duelTestError='1';warn.textContent='テスト用の通信エラー';
   document.querySelector('#demo-app .screen').append(warn);
 });
 await page.locator('[data-duel-status-help-kind="error"]').waitFor();
 assert.match(await page.locator('[data-duel-status-help]').innerText(),/操作結果が未確認なら連続送信せず/);
 await page.evaluate(()=>document.querySelector('[data-duel-test-error]')?.remove());
 await page.locator('[data-duel-status-help-kind="error"]').waitFor({state:'detached'});
 assert.equal(await page.locator('#duel-game option').count(),7,'status help never changes duel setup');
 const screenshot=async(name)=>{
  if(!shotDir)return;
  mkdirSync(shotDir,{recursive:true});
  await page.screenshot({path:resolve(shotDir,name+'-'+engine+'.png'),fullPage:true,animations:'disabled'});
 };
 async function chooseMode(mode){
  await page.locator('#demo-mode').selectOption(mode);
  assert.equal(await page.locator('#duel-game').inputValue(),mode);
  const formGuide=page.locator('.duel-new [data-duel-beginner]');
  await formGuide.waitFor();
  assert.equal(await formGuide.getAttribute('data-duel-beginner'),mode,'setup rules follow selected mode');
  await formGuide.locator('summary').click();
  assert.match(await formGuide.innerText(),/勝利条件[\s\S]*最初にすること[\s\S]*覚えておくこと/);
  assert.equal(await formGuide.evaluate(el=>el.open),true,'native disclosure opens on mobile');
  assert.equal(await page.locator('#demo-app .duel-opponent-toggle').count(),1,'opponent picker exists');
  await page.locator('[data-duel-invite-guide]').waitFor();
  const selectedLabel=(await page.locator('.duel-opponent-toggle > span').first().innerText()).trim();
  const inviteMessage=await page.locator('.duel-invite-guide').innerText();
  if(selectedLabel==='相手を選択')assert.match(inviteMessage,/まず相手を選択/);
  else assert.match(inviteMessage,/招待の準備ができた|高額のため再確認が必要/,'remembered opponent stays ready');
  // Native select is intentionally replaced with a touch-accessible in-page picker.
  await page.locator('[data-duel-target-toggle]').click();
  assert.equal(await page.locator('[data-duel-target-option]').count(),1);
  await page.locator('[data-duel-target-option]').click();
  assert.match(await page.locator('.duel-invite-guide').innerText(),/招待の準備ができた/);
  if(mode==='othello'){
   await page.locator('#duel-stake').selectOption('50000');
   assert.match(await page.locator('.duel-invite-guide').innerText(),/KPが不足/);
   assert.equal(await page.locator('[data-duel-act=create]').isDisabled(),true,'insufficient balance prevents invite');
   await page.locator('#duel-stake').selectOption('1000');
   assert.match(await page.locator('.duel-invite-guide').innerText(),/招待の準備ができた/);
  }
  await page.locator('[data-duel-journey]').waitFor();
  if(mode==='othello'){
   await page.evaluate(()=>dispatchEvent(new Event('offline')));
   assert.match(await page.locator('[data-duel-connection]').innerText(),/ブラウザがオフライン/);
   assert.equal(await page.locator('[data-duel-act=create]').isDisabled(),false,'passive offline guide cannot replace submit logic');
   await page.evaluate(()=>dispatchEvent(new Event('online')));
   assert.match(await page.locator('[data-duel-connection]').innerText(),/同期はまだ確認していない/);
   // Browser offline emulation rather than a synthetic event.
   await ctx.setOffline(true);
   await page.locator('[data-duel-connection-type="offline"]').waitFor();
   assert.match(await page.locator('[data-duel-connection]').innerText(),/ブラウザがオフライン/);
   await ctx.setOffline(false);
   await page.locator('[data-duel-connection-type="offline"]').waitFor({state:'detached'});
  }
  assert.match(await page.locator('.duel-journey-title').innerText(),/相手を選んで申し込む/);
  await page.locator('[data-duel-act=create]').click();
  assert.match(await page.locator('.duel-history').innerText(),/招待中/);
  assert.match(await page.locator('.duel-journey-title').innerText(),/相手の承諾待ち/);
  assert.match(await page.locator('.duel-journey-step[aria-current=step]').innerText(),/招待/);
  await page.locator(b).click();
  assert.match(await page.locator('.duel-journey-title').innerText(),/対戦の招待が届いた/);
  await page.locator('[data-duel-act=accept]').click();
  assert.equal(await page.locator('#demo-app .duel-arena').count(),1);
  const inPlayRules=page.locator('.duel-arena > [data-duel-beginner]');
  await inPlayRules.waitFor();
  assert.equal(await inPlayRules.getAttribute('data-duel-beginner'),mode,'confirmed active game rules are available');
  assert.match(await page.locator('.duel-journey-step[aria-current=step]').innerText(),/対戦/);
  assert.match(await page.locator('.duel-journey-title').innerText(),/あなたの番|相手の番/);
  // Every game shares a compact mobile-active hierarchy; preserve the turn and safety banners.
  const compact=page.locator('[data-duel-journey-stage="active"]');
  assert.equal(await compact.count(),1,'active stage is explicitly marked');
  assert.equal(await compact.locator('.duel-journey-steps').evaluate(el=>getComputedStyle(el).display),'none','mobile hides redundant progress rail only');
  assert.equal(await compact.locator('.duel-journey-title').isVisible(),true,'turn remains visible');
  assert.equal(await page.locator('.duel-turn').isVisible(),true,'confirmed turn remains visible');

  assert.equal(await page.locator('.duel-intro').count(),0,'hide intro while playing');
  assert.equal(await page.locator('.duel-create-collapse').count(),1,'new game form collapses during a duel');
  assert.equal(await page.locator('.duel-create-collapse').evaluate(el=>el.open),false);
  assert.equal(await page.locator('.duel-current').evaluate(el=>el.compareDocumentPosition(document.querySelector('.duel-history'))&Node.DOCUMENT_POSITION_FOLLOWING?true:false),true,'active board precedes history in DOM');
  assert.match(await page.locator('.duel-state').innerText(),/対局中|対戦中/);
  assert.ok((await page.locator('.duel-arena').innerText()).includes(modeName[mode]),'arena title '+mode);
  if(['othello','poker','bluffdice'].includes(mode)){
    const deep=page.locator('.duel-arena > [data-duel-insights]');
    await deep.waitFor();
    assert.equal(await deep.getAttribute('data-duel-insights'),mode,'game-specific confirmed/public guide');
    await deep.locator('summary').click();
    const content=await deep.innerText();
    if(mode==='othello')assert.match(content,/四隅：黒0か所／白0か所／空き4か所/);
    if(mode==='poker')assert.match(content,/ストレートフラッシュ ＞ フォーカード ＞ フルハウス/);
    if(mode==='bluffdice')assert.match(content,/ワイルドではなく/);
    assert.equal(await deep.evaluate(el=>el.open),true,'mobile native detail opens');
  }
  await page.locator(a).click();
  const hasTurn=await page.locator('.duel-turn.my-turn').count()===1;
  if(!hasTurn)await page.locator(b).click();
  const guideByMode={othello:/オセロ：置く場所を選ぶ/,gomoku:/五目並べ：選択して確定/,connect4:/四目並べ：列を選ぶ/,
   hitblow:/Hit & Blow：4桁を予想/,bluffdice:/ブラフダイス：次の宣言/,poker:/ポーカー：交換を選ぶ/};
  await page.locator('[data-duel-action-hint]').waitFor();
  assert.match(await page.locator('[data-duel-action-hint]').innerText(),guideByMode[mode],'6 mode action guide '+mode);
  assert.equal(await page.locator('[data-duel-action-hint]').evaluate(el=>getComputedStyle(el).animationName),'none','guide honors reduced motion');
  if(!hasTurn)await page.locator(a).click();
  // Full six-mode phone quality gate at both requested widths.
  for(const width of [375,390]){
   await page.setViewportSize({width,height:844});
   const layout=await page.evaluate(()=>({
     overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
     turn:!!document.querySelector('#demo-app .duel-arena .duel-turn'),
     state:!!document.querySelector('#demo-app .duel-arena .duel-state')
   }));
   assert.equal(layout.overflow,false,mode+' overflow at '+width+'px');
   assert.equal(layout.turn,true,mode+' missing confirmed turn at '+width+'px');
   assert.equal(layout.state,true,mode+' missing confirmed state at '+width+'px');
  }
  if(mode==='othello'){
   // Simulate auxiliary UI mutation bursts on slow phones. No game action
   // or private data is modified, and no server/KP request is issued.
   await page.evaluate(()=>{
    const screen=document.querySelector('#demo-app .screen');
    for(let i=0;i<180;i++){
     const item=document.createElement('span');
     item.dataset.duelPhase8Stress='1';
     screen.append(item);item.remove();
    }
   });
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   assert.equal(await page.locator('[data-duel-journey]').count(),1,'one guide after auxiliary render burst');
   assert.equal(await page.locator('.duel-turn').isVisible(),true,'confirmed turn survives burst');
  }
  await screenshot('01-'+mode+'-playing');
  const data=await page.locator('#demo-app .badge').first().innerText();
  assert.match(data,/19,000 KP/,mode+' escrow debited locally');
 }
 const assertOthelloGeometry=async(view,stage)=>{
  // Layout sizes must remain square even when a transition is in progress.
  // offsetWidth/offsetHeight avoid interpreting a temporary 3D flip as deformation.
  const measured=await view.locator('.duel-board.duel-othello').evaluate(board=>{
   const cells=[...board.querySelectorAll('.duel-square')];
   const rect=element=>{const r=element.getBoundingClientRect();return {width:r.width,height:r.height};};
   return {
    board:rect(board),
    cells:cells.map(rect),
    pieces:cells.map(cell=>cell.querySelector('.duel-piece')).filter(Boolean).map(piece=>({width:piece.offsetWidth,height:piece.offsetHeight}))
   };
  });
  assert.equal(measured.cells.length,64,stage+' still renders all 64 Othello cells');
  assert.ok(Math.abs(measured.board.width-measured.board.height)<=1.5,stage+' board remains square '+JSON.stringify(measured.board));
  for(const [i,cell] of measured.cells.entries()){
   assert.ok(Math.abs(cell.width-cell.height)<=1.5,stage+' cell '+i+' is square '+JSON.stringify(cell));
   assert.ok(Math.abs(cell.width-measured.cells[0].width)<=1.5,stage+' cell '+i+' has equal width');
   assert.ok(Math.abs(cell.height-measured.cells[0].height)<=1.5,stage+' row '+i+' has equal height');
  }
  for(const [i,piece] of measured.pieces.entries()){
   assert.ok(Math.abs(piece.width-piece.height)<=1.5,stage+' stone '+i+' is circular '+JSON.stringify(piece));
  }
 };
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
 // Emulate a low-end CPU during a complete first duel entry and render-burst check.
 // This emulation is not evidence of performance on a physical phone.
 const slowCPU=engine==='chromium'?await ctx.newCDPSession(page):null;
 if(slowCPU)await slowCPU.send('Emulation.setCPUThrottlingRate',{rate:4});
 // Othello — move, flip, then resign (the full 60-turn finish is covered by the D1 service integration suite).
 await chooseMode('othello');
 if(slowCPU){await slowCPU.send('Emulation.setCPUThrottlingRate',{rate:1});await slowCPU.detach();}
 await assertOthelloGeometry(page,'reduced motion starting board');
 await page.locator('.duel-othello-position-details > summary').click();
  await page.locator('[data-othello-position]').waitFor();
 assert.match(await page.locator('[data-othello-position]').textContent(),/石数は同数.*空き60マス/);
 assert.match(await page.locator('[data-othello-position]').textContent(),/一度に最大1枚返せる/);
 assert.equal(await page.locator('.duel-square.available').count(),4);
 assert.equal(await page.locator('.duel-othello .duel-capture-count').count(),4,'all four legal squares show a capture number');
 assert.deepEqual(await page.locator('.duel-othello .duel-capture-count').allInnerTexts(),['1','1','1','1']);
 assert.equal(await page.locator('.duel-othello-scorebar').getAttribute('aria-label'),'黒 2枚、白 2枚、空き 60マス');
 assert.match(await page.locator('.duel-othello-coach').innerText(),/置ける場所 4か所/);
 await click(19);
 assert.match(await page.locator('.duel-counts').innerText(),/黒 4/);
 assert.match(await page.locator('[data-othello-position]').textContent(),/黒が3枚多い.*空き59マス/);
 await page.locator('.duel-square.duel-othello-last-observed[data-duel-cell="19"]').waitFor();
 assert.match(await page.locator('[data-othello-last-note]').innerText(),/3行4列（1枚返した）/);
 assert.equal(await page.locator('.duel-othello-scorebar').getAttribute('aria-label'),'黒 4枚、白 1枚、空き 59マス');
 await assertOthelloGeometry(page,'reduced motion after first move');
 assert.equal(await page.locator('.duel-square.duel-new-stone').count(),0,'reduced-motion disables decorative animation');
 await turn('b');
 await page.locator('.duel-square.available').first().click();
 await page.locator('[data-duel-act=resign-preview]').click();
 await page.locator('[data-duel-act=resign]').click();
 await checkWinner('a');
 const recap=page.locator('.duel-arena [data-duel-finished-review]');
 await recap.waitFor();
 await recap.locator('summary').click();
 assert.match(await recap.innerText(),/確定結果/);
 const shared=page.locator('[data-duel-public-result-share]');
 await shared.waitFor();
 assert.equal(await shared.evaluate(el=>el.open),false,'public result share stays collapsed until selected');
 await shared.locator('summary').click();
 const publicOutcome=(await page.locator('.duel-result').innerText()).trim();
 assert.equal(await shared.locator('textarea').inputValue(),publicOutcome,'sharing includes confirmed result only');
 assert.equal(await shared.locator('textarea').count(),1,'exactly one read-only confirmed result field');
 assert.equal(await shared.locator('textarea').getAttribute('readonly')!==null,true,'sharing text cannot change the result');

 assert.match(await recap.innerText(),/次の試合で確認すること/);
 assert.match(await recap.innerText(),/自分の手番ごとに置ける場所を確認/);
 assert.equal(await recap.locator('dt').filter({hasText:'次の試合で確認すること'}).count(),1,'one next-match focus field from confirmed results');
 assert.match(await recap.innerText(),/敗北/);
 assert.match(await recap.innerText(),/表示済みの確定情報のみ/);
 const historyFilter=page.locator('.duel-history [data-duel-history-filter]');
 assert.equal(await historyFilter.count(),3,'three client-only history filters');
 await page.locator('[data-duel-history-filter="finished"]').click();
 assert.equal(await page.locator('.duel-history .duel-match:not([hidden])').count(),1,'finished match remains visible');
 await page.locator('[data-duel-history-filter="ongoing"]').click();
 assert.equal(await page.locator('.duel-history .duel-match:not([hidden])').count(),0,'no imaginary ongoing games');
 assert.match(await page.locator('[data-duel-history-filter-note]').innerText(),/該当する対戦は/);
 await page.locator('[data-duel-history-filter="all"]').click();
 assert.equal(await page.locator('.duel-history .duel-match:not([hidden])').count(),1,'restore all loaded rows');
 assert.match(await page.locator('.duel-journey-title').innerText(),/対戦終了・結果確定/);
 assert.match(await page.locator('.duel-journey-step[aria-current=step]').innerText(),/再戦/);
 assert.equal(await page.locator('[data-duel-rematch]').count(),1,'finished match offers rematch preset');
 assert.equal(await page.locator('.duel-rematch-steps').evaluate(el=>el.open),false,'rematch steps optional');
 await page.locator('.duel-rematch-steps > summary').click();
 assert.equal(await page.locator('.duel-rematch-steps').evaluate(el=>el.open),true,'rematch steps accessible');
 assert.match(await page.locator('[data-duel-rematch-guide]').innerText(),/同じ条件で、もう一戦/);
 assert.match(await page.locator('[data-duel-rematch-guide]').innerText(),/押しただけでは招待もKPの操作も発生しない/);
 assert.equal(await page.locator('.duel-journey').evaluate(el=>getComputedStyle(el).animationName),'none','shared flow guide honours reduced motion');
 await page.locator('[data-duel-rematch]').click();
 assert.match(await page.locator('[data-duel-rematch-guide]').innerText(),/再戦の内容を確認中/);
 assert.match(await page.locator('[data-duel-rematch-guide]').innerText(),/自動では開始しない/);
 assert.equal(await page.locator('[data-duel-rematch-guide] li[aria-current=step]').count(),1);
 assert.equal(await page.locator('#duel-game').inputValue(),'othello','rematch retains the game');
 assert.equal(await page.locator('#duel-stake').inputValue(),'1000','rematch retains the stake');
 assert.match(await page.locator('.duel-result').innerText(),/敗北/,'rematch does not create a second game');
 assert.match(await page.locator('#demo-app .badge').first().innerText(),/19,000 KP/,'rematch preparation cannot deduct KP');
 assert.equal(await page.locator('[data-duel-act=accept]').count(),0,'rematch preparation cannot send an invitation');
 await screenshot('02-othello-result');
 // Gomoku — alternating 9 moves, five in a row wins.
 await chooseMode('gomoku');
 const gomokuViewport=page.locator('[data-duel-board-scroll]');
 const dimensions=await gomokuViewport.evaluate(el=>({width:el.clientWidth,scrollWidth:el.scrollWidth,left:el.scrollLeft,top:el.scrollTop}));
 assert.ok(dimensions.scrollWidth>=660&&dimensions.width<660,'Gomoku board must pan instead of shrinking on iPhone');
 assert.ok(dimensions.left>0&&dimensions.top>0,'first open centers on the middle of the board');
 assert.equal(await page.locator('[data-gomoku-zoom-label]').innerText(),'100%','initial zoom is touch-safe 44px');
 await page.locator('[data-gomoku-zoom-action="in"]').click();
 assert.equal(await page.locator('[data-gomoku-zoom-label]').innerText(),'118%');
 await page.waitForFunction(()=>Math.round(document.querySelector('[data-duel-board-scroll] .duel-gomoku')?.getBoundingClientRect().width||0)===780,null,{timeout:5000}).catch(async()=>{
   const actual=await gomokuViewport.evaluate(el=>({inline:el.querySelector('.duel-gomoku').style.cssText,computed:getComputedStyle(el.querySelector('.duel-gomoku')).width,label:document.querySelector('[data-gomoku-zoom-label]')?.textContent}));
   throw Error('zoom must change measured cell size: '+JSON.stringify(actual));
 });
 const enlarged=await gomokuViewport.evaluate(el=>({board:el.querySelector('.duel-gomoku').getBoundingClientRect().width,left:el.scrollLeft,top:el.scrollTop}));
 assert.equal(enlarged.board,780,'zoom is 52px per cell');
 assert.ok(enlarged.left>dimensions.left&&enlarged.top>dimensions.top,'zoom preserves the viewed logical centre');
 await page.locator('[data-gomoku-zoom-action="out"]').click();
 assert.equal(await page.locator('[data-gomoku-zoom-label]').innerText(),'100%');
 await page.locator('[data-gomoku-zoom-action="center"]').click();
 assert.equal(await page.locator('.duel-counts').innerText().then(x=>x.includes('黒 0')),true,'zoom never sends a turn');
 const dimensionsAfterZoom=await gomokuViewport.evaluate(el=>({left:el.scrollLeft,top:el.scrollTop}));
 assert.ok(dimensionsAfterZoom.left>0&&dimensionsAfterZoom.top>0,'board remains pannable and centred');
  assert.ok((await page.locator('[data-duel-cell="112"]').boundingBox()).width>=42,'touch target is at least 42px wide');
 await click(112);
 assert.equal(await page.locator('.duel-preview-cell').count(),1,'tap only selects a candidate');
 assert.equal(await page.locator('.duel-counts').innerText().then(x=>x.includes('黒 0')),true,'preview does not commit a move');
 const selectedPosition=await gomokuViewport.evaluate(el=>({left:el.scrollLeft,top:el.scrollTop}));
 assert.ok(Math.abs(selectedPosition.left-dimensionsAfterZoom.left)<3&&Math.abs(selectedPosition.top-dimensionsAfterZoom.top)<3,'preview re-render retains pan position after zoom');
 await page.locator('[data-duel-cancel-cell]').click();
 assert.equal(await page.locator('.duel-preview-cell').count(),0,'cancel clears selection');
 await page.locator('.duel-create-collapse>summary').click();
 assert.equal(await page.locator('#duel-game').isVisible(),true,'another duel can be invited from expandable form');
 await page.locator('.duel-create-collapse>summary').click();
 for(let i=0;i<9;i++){
  await turn(i%2?'b':'a');
  const cell=i%2?15+Math.floor(i/2):Math.floor(i/2);
  await click(cell);
  assert.equal(await page.locator('.duel-preview-cell').count(),1,'must select before placing');
  await page.locator('[data-duel-confirm-cell="'+cell+'"]').click();
  if(i===0){
   await page.locator('.duel-gomoku-last-confirmed[data-duel-cell="0"]').waitFor();
   assert.match(await page.locator('[data-gomoku-last-status]').innerText(),/1行 1列/);
   assert.equal(await page.locator('.duel-gomoku-last-confirmed').evaluate(el=>getComputedStyle(el).animationName),'none','reduced motion suppresses movement');
  }
 }
 await checkWinner('a');
 // Connect Four — four stacked chips in one column.
 await chooseMode('connect4');
 for(let i=0;i<7;i++){await turn(i%2?'b':'a');await click(i%2?1:0);}
 assert.equal(await page.locator('.duel-connect4-space.a').count(),4);
 assert.equal(await page.locator('.duel-c4-victory-board .duel-c4-win').count(),4,'winning line glows only on confirmed four');
 assert.equal(await page.locator('.duel-c4-celebration').count(),1,'winning celebration displayed once');
 assert.match(await page.locator('.duel-c4-celebration').innerText(),/FOUR IN A ROW/);
 assert.equal(await page.locator('.duel-c4-victory-board .duel-c4-win i').first().evaluate(el=>getComputedStyle(el).animationName),'none','reduced motion disables winning shimmer');
 await checkWinner('a');
 // Hit & Blow — private digits differ per player and are not disclosed to the other viewer.
 await chooseMode('hitblow');
 const digits=async view=>(await view.locator('.duel-hb-own-code .duel-hb-digit').allInnerTexts()).join('');
 const codeA=await digits(page);
 await turn('b');
 const codeB=await digits(page);
 assert.equal(codeA.length,4);assert.equal(codeB.length,4);
 assert.equal(await page.locator('.duel-hb-code-reveal').count(),0,'opponent code stays secret until confirmed finish');
 await turn('a');
 assert.match(await page.locator('.duel-hb-logic').innerText(),/5,040 通り/);
 await page.locator('#duel-guess').fill('0011');
 assert.match(await page.locator('#duel-hb-draft-help').innerText(),/同じ数字は使えません/);
 await page.locator('#duel-guess').fill(codeB);
 assert.match(await page.locator('#duel-hb-draft-help').innerText(),/入力OK/);
 await page.locator('[data-duel-mini=hitblow]').click();
 assert.match(await page.locator('.duel-guess-history').innerText(),/4 Hit/);
 assert.match(await page.locator('.duel-hb-code-reveal').innerText(),/CODE BREAKER/);
 assert.match(await page.locator('.duel-hb-logic').innerText(),/1 通り/);
 assert.equal(await page.locator('.duel-hb-code-reveal').evaluate(el=>getComputedStyle(el).animationName),'none','reduced motion disables Hit & Blow celebration');
 await checkWinner('a');
 // Bluff dice — an impossible-to-reach ten-six bid is correctly challenged twice.
 await chooseMode('bluffdice');
 assert.equal(await page.locator('.duel-bluff-hand .duel-bluff-die').count(),5,'own five dice, opponent hand never present');
 assert.equal(await page.locator('.duel-bluff-showdown').count(),0,'no reveal while private');
 async function bluffRound(){
  const previousHistory=Number(await page.locator('.duel-bluff-table').getAttribute('data-bluff-history-count'));
  await turn('a');
  await page.locator('#duel-bid-count').selectOption('10');
  await page.locator('#duel-bid-face').selectOption('6');
  await page.locator('[data-duel-mini=bid]').click();
  await turn('b');
  assert.equal(await page.locator('.duel-bluff-hand .duel-bluff-die').count(),5,'B sees only their own five dice');
  assert.equal(await page.locator('.duel-bluff-showdown').count(),previousHistory?1:0,'the *new* round stays private; an already revealed prior round may remain visible');
  assert.equal(Number(await page.locator('.duel-bluff-table').getAttribute('data-bluff-history-count')),previousHistory,'making a bid does not reveal this round');
  await page.locator('[data-duel-mobile-detail="bluffdice"] > summary').click();
  assert.match(await page.locator('.duel-bluff-odds').innerText(),/相手5個を公平なダイスと仮定/);
  await page.locator('[data-duel-mini=challenge]').click();
  assert.equal(await page.locator('.duel-bluff-reveal-dice .duel-bluff-die').count(),10,'ten dice are revealed only after challenge');
  assert.equal(await page.locator('.duel-bluff-reveal-row').count(),2,'both sides are visibly revealed');
  assert.equal(await page.locator('.duel-bluff-showdown').count(),1,'latest showdown occupies one visible panel');
  assert.equal(Number(await page.locator('.duel-bluff-table').getAttribute('data-bluff-history-count')),previousHistory+1,'only the actual challenge publishes a new round result');
  assert.equal(await page.locator('.duel-bluff-showdown').evaluate(el=>getComputedStyle(el).animationName),'none','reduced motion suppresses the theater animation');
 }
 await bluffRound();assert.match(await page.locator('.duel-mini-round').innerText(),/ラウンド1/);
 await bluffRound();await checkWinner('b');
 // Poker — both players can confirm their own exchange; board shows showdown only after both finish.
 await chooseMode('poker');
 assert.equal(await page.locator('.duel-card').count(),5);
 assert.equal(await page.locator('.duel-poker-reveal-card').count(),0,'opponent cards are private before the showdown');
 assert.equal(await page.locator('.duel-poker-hand-card').count(),5);
 assert.match(await page.locator('.duel-poker-choice-summary').innerText(),/交換予定/);
 await page.locator('[data-duel-card="0"]').click();
 assert.match(await page.locator('.duel-card.selected').innerText(),/交換/);
 await page.locator('[data-duel-mini=poker]').click();
 assert.equal(await page.locator('.duel-showdown').count(),0);
 assert.match(await page.locator('.duel-poker-steps').innerText(),/交換確定/);
 await turn('b');assert.equal(await page.locator('.duel-poker-reveal-card').count(),0,'other hand remains private while second swap pending');
 await page.locator('[data-duel-mini=poker]').click();
 assert.equal(await page.locator('.duel-showdown').count(),1);
 assert.equal(await page.locator('.duel-poker-reveal-card').count(),10,'only confirmed showdown reveals all ten cards');
 assert.equal(await page.locator('.duel-poker-showdown').evaluate(el=>getComputedStyle(el).animationName),'none','reduced motion removes poker flip animation');
 assert.equal(await page.locator('.duel-result').count(),1);
 await screenshot('02-poker-showdown');
 for(const width of [320,375,390,768,1280]){
  await page.setViewportSize({width,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'horizontal overflow '+width);
 }
 // A separate motion-enabled context verifies an actual Othello move on both engines.
 const animatedCtx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:engine==='webkit',hasTouch:true,reducedMotion:'no-preference'});
 const animatedPage=await animatedCtx.newPage();animatedPage.on('pageerror',e=>errors.push(e.message));
 await animatedPage.goto(url+'?cpu=1',{waitUntil:'networkidle'});
 await animatedPage.locator('.duel-othello .duel-square.available').first().click();
 await animatedPage.locator('.duel-othello .duel-square.duel-new-stone').waitFor();
 assert.ok(await animatedPage.locator('.duel-othello .duel-square.duel-flipped-stone').count()>=1,'captured stone gets a flip');
 const animation=await animatedPage.locator('.duel-othello .duel-new-stone .duel-piece').evaluate(el=>getComputedStyle(el).animationName);
 assert.match(animation,/duel-stone-land/,'motion-enabled browser plays landing animation');
 const halo=await animatedPage.locator('.duel-othello .duel-new-stone').evaluate(el=>getComputedStyle(el,'::after').animationName);
 assert.match(halo,/duel-placement-wave/,'move confirmation includes a lightweight impact ripple');
 await assertOthelloGeometry(animatedPage,'animated placement and flip');
 // Check mobile widths and after the delayed CPU return; neither the grid
 // nor the stones may stretch between moves or during an animated redraw.
 await animatedPage.waitForTimeout(900);
 for(const width of [320,375,390,430]){
  await animatedPage.setViewportSize({width,height:844});
  await assertOthelloGeometry(animatedPage,'CPU WebKit/Chromium at '+width+'px');
 }
 if(shotDir){
  await animatedPage.setViewportSize({width:390,height:844});
  await animatedPage.screenshot({path:resolve(shotDir,'03-othello-stone-geometry-'+engine+'.png'),fullPage:true,animations:'disabled'});
 }
 // Connect Four motion is measured in a real mobile browser, not inferred
 // from CSS source. One authoritative move creates a downward fall animation.
 await animatedPage.locator('#demo-mode').selectOption('connect4');
 const beforeChipCount=await animatedPage.locator('.duel-connect4-space.a').count();
 assert.equal(beforeChipCount,0,'Connect Four starts empty');
 await animatedPage.locator('.duel-connect4-head [data-duel-cell="0"]').click();
 const freshChip=animatedPage.locator('.duel-connect4-space.duel-c4-new-chip');
 await freshChip.waitFor();
 assert.equal(await freshChip.getAttribute('data-c4-index'),'35','the piece lands in the lowest slot');
 const drop=await freshChip.locator('i').evaluate(el=>({
  name:getComputedStyle(el).animationName,
  duration:getComputedStyle(el).animationDuration,
  distance:getComputedStyle(el.parentElement).getPropertyValue('--c4-drop-distance')
 }));
 assert.match(drop.name,/duel-c4-drop/,'real fall/bounce keyframes are active');
 assert.ok(parseFloat(drop.distance)>20,'drop distance is computed from rendered cell geometry');
 assert.ok(parseFloat(drop.duration)>0.45,'drop has a perceptible animated duration');
 if(shotDir)await animatedPage.screenshot({path:resolve(shotDir,'04-connect4-falling-chip-'+engine+'.png'),fullPage:true,animations:'disabled'});
 for(const width of [320,375,390,430]){
  await animatedPage.setViewportSize({width,height:844});
  assert.equal(await animatedPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Connect Four has no mobile horizontal overflow at '+width);
  const geometry=await animatedPage.locator('.duel-connect4-board').evaluate(el=>{
   const all=[...el.querySelectorAll('.duel-connect4-space')];
   return {count:all.length,first:all[0].getBoundingClientRect().width,last:all.at(-1).getBoundingClientRect().width};
  });
  assert.equal(geometry.count,42,'all 42 Connect Four spaces render');
  assert.ok(Math.abs(geometry.first-geometry.last)<1,'all columns have uniform widths');
 }

 // A second two-view page checks the genuine challenge->10 dice reveal motion.
 // No GPU tricks or staged fake dice: this is the same local mini-game rule path.
 await animatedPage.locator('[data-demo-play="two"]').click();
 await animatedPage.locator('#demo-mode').selectOption('bluffdice');
 await animatedPage.locator('[data-duel-target-toggle]').click();
 await animatedPage.locator('[data-duel-target-option]').click();
 await animatedPage.locator('[data-duel-act="create"]').click();
 await animatedPage.locator('[data-demo-view="b"]').click();
 await animatedPage.locator('[data-duel-act="accept"]').click();
 await animatedPage.locator('[data-demo-view="a"]').click();
 await animatedPage.locator('#duel-bid-count').selectOption('10');
 await animatedPage.locator('#duel-bid-face').selectOption('6');
 await animatedPage.locator('[data-duel-mini="bid"]').click();
 assert.equal(await animatedPage.locator('.duel-bluff-reveal-row').count(),0,'before challenge other dice remain secret');
 await animatedPage.locator('[data-demo-view="b"]').click();
 await animatedPage.locator('[data-duel-mini="challenge"]').click();
 const reveal=animatedPage.locator('.duel-bluff-showdown.duel-bluff-reveal-animated');
 await reveal.waitFor({timeout:6500});
 const rollAnimation=await reveal.locator('.duel-bluff-reveal-dice .duel-bluff-die').first().evaluate(el=>getComputedStyle(el).animationName);
 assert.match(rollAnimation,/duel-bluff-dice-roll/,'real WebKit/Chromium plays the dice reveal roll');
 assert.match(await reveal.innerText(),/ブラフを見破った/,'the result is grounded in the true declared count');
 for(const width of [320,375,390,430]){
  await animatedPage.setViewportSize({width,height:844});
  assert.equal(await animatedPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Bluff Dice fits iPhone width '+width);
 }
 if(shotDir){
  await animatedPage.setViewportSize({width:390,height:844});
  await animatedPage.screenshot({path:resolve(shotDir,'05-bluffdice-true-reveal-'+engine+'.png'),fullPage:true,animations:'disabled'});
 }
 // Test a real two-player poker exchange progression and card flips in
 // motion-enabled Chromium and iPhone WebKit. No test KP or D1 is touched.
 await animatedPage.locator('#demo-mode').selectOption('poker');
 await animatedPage.locator('[data-duel-target-toggle]').click();
 await animatedPage.locator('[data-duel-target-option]').click();
 await animatedPage.locator('[data-duel-act=create]').click();
 await animatedPage.locator('[data-demo-view=b]').click();
 await animatedPage.locator('[data-duel-act=accept]').click();
 await animatedPage.locator('[data-demo-view=a]').click();
 assert.equal(await animatedPage.locator('.duel-poker-reveal-card').count(),0);
 await animatedPage.locator('[data-duel-card="0"]').click();
 assert.equal(await animatedPage.locator('.duel-card.selected').count(),1);
 await animatedPage.locator('[data-duel-mini=poker]').click();
 assert.equal(await animatedPage.locator('.duel-poker-reveal-card').count(),0,'first swap never reveals the opponent');
 await animatedPage.locator('[data-demo-view=b]').click();
 await animatedPage.locator('[data-duel-mini=poker]').click();
 const pokerReveal=animatedPage.locator('.duel-poker-showdown.duel-poker-arrival');
 await pokerReveal.waitFor({timeout:7000});
 assert.equal(await pokerReveal.locator('.duel-poker-reveal-card').count(),10);
 assert.match(await pokerReveal.locator('.duel-poker-reveal-card').first().evaluate(el=>getComputedStyle(el).animationName),/duel-poker-flip/);
 for(const width of [320,375,390,430]){
  await animatedPage.setViewportSize({width,height:844});
  assert.equal(await animatedPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'poker no horizontal overflow at '+width);
 }
 if(shotDir)await animatedPage.screenshot({path:resolve(shotDir,'06-poker-card-flip-'+engine+'.png'),fullPage:true,animations:'disabled'});
 // The same real DOM renderer plays confirmed Hit/Blow feedback on WebKit
 // and Chromium without querying or modifying the production opponent secret.
 await animatedPage.locator('#demo-mode').selectOption('hitblow');
 await animatedPage.locator('[data-duel-target-toggle]').click();
 await animatedPage.locator('[data-duel-target-option]').click();
 await animatedPage.locator('[data-duel-act=create]').click();
 await animatedPage.locator('[data-demo-view=b]').click();
 await animatedPage.locator('[data-duel-act=accept]').click();
 const opponentCode=(await animatedPage.locator('.duel-hb-own-code .duel-hb-digit').allInnerTexts()).join('');
 assert.equal(opponentCode.length,4);
 await animatedPage.locator('[data-demo-view=a]').click();
 assert.equal(await animatedPage.locator('.duel-hb-code-reveal').count(),0,'public board never shows hidden opponent code');
 await animatedPage.locator('#duel-guess').fill(opponentCode);
 await animatedPage.locator('[data-duel-mini=hitblow]').click();
 const newFeedback=animatedPage.locator('.duel-hb-row.duel-hb-feedback-new');
 await newFeedback.waitFor({timeout:7000});
 assert.match(await newFeedback.evaluate(el=>getComputedStyle(el).animationName),/duel-hb-feedback-pulse/);
 assert.equal(await animatedPage.locator('.duel-hb-code-reveal').count(),1,'four Hit publishes code at resolution only');
 for(const width of [320,375,390,430]){
  await animatedPage.setViewportSize({width,height:844});
  assert.equal(await animatedPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Hit & Blow fits iPhone width '+width);
 }
 if(shotDir)await animatedPage.screenshot({path:resolve(shotDir,'07-hitblow-new-feedback-'+engine+'.png'),fullPage:true,animations:'disabled'});
 // P9.4 responsive standalone PvE page: test public snapshots without a
 // session token or any production Worker request. This is a UI/layout test.
 const pvePage=await ctx.newPage();
 pvePage.on('pageerror',e=>errors.push(e.message));
 await pvePage.goto('http://127.0.0.1:'+port+'/duel-pve.html',{waitUntil:'networkidle'});
 assert.match(await pvePage.locator('#pve-root').innerText(),/KP口座/);
 for(const game of ['othello','gomoku','connect4','hitblow','bluffdice','poker']){
  await pvePage.evaluate(async mode=>{
   const {pvePanel,duelRewardPanel,pveBuildPanel}=await import('./duel-pve/view.js?v=p95-build');
   const board=mode==='othello'?'.'.repeat(27)+'WB'+'.'.repeat(6)+'BW'+'.'.repeat(27):
    mode==='gomoku'?'.'.repeat(225):mode==='connect4'?'.'.repeat(42):
    mode==='hitblow'?JSON.stringify({history:[],turn:'a'}):
    mode==='bluffdice'?JSON.stringify({round:1,winsA:0,winsB:0,bid:null,history:[]}):
    JSON.stringify({doneA:false,doneB:false,turn:'a'});
   const ownHand=mode==='hitblow'?{kind:mode,value:'0123'}:
    mode==='bluffdice'?{kind:mode,value:[1,2,3,4,5]}:
    mode==='poker'?{kind:mode,value:[0,6,12,18,24]}:null;
   const rewardProfile={enabled:[],collection:[{mode:'pve',game:mode}],skills:[]};
   const build=[{game:mode,style:'attack'}];
   document.querySelector('#pve-root').innerHTML=pvePanel({
    match:{game:mode,level:'normal',board,ownHand,turn:'human',winner:null,version:0},
    connected:true,build
   })+pveBuildPanel(rewardProfile,build,false,'')+duelRewardPanel(rewardProfile);
   document.querySelectorAll('.duel-reward-panel details').forEach(panel=>{panel.open=true;});
  },game);
  for(const width of [375,390]){
   await pvePage.setViewportSize({width,height:844});
   assert.equal(await pvePage.locator('.duel-pve-panel').isVisible(),true,'PvE panel '+game);
   assert.equal(await pvePage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'PvE no overflow '+game+' '+width);
   assert.match(await pvePage.locator('.duel-pve-status').innerText(),/あなたの手番/);
   assert.equal(await pvePage.getByText('攻略遺物のヒント（攻め）',{exact:true}).isVisible(),true);
   assert.equal(await pvePage.locator('.duel-reward-panel li:visible').count(),12);
  }
  if(shotDir){
   await pvePage.screenshot({path:resolve(shotDir,'08-pve-'+game+'-'+engine+'.png'),fullPage:true,animations:'disabled'});
  }
 }
 // Use the real controller with test responses for the authenticated build flow.
 let savedBuild=[];
 await pvePage.addInitScript(()=>localStorage.setItem('keso-kp-session-v1','build-fixture-token'));
 await pvePage.route('https://valorant-results.tealeaforest.workers.dev/api/kp/**',async route=>{
  const request=route.request();
  const path=new URL(request.url()).pathname;
  if(request.method()==='OPTIONS'){
   await route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});
   return;
  }
  assert.equal(request.headers().authorization,'Bearer build-fixture-token');
  if(path==='/api/kp/duels/pve/build'&&request.method()==='POST'){
   const {game,style}=request.postDataJSON();
   assert.equal(game,'othello');
   savedBuild=style?[{game,style}]:[];
  }
  const json=path==='/api/kp/state'?{selfUserId:'test-owner'}:
   path==='/api/kp/duels/rewards'?{enabled:[],skills:[],collection:[{game:'othello',mode:'pve'}]}:
   {build:savedBuild};
  await route.fulfill({json,headers:{'Access-Control-Allow-Origin':'*'}});
 });
 await pvePage.goto('http://127.0.0.1:'+port+'/duel-pve.html');
 const buildChoice=pvePage.locator('[data-pve-build="othello"]');
 await buildChoice.selectOption('defense');
 await pvePage.getByText('攻略ビルドを保存しました。',{exact:true}).waitFor();
 await pvePage.reload();
 await buildChoice.waitFor();
 assert.equal(await buildChoice.inputValue(),'defense');
 await buildChoice.selectOption('');
 await pvePage.getByText('攻略ビルドを保存しました。',{exact:true}).waitFor();
 assert.deepEqual(savedBuild,[]);
 await pvePage.close();
 await animatedCtx.close();
 assert.deepEqual(requests,[],'demo must never call KP/Discord or Worker endpoints');
 assert.deepEqual(errors,[],'browser runtime errors');
 console.log('DUEL DEMO SUCCESS ('+engine+'): 6 modes, challenge+accept, real rules, hands/privacy, payout mock, screenshot UI, mobile widths, 0 D1 requests.');
 await ctx.close();
})().catch(e=>{console.error('DUEL DEMO FAILED ('+engine+')',e);console.error({errors,requests});process.exitCode=1}).finally(async()=>{await browser?.close();server.kill();});
