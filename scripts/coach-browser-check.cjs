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
    totalVdkRosterMatches:44,archivedMatches:4,usableMatches:3,invalidMatches:0,killDataMissing:1,roundDataMissing:0,
    backfill:{status:'running',complete:3,partial:1,missing:40,unavailable:0,pending:41},
    overall:{rounds:68,firstKillWinPct:70,firstKillWins:21,firstKillOutcomesKnown:30,comebackWins:7,roundsWithSides:0,repeatedVictimRounds:1},
    maps:[{map:'Corrode',matches:1,rounds:22,ourFirstKills:13,firstKillWins:8,firstKillLosses:5,firstKillWinPct:61.5}],
    trioComparisons:[{map:'Corrode',composition:'Fade + Clove',matches:1,firstKillWins:8,firstKillLosses:5,firstKillWinPct:61.5}],
    fullDiagnosis:{
     items:[
      {subject:'チーム',category:'試合全体',title:'味方FK後のラウンド勝率',status:'good',
       numerator:21,denominator:30,ratePct:70,referencePct:null,differencePp:null,
       evidence:'21 / 30（70.0%）',reason:'良い傾向。ただし戦術の証明ではない',
       nextAction:'FK後に勝った場面のカバーを確認',rawSecret:'private-vod-identifier'},
      {subject:'VDK',category:'先制',title:'先制デス率',status:'context',
       numerator:6,denominator:68,ratePct:8.8,referencePct:null,differencePp:null,
       evidence:'6 / 68（8.8%）',reason:'役割によって変化する',
       nextAction:'味方の距離とサイドを確認'},
      {subject:'Abema',category:'生存・取り返し',title:'FD後5秒以内に味方が同じ敵を倒した率',
       status:'focus',numerator:1,denominator:7,ratePct:14.3,referencePct:null,differencePp:null,
       evidence:'1 / 7（14.3%）',reason:'参考値',nextAction:'録画でカバー位置を確認'},
      {subject:'石原',category:'攻撃・防衛',title:'攻撃時のFK−FD収支',status:'insufficient',
       numerator:0,denominator:0,ratePct:null,referencePct:null,differencePp:null,
       evidence:'攻守情報不足',reason:'判定保留',nextAction:'記録が得られた試合で比較'}
     ],
     synopsis:[
      {subject:'チーム',strengths:1,focuses:0,other:0,strongest:{title:'味方FK後のラウンド勝率'},priority:null},
      {subject:'VDK',strengths:0,focuses:0,other:1,strongest:null,priority:null},
      {subject:'Abema',strengths:0,focuses:1,other:0,strongest:null,priority:{title:'FD後5秒以内に味方が同じ敵を倒した率'}},
      {subject:'石原',strengths:0,focuses:0,other:1,strongest:null,priority:null}
     ],
     limitations:['スキル・設置・位置取りはログから確認できない']
    },
    coachSignals:[
      {subject:'チーム',kind:'strength',metric:'team_fk_conversion',title:'FK後の勝利につながる傾向',
       evidence:'味方がFKした30ラウンドのうち21勝',action:'勝ったラウンドを録画で確認',
       numerator:21,denominator:30,ratePct:70},
      {subject:'Abema',kind:'review',metric:'fk_survival',title:'FK直後の生存・カバーを確認',
       evidence:'本人の9FK中5秒以内に4回死亡',action:'再ピークかカバーかを録画で確認',
       numerator:4,denominator:9,ratePct:44.4}
    ],
    coachingNotes:[
      {subject:'チーム',kind:'review',title:'先制キル後の敗北を優先して検証',
       evidence:'25ラウンド中8ラウンドで敗北',action:'録画で位置関係を確認'},
      {subject:'VDK',kind:'collect',title:'個人評価は保留',
       evidence:'3試合・68ラウンド',action:'補完して再比較'}
    ],
    successRounds:[{map:'Corrode',matchJst:'2026-11-15 06:25',round:2,
     category:'early_two_kills_won',evidence:'先制2キルから勝利',focus:'勝利した配置をVODで確認',
     firstKiller:'石原',secretMatchId:'never-export'}],
    reviewRounds:[{map:'Corrode',matchJst:'2026-11-15 06:25',round:0,priority:4,
      category:'two_opening_kills_lost',evidence:'味方が先に敵2人を倒したが、ラウンドは敗北（最初のキル：2.7秒）',
      focus:'人数有利を失った時点を録画で確認',firstKiller:'石原',
      firstKillSecond:2.7,lostAfterOpening:true,distinctEnemyKillsBeforeAllyDeath:2,
      rapidAllyDeaths:1,openerDiedWithin5s:false}],
    individual:[
      {player:'VDK',matches:3,rounds:68,observedOpeningRounds:68,firstKills:4,firstDeaths:6,fkFdDiff:-2,firstKillWins:3,firstKillLosses:1,firstKillWinPct:75,firstDeathWins:2,firstDeathLosses:4,firstDeathRecoveryPct:33.3,openingKillerDiedWithin5s:0,firstDeathKillerEliminatedWithin5s:2},
      {player:'Abema',matches:3,rounds:68,observedOpeningRounds:68,firstKills:9,firstDeaths:7,fkFdDiff:2,firstKillWins:6,firstKillLosses:3,firstKillWinPct:66.7,firstDeathWins:3,firstDeathLosses:4,firstDeathRecoveryPct:42.9,openingKillerDiedWithin5s:1,firstDeathKillerEliminatedWithin5s:1},
      {player:'石原',matches:3,rounds:68,observedOpeningRounds:68,firstKills:8,firstDeaths:3,fkFdDiff:5,firstKillWins:7,firstKillLosses:1,firstKillWinPct:87.5,firstDeathWins:1,firstDeathLosses:2,firstDeathRecoveryPct:33.3,openingKillerDiedWithin5s:1,firstDeathKillerEliminatedWithin5s:0}
    ],
    individualMapAgent:[
      {player:'VDK',map:'Corrode',agent:'Fade',matches:1,firstKills:0,firstDeaths:1,fkFdDiff:-1,firstKillWinPct:null,firstDeathWins:0,firstDeathLosses:1,firstDeathRecoveryPct:0,openingKillerDiedWithin5s:0,firstDeathKillerEliminatedWithin5s:0}
    ]
  };
  // Fields present in a bad upstream payload must never leak into diagnostics.
  report._raw={match_id:'secret-match-id',puuid:'secret-puuid',opponent:'private-enemy'};
  report.maps[0].puuid='secret-raw-puuid';
  const ctx=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
  await ctx.addInitScript(t=>localStorage.setItem('keso-kp-session-v1',t),token);
  await ctx.addInitScript(()=>{
    Object.defineProperty(navigator,'clipboard',{configurable:true,
      value:{writeText:async text=>{window.__copiedDiagnostic=text}}});
  });
  const requests=[];
  let use43Report=false;
  await ctx.route('https://valorant-results.tealeaforest.workers.dev/**',async route=>{
   const req=route.request();requests.push({url:req.url(),method:req.method(),auth:req.headers().authorization});
   const actual=use43Report?{...report,archivedMatches:44,usableMatches:43,
     backfill:{status:'complete',complete:43,partial:1,missing:0,unavailable:1,pending:0}}:report;
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(actual)});
  });
  const page=await ctx.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:18784/coach.html');
  await page.locator('#report:not([hidden])').waitFor();
  assert.equal(await page.locator('#tab-VDK').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('#archive-drawer').evaluate(el=>el.open),false,
    'all the old audit tables must be tucked away by default');
  assert.match(await page.locator('#focus-content').innerText(),/VDKのコーチング/);
  await page.locator('#focus-content > details.focus-details > summary').click();
  assert.match(await page.locator('#focus-content').innerText(),/先制デス率/);
  assert.match(await page.locator('#focus-content').innerText(),/明確な弱点候補は未検出/);
  await page.locator('#tab-Abema').click();
  assert.equal(await page.locator('#tab-Abema').getAttribute('aria-selected'),'true');
  assert.match(await page.locator('#focus-content').innerText(),/最優先の弱点候補/);
  assert.match(await page.locator('#focus-content').innerText(),/FD後5秒以内に味方が同じ敵を倒した率/);
  assert.match(await page.locator('#focus-content').innerText(),/1 \/ 7/);
  assert.ok(!(await page.locator('#focus-content').innerText()).includes('攻撃時のFK−FD収支'),
    'another player must not clutter the current subject');
  await page.locator('#tab-石原').click();
  assert.match(await page.locator('#focus-content').innerText(),/石原のコーチング/);
  assert.match(await page.locator('#focus-content').innerText(),/明確な弱点候補は未検出/);
  await page.locator('#tab-チーム').click();
  assert.match(await page.locator('#focus-content').innerText(),/チームのコーチング/);
  assert.match(await page.locator('#focus-content').innerText(),/味方FK後のラウンド勝率/);
  await page.locator('#tab-VDK').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#tab-Abema').getAttribute('aria-selected'),'true',
    'tab key navigation should work without any request');
  assert.equal(requests.length,1,'changing tabs only uses existing data');
  await page.locator('#archive-drawer > summary').click();
  assert.equal(await page.locator('#archive-drawer').evaluate(el=>el.open),true);
  assert.match(await page.locator('#totals').innerText(),/44/);
  assert.match(await page.locator('#backfill-counts').innerText(),/完全保存/);
  assert.match(await page.locator('#backfill-counts').innerText(),/一部欠損/);
  assert.match(await page.locator('#backfill-counts').innerText(),/40/);
  assert.match(await page.locator('#backfill-message').innerText(),/補完処理は有効/);
  assert.match(await page.locator('#maps').innerText(),/61\.5%/);
  assert.match(await page.locator('#trio').innerText(),/Fade/);
  assert.match(await page.locator('#players').innerText(),/VDK/);
  assert.match(await page.locator('#players').innerText(),/石原/);
  assert.match(await page.locator('#players').innerText(),/5秒以内/);
  assert.match(await page.locator('#players').innerText(),/先制デス後にチームが勝利/);
  assert.match(await page.locator('#players').innerText(),/42\.9%/);
  assert.match(await page.locator('#player-map').innerText(),/FD後勝率/);
  assert.match(await page.locator('#player-map').innerText(),/Corrode \/ Fade/);
  assert.match(await page.locator('#diagnosis-summary').innerText(),/良い傾向/);
  assert.match(await page.locator('#diagnosis-summary').innerText(),/見直し/);
  assert.match(await page.locator('#diagnosis-full').innerText(),/先制デス率/);
  await page.locator('#diagnosis-full details').first().locator('summary').click();
  assert.match(await page.locator('#diagnosis-full').innerText(),/21 \/ 30/);
  assert.match(await page.locator('#diagnosis-limits').innerText(),/スキル/);
  await page.locator('#diagnosis-full details').last().locator('summary').click();
  assert.match(await page.locator('#diagnosis-full details').last().innerText(),/攻守情報不足/);
  assert.match(await page.locator('#coach-signals').innerText(),/良い傾向/);
  assert.match(await page.locator('#coach-signals').innerText(),/見直し候補/);
  assert.match(await page.locator('#coach-signals').innerText(),/Abema/);
  assert.match(await page.locator('#coach-notes').innerText(),/個人評価は保留/);
  assert.match(await page.locator('#coach-notes').innerText(),/先制キル後の敗北/);
  assert.match(await page.locator('#success-rounds').innerText(),/先制2キルから勝利/);
  assert.match(await page.locator('#success-rounds').innerText(),/石原/);
  assert.match(await page.locator('#review-rounds').innerText(),/R0/);
  assert.match(await page.locator('#review-rounds').innerText(),/2026-11-15 06:25/);
  assert.match(await page.locator('#review-rounds').innerText(),/石原/);
  assert.match(await page.locator('#player-map').innerText(),/−1|-1/);
  assert.match(await page.locator('#quality').innerText(),/複数回死亡/);
  assert.equal(requests.length,1,'no extra polling or KPI writes');
  assert.equal(requests[0].method,'GET');
  assert.equal(requests[0].auth,'Bearer '+token);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'phone-width layout');
  assert.equal(await page.locator('#coach-tabs').evaluate(el=>el.scrollWidth<=el.clientWidth),true,
    'tabs never overflow phone width');
  assert.ok(!(await page.locator('body').innerText()).includes(token),'no token in visible markup');
  await page.locator('#share').click();
  await page.waitForFunction(()=>typeof window.__copiedDiagnostic==='string');
  const exported=await page.evaluate(()=>window.__copiedDiagnostic);
  const diagnostic=JSON.parse(exported);
  assert.equal(diagnostic.format,'KESO_COACH_SAFE_DIAGNOSTIC_V1');
  assert.equal(diagnostic.archive.complete,3);
  assert.equal(diagnostic.totalVdkRosterMatches,44);
  assert.equal(diagnostic.individual.length,3);
  assert.equal(diagnostic.fullDiagnosis.items.length,4);
  assert.equal(diagnostic.fullDiagnosis.items[0].numerator,21);
  assert.equal(diagnostic.fullDiagnosis.synopsis.length,4);
  assert.ok(!JSON.stringify(diagnostic.fullDiagnosis).includes('private-vod-identifier'));
  assert.equal(diagnostic.coachSignals.length,2);
  assert.equal(diagnostic.coachSignals[0].numerator,21);
  assert.equal(diagnostic.individual.find(p=>p.player==='Abema').firstDeathRecoveryPct,42.9);
  assert.equal(diagnostic.reviewRounds[0].round,0);
  assert.equal(diagnostic.successRounds[0].round,2);
  assert.ok(!exported.includes('never-export'));
  assert.ok(!exported.includes(token),'no session token in exported text');
  for(const secret of ['secret-match-id','secret-puuid','secret-raw-puuid','private-enemy'])
    assert.ok(!exported.includes(secret),'private match data excluded: '+secret);
  assert.equal(requests.length,1,'copy does not trigger new D1/HTTP reads');
  use43Report=true;
  await page.locator('#reload').click();
  await page.waitForFunction(()=>document.querySelector('#totals').textContent.includes('43'));
  assert.equal(await page.locator('#tab-Abema').getAttribute('aria-selected'),'true',
    'manual refresh retains chosen player');
  assert.match(await page.locator('#totals').innerText(),/成績の分析対象[\s\S]*43/);
  assert.match(await page.locator('#totals').innerText(),/データ不足で除外[\s\S]*1/);
  assert.match(await page.locator('#backfill-message').innerText(),/欠損1試合は個人・チーム成績の分母から除外/);
  assert.equal(requests.length,2,'refresh is manual only');
  assert.deepEqual(errors,[]);
  assert.equal(await page.locator('#resume-backfill').isHidden(),true,
    'an active backfill must not show resume');
  await ctx.close();
  // The resume control only appears for the previously opted-in linked owner,
  // after an explicit user click; no recurring or surprise POSTs.
  const resumeCtx=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
  await resumeCtx.addInitScript(t=>sessionStorage.setItem('keso-coach-session-v1',t),token);
  let resumed=false,postCount=0,getCount=0;
  await resumeCtx.route('https://valorant-results.tealeaforest.workers.dev/**',async route=>{
    const req=route.request();
    if(req.method()==='POST'&&req.url().endsWith('/api/kp/coach/backfill/resume')){
      postCount++;resumed=true;
      assert.equal(req.headers().authorization,'Bearer '+token);
      return route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({status:'resumed'})});
    }
    if(req.method()==='GET'&&req.url().endsWith('/api/kp/coach/rounds')){
      getCount++;
      return route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({...report,canResume:true,
          backfill:{...report.backfill,status:resumed?'running':'complete'}})});
    }
    throw Error('unexpected coach request: '+req.method()+' '+req.url());
  });
  const resumePage=await resumeCtx.newPage();
  await resumePage.goto('http://127.0.0.1:18784/coach.html');
  await resumePage.locator('#report:not([hidden])').waitFor();
  await resumePage.locator('#resume-backfill').waitFor({state:'visible'});
  assert.equal(postCount,0,'no automatic backfill restart');
  assert.equal(getCount,1);
  await resumePage.locator('#resume-backfill').click();
  await resumePage.waitForFunction(()=>document.getElementById('status').textContent.includes('補完を再開した'));
  assert.equal(postCount,1);
  assert.equal(getCount,2,'one fresh read after successful resume');
  assert.equal(await resumePage.locator('#resume-backfill').isHidden(),true);
  await resumeCtx.close();
  const guest=await browser.newContext({viewport:{width:320,height:568},isMobile:true});
  const second=await guest.newPage();
  await second.route('https://valorant-results.tealeaforest.workers.dev/**',async route=>{
   if(route.request().url().endsWith('/api/kp/auth'))await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({token})});
   else await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(report)});
  });
  await second.goto('http://127.0.0.1:18784/coach.html');
  await second.locator('#connection').waitFor({state:'visible'});
  assert.equal(await second.locator('#report').isHidden(),true);
  assert.equal(await second.locator('#share').isDisabled(),true,'anonymous users cannot copy a report');
  assert.equal(await second.locator('#resume-backfill').isHidden(),true,
    'anonymous users cannot resume a backfill');
  await second.locator('#code').fill('b'.repeat(48));
  await second.locator('#connect-form button').click();
  await second.locator('#report:not([hidden])').waitFor();
  assert.equal(await second.locator('#code').inputValue(),'','code cleared after login');
  assert.equal(await second.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await guest.close();
  console.log('KESO COACH mobile browser passed: auth, manual fetch, privacy-allowlisted report copy, 320/375 widths.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.kill());
