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
  const {readPrivateRecords,savePrivateRecord}=await import('../services/valorant-results/src/coach-private-records.ts');
  const {practiceMatches,savePracticeMatch,practiceReview}=await import('../services/valorant-results/src/coach-practice-review.ts');
  const reviewIdentity={status:'linked',subjectId:'subject',accounts:[{puuid:'fixture-self',riotId:'Fixture#T'}]};
  const {DatabaseSync}=require('node:sqlite'),privateSql=new DatabaseSync(':memory:');privateSql.exec('PRAGMA foreign_keys=ON');
  for(const name of ['0006_competitive_match_rosters.sql','0007_competitive_round_events.sql','0010_coach_profiles.sql','0011_coach_goals.sql','0013_coach_private_records.sql','0014_coach_match_review.sql'])privateSql.exec(require('node:fs').readFileSync(require('node:path').join(root,'services/valorant-results/migrations',name),'utf8'));
  privateSql.exec("INSERT INTO coach_profiles(guild,subject_id,owner_user,person_key,display_name,updated_at) VALUES('fixture','subject','owner','kobe','神戸',0)");
  const query=(text,args=[])=>({bind:(...values)=>query(text,values),first:()=>privateSql.prepare(text).get(...args)||null,all:()=>({results:privateSql.prepare(text).all(...args)})});const privateDb={prepare:query};let losePrivateReply=false;
  let teamState={joined:false,shareStatus:false,shareMetrics:false,version:0};
  const partyReport={scope:'consented-team-only',ruleVersion:'party-verified-v1',
   overall:{matches:2,unknownOutcomes:0,winRate:{value:1,numerator:2,denominator:2},
    kd:{value:2,numerator:60,denominator:30,validPlayerSamples:4,excludedPlayerSamples:0}},
   quality:{inspectedMatches:2,eligibleMatches:2,excludedMatches:0,inputLimit:250,limitReached:false},
   maps:[{map:'<img src=x onerror=alert(1)>',matches:2,
    winRate:{value:1,numerator:2,denominator:2},
    kd:{value:2,numerator:60,denominator:30}}],
   positionBasedTradeDistance:'評価範囲外',puuid:'must-not-display'};
  let teamChallenge=null,teamHistory=[],teamSelf=null;
  let noticeSettings={enabled:false,version:0};
  const selfSubject='11111111-1111-4111-8111-111111111111',otherSubject='22222222-2222-4222-8222-222222222222';let otherPublic=true;
  const sharedFixture=(subject)=>({subjectId:subject,displayName:subject===selfSubject?state.settings.displayName:'<img src=x onerror=alert(1)> 共有者',policyVersion:1,period:{from:'2026-11-01',to:'2026-11-20',timezone:'Asia/Tokyo'},matches:{analyzed:20,candidates:22,excluded:2,rowLimit:250,limitReached:false},metrics:subject===selfSubject&&!state.settings.fields.includes('kd')?{}:{kd:{value:1.2,validMatches:20,excludedMatches:0,numerator:240,denominator:200,formula:'合計キル数 ÷ 合計デス数',secret:'never-share-metric'}},goals:'never-share-goals',accounts:['never-share-account'],weakness:'never-share-weakness',puuid:'never-share-id'});
  await ctx.route('https://valorant-results.tealeaforest.workers.dev/**',async route=>{
   const req=route.request(),url=new URL(req.url());requests.push({url:req.url(),method:req.method(),auth:req.headers().authorization});
   if(req.headers().authorization==='Bearer '+'b'.repeat(48))return route.fulfill({json:{identity:{status:'unregistered'},report:null}});
   if(['/api/kp/coach/practice/matches','/api/kp/coach/practice/match','/api/kp/coach/practice/review'].includes(url.pathname)){
    try{const out=url.pathname.endsWith('/match')?await savePracticeMatch(privateDb,'fixture',reviewIdentity,req.postDataJSON()):url.pathname.endsWith('/matches')?await practiceMatches(privateDb,'fixture',reviewIdentity,url.searchParams.get('record'),url.searchParams.get('kind'),url.searchParams.get('cursor')):await practiceReview(privateDb,'fixture',reviewIdentity,url.searchParams.get('record'),url.searchParams.get('previous'));if(req.method()==='POST'&&losePrivateReply){losePrivateReply=false;return route.abort('failed');}return route.fulfill({json:out});}catch(e){return route.fulfill({status:e.status||500,json:{error:e.message}});}
   }
   if(['/api/kp/coach/practice/records','/api/kp/coach/notes'].includes(url.pathname)){
    const kind=url.pathname.endsWith('/notes')?'notes':'records';
    try{const value=req.method()==='GET'?await readPrivateRecords(privateDb,'fixture','subject',kind,url.searchParams.get('cursor')):await savePrivateRecord(privateDb,'fixture','subject',kind,req.postDataJSON());
     if(req.method()==='POST'&&losePrivateReply){losePrivateReply=false;return route.abort('failed');}return route.fulfill({json:value});}
    catch(e){return route.fulfill({status:e.status||500,json:{error:e.message}});}
   }
   if(url.pathname.startsWith('/api/kp/coach/team/')){
    const kind=url.pathname.split('/').pop();
    if(kind==='consent'){
     if(req.method()==='GET')return route.fulfill({json:{team:'確認済みコーチロスター',settings:teamState}});
     const b=req.postDataJSON();if(b.expectedVersion!==teamState.version)return route.fulfill({status:409,json:{error:'同意が更新されています。'}});
     teamState={joined:b.joined,shareStatus:b.shareStatus,shareMetrics:b.shareMetrics,version:teamState.version+1};
     return route.fulfill({json:{team:'確認済みコーチロスター',settings:teamState}});
    }
    if(kind==='notification'){
     if(!teamState.joined)return route.fulfill({status:404,json:{error:'この表示は利用できません。'}});
     if(req.method()==='GET')return route.fulfill({json:{settings:noticeSettings,deliveryReady:false,
      preview:{message:'KESO COACH：チームの共有課題が更新されました。内容は本人認証後のチーム画面で確認してください。',mode:'送信しないプレビュー',mentions:'なし',includesPersonalNotes:false,includesMatchIds:false}}});
     const b=req.postDataJSON();if(b.expectedVersion!==noticeSettings.version)return route.fulfill({status:409,json:{error:'古い設定です。'}});
     noticeSettings={enabled:b.enabled,version:noticeSettings.version+1};
     return route.fulfill({json:{settings:noticeSettings,deliveryReady:false,
      preview:{message:'KESO COACH：チームの共有課題が更新されました。内容は本人認証後のチーム画面で確認してください。',mode:'送信しないプレビュー',mentions:'なし',includesPersonalNotes:false,includesMatchIds:false}}});
    }
    if(['pdca','challenge','status'].includes(kind)){
     if(!teamState.joined)return route.fulfill({status:404,json:{error:'この表示は利用できません。'}});
     if(kind==='challenge'&&req.method()==='POST'){
      const b=req.postDataJSON();if(b.expectedVersion!==(teamChallenge?.version??0))return route.fulfill({status:409,json:{error:'古い版です。'}});
      teamChallenge={version:b.expectedVersion+1,category:b.category,title:b.title,action:b.action,
       measure:b.measure,periodEnd:b.periodEnd,active:b.active,updatedAt:1000};
      teamHistory.unshift({...teamChallenge,reason:b.reason});
      return route.fulfill({json:{saved:true,version:teamChallenge.version}});
     }
     if(kind==='status'&&req.method()==='POST'){
      if(!teamState.shareStatus)return route.fulfill({status:404,json:{error:'同意が必要です。'}});
      const b=req.postDataJSON();if(!teamChallenge?.active||b.expectedVersion!==(teamSelf?.version??0)||b.challengeVersion!==teamChallenge.version)
       return route.fulfill({status:409,json:{error:'古い版です。'}});
      teamSelf={state:b.state,action:b.action,version:(teamSelf?.version??0)+1,challengeVersion:b.challengeVersion};
      return route.fulfill({json:{saved:true,version:teamSelf.version,challengeVersion:teamChallenge.version}});
     }
     if(kind==='pdca'&&req.method()==='GET')return route.fulfill({json:{
      challenge:teamChallenge,canEdit:true,history:teamHistory.slice(0,5),
      self:teamSelf||{version:0,state:'未着手',action:''},
      shared:teamState.shareStatus&&teamSelf?.challengeVersion===teamChallenge?.version?
       [{displayName:'<img src=x onerror=alert(1)> 共有者',state:teamSelf.state,action:teamSelf.action}]:[],
      note:'本人の実施申告です。'
     }});
    }
    if(kind==='metrics')return route.fulfill(teamState.joined&&teamState.shareMetrics?
     {json:partyReport}:{status:404,json:{error:'この表示は利用できません。'}});
    if(kind==='roster')return route.fulfill(teamState.joined?
     {json:{members:[{displayName:'確認済みの共有者',status:'まだ分かりません'}],participantCount:1}}:
     {status:404,json:{error:'この表示は利用できません。'}});
   }
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
  await page.locator('[data-quick-start]').waitFor();
  assert.equal(await page.locator('[data-full-coach]').evaluate(el=>el.open),false,'a single priority is shown first');
  assert.equal(await page.locator('[data-quick-start] .coach-quick-steps li').count(),3);
  assert.equal(await page.evaluate(()=>Boolean(document.querySelector('#member-result').compareDocumentPosition(document.querySelector('#coach-loop-host')) & Node.DOCUMENT_POSITION_FOLLOWING)),true,'today\'s one priority appears before the old review history');
  assert.equal(await page.locator('[data-aim-routine]').count(),1);
  assert.equal(await page.locator('[data-aim-routine]').evaluate(el=>el.open),false,'optional aim routine starts folded');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile quick start fits');
  await page.locator('[data-aim-routine] > summary').click();
  assert.match(await page.locator('[data-aim-routine]').innerText(),/停止→初弾/);
  await page.locator('[data-aim-routine] > summary').click();
  await page.locator('[data-full-coach] > summary').click();
  await page.locator('[data-primary-mission]').waitFor();
  assert.deepEqual(requests.map(r=>new URL(r.url).pathname).sort(),['/api/kp/coach/me','/api/kp/coach/practice/records','/api/kp/coach/notes','/api/kp/coach/goals'].sort(),'only authenticated self data and today’s three record reads occur on entry');
  assert.ok(requests.every(r=>r.method==='GET'&&r.auth==='Bearer '+token),'all initial requests use the signed-in member’s token and never mutate records');
  assert.equal(await page.locator('[data-member="VDK"]').count(),0,'no other-person selector');
  assert.equal(await page.locator('#legacy-coach').innerText(),'');
  assert.ok(!(await page.locator('body').innerText()).includes(token));
  await page.locator('#coach-operations').evaluate(el=>el.open=true);
  assert.equal(await page.locator('.prototype-top .playerline .name').innerText(),'神戸');
  assert.equal(await page.locator('[data-primary-mission]').count(),1);
  assert.equal(await page.locator('.prototype-top .block').count(),3,'selected recipes become the three prototype blocks');
  assert.equal(await page.locator('.prototype-top .rankbox .r').first().innerText(),'未取得','never invent sample ranks');
  assert.match(await page.locator('.prototype-top .evidence').innerText(),/1\.96/,'uses real fixture KD');
  // Phase 3-C team UI is explicit opt-in. It must not ask for metrics on page load.
  await page.locator('[data-team-panel] > summary').click();
  await page.locator('[data-team-load]').click();
  await page.locator('[data-team-consent-form]').waitFor({state:'visible'});
  assert.equal(await page.locator('[name="joined"]').isChecked(),false);
  assert.equal(await page.locator('[data-team-metrics-load]').isVisible(),false);
  await page.locator('[name="joined"]').check();await page.locator('[name="shareMetrics"]').check();
  await page.locator('[data-team-consent-form] button[type="submit"]').click();
  await page.locator('[data-team-metrics-load]').waitFor({state:'visible'});
  await page.locator('[data-team-metrics-load]').click();
  await page.locator('[data-team-metrics-view] [data-coach-party-metrics]').waitFor();
  assert.match(await page.locator('[data-team-metrics-view]').innerText(),/勝率：100.0%/);
  assert.equal(await page.locator('[data-team-metrics-view] img, [data-team-metrics-view] script').count(),0,'no HTML injection');
  assert.ok(!(await page.locator('[data-team-metrics-view]').innerText()).includes('must-not-display'),'no extra response fields');
  for(const width of [320,375,1440]){
   await page.setViewportSize({width,height:900});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'team cards fit '+width);
   if(process.env.COACH_V6_SCREENSHOTS_DIR)await page.locator('[data-team-panel]').screenshot({path:require('node:path').join(process.env.COACH_V6_SCREENSHOTS_DIR,'phase3-team-'+width+'.png')});
  }
  await page.locator('[name="shareMetrics"]').uncheck();
  await page.locator('[data-team-consent-form] button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-team-metrics-load]')?.hidden===true);
  assert.equal(await page.locator('[data-team-metrics-view] [data-coach-party-metrics]').count(),0,'revoking consent clears metric cards');
  // Phase 3-E: manual-only notice preview, opt-in, and opt-out (never send Discord).
  const noticeRequestsBefore=requests.filter(r=>r.url.includes('/team/notification')).length;
  assert.equal(noticeRequestsBefore,0,'no automatic notification request');
  await page.locator('[data-team-notice] > summary').click();
  await page.locator('[data-notice-load]').click();
  await page.locator('[data-notice-form]').waitFor({state:'visible'});
  assert.equal(await page.locator('[name=noticeEnabled]').isChecked(),false);
  assert.match(await page.locator('[data-notice-preview]').innerText(),/共有課題が更新/);
  await page.locator('[name=noticeEnabled]').check();
  await page.locator('[data-notice-form] button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('[data-notice-form] button[type=submit]')?.disabled===false);
  assert.equal(noticeSettings.enabled,true);assert.equal(await page.locator('[data-notice-preview] img').count(),0);
  await page.locator('[name=noticeEnabled]').uncheck();
  await page.locator('[data-notice-form] button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('[data-notice-form] button[type=submit]')?.disabled===false);
  assert.equal(noticeSettings.enabled,false,'opt-out stops future notification');
  for(const width of [320,375,1440]){
   await page.setViewportSize({width,height:900});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'notice card layout '+width);
  }
  await page.setViewportSize({width:375,height:812});
  // Phase 3-D: each state is loaded and saved only by an explicit owner action.
  await page.locator('[data-team-pdca] > summary').click();
  await page.locator('[data-team-pdca-load]').click();
  await page.locator('[data-team-task-form]').waitFor({state:'visible'});
  assert.equal(await page.locator('[data-team-status-form]').isVisible(),false,'no status sharing without opt-in');
  await page.locator('[data-team-task-form] [name=teamTitle]').fill('次の試合のピークをそろえます');
  await page.locator('[data-team-task-form] [name=teamAction]').fill('味方の合図で二人一緒に出ます');
  await page.locator('[data-team-task-form] [name=teamMeasure]').fill('録画で時間を確認します');
  await page.locator('[data-team-task-form] [name=teamPeriodEnd]').fill('2026-12-01');
  await page.locator('[data-team-task-form] [name=teamReason]').fill('一つだけ練習するため');
  await page.locator('[data-team-task-form] button[type=submit]').click();
  await page.locator('[data-team-task] h3').waitFor();
  assert.match(await page.locator('[data-team-task]').innerText(),/次の試合のピークをそろえます/);
  await page.locator('[data-team-consent-form] [name=shareStatus]').check();
  await page.locator('[data-team-consent-form] button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('[data-team-pdca-load]')?.hidden===false);
  await page.locator('[data-team-pdca-load]').click();
  await page.locator('[data-team-status-form]').waitFor({state:'visible'});
  await page.locator('[data-team-status-form] [name=teamState]').selectOption('実施予定');
  await page.locator('[data-team-status-form] [name=teamSelfAction]').fill('合図してピークします');
  await page.locator('[data-team-status-form] button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('[data-team-participants]')?.textContent?.includes('実施予定'));
  assert.equal(await page.locator('[data-team-participants] img, [data-team-participants] script').count(),0,'team status is plain text');
  for(const width of [320,375,1440]){
   await page.setViewportSize({width,height:900});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'PDCA layout fits '+width);
   if(process.env.COACH_V6_SCREENSHOTS_DIR)
    await page.locator('[data-team-pdca]').screenshot({path:require('node:path').join(process.env.COACH_V6_SCREENSHOTS_DIR,'phase3d-pdca-'+width+'.png')});
  }
  await page.locator('[data-team-consent-form] [name=shareStatus]').uncheck();
  await page.locator('[data-team-consent-form] button[type=submit]').click();
  assert.equal(await page.locator('[data-team-participants]').innerText(),'','revoke removes visible sharing');
  await page.setViewportSize({width:375,height:812});
  await page.setViewportSize({width:375,height:812});
  const beforeUiActions=requests.length;
  await page.locator('#acceptBtn').click();await page.waitForFunction(()=>document.querySelector('#acceptBtn')?.getAttribute('aria-pressed')==='true');assert.equal(await page.locator('#acceptBtn').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#acceptNote').isVisible(),true);
  await page.locator('#timerBtn').click();assert.match(await page.locator('#timerBtn').innerText(),/一時停止/);await page.locator('#timerReset').click();assert.match(await page.locator('#clock').innerText(),/04:00/);
  assert.equal(requests.length,beforeUiActions+1,'explicit plan save makes only one authenticated POST because private records/notes/goals were preloaded; timer does not write');
  assert.ok(requests.at(-1).url.endsWith('/api/kp/coach/practice/records')&&requests.at(-1).method==='POST'&&requests.at(-1).auth==='Bearer '+token,'explicit plan save writes only to the signed-in person’s record API');
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

  assert.equal(requests.length,beforeUiActions+1,'changing dashboard tabs never triggers extra API calls');
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
  assert.equal(requests.length,beforeUiActions+1,'copying selected report is purely client-side');

  assert.deepEqual(errors,[]);
  await page.locator('#member-coaching-panel').evaluate(el=>el.open=true);
  const beforeSwitch=requests.length;
  await page.locator('[data-member="Aquatopia"]').click();
  await page.waitForFunction(()=>document.querySelector('.prototype-top .playerline .name')?.textContent==='Aquatopia');
  const memberReads=requests.slice(beforeSwitch);
  assert.ok(memberReads.some(r=>new URL(r.url).pathname==='/api/kp/coach/member'&&r.url.includes('person=Aquatopia')),'the selected member was loaded');
  const allowedMemberReads=new Set(['/api/kp/coach/member','/api/kp/coach/practice/records','/api/kp/coach/notes','/api/kp/coach/goals']);
  assert.ok(memberReads.every(r=>r.method==='GET'&&r.auth==='Bearer '+token&&allowedMemberReads.has(new URL(r.url).pathname)),'switching member may use cached records, but never writes or reads unexpected endpoints');
  const beforeReturn=requests.length;
  await page.locator('#return-self').click();
  await page.waitForFunction(()=>document.querySelector('.prototype-top .playerline .name')?.textContent==='神戸');
  const selfReads=requests.slice(beforeReturn);
  assert.ok(selfReads.some(r=>new URL(r.url).pathname==='/api/kp/coach/me'),'return to self must load the signed-in profile');
  const allowedSelfReads=new Set(['/api/kp/coach/me','/api/kp/coach/practice/records','/api/kp/coach/notes','/api/kp/coach/goals']);
  assert.ok(selfReads.every(r=>r.method==='GET'&&r.auth==='Bearer '+token&&allowedSelfReads.has(new URL(r.url).pathname)),'return to self may use cached records, but never writes or reads unexpected endpoints');
  for(const width of [320,375,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'layout '+width);}
  const japanese=await page.locator('.coach-existing p,.coach-existing li,#coach-operations p').evaluateAll(nodes=>[...new Set(nodes.flatMap(n=>(n.textContent||'').match(/[^。！？]+[。！？]/gu)||[]))]);
  const dictionaryEnds=japanese.filter(t=>/(?:[^ま]した|できる|できない|補わない|だけ|ではない|である|必要だ|確認する|断定しない|影響する|数える|決まる|異なる|とする|持つ|わかる|分かる|求める|含まれる|保存される|判断できない|得られる|必要になる|揃わない|少ない|多い|低い|高い|出ない|変わらない|足りない|違う|はない|を指す|と呼ぶ)。(?:$)/u.test(t));
  assert.deepEqual(dictionaryEnds,[],'all seven tabs and folded legacy paragraphs use courteous sentence endings');
  if(process.env.COACH_JAPANESE_AUDIT)require('node:fs').writeFileSync(process.env.COACH_JAPANESE_AUDIT,JSON.stringify({sentences:japanese.length,dictionaryEnds},null,2));
  // Phase 3-C read-only component: isolated visual fixture; no real team API is connected.
  await page.evaluate(async()=>{
   const {renderVerifiedPartyMetrics}=await import('./coach/team-metrics-view.js');
   const host=document.createElement('div');host.dataset.metricsFixture='';
   document.querySelector('#report').prepend(host);
   renderVerifiedPartyMetrics(host,{
    scope:'consented-team-only',ruleVersion:'party-verified-v1',
    overall:{matches:1,unknownOutcomes:0,winRate:{value:1,numerator:1,denominator:1},
     kd:{value:2,numerator:30,denominator:15,validPlayerSamples:2,excludedPlayerSamples:0}},
    quality:{excludedMatches:3,limitReached:false},
    maps:[{map:'<img src=x onerror=alert(1)>',matches:1,
     winRate:{value:1,numerator:1,denominator:1},kd:{value:2,numerator:30,denominator:15}}],
    positionBasedTradeDistance:'評価範囲外'
   });
  });
  const partyFixture=page.locator('[data-metrics-fixture]');
  assert.equal(await partyFixture.locator('img,script').count(),0,'untrusted map label remains text');
  assert.match(await partyFixture.innerText(),/勝率：100.0%/);
  assert.match(await partyFixture.innerText(),/トレード距離など位置解析：評価範囲外/);
  const partyParagraph=await partyFixture.locator('p').first().evaluate(el=>({font:getComputedStyle(el).fontSize,line:getComputedStyle(el).lineHeight}));
  assert.equal(partyParagraph.font,'16px');assert.ok(parseFloat(partyParagraph.line)>=30,'read-only copy line-height at least 1.9');
  for(const width of [320,375,1440]){
   await page.setViewportSize({width,height:900});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Phase 3-C party card fits '+width);
   if(process.env.COACH_V6_SCREENSHOTS_DIR)await partyFixture.screenshot({path:require('node:path').join(process.env.COACH_V6_SCREENSHOTS_DIR,'phase3c-party-fixture-'+width+'.png')});
  }
  await partyFixture.evaluate(n=>n.remove());
  // Owner-only practice and memo UI uses the actual SQLite-backed save/list logic.
  const loop=page.locator('[data-coach-loop]');assert.equal(await loop.count(),1);
  assert.match(await loop.innerText(),/今回保存した練習予定です/,'preloaded private records show the real planned practice, without claiming it was completed');
  const records=page.locator('[data-private-records]');await records.locator('[data-record-panel]').evaluate(el=>el.open=true);await records.locator('[data-record-load]').click();await records.locator('[role="status"]').filter({hasText:'本人限定の記録を読み込みました。'}).waitFor();await records.locator('[data-record-form]').waitFor();
  let recordForm=records.locator('[data-record-form]').first();
  // An asynchronous record refresh can replace the form while editing.
  // Set required report last, then check the live form and actual outgoing POST.
  await recordForm.locator('[name="minutes"]').fill('0');
  await recordForm.locator('[name="attempts"]').fill('3');
  await recordForm.locator('[name="successes"]').fill('2');
  await recordForm.locator('[name="reflection"]').fill('自分の振り返りです。\n次は退路を確認します。');
  // Final select must follow all field edits: a queued owner-record refresh can replace
  // the form during those edits and reset the previously selected required report.
  await recordForm.locator('[name="report"]').selectOption('done');
  const saveInputs=await recordForm.evaluate(form=>({
   report:form.elements.namedItem('report')?.value,
   minutes:form.elements.namedItem('minutes')?.value,
   attempts:form.elements.namedItem('attempts')?.value,
   successes:form.elements.namedItem('successes')?.value
  }));
  assert.deepEqual(saveInputs,{report:'done',minutes:'0',attempts:'3',successes:'2'},
   'live form must preserve non-empty zero and attempts before owner-only submit');
  // Explicitly validate and click the owner-only form, rather than relying on implicit Enter submission.
  const valid=await recordForm.evaluate(form=>({valid:form.checkValidity(),invalid:[...form.elements].filter(el=>el.validity&&!el.validity.valid).map(el=>el.name||el.tagName)}));
  assert.equal(valid.valid,true,'owner record form must be valid before saving; invalid controls: '+valid.invalid.join(', '));
  const [saveResponse]=await Promise.all([
   page.waitForResponse(response=>new URL(response.url()).pathname==='/api/kp/coach/practice/records'&&response.request().method()==='POST',{timeout:12000}),
   recordForm.locator('button[type="submit"]').click()
  ]);
  assert.equal(saveResponse.ok(),true,'owner record save API must succeed: HTTP '+saveResponse.status());
  const savedRequest=saveResponse.request().postDataJSON();
  assert.deepEqual(savedRequest.execution,{report:'done',minutes:0,attempts:3,successes:2},
   'the actual POST must persist the intended zero-minute value, not a stale or replaced form');
  await records.locator('[role="status"]').filter({hasText:'保存しました'}).waitFor({timeout:12000});
  assert.match(await loop.innerText(),/前回ご本人が記録した内容です/);
  assert.match(await loop.innerText(),/自分の振り返り/);
  await page.evaluate(()=>{
   window.__coachClipboardOriginal=Object.getOwnPropertyDescriptor(navigator,'clipboard')||null;
   Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('permission denied');}}});
  });
  await loop.locator('[data-loop-action="copy"]').click();
  const privateCopy=await loop.locator('[data-private-copy-fallback]').inputValue();
  assert.match(privateCopy,/本人専用の実施記録/);
  assert.match(privateCopy,/自分の振り返り/);
  assert.doesNotMatch(privateCopy,/fixture-self|review-private-|個人メモ|Bearer|PUUID|match_id/);
  await page.evaluate(()=>{
   if(window.__coachClipboardOriginal)Object.defineProperty(navigator,'clipboard',window.__coachClipboardOriginal);
   else delete navigator.clipboard;
   delete window.__coachClipboardOriginal;
  });
  for(const width of [320,375,1440]){
   await page.setViewportSize({width,height:900});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Phase2-C loop fits '+width);
   if(process.env.COACH_V6_SCREENSHOTS_DIR)await loop.screenshot({path:require('node:path').join(process.env.COACH_V6_SCREENSHOTS_DIR,'private-loop-'+width+'.png')});
  }

  assert.equal(privateSql.prepare('SELECT status FROM coach_practice_records').get().status,'recorded');assert.equal(JSON.parse(privateSql.prepare('SELECT execution_json FROM coach_practice_records').get().execution_json).minutes,0);
  recordForm=records.locator('[data-record-form]').first();await recordForm.evaluate(f=>f.closest('details').open=true);await recordForm.locator('[name="reflection"]').fill('競合しても残す振り返り');privateSql.prepare("UPDATE coach_practice_records SET version=version+1,reflection='別端末の修正'").run();await recordForm.locator('button[type="submit"]').click();await records.locator('[data-record-reload]').waitFor();assert.equal(await recordForm.locator('[name="reflection"]').inputValue(),'競合しても残す振り返り');await records.locator('[data-record-reload]').click();await records.locator('[role="status"]').filter({hasText:'読み込みました'}).waitFor();assert.equal(await records.locator('[data-record-form]').first().locator('[name="reflection"]').inputValue(),'別端末の修正');
  // Phase 2-B: real saved roster observations, opaque own-match links and re-evaluation.
  const savedPractice=privateSql.prepare('SELECT record_id,planned_at FROM coach_practice_records').get();
  const reviewPlayers=JSON.parse(JSON.stringify([{puuid:'fixture-self',team_id:'Blue',agent:'Sage',k:20,d:10,a:5,score:4000,damageDealt:3000,hs:20,bs:70,ls:10},...Array.from({length:9},(_,i)=>({puuid:'review-other-'+i,team_id:i<4?'Blue':'Red',agent:'Jett'}))]));
  for(let i=-6;i<=6;i++)if(i)privateSql.prepare('INSERT INTO valorant_match_rosters VALUES(?,?,?,?,?,?,?)').run('review-private-'+i,savedPractice.planned_at+(i<0?i*1000:i),'Ascent','ACT1',JSON.stringify([{id:'Blue',won:true,rounds:13},{id:'Red',won:false,rounds:7}]),JSON.stringify(reviewPlayers),Date.now());
  let reviewPanel=records.locator('[data-practice-review="'+savedPractice.record_id+'"]').first();await reviewPanel.evaluate(d=>{for(let x=d;x;x=x.parentElement.closest('details')){if(x.tagName==='DETAILS')x.open=true;}});await reviewPanel.locator('[data-match-load]').click();await reviewPanel.locator('[data-match-form]').waitFor();
  await reviewPanel.locator('[data-match-choice]').selectOption({index:1});await reviewPanel.locator('[name="primaryMetric"]').selectOption('dpr');losePrivateReply=true;await reviewPanel.locator('[data-match-save]').click();await records.locator('[data-record-retry]').waitFor();assert.equal(privateSql.prepare('SELECT version FROM coach_practice_records').get().version,4);await records.locator('[data-record-retry]').click();await records.locator('[role="status"]').filter({hasText:'観察指標の設定を保存しました'}).waitFor();assert.equal(privateSql.prepare('SELECT version FROM coach_practice_records').get().version,4,'link retry cannot duplicate the write');
  reviewPanel=records.locator('[data-practice-review="'+savedPractice.record_id+'"]').first();await reviewPanel.evaluate(d=>{for(let x=d;x;x=x.parentElement.closest('details')){if(x.tagName==='DETAILS')x.open=true;}});const beforeReview=requests.length;await reviewPanel.locator('[data-review-load]').click();await reviewPanel.locator('[data-review-metric="dpr"]').waitFor();assert.match(await reviewPanel.innerText(),/本人が残した記録です/);assert.match(await reviewPanel.innerText(),/暫定の傾向です/);assert.match(await reviewPanel.innerText(),/練習による効果とは断定しません/);assert.equal(requests.length,beforeReview+1,'one explicit review read, no poll');
  const explicitReviewRequests=requests.length;await loop.locator('[data-loop-action="review"]').click();
  await records.locator('[data-review-metric="dpr"]').first().waitFor();
  assert.equal(requests.length,explicitReviewRequests+1,'top loop review reads only after a click');
  assert.match(await loop.innerText(),/DPR：前/);
  await loop.locator('[data-loop-action="change"]').click();
  assert.equal(await page.locator('[data-other-practice]').evaluate(n=>n.open),true);
  privateSql.prepare("UPDATE valorant_match_rosters SET players_json=json_set(players_json,'$[0].damageDealt',4000,'$[0].damageDealtAt',?) WHERE match_id='review-private-6'").run(Date.now());await reviewPanel.locator('[data-review-load]').click();await reviewPanel.locator('[role="status"]').filter({hasText:'再計算しました'}).waitFor();
  for(const width of [320,375,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'observation fits '+width);if(process.env.COACH_V6_SCREENSHOTS_DIR)await reviewPanel.screenshot({path:require('node:path').join(process.env.COACH_V6_SCREENSHOTS_DIR,'observation-'+width+'.png')});}
  // Preserve an unsaved match selection when another form is saved.
  await reviewPanel.locator('[data-match-load]').click();await reviewPanel.locator('[name="primaryMetric"]').selectOption('acs');await reviewPanel.locator('[name="support1"]').selectOption('');await reviewPanel.locator('[name="support2"]').selectOption('');
  recordForm=records.locator('[data-record-form]').first();await recordForm.locator('[name="reflection"]').fill('別の入力も保存します。');await recordForm.locator('button[type="submit"]').click();await records.locator('[role="status"]').filter({hasText:'実施記録を保存しました'}).waitFor();
  reviewPanel=records.locator('[data-practice-review="'+savedPractice.record_id+'"]').first();assert.equal(await reviewPanel.locator('[name="primaryMetric"]').inputValue(),'acs','unrelated save preserves the unsaved metric selection');await reviewPanel.evaluate(d=>{for(let x=d;x;x=x.parentElement.closest('details')){if(x.tagName==='DETAILS')x.open=true;}});await reviewPanel.locator('[data-match-save]').click();await records.locator('[role="status"]').filter({hasText:'観察指標の設定を保存しました'}).waitFor();
  reviewPanel=records.locator('[data-practice-review="'+savedPractice.record_id+'"]').first();await reviewPanel.evaluate(d=>{for(let x=d;x;x=x.parentElement.closest('details')){if(x.tagName==='DETAILS')x.open=true;}});await reviewPanel.locator('[data-review-load]').click();await reviewPanel.locator('[data-review-metric="acs"]').waitFor();
  const observationSentences=await reviewPanel.locator('p,blockquote[data-catalogue-check]').evaluateAll(nodes=>[...new Set(nodes.flatMap(n=>(n.textContent||'').match(/[^。！？]+[。！？]/gu)||[]))]);
  assert.equal(await reviewPanel.locator('body').count(),0);assert.doesNotMatch(await reviewPanel.innerText(),/review-private-|fixture-self/);
  await records.locator('[data-personal-notes]').evaluate(d=>d.open=true);let newMemo=records.locator('[data-note-form]').first();await newMemo.locator('[name="title"]').fill('本人だけのメモ');await newMemo.locator('[name="body"]').fill('<img src=x onerror=alert(1)>\n秘密の振り返り');await newMemo.locator('[name="recordId"]').selectOption(savedPractice.record_id);const beforeTyping=requests.length;await newMemo.locator('[name="body"]').press('End');assert.equal(requests.length,beforeTyping,'typing never saves');
  losePrivateReply=true;await newMemo.locator('button[type="submit"]').click();await records.locator('[data-record-retry]').waitFor();assert.equal(privateSql.prepare('SELECT COUNT(*) n FROM coach_personal_notes').get().n,1);await records.locator('[data-record-retry]').click();await records.locator('[role="status"]').filter({hasText:'保存しました'}).waitFor();assert.equal(privateSql.prepare('SELECT COUNT(*) n FROM coach_personal_notes').get().n,1,'lost ack retry does not duplicate');assert.equal(await records.locator('img').count(),0);
  await records.locator('[data-personal-notes]').evaluate(d=>d.open=true);let savedMemo=records.locator('[data-note-form]').filter({has:page.locator('[data-note-delete]')}).first();await savedMemo.locator('[name="body"]').fill('修正後の本人メモ');await savedMemo.locator('button[type="submit"]').click();await records.locator('[role="status"]').filter({hasText:'保存しました'}).waitFor();assert.equal(privateSql.prepare('SELECT body FROM coach_personal_notes').get().body,'修正後の本人メモ');
  assert.equal(await loop.locator('[data-copy-include-notes]').isChecked(),false,'individual notes are opt-in OFF');
  await loop.locator('[data-loop-action="copy"]').click();
  assert.doesNotMatch(await page.evaluate(()=>window.__copiedDiagnostic),/修正後の本人メモ/);
  await loop.locator('[data-copy-include-notes]').check();
  await loop.locator('[data-loop-action="copy"]').click();
  const recordAndNote=await page.evaluate(()=>window.__copiedDiagnostic);
  assert.match(recordAndNote,/修正後の本人メモ/);
  assert.doesNotMatch(recordAndNote,/fixture-self|review-private-|PUUID|match_id|Bearer/);

  const savedNoteId=privateSql.prepare('SELECT note_id FROM coach_personal_notes WHERE deleted_at IS NULL').get().note_id;let noteReview=records.locator('[data-practice-review="'+savedNoteId+'"]').first();await noteReview.evaluate(d=>{for(let x=d;x;x=x.parentElement.closest('details')){if(x.tagName==='DETAILS')x.open=true;}});await noteReview.locator('[data-match-load]').click();await noteReview.locator('[data-match-choice]').selectOption({index:1});assert.equal(await noteReview.locator('[name="primaryMetric"]').count(),0);await noteReview.locator('[data-match-save]').click();await records.locator('[role="status"]').filter({hasText:'本人の試合をメモに関連付けました'}).waitFor();assert.ok(privateSql.prepare('SELECT match_id FROM coach_personal_notes WHERE note_id=?').get(savedNoteId).match_id);
  for(const width of [320,375,1440]){await page.setViewportSize({width,height:900});await records.locator('[data-personal-notes]').evaluate(d=>d.open=true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'private records fit '+width);if(process.env.COACH_V6_SCREENSHOTS_DIR)await records.screenshot({path:require('node:path').join(process.env.COACH_V6_SCREENSHOTS_DIR,'private-records-'+width+'.png')});}
  newMemo=records.locator('[data-note-form]').first();await newMemo.locator('[name="title"]').fill('未保存の入力');await newMemo.locator('[name="body"]').fill('移動しても勝手に保存しません');await records.locator('[data-record-load]').click();await records.locator('[data-record-leave-guard]:not([hidden])').waitFor();await records.getByRole('button',{name:'入力に戻ります',exact:true}).click();assert.equal(await newMemo.locator('[name="title"]').inputValue(),'未保存の入力');await records.locator('[data-record-load]').click();await records.getByRole('button',{name:'保存して移動します',exact:true}).click();await records.locator('[role="status"]').filter({hasText:'読み込みました'}).waitFor();assert.equal(privateSql.prepare('SELECT COUNT(*) n FROM coach_personal_notes').get().n,2);
  await records.locator('[data-personal-notes]').evaluate(d=>d.open=true);savedMemo=records.locator('[data-note-form]').filter({has:page.locator('[data-note-delete]')}).first();await savedMemo.locator('[data-note-delete]').click();await records.locator('[role="status"]').filter({hasText:'内容を削除しました'}).waitFor();assert.equal(privateSql.prepare("SELECT COUNT(*) n FROM coach_personal_notes WHERE deleted_at IS NOT NULL AND title='' AND body=''").get().n,1);
  await records.locator('[data-personal-notes]').evaluate(d=>d.open=true);newMemo=records.locator('[data-note-form]').first();await newMemo.locator('[name="title"]').fill('破棄する入力');await newMemo.locator('[name="body"]').fill('破棄して移動するテスト');await page.evaluate(()=>{const a=document.createElement('a');a.id='test-leave-records';a.href='/leave-test';a.textContent='移動の検証';a.onclick=e=>e.preventDefault();document.body.append(a);});await page.locator('#test-leave-records').click();await records.getByRole('button',{name:'破棄して移動します',exact:true}).click();assert.equal(await records.locator('[data-note-form]').first().locator('[name="body"]').inputValue(),'','discard clears text before any reload');await records.locator('[data-record-load]').click();await records.locator('[role="status"]').filter({hasText:'読み込みました'}).waitFor();assert.equal(await records.locator('[data-note-form]').first().locator('[name="body"]').inputValue(),'');
  // Shared summaries and their copy must not contain private practice/memo state.
  const privateSentences=await records.locator('p').evaluateAll(nodes=>[...new Set(nodes.flatMap(n=>(n.textContent||'').match(/[^。！？]+[。！？]/gu)||[]))]);
  const privateBad=[...privateSentences,...observationSentences].filter(t=>/(?:できる|できない|補わない|だけ|ではない|である|必要だ|確認する|断定しない|数える|とする|保存される|判断できない|足りない|違う|はない)。(?:$)/u.test(t));assert.deepEqual(privateBad,[],'private records UI uses courteous Japanese');
  if(process.env.COACH_JAPANESE_AUDIT)require('node:fs').writeFileSync(process.env.COACH_JAPANESE_AUDIT,JSON.stringify({sentences:japanese.length,privateRecordSentences:privateSentences.length,observationSentences:observationSentences.length,dictionaryEnds,privateBad},null,2));
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
  await page.locator('[data-full-coach]').evaluate(el=>el.open=true);
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
  assert.equal(await page.locator('[data-primary-mission]').count(),0);assert.equal(await page.locator('#share').isEnabled(),false);assert.equal(await page.locator('#share-fallback').inputValue(),'');assert.equal(await page.locator('[data-coach-goals]').count(),0);assert.equal(await page.locator('[data-note-form]').count(),0);
  assert.ok(!(await sharing.locator('[data-shared-results]').innerText()).includes('never-share'));
  await sharing.locator('[data-summary-copy]').click();await sharing.locator('[role="status"]').filter({hasText:'コピーしました'}).waitFor();const copied=JSON.parse(await page.evaluate(()=>window.__copiedDiagnostic));assert.equal(copied.format,'KESO_COACH_GUILD_SUMMARY_V1');assert.doesNotMatch(JSON.stringify(copied),/never-share|subjectId|puuid|KESO_COACH_SAFE_MEMBER|本人メモ|秘密の振り返り|競合しても残す/);
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('unavailable');}}}));await sharing.locator('[data-summary-copy]').click();await sharing.locator('[data-summary-fallback]:not([hidden])').waitFor();assert.match(await sharing.locator('[data-summary-fallback]').inputValue(),/KESO_COACH_GUILD_SUMMARY_V1/);
  otherPublic=false;const copyCount=requests.length;await sharing.locator('[data-summary-copy]').click();await sharing.locator('[role="status"]').filter({hasText:'利用できません'}).waitFor();assert.equal(requests.length,copyCount+1,'copy rechecks current consent');assert.equal(await sharing.locator('.shared-summary').count(),0);assert.equal(await sharing.locator('[data-summary-fallback]').inputValue(),'');
  await sharing.locator('[data-summary-self]').click();await page.locator('[data-quick-start]').waitFor();await page.locator('[data-full-coach]').evaluate(el=>el.open=true);await page.locator('[data-primary-mission]').waitFor();assert.equal(await page.locator('.prototype-top .playerline .name').innerText(),'神戸');
  // Comparison uses only shared subjects, including our own selected summary.
  await sharing.locator('[data-sharing-settings] > summary').click();await settingsForm.locator('[name="visibility"]').selectOption('guild-summary');await settingsForm.locator('button[type="submit"]').click();await sharing.locator('[role="status"]').filter({hasText:'共有しました'}).waitFor();otherPublic=true;
  await sharing.locator('[data-sharing-browse] > summary').click();await sharing.locator('[data-directory-load]').click();await page.waitForFunction(()=>document.querySelectorAll('[name="sharedSubject"]').length===2);for(const box of await sharing.locator('[name="sharedSubject"]').all())await box.check();await sharing.locator('[data-summary-open]').click();await page.waitForFunction(()=>document.querySelectorAll('.shared-summary').length===2);
  if(process.env.COACH_V6_SCREENSHOTS_DIR)await sharing.screenshot({path:require('node:path').join(process.env.COACH_V6_SCREENSHOTS_DIR,'shared-comparison.png')});
  assert.ok(requests.at(-1).url.includes('/comparison?subjects='));assert.equal(await page.locator('#share-fallback').inputValue(),'');
  for(const width of [320,375,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'shared summary fits '+width);}
  const beforeFocus=requests.length;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));assert.equal(await sharing.locator('.shared-summary').count(),0);assert.equal(await sharing.locator('[name="sharedSubject"]').count(),0);assert.equal(requests.length,beforeFocus,'foreground invalidates old summaries without polling');await sharing.locator('[data-summary-self]').click();await page.locator('[data-quick-start]').waitFor();await page.locator('[data-full-coach]').evaluate(el=>el.open=true);await page.locator('[data-primary-mission]').waitFor();
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
  const emptyPage=await emptyCtx.newPage(),emptyErrors=[];emptyPage.on('pageerror',e=>emptyErrors.push(e.message));await emptyPage.goto('http://127.0.0.1:18784/coach.html');await emptyPage.locator('[data-quick-start]').waitFor();await emptyPage.locator('[data-full-coach]').evaluate(el=>el.open=true);await emptyPage.locator('[data-primary-mission]').waitFor();assert.equal(await emptyPage.locator('.prototype-top .playerline .name').innerText(),'VDK');assert.equal(await emptyPage.locator('.prototype-top .rankbox .r').first().innerText(),'未取得');assert.match(await emptyPage.locator('.prototype-top').innerText(),/記録|試合/);assert.equal(emptyReport.performance.overall.kd,null);assert.equal(await emptyPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(emptyErrors,[]);await emptyCtx.close();
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
   const sp=await sc.newPage(),errors=[];sp.on('pageerror',e=>errors.push(e.message));await sp.goto('http://127.0.0.1:18784/coach.html');await sp.locator('[data-quick-start]').waitFor();await sp.locator('[data-full-coach]').evaluate(el=>el.open=true);await sp.locator('[data-primary-mission]').waitFor();
   if(scenario==='late-summary'){
    await sp.locator('[data-sharing-browse] > summary').click();await sp.locator('[data-directory-load]').click();await sp.locator('[name="sharedSubject"]').check();await sp.locator('[data-summary-open]').click();while(!releaseSummary)await new Promise(r=>setTimeout(r,20));
    await sp.evaluate(()=>{localStorage.setItem('keso-kp-session-v1','b'.repeat(48));window.dispatchEvent(new Event('focus'));});await sp.getByRole('alert').filter({hasText:'まだ連携'}).first().waitFor();releaseSummary();await sp.waitForTimeout(100);
   }else{await sp.locator('[data-sharing-settings] > summary').click();await sp.locator('[data-sharing-form] button[type="submit"]').click();await sp.getByRole('alert').filter({hasText:'もう一度ログイン'}).waitFor();}
   assert.equal(await sp.locator('.shared-summary').count(),0);assert.equal(await sp.locator('[data-sharing-form]').count(),0);assert.equal(await sp.locator('[data-primary-mission]').count(),0);assert.equal(await sp.locator('#share-fallback').inputValue(),'');assert.deepEqual(errors,[]);await sc.close();
  }
  for(const scenario of ['late-private','unauthorized-private']){
   const sc=await browser.newContext({viewport:{width:375,height:812}});await sc.addInitScript(t=>localStorage.setItem('keso-kp-session-v1',t),token);let releasePrivate,privateCalls=0;
   await sc.route('https://valorant-results.tealeaforest.workers.dev/**',async route=>{
    const r=route.request(),url=new URL(r.url());if(url.pathname.endsWith('/notes')&&r.method()==='POST')privateCalls++;if(r.headers().authorization==='Bearer '+'b'.repeat(48))return route.fulfill({json:{identity:{status:'unregistered'},report:null}});
    if(r.method()==='POST'){if(scenario==='unauthorized-private')return route.fulfill({status:401,json:{error:'接続が切れました。'}});await new Promise(resolve=>releasePrivate=resolve);return route.fulfill({json:{item:{id:r.postDataJSON().id,status:'active',title:'古い本人のメモ',body:'戻してはいけない本文',version:1}}}).catch(()=>{});}
    if(url.pathname.endsWith('/practice/records'))return route.fulfill({json:await readPrivateRecords(privateDb,'fixture','subject','records',null)});
    if(url.pathname.endsWith('/notes'))return route.fulfill({json:{items:[],nextCursor:null}});
    if(url.pathname.endsWith('/goals'))return route.fulfill({json:state.goals});
    return route.fulfill({json:{...state,report:projectCoachSelfReport(makeMember('神戸'))}});
   });
   const sp=await sc.newPage(),se=[];sp.on('pageerror',e=>se.push(e.message));await sp.goto('http://127.0.0.1:18784/coach.html');await sp.locator('[data-quick-start]').waitFor();await sp.locator('[data-full-coach]').evaluate(el=>el.open=true);await sp.locator('[data-primary-mission]').waitFor();await sp.locator('[data-record-panel]').evaluate(el=>el.open=true);await sp.locator('[data-record-load]').click();await sp.locator('[data-private-records] [role="status"]').filter({hasText:'本人限定の記録を読み込みました'}).waitFor();await sp.locator('[data-record-panel]').evaluate(el=>el.open=true);await sp.locator('[data-personal-notes]').evaluate(d=>d.open=true);
   const f=sp.locator('[data-note-form]').first();await f.locator('[name="title"]').fill('古い本人のメモ');await f.locator('[name="body"]').fill('戻してはいけない本文');await f.evaluate(f=>window.__oldPrivateForm=f);await f.locator('button[type="submit"]').click();
   if(scenario==='late-private'){while(!releasePrivate)await new Promise(r=>setTimeout(r,20));await sp.evaluate(()=>{localStorage.setItem('keso-kp-session-v1','b'.repeat(48));window.dispatchEvent(new Event('focus'));});await sp.getByRole('alert').filter({hasText:'まだ連携'}).first().waitFor();releasePrivate();await sp.waitForTimeout(100);}else await sp.getByRole('alert').filter({hasText:'もう一度ログイン'}).waitFor();
   const previousCalls=privateCalls;await sp.evaluate(()=>window.__oldPrivateForm.__save());assert.equal(privateCalls,previousCalls,'stale form cannot post under a later session');assert.equal(await sp.locator('[data-note-form]').count(),0);assert.ok(!(await sp.locator('body').textContent()).includes('戻してはいけない本文'));assert.deepEqual(se,[]);await sc.close();
  }
  for(const scenario of ['late-observation','unauthorized-observation']){
   const sc=await browser.newContext({viewport:{width:375,height:812}});await sc.addInitScript(t=>localStorage.setItem('keso-kp-session-v1',t),token);let releaseReview,linkPosts=0;
   await sc.route('https://valorant-results.tealeaforest.workers.dev/**',async route=>{const r=route.request(),u=new URL(r.url());if(r.method()==='POST'&&u.pathname.endsWith('/match'))linkPosts++;if(r.headers().authorization==='Bearer '+'b'.repeat(48))return route.fulfill({json:{identity:{status:'unregistered'},report:null}});
    if(u.pathname.endsWith('/review')){if(scenario==='unauthorized-observation')return route.fulfill({status:401,json:{error:'接続が切れました。'}});await new Promise(resolve=>releaseReview=resolve);return route.fulfill({json:{privateMarker:'返してはいけない観察'}}).catch(()=>{});}
    if(u.pathname.endsWith('/matches'))return route.fulfill({json:await practiceMatches(privateDb,'fixture',reviewIdentity,savedPractice.record_id,'record',null)});
    if(u.pathname.endsWith('/practice/records'))return route.fulfill({json:await readPrivateRecords(privateDb,'fixture','subject','records',null)});
    if(u.pathname.endsWith('/notes'))return route.fulfill({json:{items:[],nextCursor:null}});if(u.pathname.endsWith('/goals'))return route.fulfill({json:state.goals});return route.fulfill({json:{...state,report:projectCoachSelfReport(makeMember('神戸'))}});
   });
   const sp=await sc.newPage(),se=[];sp.on('pageerror',e=>se.push(e.message));await sp.goto('http://127.0.0.1:18784/coach.html');await sp.locator('[data-quick-start]').waitFor();await sp.locator('[data-full-coach]').evaluate(el=>el.open=true);await sp.locator('[data-primary-mission]').waitFor();await sp.locator('[data-record-panel]').evaluate(el=>el.open=true);await sp.locator('[data-record-load]').click();await sp.locator('[data-private-records] [role="status"]').filter({hasText:'本人限定の記録を読み込みました'}).waitFor();await sp.locator('[data-record-panel]').evaluate(el=>el.open=true);const rp=sp.locator('[data-practice-review]').first();await rp.evaluate(d=>{for(let x=d;x;x=x.parentElement.closest('details')){if(x.tagName==='DETAILS')x.open=true;}});await rp.locator('[data-match-load]').click();await rp.locator('[data-match-form]').waitFor();await rp.locator('[name="primaryMetric"]').selectOption('dpr');await rp.locator('[data-match-form]').evaluate(f=>window.__staleMatchForm=f);await rp.locator('[data-review-load]').click();
   if(scenario==='late-observation'){while(!releaseReview)await new Promise(r=>setTimeout(r,20));await sp.evaluate(()=>{localStorage.setItem('keso-kp-session-v1','b'.repeat(48));window.dispatchEvent(new Event('focus'));});await sp.getByRole('alert').filter({hasText:'まだ連携'}).first().waitFor();releaseReview();await sp.waitForTimeout(100);}else await sp.getByRole('alert').filter({hasText:'もう一度ログイン'}).waitFor();
   await sp.evaluate(()=>window.__staleMatchForm.__save());assert.equal(linkPosts,0,'stale match selector cannot save under another session');assert.equal(await sp.locator('[data-practice-review]').count(),0);assert.ok(!(await sp.locator('body').textContent()).includes('返してはいけない観察'));assert.deepEqual(se,[]);await sc.close();
  }
  // Real iPhone Activity report failure: an already-connected KP owner must
  // get a retry action, NEVER the 48-digit fallback for a backend 503/400.
  {
   const retryContext=await browser.newContext({viewport:{width:375,height:812}});
   await retryContext.addInitScript(t=>localStorage.setItem('keso-kp-session-v1',t),token);
   let firstReport=true;
   await retryContext.route('https://valorant-results.tealeaforest.workers.dev/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/kp/coach/me'&&firstReport){
     firstReport=false;
     return route.fulfill({status:503,json:{error:'コーチングの分析情報を読み込めませんでした。診断コード：COACH_REPORT',code:'COACH_REPORT'}});
    }
    return route.fulfill({json:{...state,report:projectCoachSelfReport(makeMember('神戸'))}});
   });
   const page=await retryContext.newPage();
   await page.goto('http://127.0.0.1:18784/coach.html?embedded=1');
   await page.waitForFunction(()=>!document.getElementById('coach-retry-panel').hidden);
   assert.equal(await page.locator('#connection').isVisible(),false,'do not ask the linked user to type a 48-digit code');
   assert.equal(await page.locator('#code').isVisible(),false);
   assert.match(await page.locator('#coach-ui-message').innerText(),/COACH_REPORT/);
   await page.locator('#coach-retry').click();
   await page.locator('[data-quick-start]').waitFor();await page.locator('[data-full-coach]').evaluate(el=>el.open=true);await page.locator('[data-primary-mission]').waitFor();
   assert.equal(await page.locator('#coach-retry-panel').isVisible(),false);
   assert.equal(await page.locator('#connection').isVisible(),false);
   await retryContext.close();
  }
  console.log('KESO COACH self-first, private sessions, v6/practice regression and 320/375/1440 layout: OK');
 }finally{await browser.close();server.kill();}
})().catch(e=>{console.error(e);server.kill();process.exitCode=1;});
