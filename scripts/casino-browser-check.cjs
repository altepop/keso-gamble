// Optional local tooling: npm install --no-save playwright (Chromium required).
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {existsSync,mkdirSync}=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..'),port=18765,key='keso-exchange-v0.2';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
let browser;
(async()=>{
 for(let i=0;i<40;i++){try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 const errors=[],media=[];
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await context.exposeBinding('__mediaAudit',(_,name)=>media.push(name));
 await context.addInitScript(()=>{
  for(const name of ['Audio','AudioContext','webkitAudioContext','RTCPeerConnection'])Object.defineProperty(window,name,{configurable:true,value:function(){window.__mediaAudit(name);throw Error('Unexpected media use');}});
  HTMLMediaElement.prototype.play=function(){window.__mediaAudit('play');throw Error('Unexpected media use');};
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}`);await page.locator('.title-start').click();await page.locator('[data-screen=casino]').click();await page.locator('[data-casino-game=chinchiro]').click();
 const diceSequence=[1,1,3,0,0,0];
 async function rig(numbers){await page.evaluate(numbers=>{const original=crypto.getRandomValues.bind(crypto);crypto.getRandomValues=array=>{if(numbers.length&&array.length===1){array[0]=numbers.shift();return array;}return original(array);};},numbers);}
 await rig(diceSequence);await page.locator('[data-action=chinchiro]').click();
 await page.locator('.die.tumbling').first().waitFor();assert.equal(await page.locator('.casino-verdict').count(),0);
 assert.equal(await page.locator('[data-action=chinchiro]').isDisabled(),true);
 await page.locator('[data-action=chinchiro]').dispatchEvent('click');
 if(process.env.CASINO_SCREENSHOTS){mkdirSync(process.env.CASINO_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.CASINO_SCREENSHOTS,'dice-rolling.png'),fullPage:true});}
 await page.locator('.dice-side.active .dice-bowl[data-stopped="1"]').waitFor();
 assert.equal(await page.locator('.dice-side.active .die[role=img]').count(),1);
 await page.locator('.dice-side.active .dice-bowl[data-stopped="2"]').waitFor();
 assert.equal(await page.locator('.dice-side.active .die[role=img]').count(),2);
 assert.equal(await page.locator('.dice-side.active .die.tumbling').count(),1);
 assert.equal(await page.locator('.casino-verdict').count(),0);
 assert.match(await page.locator('.dice-tension').innerText(),/ゾロ目/);
 assert.equal(await page.locator('.dice-side.active .die.newly-landed').count(),1,'only the die that just stopped bounces');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'rolling dice stay inside the mobile viewport');
 const bowl=await page.locator('.dice-side.active .dice-bowl').boundingBox();assert.ok(bowl.width>250,'the active bowl has room for the throw');
 if(process.env.CASINO_SCREENSHOTS)await page.screenshot({path:path.join(process.env.CASINO_SCREENSHOTS,'dice-last.png'),fullPage:false});
 await page.locator('.casino-verdict.fresh').waitFor();assert.match(await page.locator('.casino-net').innerText(),/2,500/);
 if(process.env.CASINO_SCREENSHOTS)await page.screenshot({path:path.join(process.env.CASINO_SCREENSHOTS,'dice-win.png'),fullPage:true});
 await page.waitForFunction(()=>!document.querySelector('[data-action=chinchiro]').disabled);
 assert.equal(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).chinchiro.length,key),1);
 assert.equal(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).cash,key),12500);
 await rig([1,1,3,0,0,0]);await page.locator('[data-action=chinchiro]').click();await page.locator('[data-action=casino-skip]').click();
 await page.waitForFunction(()=>!document.querySelector('[data-action=chinchiro]').disabled);
 assert.equal(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).chinchiro.length,key),2);
 await page.locator('#chinchiro-amount').fill('20000');await page.locator('[data-action=chinchiro]').click();await page.locator('.toast').filter({hasText:'所持KP'}).waitFor();assert.equal(await page.locator('[data-action=chinchiro]').isDisabled(),false);assert.equal(await page.locator('[data-action=casino-skip]').count(),0);
 await page.locator('[data-casino-game=blackjack]').click();await rig([9,5,6]);await page.locator('[data-action=bj-start]').click();
 await page.locator('.playing-card.dealt').first().waitFor();assert.equal(await page.locator('[data-action=bj-hit]').isDisabled(),true);
 await page.waitForFunction(()=>document.querySelector('[data-action=bj-hit]')&&!document.querySelector('[data-action=bj-hit]').disabled);
 assert.equal(await page.locator('.bj-seat').last().locator('.playing-card:not(.back)').count(),2);
 assert.match(await page.locator('.bj-seat').last().locator('.bj-total').innerText(),/16/);
 if(process.env.CASINO_SCREENSHOTS)await page.screenshot({path:path.join(process.env.CASINO_SCREENSHOTS,'blackjack-playing.png'),fullPage:false});
 await rig([8,9]);await page.locator('[data-action=bj-stand]').click();await page.locator('.playing-card.dealt').first().waitFor();assert.equal(await page.locator('.casino-verdict').count(),0);
 await page.locator('.casino-verdict.fresh').waitFor();assert.match(await page.locator('.casino-net').innerText(),/500/);
 await page.waitForFunction(()=>document.querySelector('[data-action=bj-start]')&&!document.querySelector('[data-action=bj-start]').disabled);
 for(const width of [320,390,1280]){
  await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'blackjack width '+width);
  await page.locator('[data-casino-game=chinchiro]').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'dice width '+width);
  await page.locator('[data-casino-game=blackjack]').click();
 }
 await page.emulateMedia({reducedMotion:'reduce'});await rig([9,5,6]);await page.locator('[data-action=bj-start]').click();
 await page.waitForFunction(()=>document.querySelector('[data-action=bj-hit]')&&!document.querySelector('[data-action=bj-hit]').disabled);
 assert.equal(await page.locator('.playing-card.dealt').count(),0);assert.equal(await page.locator('[data-action=casino-skip]').count(),0);
 await rig([8,9]);await page.locator('[data-action=bj-stand]').click();await page.waitForFunction(()=>document.querySelector('[data-action=bj-start]')&&!document.querySelector('[data-action=bj-start]').disabled);
 await page.reload();await page.locator('.title-start').click();await page.locator('[data-screen=casino]').click();await page.locator('[data-casino-game=blackjack]').click();assert.equal(await page.locator('.casino-verdict.fresh').count(),0,'reload does not replay a settled round');
 assert.deepEqual(media,[]);assert.deepEqual(errors,[]);
 console.log('Casino browser checks passed: 3D dice, individual stops, last-die suspense, cards, exactly one demo round, skip, reduced motion, persisted reload, 320/390/1280 widths, no audio activation.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();});
