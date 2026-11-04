// 効果音 in a real browser: silent and without any AudioContext until switched on; once on, a roulette spin and the
// racing screen play synthesized sounds, the choice survives a reload, and switching off closes the audio again.
const {chromium}=require('playwright');const assert=require('node:assert/strict');const {spawn}=require('node:child_process');const {existsSync}=require('node:fs');const path=require('node:path');
const port=18781,server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:path.join(__dirname,'..'),stdio:'ignore'});let browser;
(async()=>{
 for(let i=0;i<40;i++){try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:390,height:844}});
 await ctx.addInitScript(()=>{
  window.__audio={contexts:0,sources:0,closed:0};
  const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){}});
  const node=()=>({connect(){},frequency:param(),gain:param(),Q:param(),type:''});
  class Fake{constructor(){window.__audio.contexts++;this.state='running';this.currentTime=0;this.sampleRate=8000;this.destination={};}
   createGain(){return node();}createBiquadFilter(){return node();}
   createOscillator(){window.__audio.sources++;return {...node(),start(){},stop(){}};}
   createBuffer(_c,len){return {getChannelData:()=>new Float32Array(len)};}
   createBufferSource(){window.__audio.sources++;return {...node(),buffer:null,start(){},stop(){}};}
   resume(){return Promise.resolve();}close(){window.__audio.closed++;this.state='closed';return Promise.resolve();}}
  window.__spoken=[];
  Object.defineProperty(window,'SpeechSynthesisUtterance',{value:function(text){this.text=text;}});
  Object.defineProperty(window,'speechSynthesis',{value:{speak(u){window.__spoken.push(u.text);},cancel(){},getVoices:()=>[]}});
  Object.defineProperty(window,'AudioContext',{value:Fake});Object.defineProperty(window,'webkitAudioContext',{value:Fake});
 });
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(8000);
 const audio=()=>page.evaluate(()=>({...window.__audio}));
 await page.goto(`http://127.0.0.1:${port}`);await page.locator('.title-start').click();
 await page.locator('.nav-btn[data-screen=race]').click();await page.locator('.sub-tab[data-screen=casino]').click();
 const toggle=page.locator('[data-action=sfx-toggle]');
 assert.equal(await toggle.getAttribute('aria-pressed'),'false','効果音 starts off');
 // Off: a whole roulette round creates no audio at all.
 await page.locator('[data-bet=red]').click();await page.locator('#bet-amount').fill('100');await page.locator('[data-action=spin]').click();
 await page.waitForTimeout(2200);
 assert.deepEqual(await audio(),{contexts:0,sources:0,closed:0},'no AudioContext while 効果音 is off');
 // On: the tap opens audio and the round plays the spin, landing and result sounds.
 await toggle.click();await page.locator('[data-action=sfx-toggle][aria-pressed=true]').waitFor();
 assert.equal((await audio()).contexts,1);
 const afterToggle=(await audio()).sources;
 await page.locator('[data-bet=black]').click();await page.locator('[data-action=spin]').click();await page.waitForTimeout(2200);
 assert.ok((await audio()).sources>afterToggle+20,'spin ticks, landing and result were synthesized');
 // The racing screen has the same switch, already on.
 await page.locator('.sub-tab[data-screen=race]').click();
 assert.equal(await page.locator('[data-action=sfx-toggle]').getAttribute('aria-pressed'),'true');
 // The choice survives a reload; switching off closes the audio context.
 await page.reload();await page.locator('.title-start').click();await page.locator('.nav-btn[data-screen=race]').click();
 assert.equal(await page.locator('[data-action=sfx-toggle]').getAttribute('aria-pressed'),'true');
 await page.locator('[data-action=sfx-toggle]').click();await page.locator('[data-action=sfx-toggle][aria-pressed=false]').waitFor();
 // The big-win show (switched back on): titles climb BIG → MEGA → SUPER MEGA WIN with the announcer, the amount counts
 // up to the real result, a tap skips to the end and another closes it.
 await page.locator('[data-action=sfx-toggle]').click();await page.locator('[data-action=sfx-toggle][aria-pressed=true]').waitFor();
 await page.evaluate(()=>{window.__spoken.length=0;});
 const version=await page.evaluate(()=>[...document.querySelectorAll('script[src*="bootstrap.js"]')][0].src.split('?v=')[1]);
 await page.evaluate(v=>import('./js/bigwin.js?v='+v).then(m=>{window.__bigWinShown=m.showBigWin(5000,100,{reducedMotion:false});}),version);
 await page.locator('.bigwin [data-bigwin-title]').filter({hasText:'SUPER MEGA WIN'}).waitFor({timeout:9000});
 assert.deepEqual(await page.evaluate(()=>window.__spoken),['Big win!','Mega win!','Super mega win!']);
 await page.locator('.bigwin').click({position:{x:20,y:20}});
 assert.equal(await page.locator('[data-bigwin-count]').innerText(),'5,000');
 await page.locator('.bigwin').click({position:{x:20,y:20}});
 assert.equal(await page.locator('.bigwin').count(),0,'a second tap closes the show');
 assert.equal(await page.evaluate(()=>import('./js/bigwin.js').then(m=>m.showBigWin(300,100))),false,'an ordinary win has no show');
 assert.deepEqual(errors,[]);
 console.log('Sound effects passed: off by default with no AudioContext, switch-on tap opens audio, roulette sounds, racing switch shared, persisted, switch-off; big-win show climbs BIG → MEGA → SUPER MEGA WIN with announcer, counts to the result, skip and close.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close();server.kill()});
