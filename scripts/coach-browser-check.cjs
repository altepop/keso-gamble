// The independent KESO COACH page must work on phone and never poll, write KP,
// or disclose the bearer token into markup. All responses are mocked.
const {chromium,webkit}=require('playwright');
const engine=process.argv.includes('webkit')?webkit:chromium;
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const root=require('node:path').join(__dirname,'..');
const server=spawn('python3',['-m','http.server','18784','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
(async()=>{
 for(let i=0;i<40;i++){try{const ready=await fetch('http://127.0.0.1:18784/coach.html');await ready.arrayBuffer();if(ready.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 const browser=await engine.launch({headless:true,...engine===chromium?{args:['--no-sandbox'],...(process.env.COACH_CHROMIUM_EXECUTABLE?{executablePath:process.env.COACH_CHROMIUM_EXECUTABLE}:{})}: {}});
 const {projectCoachSelfReport}=await import('../services/valorant-results/src/coach-self-report.ts');
 const {coachPerformance}=await import('../services/valorant-results/src/coach-performance.ts');
 const {coachNextMatch}=await import('../services/valorant-results/src/coach-next-match.ts');
 const {coachMatchFeedback}=await import('../services/valorant-results/src/coach-match-feedback.ts');
 const performance=coachPerformance(Array.from({length:20},(_,i)=>({match_id:'fixture-'+i,ended_at:1700000000000+i*86400000,map:i%2?'Lotus':'Ascent',rounds_json:null,teams_json:JSON.stringify([{id:'Blue',won:i%2===0,rounds:13},{id:'Red',won:i%2!==0,rounds:7}]),players_json:JSON.stringify([{puuid:'fixture-self',name:'Fixture',tag:'T',team_id:'Blue',agent:'Sage',k:20+i%4,d:10+i%3,a:6,score:4000},...Array.from({length:9},(_,j)=>({puuid:'fixture-other'+j,team_id:j<4?'Blue':'Red',...(j===0?{agent:'Killjoy',k:10,d:15,a:4}:{})}))])})),[{name:'Fixture',tag:'T',puuid:'fixture-self'}]);
 const {coachRoundContribution}=await import('../services/valorant-results/src/coach-round-contribution.ts');
 const roundRows=[{match_id:'fixture-rounds',players_json:JSON.stringify([{puuid:'self',team_id:'Blue',k:2,d:0,a:1},...Array.from({length:9},(_,i)=>({puuid:'other'+i,team_id:i<4?'Blue':'Red',k:i===0?1:0,d:i===4||i===5||i===6?1:0,a:0}))]),teams_json:JSON.stringify([{id:'Blue',rounds:1},{id:'Red',rounds:0}]),rounds_json:JSON.stringify([{r:0,winner:'Blue',attack:'Blue',defense:'Red'}]),kills_json:JSON.stringify([{r:0,t:40000,killer:'self',victim:'other4',assistants:[]},{r:0,t:50000,killer:'self',victim:'other5',assistants:[]},{r:0,t:60000,killer:'other0',victim:'other6',assistants:['self']}])}];
 const {coachRoundContext,compactRoundContext}=await import('../services/valorant-results/src/coach-round-context.ts');
 const contextPlayers=JSON.parse(roundRows[0].players_json),contextTeams=new Map(contextPlayers.map(p=>[p.puuid,p.team_id]));
 contextPlayers[0].casts={grenade:0,ability1:3,ultimate:0};contextPlayers[0].castsAt=1700000000000;roundRows[0].players_json=JSON.stringify(contextPlayers);
 const rawContext={stats:contextPlayers.map(p=>({player:{puuid:p.puuid},economy:{loadout_value:p.puuid==='self'?700:4500},ability_casts:{grenade:0,ability1:1,ultimate:0}})),plant:{player:{puuid:'self'},round_time_in_ms:30000},defuse:null};
 const contextRound=JSON.parse(roundRows[0].rounds_json)[0];
 roundRows[0].rounds_json=JSON.stringify([{...contextRound,contextSchema:1,context:compactRoundContext(rawContext,contextTeams,1700000000000)}]);
 const contextKills=JSON.parse(roundRows[0].kills_json);contextKills[0].w='Vandal';contextKills[0].wAt=1700000000000;roundRows[0].kills_json=JSON.stringify(contextKills);
 const verifiedContext=new Set();
 const roundContribution=coachRoundContribution(roundRows,[{name:'Fixture',tag:'T',puuid:'self'}],row=>verifiedContext.add(row.match_id));
 const roundContext=coachRoundContext(roundRows,[{name:'Fixture',tag:'T',puuid:'self'}],verifiedContext);
 roundContext._raw={puuid:'private-context-puuid',match_id:'private-context-match'};
 try{
  const token='a'.repeat(48);let feedbackRevision=0;
  const makeMember=person=>{const profile=person==='神戸'?'神戸':person;
    const lessons=coachMatchFeedback(performance);
    if(feedbackRevision)lessons.sessions[0].lesson={...lessons.sessions[0].lesson,title:'更新された試合の解説'+feedbackRevision};
    return {
     person,profile,matchFeedback:{...lessons,privateId:'never-export-lessons'},nextMatch:{...coachNextMatch(performance),privateId:'never-export-plan'},roundContribution,roundContext:person==='Aquatopia'?coachRoundContext([],[],new Set()):roundContext,performance:person==='Aquatopia'?{...performance,timeline:performance.timeline.map((g,i)=>i===10?{...g,kd:null,acs:null}:g)}:performance,accounts:person==='神戸'?['Abema#ttv','Aquatopia#toppy']:[person],
     usableMatches:2,archivedMatches:2,roundDataMissing:0,killDataMissing:0,
     coverage:{discovered:0,complete:0,discoveryDone:false,allMatchesGuaranteed:false},
     individual:[{player:profile,matches:2,matchWins:1,matchLosses:1,matchDraws:0,
       totalKills:36,totalDeaths:24,firstKills:8,firstDeaths:10,
       firstKillWins:6,firstKillLosses:2,firstDeathWins:3,firstDeathLosses:7,
       firstDeathKillerEliminatedWithin5s:2,openingKillerDiedWithin5s:1,
       attack:{observedOpeningRounds:16,firstKills:5,firstDeaths:3},
       defense:{observedOpeningRounds:17,firstKills:3,firstDeaths:7}}],
     individualMapAgent:[{player:profile,map:'Ascent',agent:'Sage',matches:2,
       observedOpeningRounds:33,firstKills:8,firstDeaths:10,matchWins:1,matchLosses:1,matchDraws:0}],
     matchTrend:[
       {date:'11/16',map:'Ascent',agent:'Sage',outcome:'win',kills:20,deaths:10,assists:6,
         firstKills:5,firstDeaths:4,observedOpeningRounds:17},
       {date:'11/15',map:'Lotus',agent:'Sage',outcome:'loss',kills:16,deaths:14,assists:5,
         firstKills:3,firstDeaths:6,observedOpeningRounds:16}],
     fullDiagnosis:{items:[
       {subject:profile,category:'生存・取り返し',status:'focus',title:'FK後の動きを確認',
        numerator:2,denominator:10,evidence:'2 / 10（20%）',reason:'映像による確認が必要',
        nextAction:'味方のカバーと退避を確認'},
       {subject:profile,category:'攻撃・防衛',status:'mixed',title:'攻撃の先制収支',
        numerator:2,denominator:16,evidence:'FK5 FD3 / 16R',reason:'サイド差は暫定',
        nextAction:'攻撃側の映像を比較'},
       {subject:profile,category:'先制',status:'context',title:'先制デス率',
        numerator:10,denominator:33,evidence:'10 / 33',reason:'役割依存',
        nextAction:'倒された位置を確認'},
       {subject:profile,category:'生存・取り返し',status:'good',title:'FK後の勝利',
        numerator:6,denominator:8,evidence:'6 / 8',reason:'味方込みの観測',
        nextAction:'勝てた場面を再現'}
     ]}};};

  const ctx=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
  await ctx.addInitScript(t=>{localStorage.setItem('keso-kp-session-v1',t);sessionStorage.setItem('keso-coach-session-v1',t);},token);
  await ctx.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copiedDiagnostic=text;}}}));
  const requests=[];
  const identity={status:'linked',displayName:'神戸',defaultProfile:'神戸',visibility:'private',pendingAccounts:0,accountOptions:[{profile:'Abema',label:'Abema#ttv'},{profile:'Aquatopia',label:'Aquatopia#toppy'}]};
  const {goalPolicy}=await import('../services/valorant-results/src/coach-goals.ts');
  const {SUMMARY_FIELDS}=await import('../services/valorant-results/src/coach-sharing.ts');
  const state={settings:{displayName:'神戸',visibility:'private',fields:[],version:1,options:SUMMARY_FIELDS},goals:{policy:goalPolicy(),goals:[],history:[],historyLimit:20},identity,memberHistory:{enabled:true,supportsPause:true,people:[{person:'神戸',discovered:2,complete:2}]},canStartMemberHistory:false};
  const selfSubject='11111111-1111-4111-8111-111111111111',otherSubject='22222222-2222-4222-8222-222222222222';let otherPublic=true;
  const sharedFixture=(subject)=>({subjectId:subject,displayName:subject===selfSubject?state.settings.displayName:'<img src=x onerror=alert(1)> 共有者',policyVersion:1,period:{from:'2026-11-01',to:'2026-11-20',timezone:'Asia/Tokyo'},matches:{analyzed:20,candidates:22,excluded:2,rowLimit:250,limitReached:false},metrics:subject===selfSubject&&!state.settings.fields.includes('kd')?{}:{kd:{value:1.2,validMatches:20,excludedMatches:0,numerator:240,denominator:200,formula:'合計キル数 ÷ 合計デス数',secret:'never-share-metric'}},goals:'never-share-goals',accounts:['never-share-account'],weakness:'never-share-weakness',puuid:'never-share-id'});
  await ctx.route('https://valorant-results.tealeaforest.workers.dev/**',async route=>{
   const req=route.request(),url=new URL(req.url());requests.push({url:req.url(),method:req.method(),auth:req.headers().authorization});
   if(req.headers().authorization==='Bearer '+'b'.repeat(48))return route.fulfill({json:{identity:{status:'unregistered'},report:null}});
   if(url.pathname==='/api/kp/coach/settings'){
    if(req.method()==='GET')return route.fulfill({json:{settings:state.settings}});
    const b=req.postDataJSON();if(b.expectedVersion!==state.settings.version)return route.fulfill({status:409,json:{error:'別の画面で設定が更新されています。'}});
    state.settings={...state.settings,...b,version:state.settings.version+1,fields:b.visibility==='private'?[]:b.fields};return route.fulfill({json:{settings:state.settings}});
   }
   if(url.pathname==='/api/kp/coach/directory')return route.fulfill({json:{sharingAvailable:true,people:[...(state.settings.visibility==='guild-summary'?[{subjectId:selfSubject,displayName:state.settings.displayName}]:[]),...(otherPublic?[{subjectId:otherSubject,displayName:'<img src=x onerror=alert(1)> 共有者'}]:[])]}});
   if(['/api/kp/coach/summary','/api/kp/coach/comparison'].includes(url.pathname)){
    const subjects=url.pathname.endsWith('/summary')?[url.searchParams.get('subject')]:url.searchParams.get('subjects').split(',');
    if(subjects.some(id=>id===selfSubject?state.settings.visibility!=='guild-summary':id!==otherSubject||!otherPublic))return route.fulfill({status:404,json:{error:'この表示は利用できません。'}});
    return route.fulfill({json:url.pathname.endsWith('/summary')?sharedFixture(subjects[0]):{summaries:subjects.map(sharedFixture)}});
   }
   if(url.pathname==='/api/kp/coach/goals'){
    if(req.method()==='GET')return route.fulfill({json:state.goals});
    const b=req.postDataJSON(),old=state.goals.goals.find(g=>g.goalId===b.goalId);
    if(old&&b.expectedVersion!==old.version)return route.fulfill({status:409,json:{error:'別の画面で更新されています。'}});
    const goal={...b,version:(old?.version||0)+1,createdAt:0,updatedAt:1};state.goals.goals=state.goals.goals.filter(g=>g.goalId!==goal.goalId);
    if(goal.status==='active')state.goals.goals.push(goal);else state.goals.history.unshift(goal);
    return route.fulfill({json:{goal,created:!old}});
   }
   if(url.pathname==='/api/kp/coach/me')return route.fulfill({json:{...state,report:projectCoachSelfReport(makeMember('神戸'))}});
   if(url.pathname==='/api/kp/coach/member')return route.fulfill({json:projectCoachSelfReport(makeMember(url.searchParams.get('person')))});
   if(url.pathname==='/api/kp/coach/members/status')return route.fulfill({json:state});
   throw Error('Unexpected coaching request '+url.pathname);
  });
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:18784/coach.html?person=VDK');
  await page.locator('[data-primary-mission]').waitFor();
  assert.equal(requests.length,1);assert.ok(requests[0].url.endsWith('/coach/me'));assert.equal(requests[0].auth,'Bearer '+token);
  assert.equal(await page.locator('[data-member="VDK"]').count(),0,'no other-person selector');
  assert.equal(await page.locator('#legacy-coach').innerText(),'');
  assert.ok(!(await page.locator('body').innerText()).includes(token));
  await page.locator('#coach-operations').evaluate(el=>el.open=true);
  assert.equal(await page.locator('.prototype-top .playerline .name').innerText(),'神戸');
  assert.equal(await page.locator('[data-primary-mission]').count(),1);
  assert.equal(await page.locator('.prototype-top .block').count(),3,'selected recipes become the three prototype blocks');
  assert.equal(await page.locator('.prototype-top .rankbox .r').first().innerText(),'未取得','never invent sample ranks');
  assert.match(await page.locator('.prototype-top .evidence').innerText(),/1\.96/,'uses real fixture KD');
  const beforeUiActions=requests.length;
  await page.locator('#acceptBtn').click();assert.equal(await page.locator('#acceptBtn').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#acceptNote').isVisible(),true);
  await page.locator('#timerBtn').click();assert.match(await page.locator('#timerBtn').innerText(),/一時停止/);await page.locator('#timerReset').click();assert.match(await page.locator('#clock').innerText(),/04:00/);
  assert.equal(requests.length,beforeUiActions,'acceptance and silent timer never write or query APIs');
  await page.setViewportSize({width:375,height:812});
  assert.equal(await page.locator('#coach-operations #reload').count(),1);

  assert.equal(await page.locator('[data-improvement]').isVisible(),true);
  assert.equal(await page.locator('[data-analysis-details]').evaluate(el=>el.open),false);
  assert.equal(await page.locator('[data-other-practice]').evaluate(el=>el.open),false);
  assert.equal(await page.locator('[data-pdca-step="task"]').getAttribute('aria-current'),'step');
  if(process.env.COACH_V6_SCREENSHOTS_DIR)await require('./coach-prototype-visual.cjs')({browser,root,output:process.env.COACH_V6_SCREENSHOTS_DIR,createActualPage:async options=>{
   const context=await browser.newContext(options);
   await context.addInitScript(t=>localStorage.setItem('keso-kp-session-v1',t),token);
   await context.route('https://valorant-results.tealeaforest.workers.dev/**',route=>route.fulfill({json:{...state,report:projectCoachSelfReport(makeMember('神戸'))}}));
   return context.newPage();
  }});
  await page.locator('[data-analysis-details] > summary').click();
  assert.match(await page.locator('#member-result').innerText(),/Abema#ttv/);
  assert.match(await page.locator('#member-result').innerText(),/Aquatopia#toppy/);
  assert.equal(await page.locator('[data-coach-learning]').isVisible(),true);
  assert.equal(await page.locator('[data-reader-board] [data-reader-verdict]').count(),2);
  assert.match(await page.locator('[data-reader-board]').innerText(),/GOOD/);
  assert.match(await page.locator('[data-reader-board]').innerText(),/BAD候補|CHECK|次の課題/);
  await page.locator('[data-analysis-navigation] > summary').click();
  await page.locator('[data-coach-view="overview"]').focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#coach-view-guns > [data-reader-guide]').isVisible(),true);
  assert.equal(await page.locator('[data-pdca-step="analysis"]').getAttribute('aria-current'),'step');
  assert.equal(await page.locator('#coach-view-guns > [data-reader-advanced]').evaluate(el=>el.open),false,'beginners see plain language before expert tables');
  await page.keyboard.press('Home');assert.equal(await page.locator('#coach-view-overview').isVisible(),true);
  if(process.env.COACH_PDCA_SCREENSHOT){await page.setViewportSize({width:375,height:812});await page.locator('[data-primary-mission]').screenshot({path:process.env.COACH_PDCA_SCREENSHOT});}
  if(process.env.COACH_READER_SCREENSHOT){await page.setViewportSize({width:320,height:812});await page.locator('[data-reader-board]').screenshot({path:process.env.COACH_READER_SCREENSHOT});await page.setViewportSize({width:375,height:812});}
  assert.match(await page.locator('[data-match-feedback]').first().innerText(),/分で.*取り組みます/);
  assert.equal(await page.locator('[data-match-feedback]').first().locator('ol li').count(),3);
  assert.equal(await page.locator('[data-feedback-history]').count(),11);
  const reference=page.locator('[data-long-diagnosis]');
  assert.equal(await reference.evaluate(el=>el.open),false,'learning is the default; raw stats are supporting references');
  await reference.locator('> summary').click();
  assert.match(await page.locator('#member-result').innerText(),/最初に見るべき改善候補/);
  assert.match(await page.locator('#member-result').innerText(),/2 \/ 10/);
  assert.match(await page.locator('#coach-view-overview').innerText(),/既存の保存済み記録から2試合/);
  assert.match(await page.locator('#coach-view-overview').innerText(),/ラウンド記録を照合できた試合の推移/);
  assert.equal(await page.locator('.trend-game').count(),2,'two complete matches in trend');
  assert.equal(await page.locator('.coach-kpi').count(),4,'four top-level KPI cards');
  assert.match(await page.locator('#coach-view-overview').innerText(),/75\.0%[\s\S]*\(6 \/ 8\)/,
    'FK conversion chart divides by resolved outcomes only, never unknowns');
  await page.locator('[data-coach-view="strategy"]').click();
  await page.locator('#coach-view-strategy > [data-reader-advanced] > summary').click();
  assert.equal(await page.locator('#coach-view-strategy').isVisible(),true);
  assert.match(await page.locator('#coach-view-strategy').innerText(),/攻撃と防衛の先制動向/);
  assert.match(await page.locator('#coach-view-strategy').innerText(),/Ascent \/ Sage/);
  assert.equal(await page.locator('.coach-side').count(),2);
  await page.locator('[data-coach-view="improve"]').click();
  await page.locator('#coach-view-improve > [data-reader-advanced] > summary').click();
  assert.match(await page.locator('#coach-view-improve').innerText(),/攻撃の先制収支/);
  assert.match(await page.locator('#coach-view-improve').innerText(),/キル数のラウンド分布/);
  assert.match(await page.locator('#coach-view-improve').innerText(),/先制に限定しないキル・デス後の動き/);
  assert.match(await page.locator('#coach-view-improve').innerText(),/ラウンド単位のアシスト/);assert.match(await page.locator('#coach-view-improve').innerText(),/KASTではありません/);
  assert.match(await page.locator('#coach-view-improve').innerText(),/公式トレード率ではありません/);
  assert.match(await page.locator('#coach-view-improve').innerText(),/記録された装備額とラウンド結果/);
  assert.equal(await page.locator('[data-context-band]').count(),3);
  assert.match(await page.locator('[data-round-rate="kpr-attack"]').getAttribute('style'),/width:100%/);
  assert.equal(await page.locator('[data-round-rate="kpr-defense"]').count(),0,'unknown side is not a zero-valued bar');
  assert.match(await page.locator('#coach-view-improve').innerText(),/FK後の勝利/);
  await page.locator('[data-coach-view="metrics"]').click();
  await page.locator('#coach-view-metrics > [data-reader-advanced] > summary').click();
  await page.locator('#coach-view-metrics [data-reader-advanced] > details.member-detail > summary').filter({hasText:/^先制（/}).click();
  assert.match(await page.locator('#coach-view-metrics').innerText(),/先制デス率/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,
    'dashboard must not overflow on 375px iPhone');
  assert.equal(await page.locator('[data-coach-view]').count(),7);
  for(const width of [320,375]){
   await page.setViewportSize({width,height:812});
   for(const view of ['overview','guns','improve','time','team','metrics','strategy']){
    await page.locator('[data-coach-view="'+view+'"]').click();
    const overflow=await page.evaluate(expected=>({viewport:innerWidth,width:document.documentElement.scrollWidth,nodes:[...document.querySelectorAll('body *')].filter(n=>{if(n.getBoundingClientRect().right<=expected||!n.getBoundingClientRect().height)return false;for(let p=n.parentElement;p&&p!==document.body;p=p.parentElement)if(/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflowX))return false;return true;}).slice(0,30).map(n=>({tag:n.tagName,cls:n.className,text:n.textContent.slice(0,70),right:n.getBoundingClientRect().right,width:n.getBoundingClientRect().width}))}),width);
    assert.ok(overflow.width<=width,'performance dashboard at '+width+' / '+view+' '+JSON.stringify(overflow));
    assert.ok(await page.locator('#coach-view-'+view+' p:not(.prototype-top p)').evaluateAll(nodes=>nodes.filter(n=>n.offsetHeight).every(n=>parseFloat(getComputedStyle(n).fontSize)>=16)),'all visible body paragraphs keep 16px at '+width+' / '+view);
    assert.equal(await page.locator('#coach-view-'+view+' [data-reader-guide]').isVisible(),true,'every tab teaches how to read it');
    assert.ok(await page.locator('#coach-view-'+view+' [data-reader-glossary] [data-reader-term]').count()>0);
    const term=page.locator('#coach-view-'+view+' [data-reader-term]').first();await term.locator('summary').click();
    assert.match(await term.innerText(),/意味：[\s\S]*たとえば：[\s\S]*練習につなげるなら：/);await term.locator('summary').click();
   }
   await page.locator('[data-coach-view="guns"]').click();await page.locator('#coach-view-guns > [data-reader-advanced]').evaluate(el=>el.open=true);assert.match(await page.locator('#coach-view-guns').innerText(),/KPR/);assert.match(await page.locator('#coach-view-guns').innerText(),/Vandal/);
   await page.locator('[data-coach-view="team"]').click();await page.locator('#coach-view-team > [data-reader-advanced]').evaluate(el=>el.open=true);assert.match(await page.locator('#coach-view-team').innerText(),/同じマップ・ロール内/);assert.match(await page.locator('#coach-view-team').innerText(),/センチネル/);
   assert.match(await page.locator('#coach-view-team').innerText(),/設置・解除の記録/);assert.match(await page.locator('#coach-view-team').innerText(),/スキル使用回数/);
   await page.locator('[data-coach-view="time"]').click();assert.equal(await page.locator('#coach-view-time [data-reader-advanced] svg').first().locator('circle').count(),20);
  }
  assert.deepEqual(errors,[]);
  await page.locator('[data-coach-view="guns"]').click();
  const benchmarkRequests=requests.length;
  const ref=page.locator('[data-benchmark-reference]');
  await page.setViewportSize({width:320,height:812});
  assert.ok((await ref.boundingBox()).height>=44);
  await ref.selectOption('pro');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'pro selector also fits 320px');
  assert.equal(await page.locator('[data-benchmark-metric="hs"]').innerText().then(t=>t.includes('比較値なし')),true);
  await page.locator('[data-benchmark-reference]').selectOption('gold');
  assert.match(await page.locator('[data-benchmark-metric="acs"]').innerText(),/200.00〜239.00/);
  assert.match(await page.locator('[data-personal-analysis]').innerText(),/Gold/);
  assert.equal(requests.length,benchmarkRequests,'reference changes reuse saved report without API/D1 calls');
  await page.locator('[data-coach-view="overview"]').click();
  await page.locator('[data-other-practice] > summary').click();
  assert.equal(await page.locator('[data-practice-library]').count(),1);
  assert.ok(await page.locator('[data-practice-recommendations] [data-practice-card]').count()>0);
  assert.match(await page.locator('[data-practice-agents]').innerText(),/暗記の好みは戦績から分かりません/);
  for(const width of [320,375]){
   await page.setViewportSize({width,height:812});
   await page.locator('[data-practice-option="lineups"]').selectOption('light');
   assert.match(await page.locator('[data-practice-agents]').innerText(),/Sage/);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'practice controls at '+width);
  }
  await page.locator('[data-practice-option="goal"]').selectOption('cover');
  await page.locator('[data-practice-option="partner"]').selectOption('duo');
  await page.locator('[data-practice-option="minutes"]').selectOption('20');
  const firstPractice=await page.locator('[data-practice-recommendations] [data-practice-card]').first().getAttribute('data-practice-card');
  await page.locator('[data-practice-skip="'+firstPractice+'"]').click();
  assert.equal(await page.locator('[data-practice-recommendations] [data-practice-card="'+firstPractice+'"]').count(),0,'explicit candidate exchange');
  await page.locator('[data-practice-reset]').click();
  assert.equal(await page.locator('[data-practice-recommendations] [data-practice-card="'+firstPractice+'"]').count(),1);
  await page.locator('[data-practice-catalog] > summary').click();
  await page.locator('[data-practice-category]').selectOption('all');
  assert.equal(await page.locator('[data-practice-entry]').count(),100);
  assert.match(await page.locator('[data-practice-entry="P001"]').textContent(),/ミディアム.*ハード/);
  assert.match(await page.locator('[data-practice-entry="P001"]').textContent(),/ストレイフ.*ON/);
  await page.locator('[data-practice-query]').fill('4スタンス');
  assert.equal(await page.locator('[data-practice-entry]').count(),1);
  await page.locator('[data-practice-entry] > summary').click();
  assert.match(await page.locator('[data-practice-entry]').innerText(),/KDからA1等を判定しません/);
  assert.match(await page.locator('[data-practice-entry]').innerText(),/上達効果は確認できていません/);
  await page.locator('[data-practice-query]').fill('');
  await page.locator('[data-practice-category]').selectOption('map');
  assert.equal(await page.locator('[data-practice-entry]').count(),10);
  await page.locator('[data-practice-catalog] > summary').click();
  assert.equal(requests.length,benchmarkRequests,'practice preferences, search and exchanges never query APIs');
  if(process.env.COACH_PRACTICE_SCREENSHOT){await page.setViewportSize({width:320,height:812});await page.locator('.practice-controls').screenshot({path:process.env.COACH_PRACTICE_SCREENSHOT});await page.locator('[data-practice-recommendations]').screenshot({path:process.env.COACH_PRACTICE_SCREENSHOT.replace('.png','-plan.png')});}

  assert.equal(requests.length,1,'changing dashboard tabs never triggers extra API calls');
  await page.locator('#share').click();
  const exportedMember=JSON.parse(await page.evaluate(()=>window.__copiedDiagnostic));
  assert.equal(exportedMember.format,'KESO_COACH_SAFE_MEMBER_DIAGNOSTIC_V1');
  assert.equal(exportedMember.person,'神戸');
  assert.match(exportedMember.nextMatch.focus.action,/次|録画|確認/);
  assert.equal(JSON.stringify(exportedMember).includes('never-export-plan'),false);
  assert.equal(exportedMember.matchFeedback.sessions.length,12);
  assert.equal(exportedMember.matchFeedback.sessions[0].lesson.practice.steps.length,3);
  assert.equal(JSON.stringify(exportedMember).includes('never-export-lessons'),false);
  await page.locator('[data-analysis-details]').evaluate(el=>el.open=true);await page.locator('[data-long-diagnosis]').evaluate(el=>el.open=true);
  assert.match(await page.locator('[data-next-match]').innerText(),/次の1試合で試すこと/);
  assert.match(await page.locator('[data-next-match]').innerText(),/KPR/);
  assert.equal(exportedMember.performance.overall.kd,performance.overall.kd);
  assert.equal(exportedMember.performance.timeline.length,20);
  assert.ok(exportedMember.performance.rolePeers.length>0);assert.equal(exportedMember.performance.rolePeers[0].kpr.peerRate,.5);
  assert.equal(exportedMember.performance.rateBases.kpr.rounds,400);
  assert.equal(exportedMember.roundContext.economy.rounds,1);assert.equal(exportedMember.roundContext.spike.plant.events,1);
  assert.equal(exportedMember.roundContext.abilities.grenade.casts,0);assert.equal(exportedMember.roundContext.weapons.knownKills,1);
  assert.equal(exportedMember.roundContext.matchAbilities.ability1.casts,3);
  assert.equal(JSON.stringify(exportedMember).includes('private-context'),false);
  assert.equal(exportedMember.matchTrend.length,2,'safe copy includes anonymous date-based trend');
  assert.equal(JSON.stringify(exportedMember).includes('private-vod-identifier'),false);
  assert.equal(JSON.stringify(exportedMember).includes('secret-puuid'),false);
  assert.equal(requests.length,1,'copying selected report is purely client-side');

  assert.deepEqual(errors,[]);
  await page.locator('#member-coaching-panel').evaluate(el=>el.open=true);
  await page.locator('[data-member="Aquatopia"]').click();
  await page.waitForFunction(()=>document.querySelector('.prototype-top .playerline .name')?.textContent==='Aquatopia');
  assert.equal(requests.length,2);assert.ok(requests[1].url.includes('person=Aquatopia'));
  await page.locator('#return-self').click();
  await page.waitForFunction(()=>document.querySelector('.prototype-top .playerline .name')?.textContent==='神戸');
  assert.equal(requests.length,3);assert.ok(requests[2].url.endsWith('/coach/me'));
  for(const width of [320,375,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'layout '+width);}
  const japanese=await page.locator('.coach-existing p,.coach-existing li,#coach-operations p').evaluateAll(nodes=>[...new Set(nodes.flatMap(n=>(n.textContent||'').match(/[^。！？]+[。！？]/gu)||[]))]);
  const dictionaryEnds=japanese.filter(t=>/(?:[^ま]した|できる|できない|補わない|だけ|ではない|である|必要だ|確認する|断定しない|影響する|数える|決まる|異なる|とする|持つ|わかる|分かる|求める|含まれる|保存される|判断できない|得られる|必要になる|揃わない|少ない|多い|低い|高い|出ない|変わらない|足りない|違う|はない|を指す|と呼ぶ)。(?:$)/u.test(t));
  assert.deepEqual(dictionaryEnds,[],'all seven tabs and folded legacy paragraphs use courteous sentence endings');
  if(process.env.COACH_JAPANESE_AUDIT)require('node:fs').writeFileSync(process.env.COACH_JAPANESE_AUDIT,JSON.stringify({sentences:japanese.length,dictionaryEnds},null,2));
  // Goal registration is optional, private, person-scoped and persisted by explicit saves.
  const goals=page.locator('[data-coach-goals]'),processCard=goals.locator('[data-goal-kind="process"]');
  await processCard.locator('> summary').click();
  const form=processCard.locator('form');const previousCalls=requests.length;
  await form.locator('[name="action"]').fill('<img src=x onerror=alert(1)> 遮蔽へ戻ります');
  await form.locator('[name="step0"]').fill('最初の交戦前に遮蔽を決めます');
  await form.locator('[name="selfCheck"]').fill('録画で最初の3交戦を振り返ります');
  await form.locator('[name="targetDate"]').fill('2026-01-01');
  assert.equal(requests.length,previousCalls,'typing never writes');
  await form.locator('button[type="submit"]').focus();await page.keyboard.press('Enter');
  await goals.locator('[role="status"]').filter({hasText:'保存しました'}).waitFor();
  assert.equal(await goals.locator('img').count(),0,'goal HTML is plain text');
  assert.match(await processCard.innerText(),/目標日を過ぎています/);
  await page.locator('#member-coaching-panel').evaluate(el=>el.open=true);await page.locator('[data-member="Aquatopia"]').click();
  await page.waitForFunction(()=>document.querySelector('.prototype-top .playerline .name')?.textContent==='Aquatopia');
  assert.equal(await form.locator('[name="action"]').inputValue(),'<img src=x onerror=alert(1)> 遮蔽へ戻ります','same person shares goals across own accounts');
  // Simulate a simultaneous edit on a second device.
  state.goals.goals[0].version++;state.goals.goals[0].action='別端末で更新した目標';
  await form.locator('[name="action"]').fill('入力中の変更は消しません');await form.locator('button[type="submit"]').click();
  await goals.locator('[data-goal-reload]').waitFor();assert.equal(await form.locator('[name="action"]').inputValue(),'入力中の変更は消しません');
  await goals.locator('[data-goal-reload]').click();await form.locator('[name="action"]').waitFor();
  await page.waitForFunction(()=>document.querySelector('[name="action"]')?.value==='別端末で更新した目標');
  await form.locator('[name="action"]').fill('😀'.repeat(201));const beforeLong=requests.length;await form.locator('button[type="submit"]').click();
  await goals.locator('[role="status"]').filter({hasText:'文字数'}).waitFor();assert.equal(requests.length,beforeLong);
  await form.locator('[name="action"]').fill('最初の3交戦を確認します');await form.locator('button[type="submit"]').click();
  await goals.locator('[role="status"]').filter({hasText:'保存しました'}).waitFor();
  for(const width of [320,375,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'goals form fits '+width);if(process.env.COACH_V6_SCREENSHOTS_DIR)await goals.screenshot({path:require('node:path').join(process.env.COACH_V6_SCREENSHOTS_DIR,'goals-form-'+width+'.png')});}
  await form.locator('[data-goal-status="self-achieved"]').click();await goals.locator('[data-goal-history]').getByText(/本人が達成を記録（自己申告）/).waitFor({state:'attached'});await goals.locator('[data-goal-history]').evaluate(el=>el.open=true);
  await goals.locator('[data-goal-history]').getByText(/本人が達成を記録（自己申告）/).waitFor();
  const rank=goals.locator('[data-goal-kind="rank"]');await rank.locator('> summary').click();await rank.locator('select').selectOption('diamond3');await rank.locator('button[type="submit"]').click();
  await goals.locator('[role="status"]').filter({hasText:'保存しました'}).waitFor();
  await page.locator('#return-self').click();await page.waitForFunction(()=>document.querySelector('.prototype-top .playerline .name')?.textContent==='神戸');
  await goals.locator('[data-goal-kind="rank"] > summary').click();assert.equal(await goals.locator('select').inputValue(),'diamond3','saved rank survives reloading');
  assert.equal(await page.locator('.rankbox .r').first().innerText(),'未取得','target never becomes measured current rank');
  await goals.locator('[data-goal-status="archived"]').click();await goals.locator('[role="status"]').filter({hasText:'保存しました'}).waitFor();
  assert.deepEqual(errors,[]);
  // Explicit field opt-in; summary browsing never leaves private copy state behind.
  const sharing=page.locator('[data-coach-sharing]');await sharing.locator('[data-sharing-settings] > summary').click();
  const settingsForm=sharing.locator('[data-sharing-form]');await settingsForm.locator('[name="visibility"]').selectOption('guild-summary');await settingsForm.locator('[name="displayName"]').fill('自分の共有名');await settingsForm.locator('[value="kd"]').check();
  await settingsForm.locator('button[type="submit"]').focus();await page.keyboard.press('Enter');await sharing.locator('[role="status"]').filter({hasText:'共有しました'}).waitFor();
  assert.deepEqual(state.settings.fields,['matches','kd']);assert.equal(await page.locator('.prototype-top .playerline .name').innerText(),'神戸','sharing name does not replace verified person');
  for(const width of [320,375,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'sharing settings fit '+width);if(process.env.COACH_V6_SCREENSHOTS_DIR)await sharing.screenshot({path:require('node:path').join(process.env.COACH_V6_SCREENSHOTS_DIR,'sharing-form-'+width+'.png')});}
  state.settings.version++;await settingsForm.locator('[name="displayName"]').fill('競合中の入力');await settingsForm.locator('button[type="submit"]').click();await sharing.locator('[data-settings-reload]').waitFor();assert.equal(await settingsForm.locator('[name="displayName"]').inputValue(),'競合中の入力');
  await sharing.locator('[data-settings-reload]').click();await page.waitForFunction(()=>document.querySelector('[data-sharing-form] [name="displayName"]')?.value==='自分の共有名');
  await settingsForm.locator('[name="visibility"]').selectOption('private');await settingsForm.locator('button[type="submit"]').click();await sharing.locator('[role="status"]').filter({hasText:'本人限定にしました'}).waitFor();
  await sharing.locator('[data-sharing-browse] > summary').click();const beforeDirectory=requests.length;await sharing.locator('[data-directory-load]').click();await sharing.locator('[name="sharedSubject"]').waitFor();assert.equal(requests.length,beforeDirectory+1);assert.equal(await sharing.locator('[name="sharedSubject"]').count(),1);assert.equal(await sharing.locator('img').count(),0);
  await sharing.locator('[name="sharedSubject"]').check();await sharing.locator('[data-summary-open]').click();await sharing.locator('.shared-summary').waitFor();
  assert.equal(await page.locator('[data-primary-mission]').count(),0);assert.equal(await page.locator('#share').isEnabled(),false);assert.equal(await page.locator('#share-fallback').inputValue(),'');assert.equal(await page.locator('[data-coach-goals]').count(),0);
  assert.ok(!(await sharing.locator('[data-shared-results]').innerText()).includes('never-share'));
  await sharing.locator('[data-summary-copy]').click();await sharing.locator('[role="status"]').filter({hasText:'コピーしました'}).waitFor();const copied=JSON.parse(await page.evaluate(()=>window.__copiedDiagnostic));assert.equal(copied.format,'KESO_COACH_GUILD_SUMMARY_V1');assert.doesNotMatch(JSON.stringify(copied),/never-share|subjectId|puuid|KESO_COACH_SAFE_MEMBER/);
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('unavailable');}}}));await sharing.locator('[data-summary-copy]').click();await sharing.locator('[data-summary-fallback]:not([hidden])').waitFor();assert.match(await sharing.locator('[data-summary-fallback]').inputValue(),/KESO_COACH_GUILD_SUMMARY_V1/);
  otherPublic=false;const copyCount=requests.length;await sharing.locator('[data-summary-copy]').click();await sharing.locator('[role="status"]').filter({hasText:'利用できません'}).waitFor();assert.equal(requests.length,copyCount+1,'copy rechecks current consent');assert.equal(await sharing.locator('.shared-summary').count(),0);assert.equal(await sharing.locator('[data-summary-fallback]').inputValue(),'');
  await sharing.locator('[data-summary-self]').click();await page.locator('[data-primary-mission]').waitFor();assert.equal(await page.locator('.prototype-top .playerline .name').innerText(),'神戸');
  // Comparison uses only shared subjects, including our own selected summary.
  await sharing.locator('[data-sharing-settings] > summary').click();await settingsForm.locator('[name="visibility"]').selectOption('guild-summary');await settingsForm.locator('button[type="submit"]').click();await sharing.locator('[role="status"]').filter({hasText:'共有しました'}).waitFor();otherPublic=true;
  await sharing.locator('[data-sharing-browse] > summary').click();await sharing.locator('[data-directory-load]').click();await page.waitForFunction(()=>document.querySelectorAll('[name="sharedSubject"]').length===2);for(const box of await sharing.locator('[name="sharedSubject"]').all())await box.check();await sharing.locator('[data-summary-open]').click();await page.waitForFunction(()=>document.querySelectorAll('.shared-summary').length===2);
  if(process.env.COACH_V6_SCREENSHOTS_DIR)await sharing.screenshot({path:require('node:path').join(process.env.COACH_V6_SCREENSHOTS_DIR,'shared-comparison.png')});
  assert.ok(requests.at(-1).url.includes('/comparison?subjects='));assert.equal(await page.locator('#share-fallback').inputValue(),'');
  for(const width of [320,375,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'shared summary fits '+width);}
  const beforeFocus=requests.length;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));assert.equal(await sharing.locator('.shared-summary').count(),0);assert.equal(await sharing.locator('[name="sharedSubject"]').count(),0);assert.equal(requests.length,beforeFocus,'foreground invalidates old summaries without polling');await sharing.locator('[data-summary-self]').click();await page.locator('[data-primary-mission]').waitFor();
  await page.locator('#coach-operations').evaluate(el=>el.open=true);
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('clipboard unavailable');}}}));
  await page.locator('#share').click();await page.locator('#share-fallback:not([hidden])').waitFor();assert.ok((await page.locator('#share-fallback').inputValue()).includes('神戸'));
  await page.evaluate(()=>{localStorage.setItem('keso-kp-session-v1','b'.repeat(48));window.dispatchEvent(new Event('focus'));});
  await page.getByRole('alert').filter({hasText:'まだ連携'}).first().waitFor();assert.equal(await page.locator('#share-fallback').inputValue(),'');assert.equal(await page.locator('[data-primary-mission]').count(),0);assert.equal(await page.locator('#report').isHidden(),true);assert.equal(await page.locator('[data-coach-goals]').count(),0);assert.equal(await page.locator('[data-sharing-form]').count(),0);assert.equal(await page.locator('body').textContent().then(t=>t.includes('最初の3交戦を確認します')),false);
  await ctx.close();
  // Account switching must erase old graphs, copied text and late requests.
  const race=await browser.newContext({viewport:{width:375,height:812}});await race.addInitScript(t=>localStorage.setItem('keso-kp-session-v1',t),token);
  let release;let calls=0;
  await race.route('https://valorant-results.tealeaforest.workers.dev/**',async route=>{
    calls++;if(calls===1){await new Promise(r=>release=r);return route.fulfill({json:{...state,report:projectCoachSelfReport(makeMember('神戸'))}}).catch(()=>{});}
    return route.fulfill({json:{identity:{status:'unregistered'},report:null}});
  });
  const rp=await race.newPage();await rp.goto('http://127.0.0.1:18784/coach.html');await rp.waitForFunction(()=>!!document.querySelector('#reload').disabled);
  while(!release)await new Promise(r=>setTimeout(r,20));
  await rp.evaluate(()=>{localStorage.setItem('keso-kp-session-v1','b'.repeat(48));window.dispatchEvent(new StorageEvent('storage',{key:'keso-kp-session-v1'}));});
  await rp.getByRole('alert').filter({hasText:'まだ連携'}).first().waitFor();release();await rp.waitForTimeout(100);
  assert.equal(await rp.locator('[data-primary-mission]').count(),0);assert.equal(await rp.locator('#share-fallback').inputValue(),'');assert.equal(await rp.locator('#report').isHidden(),true);
  await race.close();
  const guest=await browser.newContext();let guestCalls=0;await guest.route('https://valorant-results.tealeaforest.workers.dev/**',()=>{guestCalls++;});const gp=await guest.newPage();await gp.goto('http://127.0.0.1:18784/coach.html');assert.equal(await gp.locator('#connection').isVisible(),true);assert.equal(guestCalls,0);await guest.close();
  // A linked player with no saved matches still gets a useful self screen.
  const emptyPerformance=coachPerformance([],[]),emptyReport=projectCoachSelfReport({...makeMember('VDK'),accounts:['Dolly#SDGs'],archivedMatches:0,usableMatches:0,performance:emptyPerformance,nextMatch:coachNextMatch(emptyPerformance),matchFeedback:coachMatchFeedback(emptyPerformance),individual:[],individualMapAgent:[],matchTrend:[],fullDiagnosis:{items:[]},roundContribution:coachRoundContribution([],[]),roundContext:coachRoundContext([],[],new Set())});
  const emptyCtx=await browser.newContext({viewport:{width:320,height:812}});await emptyCtx.addInitScript(t=>localStorage.setItem('keso-kp-session-v1',t),token);
  await emptyCtx.route('https://valorant-results.tealeaforest.workers.dev/**',route=>route.fulfill({json:{...state,identity:{...identity,displayName:'VDK',defaultProfile:'VDK',accountOptions:[{profile:'VDK',label:'Dolly#SDGs'}]},report:emptyReport}}));
  const emptyPage=await emptyCtx.newPage(),emptyErrors=[];emptyPage.on('pageerror',e=>emptyErrors.push(e.message));await emptyPage.goto('http://127.0.0.1:18784/coach.html');await emptyPage.locator('[data-primary-mission]').waitFor();assert.equal(await emptyPage.locator('.prototype-top .playerline .name').innerText(),'VDK');assert.equal(await emptyPage.locator('.prototype-top .rankbox .r').first().innerText(),'未取得');assert.match(await emptyPage.locator('.prototype-top').innerText(),/記録|試合/);assert.equal(emptyReport.performance.overall.kd,null);assert.equal(await emptyPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(emptyErrors,[]);await emptyCtx.close();
  // Saving an old user's goal must never paint it after a session switch.
  for(const scenario of ['late-save','unauthorized-save']){
   const sc=await browser.newContext({viewport:{width:375,height:812}});await sc.addInitScript(t=>localStorage.setItem('keso-kp-session-v1',t),token);
   let releaseSave;await sc.route('https://valorant-results.tealeaforest.workers.dev/**',async route=>{
    const req=route.request();if(req.headers().authorization==='Bearer '+'b'.repeat(48))return route.fulfill({json:{identity:{status:'unregistered'},report:null}});
    if(req.method()==='POST'){
     if(scenario==='unauthorized-save')return route.fulfill({status:401,json:{error:'接続が切れました。'}});
     await new Promise(resolve=>releaseSave=resolve);return route.fulfill({json:{goal:{...req.postDataJSON(),version:1},created:true}}).catch(()=>{});
    }
    return route.fulfill({json:{...state,goals:{...state.goals,goals:[],history:[]},report:projectCoachSelfReport(makeMember('神戸'))}});
   });
   const sp=await sc.newPage(),se=[];sp.on('pageerror',e=>se.push(e.message));await sp.goto('http://127.0.0.1:18784/coach.html');await sp.locator('[data-coach-goals]').waitFor();
   await sp.locator('[data-goal-kind="process"] > summary').click();await sp.locator('[name="action"]').fill('古い所有者だけの目標');await sp.locator('[name="selfCheck"]').fill('録画で確認します');await sp.locator('[data-goal-form="process"] button[type="submit"]').click();
   if(scenario==='late-save'){
    while(!releaseSave)await new Promise(r=>setTimeout(r,20));await sp.evaluate(()=>{localStorage.setItem('keso-kp-session-v1','b'.repeat(48));window.dispatchEvent(new Event('focus'));});
    await sp.getByRole('alert').filter({hasText:'まだ連携'}).first().waitFor();releaseSave();await sp.waitForTimeout(100);
   }else await sp.getByRole('alert').filter({hasText:'もう一度ログイン'}).waitFor();
   assert.equal(await sp.locator('[data-coach-goals]').count(),0);assert.ok(!(await sp.locator('body').textContent()).includes('古い所有者だけの目標'));assert.deepEqual(se,[]);await sc.close();
  }
  // A late shared-summary response and a rejected settings write clear all prior-person UI.
  for(const scenario of ['late-summary','unauthorized-settings']){
   const sc=await browser.newContext({viewport:{width:375,height:812}});await sc.addInitScript(t=>localStorage.setItem('keso-kp-session-v1',t),token);let releaseSummary;
   await sc.route('https://valorant-results.tealeaforest.workers.dev/**',async route=>{
    const r=route.request(),url=new URL(r.url());if(r.headers().authorization==='Bearer '+'b'.repeat(48))return route.fulfill({json:{identity:{status:'unregistered'},report:null}});
    if(url.pathname.endsWith('/settings'))return route.fulfill({status:401,json:{error:'接続が切れました。'}});
    if(url.pathname.endsWith('/directory'))return route.fulfill({json:{people:[{subjectId:otherSubject,displayName:'遅着する共有者'}],sharingAvailable:true}});
    if(url.pathname.endsWith('/summary')){await new Promise(resolve=>releaseSummary=resolve);return route.fulfill({json:sharedFixture(otherSubject)}).catch(()=>{});}
    return route.fulfill({json:{...state,report:projectCoachSelfReport(makeMember('神戸'))}});
   });
   const sp=await sc.newPage(),errors=[];sp.on('pageerror',e=>errors.push(e.message));await sp.goto('http://127.0.0.1:18784/coach.html');await sp.locator('[data-primary-mission]').waitFor();
   if(scenario==='late-summary'){
    await sp.locator('[data-sharing-browse] > summary').click();await sp.locator('[data-directory-load]').click();await sp.locator('[name="sharedSubject"]').check();await sp.locator('[data-summary-open]').click();while(!releaseSummary)await new Promise(r=>setTimeout(r,20));
    await sp.evaluate(()=>{localStorage.setItem('keso-kp-session-v1','b'.repeat(48));window.dispatchEvent(new Event('focus'));});await sp.getByRole('alert').filter({hasText:'まだ連携'}).first().waitFor();releaseSummary();await sp.waitForTimeout(100);
   }else{await sp.locator('[data-sharing-settings] > summary').click();await sp.locator('[data-sharing-form] button[type="submit"]').click();await sp.getByRole('alert').filter({hasText:'もう一度ログイン'}).waitFor();}
   assert.equal(await sp.locator('.shared-summary').count(),0);assert.equal(await sp.locator('[data-sharing-form]').count(),0);assert.equal(await sp.locator('[data-primary-mission]').count(),0);assert.equal(await sp.locator('#share-fallback').inputValue(),'');assert.deepEqual(errors,[]);await sc.close();
  }
  console.log('KESO COACH self-first, private sessions, v6/practice regression and 320/375/1440 layout: OK');
 }finally{await browser.close();server.kill();}
})().catch(e=>{console.error(e);server.kill();process.exitCode=1;});
