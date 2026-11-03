const {chromium}=require('playwright');const assert=require('node:assert/strict');const {spawn}=require('node:child_process');const {existsSync}=require('node:fs');
const server=spawn('python3',['-m','http.server','8766','--bind','127.0.0.1'],{stdio:'ignore'});let browser;
(async()=>{
 const {createInitialState}=await import('../js/engine.js');const state={...createInitialState(),cash:2700,voiceRewards:{enabled:true,connected:true,eligible:true,earned:5,amount:15,dailyCap:240},quizRates:{DAILY:100,SOLO:50,AGENT:50,RANKED:100},quizCounts:{RANKED:2},quizLimits:{RANKED:10},quizCompleted:['DAILY'],serverWallet:true,selfUserId:'one',members:[{id:'one',name:'本人'},{id:'two',name:'相手 <b>text</b>'}],rewardRates:{competitive:{win:900,loss:-200,bottom:-400},teamdeathmatch:{win:70,loss:0,bottom:-30}},mastery:[{agent:'ジェット<b>',games:30,wins:9,titles:['ジェットしか友達がいない','ジェットの面汚し']}]};
 let debitCount=0,lost=true,authCalls=0,logouts=0;const results=new Map();const errors=[];
 for(let n=0;n<40;n++){try{if((await fetch('http://127.0.0.1:8766')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:390,height:844}});
 await ctx.addInitScript(()=>{for(const name of ['Audio','AudioContext','RTCPeerConnection'])Object.defineProperty(window,name,{value:()=>{throw Error('media requested')}});Object.defineProperty(navigator,'audioSession',{get(){throw Error('audio session requested')}});});
 let page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await ctx.route('https://valorant-results.tealeaforest.workers.dev/api/kp/**',async route=>{
  if(new URL(route.request().url()).pathname.endsWith('/feed'))return route.fulfill({json:{entries:[]}});
  const path=new URL(route.request().url()).pathname;let result;
  if(path.endsWith('auth')){authCalls++;result={token:'a'.repeat(48)};}
  else {assert.equal(route.request().headers().authorization,'Bearer '+'a'.repeat(48));
   if(path.endsWith('state'))result=state;
   else if(path.endsWith('pulse'))result={pulse:`${state.cash}:${state.directives.length}`};
   else if(path.endsWith('logout')){logouts++;result={disconnected:true};}
   else{const body=route.request().postDataJSON();if(!results.has(body.id)){
    debitCount++;if(body.action==='spin'){state.cash-=100;state.spins=[{outcome:0,amount:100,payout:0}];results.set(body.id,{result:{outcome:0,payout:0}});}
    else if(body.action==='directive'){state.cash-=2500;state.directives.push({id:body.id,target:'two',task:'unrated',cost:2500,status:'active',time:Date.now()});results.set(body.id,{result:{issued:true}});}
    else if(body.action==='luxury'){assert.equal(body.args.item,'title');assert.equal(body.args.title,'KP長者');state.cash-=20000;state.luxury={title:body.args.title,convicts:[],billboard:null,statues:[]};results.set(body.id,{result:{luxury:{item:'title',id:'test-luxury'}}});}
    else throw Error('unexpected action');
   }result=results.get(body.id);if(body.action==='spin'&&lost){lost=false;await route.abort();return;}}
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.goto('http://127.0.0.1:8766');await page.locator('#kp-connect-code').fill('c'.repeat(48));await page.locator('[data-action=connect-kp]').click();await page.locator('.home-summary').waitFor();
 assert.match(await page.locator('.badge').first().innerText(),/2,700/);
 await page.close();page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8766');await page.locator('.title-start').filter({hasText:'2,700'}).waitFor();assert.equal(await page.locator('#kp-connect-code').count(),0);assert.equal(authCalls,1);await page.locator('.title-start').click();
 await page.locator('summary',{hasText:'エージェント熟練度'}).click(); // folded on the home screen
 assert.match(await page.locator('#app').innerText(),/エージェント熟練度[\s\S]*30試合・9勝[\s\S]*「ジェットしか友達がいない」\s*「ジェットの面汚し」/);assert.equal(await page.locator('.asset-card b').count(),0);
 await page.locator('.nav-btn[data-screen=play]').click();assert.equal(await page.locator('[data-approve]').count(),0);assert.match(await page.locator('#app').innerText(),/VCT QUIZで稼ぐ/);assert.match(await page.locator('#app').innerText(),/朝9時/);assert.match(await page.locator('#app').innerText(),/受取済み/);assert.match(await page.locator('#app').innerText(),/2\/10回/);assert.match(await page.locator('#app').innerText(),/通話で稼ぐ/);assert.match(await page.locator('#app').innerText(),/5 \/ 240 KP/);assert.equal(await page.locator('#claim-reference').count(),0);assert.match(await page.locator('#app').innerText(),/コンペ\s*勝ち \+900 KP\s*負け −200 KP／最下位 −400 KP/);assert.match(await page.locator('#app').innerText(),/細かいルール（デスマ・エスカ・ラッキー）/);
 await page.locator('.nav-btn[data-screen=assets]').click();assert.equal(await page.locator('[data-action=salary]').count(),0);assert.equal(await page.locator('[data-action=reset]').count(),0);
 await page.locator('.nav-btn[data-screen=race]').click();await page.locator('.sub-tab[data-screen=casino]').click();await page.locator('#bet-amount').fill('100');await page.locator('[data-action=spin]').click();await page.locator('.kp-connection').filter({hasText:'通信結果'}).waitFor();assert.equal(debitCount,1);
 await page.reload();await page.locator('[data-action=refresh-kp]').click();await page.waitForFunction(()=>!sessionStorage.getItem('keso-kp-pending-v1'));assert.equal(debitCount,1);await page.locator('.title-start').click();assert.match(await page.locator('.badge').first().innerText(),/2,600/);
 await page.locator('.nav-btn[data-screen=directives]').click();await page.locator('#directive-target').selectOption('two');await page.locator('#directive-task').selectOption('unrated');assert.equal(await page.locator('#directive-target b').count(),0);await page.locator('[data-action=issue-directive]').click();await page.locator('.history-entry').waitFor();assert.match(await page.locator('.badge').first().innerText(),/100/);assert.equal(debitCount,2);assert.equal(await page.locator('[data-complete]').count(),0);
 // A native confirm is blocked by some Discord/iOS embeds. The shop must not need it.
 state.cash=30000;
 await page.locator('.nav-btn[data-screen=assets]').click();await page.locator('[data-action=refresh-kp]').click();
 await page.locator('.nav-btn[data-screen=directives]').click();await page.locator('.sub-tab[data-screen=shop]').click();
 assert.equal(await page.locator('.screen').getAttribute('data-view'),'shop');
 assert.equal(await page.locator('[data-action=luxury]').count(),7);
 await page.evaluate(()=>{window.confirm=()=>{throw Error('native confirm must not be used for luxury');};});
 await page.locator('#lux-title').selectOption('KP長者');
 await page.locator('[data-action=luxury][data-item=title]').click();
 const confirmationText=await page.locator('.luxury-confirmation').innerText();
 assert.match(confirmationText,/20,000 KP/);
 assert.match(confirmationText,/指定内容：KP長者/);
 assert.equal(debitCount,2,'opening the in-page review must not debit the wallet');
 await page.locator('[data-action=luxury-cancel]').click();
 assert.equal(await page.locator('.luxury-confirmation').count(),0);
 assert.equal(debitCount,2,'cancellation must not debit the wallet');
 await page.locator('[data-action=luxury][data-item=title]').click();
 await page.locator('[data-action=luxury-approve]').click();
 // Click dispatch does not wait for the async server debit + refreshed state.
 await page.locator('.luxury-confirmation').waitFor({state:'detached',timeout:8000});
 await page.locator('.asset-card').filter({hasText:'あなたの称号:「KP長者」'}).waitFor();
 assert.equal(debitCount,3,'one approved luxury purchase debits the server once');
 assert.equal(await page.locator('.luxury-confirmation').count(),0);
 assert.equal(await page.evaluate(()=>localStorage.getItem('keso-exchange-v0.2')),null);
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 // The account controls live on 資産.
 await page.locator('.nav-btn[data-screen=assets]').click();
 // Simulate Discord/iPhone native chrome covering the top 64 CSS pixels.
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{document.documentElement.classList.add('discord-activity');const chrome=document.createElement('div');chrome.id='native-chrome';Object.assign(chrome.style,{position:'fixed',top:'0',left:'0',right:'0',height:'64px',zIndex:'99999',background:'#000'});document.body.append(chrome);});
 for(const action of ['refresh-kp','disconnect-kp']){const button=page.locator(`[data-action=${action}]`);await button.scrollIntoViewIfNeeded();const box=await button.boundingBox();assert.ok(box.y>=64&&box.height>=48&&box.x>=0&&box.x+box.width<=390);}
 await page.locator('[data-action=refresh-kp]').click();
 await page.locator('[data-action=disconnect-kp]').click();await page.locator('#kp-connect-code').waitFor();assert.equal(logouts,1);assert.equal(await page.evaluate(()=>localStorage.getItem('keso-kp-session-v1')),null);
 assert.deepEqual(errors,[]);console.log('Live browser flow passed: private connection survives closing and reopening without another code, server balance, durable lost-reply retry, no demo minting, directive debit, escaped members, mobile layout, server logout, no audio session.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.kill()});
