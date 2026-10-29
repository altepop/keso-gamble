// マインズ・スロット・ビデオポーカー・バカラ in the demo wallet, with the browser's crypto rigged so every outcome is known.
const {chromium}=require('playwright');const assert=require('node:assert/strict');const {spawn}=require('node:child_process');const {existsSync}=require('node:fs');const path=require('node:path');
const port=18769,server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:path.join(__dirname,'..'),stdio:'ignore'});let browser;
(async()=>{
 for(let i=0;i<40;i++){try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await context.addInitScript(()=>{for(const name of ['Audio','AudioContext','RTCPeerConnection'])Object.defineProperty(window,name,{value:()=>{throw Error('media requested')}});});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(8000);
 // The next single-number draws come from this list; everything else stays random.
 const rig=numbers=>page.evaluate(numbers=>{window.__rig=numbers;if(!window.__rigged){const original=crypto.getRandomValues.bind(crypto);crypto.getRandomValues=a=>{if(window.__rig.length&&a.length===1){a[0]=window.__rig.shift();return a;}return original(a);};window.__rigged=true;}},numbers);
 const cash=async()=>Number((await page.locator('.topbar .badge').first().innerText()).replace(/[^\d]/g,''));
 const until=async(check,label)=>{for(let i=0;i<80;i++){if(await check())return;await new Promise(r=>setTimeout(r,50));}assert.fail(label);};
 const cashIs=n=>until(async()=>await cash()===n,`cash ${n}`);
 const count=(selector,n)=>until(async()=>await page.locator(selector).count()===n,`${selector} ×${n}`);
 const game=id=>page.locator(`[data-casino-game=${id}]`).click();
 const noOverflow=async label=>{for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${label} at ${width}px`);}await page.setViewportSize({width:390,height:844});};
 await page.goto(`http://127.0.0.1:${port}`);await page.locator('.title-start').click();
 await page.locator('.nav-btn[data-screen=race]').click();await page.locator('.sub-tab[data-screen=casino]').click();
 assert.equal(await page.locator('[data-casino-game]').count(),7);
 const start=await cash();

 // マインズ: two safe cells, then cash out at the shown multiplier.
 await game('mines');await page.locator('#mines-amount').fill('1000');await page.locator('[data-mines-count="3"]').click();
 await page.locator('[data-action=mines-start]').click();await cashIs(start-1000);
 assert.equal(await page.locator('[data-action=mines-cashout]').isDisabled(),true,'nothing to cash out before a pick');
 await rig([24]);await page.locator('[data-cell="0"]').click();await count('.mines-cell.safe',1);
 await rig([23]);await page.locator('[data-cell="1"]').click();await count('.mines-cell.safe',2);
 assert.match(await page.locator('.mines-info').innerText(),/1\.25倍/);
 await rig([0,0,0]);await page.locator('[data-action=mines-cashout]').click();
 await page.locator('.casino-verdict').filter({hasText:'倍で降りた'}).waitFor();
 assert.equal(await page.locator('.mines-cell.bomb').count(),3);await cashIs(start-1000+1250);
 // A mine on the first pick.
 await page.locator('[data-action=mines-start]').click();await count('button.mines-cell',25);
 await rig([0,0,0]);await page.locator('[data-cell="12"]').click();
 await page.locator('.casino-verdict').filter({hasText:'地雷を踏んだ'}).waitFor();await cashIs(start-1000+1250-1000);
 await noOverflow('mines');

 // スロット: 💎💎💎 in the demo pays 300× with no shared jackpot.
 let before=await cash();
 await game('slot');assert.match(await page.locator('.slot-jackpot').innerText(),/本番口座だけ/);
 await page.locator('#slot-amount').fill('100');await rig([20,20,20]);await page.locator('[data-action=slot]').click();
 await page.locator('.casino-verdict').waitFor();await count('.slot-reel[aria-label="💎"]',3);await cashIs(before-100+30000);
 await noOverflow('slot');

 // ビデオポーカー: A-4 of spades held, a 6 of spades drawn: a flush.
 before=await cash();
 await game('poker');await page.locator('#vp-amount').fill('200');await rig([0,0,0,0,0]);await page.locator('[data-action=vp-deal]').click();
 await count('button.vp-card',5);await cashIs(before-200);
 for(const i of [0,1,2,3]){await page.locator(`[data-vp-hold="${i}"]`).click();await count('.vp-card.held',i+1);}
 await rig([0]);await page.locator('[data-action=vp-draw]').click();
 await page.locator('.casino-verdict').filter({hasText:'フラッシュ'}).waitFor();await cashIs(before-200+1000);
 await noOverflow('poker');

 // バカラ: player 8 (a natural) against banker 7.
 before=await cash();
 await game('baccarat');await page.locator('#baccarat-amount').fill('500');await rig([7,12,2,3]);await page.locator('[data-action=baccarat][data-side=player]').click();
 await page.locator('.casino-verdict').filter({hasText:'プレイヤーの勝ち'}).waitFor();await cashIs(before+500);
 assert.match(await page.locator('.bac-side.won').innerText(),/プレイヤー\s*8/);
 await noOverflow('baccarat');

 assert.deepEqual(errors,[]);
 console.log('More casino passed: mines safe picks, cash-out and a mine, slot 💎💎💎 without a demo jackpot, video poker hold and draw, baccarat natural, 320/390/1280 widths.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.kill()});
