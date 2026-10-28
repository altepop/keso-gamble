import {kpCommands,KP_COMMAND_VERSION} from './kp-command.ts';
import {voiceControl,voiceStatus} from './voice-api.ts';
import {ensureVoiceLedger,voicePolicy} from './voice-rewards.ts';
import {ensureQuizKp,receiveQuizKp,isKpParticipant,quizKpRates,quizKpLimits} from './quiz-kp.ts';
import {activityAuthAvailable,createActivityChallenge,authenticateActivity}from './discord-activity-auth.ts';
import { initializeKp, exchangeKpCode, kpSession, revokeKpSession, kpHash } from './kp.ts';
import type { KpEnv, KpMapping } from './kp.ts';
import configuredPlayers from '../players.json' with { type: 'json' };
import discord from '../discord-config.json' with { type: 'json' };
import policy from '../kp-policy.json' with { type: 'json' };
// @ts-expect-error The shared pure browser engine has no TypeScript declarations.
import { advanceMarket, trade, spin, spinNumbers, cryptoRouletteNumber } from '../../../js/engine.js';
// @ts-expect-error The shared pure browser engine has no TypeScript declarations.
import { hydrateRacing, placeRaceBet, useExchange } from '../../../js/racing.js';
// @ts-expect-error Shared browser engine.
import { hydrateMleague, placeMlBet, mlPartner } from '../../../js/mleague.js';
import { mlClosed, mlData, mlResults, seasonStats } from './mleague.ts';
import { racingView, raceSeed } from './racing-kp.ts';
import { defaultRoastLevel, validRoastLevel } from './racing-crowns.ts';
import { buyHorse, sellHorse, ownedHorses, raceEntries } from './racing-horses.ts';
import { masteryOf, riotIdOf } from './mastery.ts';
import { buyLuxury, luxuryPosts, luxuryView } from './luxury.ts';
export async function readKpState(env:KpEnv,mapping:KpMapping,user:string){
 const wallet=await env.DB.prepare('SELECT balance,version FROM kp_wallets WHERE guild=? AND user=?').bind(mapping.guildId,user).first<{balance:number;version:number}>();
 const row=await env.DB.prepare('SELECT data,version FROM kp_state WHERE guild=? AND user=?').bind(mapping.guildId,user).first<{data:string;version:number}>();if(!wallet||!row)throw Error('口座が見つかりません。');
 const state=JSON.parse(row.data);state.cash=wallet.balance;state.serverWallet=true;state.walletVersion=wallet.version;state.stateVersion=row.version;advanceMarket(state);Object.assign(state,hydrateRacing(state),hydrateMleague(state));if(!validRoastLevel(state.roastLevel))state.roastLevel=defaultRoastLevel(mapping,user);state.racing=await racingView(env,mapping);state.horses=await ownedHorses(env,mapping,user);const riotId=riotIdOf(mapping,user);state.mastery=riotId?await masteryOf(env,riotId,state.roastLevel):[];state.luxury=await luxuryView(env,mapping,user);for(const h of state.horses)h.statue=state.luxury.statues.includes(h.id);
 const rewards=(await env.DB.prepare('SELECT id,match,mode,amount,at FROM kp_events WHERE guild=? AND user=? ORDER BY at DESC,id LIMIT 100').bind(mapping.guildId,user).all<{id:string;match:string;mode:string;amount:number;at:number}>()).results;
 await ensureQuizKp(env);
 const quiz=(await env.DB.prepare('SELECT id,mode,day,game,amount,completed_at FROM kp_quiz_events WHERE guild=? AND user=? UNION ALL SELECT id,mode,day,game,amount,completed_at FROM kp_quiz_ranked_extra WHERE guild=? AND user=? ORDER BY completed_at DESC LIMIT 100').bind(mapping.guildId,user,mapping.guildId,user).all<{id:string;mode:string;day:string;game:string;amount:number;completed_at:number}>()).results;
 await ensureVoiceLedger(env);
 const voice=(await env.DB.prepare("SELECT e.id,e.day,e.slot,e.amount+COALESCE((SELECT delta FROM kp_ledger WHERE id='bonus:'||e.id),0) AS amount,e.at FROM kp_voice_events e WHERE e.guild=? AND e.user=? ORDER BY e.at DESC LIMIT 100").bind(mapping.guildId,user).all<{id:string;day:string;slot:number;amount:number;at:number}>()).results;
 state.voiceRewards={...await voiceStatus(env,user),...voicePolicy,earned:voice.filter(e=>e.day===new Date().toISOString().slice(0,10)).reduce((n,e)=>n+e.amount,0)};
 state.quizRates=quizKpRates;state.quizDay=new Date().toISOString().slice(0,10);state.quizLimits=quizKpLimits;state.quizCounts=Object.fromEntries(Object.keys(quizKpRates).map(mode=>[mode,quiz.filter(e=>e.day===state.quizDay&&e.mode===mode).length]));state.quizCompleted=Object.keys(quizKpLimits).filter(mode=>state.quizCounts[mode]>=quizKpLimits[mode]!);
 state.claims=rewards.map(e=>({id:e.id,activity:e.mode,reference:e.match,reward:e.amount,status:'approved',time:e.at})).concat(quiz.map(e=>({id:e.id,activity:'quiz.'+e.mode,reference:e.game,reward:e.amount,status:'approved',time:e.completed_at}))).concat(voice.map(e=>({id:e.id,activity:'voice',reference:'通話 '+e.slot+'回目',reward:e.amount,status:'approved',time:e.at}))).sort((a:{time:number},b:{time:number})=>b.time-a.time).slice(0,100);
 state.directives=(await env.DB.prepare('SELECT id,issuer,target,task,game,achievement,cost,status,at AS time FROM kp_directives WHERE guild=? AND (issuer=? OR target=?) ORDER BY at DESC,id LIMIT 100').bind(mapping.guildId,user,user).all()).results;
 state.members=mapping.accounts.map(a=>({id:a.discordUserId,name:configuredPlayers.find(p=>p.riotId.toLowerCase()===a.riotId.toLowerCase())?.name??a.riotId.split('#')[0]}));
 state.selfUserId=user;state.rewardRates=policy.modes;return state;
}
export async function operateKp(env:KpEnv,mapping:KpMapping,user:string,id:string,action:string,args:Record<string,unknown>){
 if(!/^[a-zA-Z0-9-]{16,80}$/.test(id))throw Error('操作IDが不正です。');
 const requestHash=await kpHash(JSON.stringify({action,args}));
 for(let attempt=0;attempt<4;attempt++){
  const existing=await env.DB.prepare('SELECT request_hash,response FROM kp_operations WHERE guild=? AND user=? AND id=?').bind(mapping.guildId,user,id).first<{request_hash:string;response:string}>();
  if(existing){if(existing.request_hash!==requestHash)throw Error('同じ操作IDを別の操作には使えません。');return JSON.parse(existing.response);}
  const state=await readKpState(env,mapping,user),before=state.cash;let result:unknown;let directive:Record<string,unknown>|null=null;
  if(action==='trade')result=trade(state,args.symbol,args.side,args.quantity);
  else if(action==='spin')result=args.type==='numbers'?spinNumbers(state,args.bets,cryptoRouletteNumber()):spin(state,args.type,args.amount,args.choice??0,cryptoRouletteNumber());
  else if(action==='directive'){
   const costs:Record<string,number>={competitive:8000,unrated:2500,solo_competitive:50000,solo_death_unrated:60000},task=String(args.task),target=String(args.target),cost=Object.hasOwn(costs,task)?costs[task]:0;
   if(!cost||!mapping.accounts.some(a=>a.discordUserId===target)||target===user)throw Error('指名する相手と課題を選んでください。');
   if(state.cash<cost)throw Error('KPが足りません。');
   useExchange(state,Date.now()); // directives, boxes and luxury items share the daily limit
   const game=task==='steam'?String(args.game??'').trim():'',achievement=task==='steam'?String(args.achievement??'').trim():'';
   if(task==='steam'&&(!game||!achievement||game.length>80||achievement.length>120))throw Error('ゲームと実績を入力してください。');
   directive={target,task,game,achievement,cost};state.cash-=cost;result={issued:true};
  }else if(action==='race-bet'){
   const raceId=Number(args.raceId),entries=Number.isSafeInteger(raceId)?await raceEntries(env,mapping,raceId):[];
   const bet=placeRaceBet(state,{raceId:args.raceId,type:args.type,horse:args.horse,amount:args.amount},Date.now(),entries);
   await raceSeed(env,mapping.guildId,bet.raceId); // the hash is fixed before betting closes
   result={bet};
  }else if(action==='ml-bet'){
   const d=await mlData(env),fixture=d.fixtures.find(f=>f.id===args.match),partner=fixture?mlPartner(d,fixture):null;
   if(fixture&&!fixture.confirmed)throw Error('公式の対戦カードを確認中です。少し待ってからもう一度お試しください。');
   const closed=fixture?(await mlClosed(env)).get(fixture.id):undefined;
   if(closed&&Date.now()>=closed.at)throw Error('この試合の予想は締め切りました（メンバーが試合開始を報告）。');
   // Odds use this season's official results; game 2 closes once game 1's result is stored.
   const bet=placeMlBet(state,{match:args.match,player:args.player,type:args.type,amount:args.amount},Date.now(),d,await mlResults(env,partner?[partner.id]:[]),seasonStats(await mlResults(env)));
   result={bet};
  }else if(action==='horse-buy'){
   useExchange(state,Date.now());result=await buyHorse(env,mapping,user,state,args);
  }else if(action==='horse-sell'){
   result=await sellHorse(env,mapping,user,state,args);
  }else if(action==='luxury'){
   useExchange(state,Date.now());result=await buyLuxury(env,mapping,user,state,args);
  }else if(action==='roast-level'){
   if(!validRoastLevel(args.level))throw Error('煽りレベルを選んでください。');
   state.roastLevel=args.level;result={roastLevel:args.level};
  }else throw Error('この操作は本番口座では使えません。');
  const response={result};const safeState={...state,claims:[],directives:[]};delete safeState.members;delete safeState.racing;delete safeState.horses;delete safeState.mastery;delete safeState.luxury;
  const inserted=await env.DB.prepare(`INSERT INTO kp_operations(id,guild,user,request_hash,response,delta,state,directive,at)
   SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM kp_wallets w JOIN kp_state s ON w.guild=s.guild AND w.user=s.user WHERE w.guild=? AND w.user=? AND w.version=? AND s.version=?) ON CONFLICT(guild,user,id) DO NOTHING`)
   .bind(id,mapping.guildId,user,requestHash,JSON.stringify(response),state.cash-before,JSON.stringify(safeState),directive?JSON.stringify(directive):null,Date.now(),mapping.guildId,user,state.walletVersion,state.stateVersion).run();
  if(inserted.meta.changes){
   if(action==='luxury')try{await luxuryPosts(env,mapping,user,(result as {luxury:Parameters<typeof luxuryPosts>[3]}).luxury);}catch{console.warn('luxury_post_pending');}
   return response;
  }
 }
 throw Error('他の操作と重なりました。残高を更新してもう一度お試しください。');
}
export async function kpApi(request:Request,env:KpEnv,override?:KpMapping):Promise<Response>{
 const origin=request.headers.get('Origin');const origins=['https://altepop.github.io','https://'+discord.applicationId+'.discordsays.com'];
 if(origin&&!origins.includes(origin))return new Response('Forbidden origin',{status:403});
 const headers:Record<string,string>={'Cache-Control':'no-store','Vary':'Origin'};
 if(origin)Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});
 const response=(body:unknown,status=200)=>Response.json(body,{status,headers});
 if(request.method==='GET'&&new URL(request.url).pathname==='/api/kp/commands')return response({applicationId:discord.applicationId,version:KP_COMMAND_VERSION,commands:kpCommands});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 try{
  const mapping=await initializeKp(env,override);if(!mapping)return response({error:'口座はまだ準備中です。'},503);
  const path=new URL(request.url).pathname;
  if(path.startsWith('/api/kp/voice/'))return voiceControl(request,env);
  if(request.method==='POST'&&path==='/api/kp/quiz/reward')return receiveQuizKp(request,env,mapping);
  if(request.method==='GET'&&path==='/api/kp/status') {
    const linked=await env.DB.prepare('SELECT COUNT(*) AS n FROM kp_accounts WHERE guild=?').bind(mapping.guildId).first<{n:number}>();
    const start=await env.DB.prepare("SELECT value FROM kp_settings WHERE key='starts_at'").first<{value:string}>();
    const timing=(await env.DB.prepare("SELECT key,value FROM monitor_state WHERE key IN ('monitor_started','monitor_finished')").all<{key:string;value:string}>()).results;
    return response({enabled:true,currency:'KP',startsAt:Number(start?.value??0),registered:mapping.accounts.length,linked:linked?.n??0,voiceEnabled:(await voiceStatus(env)).enabled,earningsPostsConfigured:Boolean((env as {KP_EARNINGS_WEBHOOK_URL?:string}).KP_EARNINGS_WEBHOOK_URL),sessionPolicy:'until_revoked',activityAuthAvailable:activityAuthAvailable(env),monitor:{lastStartedAt:Number(timing.find(r=>r.key==='monitor_started')?.value??0),lastFinishedAt:Number(timing.find(r=>r.key==='monitor_finished')?.value??0)}});
  }
  if(request.method==='GET'&&path==='/api/kp/activity/config')return response({available:activityAuthAvailable(env),applicationId:discord.applicationId});
  if(request.method==='POST'&&(path==='/api/kp/activity/challenge'||path==='/api/kp/activity/auth')){
   const text=await request.text();if(text.length>4096)return response({error:'入力が長すぎます。'},400);
   const body=JSON.parse(text);if(!body||typeof body!=='object'||Array.isArray(body))return response({error:'接続情報が不正です。'},400);
   const ip=request.headers.get('CF-Connecting-IP')??'unknown';
   if(path.endsWith('/challenge'))return response(await createActivityChallenge(env,body.codeChallenge,ip));
   const previous=/^Bearer ([a-f0-9]{48})$/.exec(request.headers.get('Authorization')??'')?.[1];
   return response(await authenticateActivity(env,mapping,body,ip,previous));
  }
  if(request.method==='POST'&&path==='/api/kp/auth'){
   const text=await request.text();if(text.length>1024)return response({error:'コードが長すぎます。'},400);
   const body=JSON.parse(text);if(typeof body.code!=='string'||! /^[a-f0-9]{48}$/.test(body.code))return response({error:'接続コードを確認してください。'},400);
   return response({token:await exchangeKpCode(env,body.code)});
  }
  const token=/^Bearer ([a-f0-9]{48})$/.exec(request.headers.get('Authorization')??'')?.[1];
  const owner=token?await kpSession(env,token):null;
  if(!owner||owner.guild!==mapping.guildId||!await isKpParticipant(env,mapping,owner.user))return response({error:'接続が切れました。/valo status のコードで接続してください。'},401);
  if(request.method==='POST'&&path==='/api/kp/logout'){await revokeKpSession(env,token!);return response({disconnected:true});}
  if(request.method==='GET'&&path==='/api/kp/state')return response(await readKpState(env,mapping,owner.user));
  if(request.method==='POST'&&path==='/api/kp/operation'){
   const text=await request.text();if(text.length>4096)return response({error:'入力が長すぎます。'},400);
   const body=JSON.parse(text);if(typeof body.id!=='string'||typeof body.action!=='string'||!body.args||typeof body.args!=='object'||Array.isArray(body.args))return response({error:'操作内容が不正です。'},400);
   const result=await operateKp(env,mapping,owner.user,body.id,body.action,body.args);
   return response(result);
  }
  return response({error:'Not found'},404);
 }catch(error){
  const message=error instanceof Error?error.message:'';
  return response({retryable:!(/[ぁ-んァ-ヶ一-龯]/.test(message)&&!message.includes('SQL')),error:/[ぁ-んァ-ヶ一-龯]/.test(message)&&!message.includes('SQL')?message:message.includes('kp_directive_active')||message.includes('kp_directives.guild, kp_directives.target')?'その相手には実行中の指令があります。':message.includes('kp_horse_limit')?'持てる馬は3頭までです。':message.includes('kp_crowns')?'その枠は埋まりました。もう一度お試しください。':message.includes('kp_horse_not_sellable')?'売れる馬が見つかりません。':'処理を確認できませんでした。残高を更新して確認してください。'},400);
 }
}
