// The independent KESO COACH page must work on phone and never poll, write KP,
// or disclose the bearer token into markup. All responses are mocked.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const root=require('node:path').join(__dirname,'..');
const server=spawn('python3',['-m','http.server','18784','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
(async()=>{
 for(let i=0;i<40;i++){try{if((await fetch('http://127.0.0.1:18784/coach.html')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const token='a'.repeat(48);
  const report={
    totalVdkRosterMatches:44,archivedMatches:3,usableMatches:3,invalidMatches:0,killDataMissing:0,roundDataMissing:0,
    overall:{rounds:68,firstKillWinPct:70,firstKillWins:21,firstKillOutcomesKnown:30,comebackWins:7,roundsWithSides:0,repeatedVictimRounds:1},
    maps:[{map:'Corrode',matches:1,rounds:22,ourFirstKills:13,firstKillWins:8,firstKillLosses:5,firstKillWinPct:61.5}],
    trioComparisons:[{map:'Corrode',composition:'Fade + Clove',matches:1,firstKillWins:8,firstKillLosses:5,firstKillWinPct:61.5}],
    individual:[
      {player:'VDK',matches:3,rounds:68,observedOpeningRounds:68,firstKills:4,firstDeaths:6,fkFdDiff:-2,firstKillWins:3,firstKillLosses:1,firstKillWinPct:75,openingKillerDiedWithin5s:0,firstDeathKillerEliminatedWithin5s:2},
      {player:'Abema',matches:3,rounds:68,observedOpeningRounds:68,firstKills:9,firstDeaths:7,fkFdDiff:2,firstKillWins:6,firstKillLosses:3,firstKillWinPct:66.7,openingKillerDiedWithin5s:1,firstDeathKillerEliminatedWithin5s:1},
      {player:'石原',matches:3,rounds:68,observedOpeningRounds:68,firstKills:8,firstDeaths:3,fkFdDiff:5,firstKillWins:7,firstKillLosses:1,firstKillWinPct:87.5,openingKillerDiedWithin5s:1,firstDeathKillerEliminatedWithin5s:0}
    ],
    individualMapAgent:[
      {player:'VDK',map:'Corrode',agent:'Fade',matches:1,firstKills:0,firstDeaths:1,fkFdDiff:-1,firstKillWinPct:null,openingKillerDiedWithin5s:0,firstDeathKillerEliminatedWithin5s:0}
    ]
  };
  const ctx=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
  await ctx.addInitScript(t=>localStorage.setItem('keso-kp-session-v1',t),token);
  const requests=[];
  await ctx.route('https://valorant-results.tealeaforest.workers.dev/**',async route=>{
   const req=route.request();requests.push({url:req.url(),method:req.method(),auth:req.headers().authorization});
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(report)});
  });
  const page=await ctx.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:18784/coach.html');
  await page.locator('#report:not([hidden])').waitFor();
  assert.match(await page.locator('#totals').innerText(),/44/);
  assert.match(await page.locator('#maps').innerText(),/61\.5%/);
  assert.match(await page.locator('#trio').innerText(),/Fade/);
  assert.match(await page.locator('#players').innerText(),/VDK/);
  assert.match(await page.locator('#players').innerText(),/石原/);
  assert.match(await page.locator('#players').innerText(),/5秒以内/);
  assert.match(await page.locator('#player-map').innerText(),/Corrode \/ Fade/);
  assert.match(await page.locator('#player-map').innerText(),/−1|-1/);
  assert.match(await page.locator('#quality').innerText(),/複数回死亡/);
  assert.equal(requests.length,1,'no extra polling or KPI writes');
  assert.equal(requests[0].method,'GET');
  assert.equal(requests[0].auth,'Bearer '+token);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'phone-width layout');
  assert.ok(!(await page.locator('body').innerText()).includes(token),'no token in visible markup');
  await page.locator('#reload').click();
  assert.equal(requests.length,2,'refresh is manual only');
  assert.deepEqual(errors,[]);
  await ctx.close();
  const guest=await browser.newContext({viewport:{width:320,height:568},isMobile:true});
  const second=await guest.newPage();
  await second.route('https://valorant-results.tealeaforest.workers.dev/**',async route=>{
   if(route.request().url().endsWith('/api/kp/auth'))await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token})});
   else await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(report)});
  });
  await second.goto('http://127.0.0.1:18784/coach.html');
  await second.locator('#connection').waitFor({state:'visible'});
  assert.equal(await second.locator('#report').isHidden(),true);
  await second.locator('#code').fill('b'.repeat(48));
  await second.locator('#connect-form button').click();
  await second.locator('#report:not([hidden])').waitFor();
  assert.equal(await second.locator('#code').inputValue(),'','code cleared after login');
  assert.equal(await second.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await guest.close();
  console.log('KESO COACH mobile browser passed: login, authenticated GET, no auto polling, table and ratio, manual refresh, 320/375 widths.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.kill());
