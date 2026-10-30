const engines=require('playwright');const engineName=process.env.PLAYWRIGHT_BROWSER||'chromium';const engine=engines[engineName];if(!['chromium','webkit'].includes(engineName))throw Error('Unsupported browser engine');const assert=require('node:assert/strict');const{readFileSync,existsSync}=require('node:fs');const{resolve}=require('node:path');const{createHash}=require('node:crypto');
const revision=process.env.KESO_TEST_REV;if(revision&&!/^[a-f0-9]{7,40}$/.test(revision))throw Error('Expected a commit SHA');
let browser;
(async()=>{
 const{createInitialState}=await import('../js/engine.js');
 browser=await engine.launch(engineName==='chromium'?{executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']}:{});
 for(const scenario of (process.argv[2]?[process.argv[2]]:['success','dm-touch','dm-refresh-touch','guild-touch','guild-refresh-touch','cancel','unconfigured','different-user'])){
  const errors=[],ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:engineName==='webkit'||scenario.includes('touch'),hasTouch:engineName==='webkit'||scenario.includes('touch')});let exchanges=0,challenge,operations=0,stateReads=0,failedModule=scenario==='module-failure';const bareModules=[];let releaseConfig;const configGate=new Promise(resolve=>{releaseConfig=resolve;});
  await ctx.addInitScript(({scenario})=>{
   for(const name of ['Audio','AudioContext','webkitAudioContext','RTCPeerConnection'])Object.defineProperty(window,name,{value:function(){throw Error('Unexpected media activation '+name);}});
   Object.defineProperty(navigator,'audioSession',{get(){throw Error('Unexpected audioSession access');}});
   HTMLMediaElement.prototype.play=()=>{throw Error('Unexpected playback')};Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia(){throw Error('Unexpected capture')},getDisplayMedia(){throw Error('Unexpected capture')}}});
   if(scenario==='different-user'){
    localStorage.setItem('keso-kp-session-v1','old-wallet-token');sessionStorage.setItem('keso-kp-pending-v1',JSON.stringify({id:'old-operation-id',owner:'old-user',action:'spin',args:{amount:100,type:'red'}}));
   }
   window.__sdkCommands=[];window.__externalUrls=[];
   // Model Discord's documented noninteractive PiP input gate for guild calls.
   if(scenario.startsWith('guild-'))document.addEventListener('DOMContentLoaded',()=>{
    if(window.__interactivePip)return;const shield=document.createElement('div');shield.id='discord-host-input-shield';shield.style.cssText='position:fixed;inset:0;z-index:2147483647';document.body.appendChild(shield);
   });
   const send=data=>window.dispatchEvent(new MessageEvent('message',{origin:location.origin,data:[1,data]}));
   Object.defineProperty(window,'parent',{configurable:true,value:{opener:null,postMessage(packet){
    const[op,payload]=packet;
    if(op===0){window.__sdkCommands.push('READY');queueMicrotask(()=>send({cmd:'DISPATCH',evt:'READY',nonce:null,data:{v:1,config:{api_endpoint:'https://discord.com/api',environment:'test'}}}));return;}
    if(op!==1)return;
    window.__sdkCommands.push(payload.cmd);
    if(payload.cmd==='AUTHORIZE'){
     if(scenario==='cancel'){queueMicrotask(()=>send({cmd:payload.cmd,evt:'ERROR',nonce:payload.nonce,data:{code:4000,message:'cancelled'}}));return;}
     window.__authorizeArgs=payload.args;queueMicrotask(()=>send({cmd:payload.cmd,evt:null,nonce:payload.nonce,data:{code:'native-sdk-code'}}));return;
    }
    if(payload.cmd==='OPEN_EXTERNAL_LINK'){
     window.__externalUrls.push(payload.args.url);
     queueMicrotask(()=>send({cmd:payload.cmd,evt:null,nonce:payload.nonce,data:{opened:true}}));return;
    }
    if(payload.cmd==='SET_CONFIG'){
     window.__interactivePip=payload.args.use_interactive_pip===true;document.getElementById('discord-host-input-shield')?.remove();queueMicrotask(()=>send({cmd:payload.cmd,evt:null,nonce:payload.nonce,data:{use_interactive_pip:window.__interactivePip}}));return;
    }
    if(payload.cmd==='AUTHENTICATE')queueMicrotask(()=>send({cmd:payload.cmd,evt:null,nonce:payload.nonce,data:{access_token:payload.args.access_token,user:{id:'user-one',username:'One',discriminator:'0',public_flags:0},scopes:['identify'],expires:'2099-01-01T00:00:00Z',application:{id:'100000000000000000',description:'test',name:'Test'}}}));
    else throw Error('Unexpected Discord command '+payload.cmd);
   }}});
  },{scenario});
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));const legacyFailure=process.env.KESO_EXPECT_LEGACY_FAILURE?page.waitForEvent('pageerror',{timeout:10000}):null;
  const state={...createInitialState(),cash:900,serverWallet:true,selfUserId:'user-one',members:[{id:'user-one',name:'本人'}],rewardRates:{competitive:{win:900,loss:-200,bottom:-400}}};
  await ctx.route('https://100000000000000000.discordsays.com/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path.startsWith('/.proxy/kp-api/api/kp/')){
    if(path.endsWith('/feed')){await route.fulfill({json:{entries:[]}});return;}
    let result;
    if(path.endsWith('/activity/config')){
     if(scenario==='slow-config')await configGate;
     if(scenario==='config-failure'){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'接続設定を確認できませんでした。'})});return;}
     result={available:scenario!=='unconfigured',applicationId:'100000000000000000'};
    }
    else if(path.endsWith('/activity/challenge')){challenge=route.request().postDataJSON().codeChallenge;result={nonce:'a'.repeat(48)};}
    else if(path.endsWith('/activity/auth')){exchanges++;const body=route.request().postDataJSON();assert.equal(body.code,'native-sdk-code');assert.equal(createHash('sha256').update(body.codeVerifier).digest('base64url'),challenge);result={token:'b'.repeat(48),userId:'user-one',accessToken:'ephemeral-discord-access'};}
    else if(path.endsWith('/state')){stateReads++;assert.equal(route.request().headers().authorization,'Bearer '+'b'.repeat(48));result=state;}
    // The 15-second check: report a change every time, so the touch scenario still sees a full refresh mid-tap.
    else if(path.endsWith('/pulse')){assert.equal(route.request().headers().authorization,'Bearer '+'b'.repeat(48));result={pulse:String(Date.now())+Math.random()};}
    else if(path.endsWith('/operation')){operations++;throw Error('Unexpected charge during login');}
    else throw Error('Unexpected endpoint '+path);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});return;
   }
   if(path==='/favicon.ico'){await route.fulfill({status:204});return;}
   const file=resolve(__dirname,'..','.'+(path==='/'?'/index.html':path));assert.ok(file.startsWith(resolve(__dirname,'..')+'/'));
   if(path.endsWith('.js')&&!new URL(route.request().url()).search)bareModules.push(path);
   if(path==='/js/casino-more.js'&&failedModule){await route.abort('failed');return;}
   const legacy=process.env.KESO_MIXED_CASINO&&path==='/js/casino.js'&&!new URL(route.request().url()).search;
   const body=legacy?readFileSync(resolve(__dirname,'../tests/fixtures/legacy-casino.js')):revision?require('node:child_process').execFileSync('git',['show',revision+':'+require('node:path').relative(resolve(__dirname,'..'),file)],{cwd:resolve(__dirname,'..')}):readFileSync(file);
   await route.fulfill({status:200,contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html',body});
  });
  await page.goto('https://100000000000000000.discordsays.com/?frame_id=frame&instance_id=instance&platform='+(engineName==='webkit'||scenario.includes('touch')?'mobile&mobile_app_version=300.0':'desktop')+(scenario.startsWith('guild-')?'&guild_id=100000000000000100&channel_id=100000000000000101':''));
  if(process.env.KESO_EXPECT_LEGACY_FAILURE){
   await legacyFailure;
   assert.ok(errors.some(message=>message.includes('validCard')),JSON.stringify(errors));assert.deepEqual(await page.evaluate(()=>window.__sdkCommands),[]);assert.equal(await page.locator('.title-screen').count(),0);
   console.log('Reproduced #138 loading failure: legacy casino validCard export missing before native READY ('+engineName+')');await ctx.close();continue;
  }
  if(scenario==='module-failure'){
   await page.getByRole('alert').filter({hasText:'画面を開けませんでした'}).waitFor();
   assert.deepEqual(await page.evaluate(()=>window.__sdkCommands),['READY']);assert.equal(exchanges,0);assert.equal(operations,0);
   assert.equal(await page.locator('button').count(),1);failedModule=false;await page.getByRole('button',{name:'もう一度開く'}).click();
   await page.locator('.title-start').filter({hasText:'900'}).waitFor();assert.equal(exchanges,1);assert.equal(operations,0);assert.deepEqual(errors,[]);
   console.log('Passed module failure: native READY before module loading, visible fallback and retry without a charge ('+engineName+')');await ctx.close();continue;
  }
  if(scenario==='slow-config'){
   await page.waitForFunction(()=>window.__sdkCommands.includes('READY'));
   await page.getByText('Discordで本人確認しています…').waitFor();assert.equal(exchanges,0);releaseConfig();
  }
  if(process.env.KESO_MIXED_CASINO)assert.deepEqual(bareModules,[],'all transitive browser modules carry the release version');
  if(scenario==='success'||scenario==='slow-config'||scenario.includes('touch')){
   await page.locator('.title-start').filter({hasText:'900'}).waitFor();assert.equal(await page.locator('#kp-connect-code').count(),0);assert.equal(exchanges,1);
   assert.deepEqual((await page.evaluate(()=>window.__sdkCommands)).filter(cmd=>cmd!=='SET_CONFIG'),['READY','AUTHORIZE','AUTHENTICATE']);assert.deepEqual(await page.evaluate(()=>window.__authorizeArgs.scope),['identify']);
   const stored=await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}));assert.ok(!stored.includes('ephemeral-discord-access')&&!stored.includes('native-sdk-code'));assert.equal(await page.evaluate(()=>localStorage.getItem('keso-exchange-v0.2')),null);
   if(scenario.includes('touch')){
    if(scenario.includes('refresh-touch')){
     await page.clock.install();const cdp=await ctx.newCDPSession(page),box=await page.locator('.title-start').boundingBox();
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});
     const previousReads=stateReads,refreshed=page.waitForResponse(r=>r.url().endsWith('/state'));await page.clock.fastForward(15000);await refreshed;assert.ok(stateReads>previousReads);await page.waitForTimeout(50);
     await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }else await page.locator('.title-start').tap({timeout:2500});
    await page.locator('.nav-btn[data-screen=play]').waitFor({timeout:2500});await page.locator('.nav-btn[data-screen=play]').tap();assert.match(await page.locator('#app').innerText(),/プレイで稼ぐ/);
   }
   if(scenario==='success'){
    await page.locator('.title-start').filter({hasText:'900'}).click();
    await page.locator('.nav-btn[data-screen=play]').click();
    const loop=page.locator('[data-companion=loop]');await loop.waitFor();
    await loop.click();
    await page.waitForFunction(()=>window.__externalUrls.includes('https://keso-loop.tealeaforest.workers.dev/'));
    assert.deepEqual(await page.evaluate(()=>window.__externalUrls),['https://keso-loop.tealeaforest.workers.dev/']);
    assert.equal(operations,0,'opening a companion website cannot change a KP wallet');
   }
   await page.reload();await page.locator('.title-start').filter({hasText:'900'}).waitFor();assert.equal(exchanges,2);assert.equal(operations,0);
   for(const width of[320,390,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  }else{
   await page.locator('#kp-connect-code').waitFor();assert.equal(await page.locator('.kp-connection').count(),0);assert.equal(operations,0);
   if(scenario==='unconfigured'||scenario==='config-failure'){assert.deepEqual(await page.evaluate(()=>window.__sdkCommands),['READY']);assert.equal(exchanges,0);}
   if(scenario==='cancel'){assert.equal(exchanges,0);await page.locator('[data-action=auto-connect-kp]').waitFor();}
   if(scenario==='different-user'){assert.equal(await page.evaluate(()=>localStorage.getItem('keso-kp-session-v1')),'old-wallet-token');assert.match(await page.locator('#app').innerText(),/別の口座/);}
  }
  assert.deepEqual(errors,[]);console.log('Passed Activity scenario: '+engineName+' '+scenario);await ctx.close();
 }
 console.log('Official SDK browser checks passed: automatic PKCE/identify login without a code, reopen, cancellation, unconfigured fallback, account-switch charge protection, mobile layouts and no audio access.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close()});
