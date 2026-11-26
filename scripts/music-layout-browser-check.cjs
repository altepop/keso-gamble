// Regression test for #music-panel rows overlaying volume controls on iPhone.
// Runs real Chromium/WebKit CSS layout; the song list must never paint on top of settings.
const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {existsSync}=require('node:fs');
const path=require('node:path');
const engine=process.argv[2]==='webkit'?'webkit':'chromium';
const browserType=engine==='webkit'?webkit:chromium;
const port=engine==='webkit'?18785:18784;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{
 cwd:path.join(__dirname,'..'),stdio:'ignore'
});
let browser;
const wait=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
function checkRectInside(inner,outer,label){
 assert.ok(inner.left>=outer.left-3&&inner.right<=outer.right+3,label+' extends horizontally outside panel');
}
(async()=>{
 for(let i=0;i<60;i++){
  try{if((await fetch('http://127.0.0.1:'+port)).ok)break;}catch{}
  await wait(120);
 }
 browser=await browserType.launch({
  ...(engine==='chromium'&&{executablePath:process.env.CHROMIUM_PATH||
   (existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined)}),
  args:engine==='chromium'?['--no-sandbox']:[]
 });
 for(const dims of [{width:390,height:844},{width:320,height:568},{width:1440,height:900}]){
  const ctx=await browser.newContext({viewport:dims});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+port);
  await page.locator('.title-start').waitFor();
  await page.locator('.music-open').click();
  await page.locator('#music-panel:not([hidden])').waitFor();
  const titleGeometry=await page.evaluate(()=>{
   const get=(selector)=>{const el=document.querySelector(selector);if(!el)return null;
    const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};};
   return {panel:get('#music-panel'),first:get('.music-now'),last:get('.music-bottom'),
    content:get('.music-info'),mode:get('#music-panel')&&getComputedStyle(document.querySelector('#music-panel')).display};
  });
  assert.equal(titleGeometry.mode,'block','panel must use nonshrinking block layout');
  assert.ok(titleGeometry.first.bottom<titleGeometry.last.top,'player and volume controls overlap on title');
  assert.ok(titleGeometry.last.bottom<titleGeometry.content.top,'volume and description overlap on title');
  checkRectInside(titleGeometry.first,titleGeometry.panel,'title currently playing');

  await page.locator('.music-close').click();
  await page.locator('.title-start').click();
  await page.locator('.nav-btn').first().waitFor();
  await page.locator('.music-open').click();
  const geometry=await page.evaluate(()=>{
   const get=(selector)=>{const el=document.querySelector(selector);if(!el)return null;
    const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};};
   const panel=document.querySelector('#music-panel');
   return {panel:get('#music-panel'),nav:get('.bottom-nav'),songList:get('.music-song-list'),
    lastSong:get('#music-song-masakane'),volume:get('.music-bottom'),status:get('.music-status'),
    tab:get('.music-tabs'),css:{position:getComputedStyle(panel).position,display:getComputedStyle(panel).display},
    expanded:document.querySelector('#keso-music').classList.contains('music-expanded')};
  });
  assert.equal(geometry.css.position,'fixed');
  assert.equal(geometry.css.display,'block');
  assert.equal(geometry.expanded,true);
  assert.ok(geometry.panel.top>=0&&geometry.panel.bottom<=dims.height+1,'panel escapes viewport');
  assert.ok(geometry.panel.bottom<=geometry.nav.top-1,'panel is underneath fixed game navigation');
  assert.ok(geometry.songList.bottom+4<=geometry.volume.top,'the playlist overlaps the volume slider');
  assert.ok(geometry.volume.bottom+4<=geometry.status.top,'volume overlaps status message');
  checkRectInside(geometry.volume,geometry.panel,'volume area');
  checkRectInside(geometry.lastSong,geometry.panel,'last song');
  const onSong=page.locator('#music-song-masakane');
  await onSong.scrollIntoViewIfNeeded();
  await onSong.click();
  await page.locator('#music-tab-lyrics').click();
  assert.match(await page.locator('#music-lyrics-content').innerText(),/まさかね/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#music-panel').isHidden(),true,'Escape closes dialog');
  // Exercise the exact CSS selectors independently of autoplay policy and spin outcomes.
  const motifs=await page.evaluate(()=>{
   const app=document.querySelector('#app'),open=document.querySelector('#keso-music .music-open');
   const fixture=document.createElement('section');
   fixture.className='slot-arena';
   fixture.innerHTML='<div class="slot-marquee"><small>FORTUNE</small></div><div class="slot-machine"></div>';
   app.appendChild(fixture);
   const songs=[...document.querySelectorAll('#keso-music .music-song')];
   const previous=songs.map(el=>el.getAttribute('aria-current'));
   const playing=open.classList.contains('playing');
   const read=()=>getComputedStyle(fixture.querySelector('small'),'::after').content;
   const choose=id=>songs.forEach(el=>el.setAttribute('aria-current',String(el.id==='music-song-'+id)));
   try{
    open.classList.remove('playing');choose('mou');
    const stopped=read();
    open.classList.add('playing');
    const normal=read();
    choose('kyohansha');const midnight=read();
    choose('relic');const relic=read();
    choose('fullpa');const fullpa=read();
    choose('makekowa');const fire=read();
    open.classList.remove('playing');const stoppedAgain=read();
    return {stopped,normal,midnight,relic,fullpa,fire,stoppedAgain};
   }finally{
    fixture.remove();open.classList.toggle('playing',playing);
    songs.forEach((el,i)=>previous[i]===null?el.removeAttribute('aria-current'):el.setAttribute('aria-current',previous[i]));
   }
  });
  assert.equal(motifs.stopped,motifs.stoppedAgain);
  assert.match(motifs.normal,/♫/);
  assert.match(motifs.midnight,/02:00/);
  assert.match(motifs.relic,/𓂀/);
  assert.match(motifs.fullpa,/⚡/);
  assert.match(motifs.fire,/🔥/);
  assert.doesNotMatch(motifs.stopped,/♫|02:00|𓂀|⚡|🔥/);
  assert.equal(errors.length,0,'browser console errors: '+errors.join('; '));
  console.log('Music modal layout passed: '+engine+' '+dims.width+'x'+dims.height);
  await ctx.close();
 }
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
 try{await browser?.close();}finally{server.kill('SIGTERM');}
});
