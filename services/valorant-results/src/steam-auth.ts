import {kpHash,kpRandom} from './kp.ts';
import {chooseSteamGame,ensureSteam,ownedSteamGames,steamConfig,steamLimit,steamView,validSteamId} from './steam-rewards.ts';
import type {SteamEnv,SteamOwner} from './steam-rewards.ts';

const origin='https://valorant-results.tealeaforest.workers.dev';
const callback=origin+'/api/kp/steam/callback';
const provider='https://steamcommunity.com/openid/login';
const ns='http://specs.openid.net/auth/2.0';
const noStore={'Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
const callbackErrors={
 ST_ORIGIN:'Steamの接続先を確認できません。KESO PLAYから接続をやり直してください。',
 ST_INPUT:'Steamの返答形式を確認できません。KESO PLAYから接続をやり直してください。',
 ST_EXPIRED:'接続リンクの有効期限（10分）が切れたか、新しいリンクに更新されています。KESO PLAYでSteam接続をやり直してください。',
 ST_ALREADY:'Steamでの確認はすでに受け付けています。KESO PLAYに戻り、「接続を確認」へ進んでください。',
 ST_SESSION:'KP口座の接続が切れています。KESO PLAYで口座へ接続し直してから、Steam接続をやり直してください。',
 ST_CANCELLED:'Steamでのログインがキャンセルされました。KESO PLAYから接続をやり直してください。',
 ST_IDENTITY:'Steamアカウントの返答を確認できません。KESO PLAYから接続をやり直してください。',
 ST_RETURN:'Steamからの戻り先が一致しません。KESO PLAYから接続をやり直してください。',
 ST_NONCE:'Steamの返答時刻を確認できないか、有効期限が切れています。KESO PLAYから接続をやり直してください。',
 ST_SIGNED:'Steamの署名対象を確認できません。管理者へ確認コードを伝えてください。',
 ST_NETWORK:'Steamへの確認通信に失敗しました。少し待ってからKESO PLAYで接続をやり直してください。',
 ST_HTTP:'Steam側が確認通信を受け付けませんでした。少し待ってからKESO PLAYで接続をやり直してください。',
 ST_SIGNATURE:'Steam側で署名を確認できませんでした。KESO PLAYから接続をやり直してください。',
 ST_INTERNAL:'接続確認の保存処理に失敗しました。管理者へ確認コードを伝えてください。',
} as const;
type CallbackCode=keyof typeof callbackErrors;
class SteamCallbackError extends Error {readonly code:CallbackCode;readonly status?:number;constructor(code:CallbackCode,status?:number){super(code);this.code=code;this.status=status;}}
function callbackFail(code:CallbackCode):never{throw new SteamCallbackError(code);}
interface Pending {hash:string;guild:string;user:string;session_hash:string;expires:number;steam:string|null;confirmed:number}
const pendingFor=async(env:SteamEnv,owner:SteamOwner,session:string,state:string)=>env.DB.prepare('SELECT * FROM kp_steam_pending WHERE hash=? AND guild=? AND user=? AND session_hash=? AND expires>?').bind(await kpHash(state),owner.guild,owner.user,await kpHash(session),Date.now()).first<Pending>();
/** Activity bearer tokens never leave the Activity. Only a short-lived random OpenID state enters the browser. */
export async function startSteamLink(env:SteamEnv,owner:SteamOwner,session:string){
 if(!env.STEAM_WEB_API_KEY)throw Error('Steam接続は設定待ちです。');steamConfig(env);await steamLimit(env,owner,'link',5);const state=kpRandom(),now=Date.now();
 await env.DB.batch([
  env.DB.prepare('DELETE FROM kp_steam_pending WHERE expires<? OR (guild=? AND user=? AND session_hash=?)').bind(now,owner.guild,owner.user,await kpHash(session)),
  env.DB.prepare('DELETE FROM kp_steam_nonces WHERE expires<?').bind(now),
  env.DB.prepare('INSERT INTO kp_steam_pending(hash,guild,user,session_hash,expires) VALUES(?,?,?,?,?)').bind(await kpHash(state),owner.guild,owner.user,await kpHash(session),now+10*60000),
 ]);
 const url=new URL(provider);url.search=new URLSearchParams({'openid.ns':ns,'openid.mode':'checkid_setup','openid.return_to':callback+'?state='+state,'openid.realm':origin+'/','openid.identity':ns+'/identifier_select','openid.claimed_id':ns+'/identifier_select'}).toString();
 return {state,url:url.toString(),expiresAt:now+10*60000};
}
async function verifyAssertion(request:Request,env:SteamEnv,send:typeof fetch){
 if(request.url.length>16384||new URL(request.url).origin!==origin)callbackFail('ST_ORIGIN');
 const query=new URL(request.url).searchParams,state=query.get('state')??'';
 if(!/^[a-f0-9]{48}$/.test(state)||[...query.keys()].some(k=>query.getAll(k).length!==1||k!=='state'&&!k.startsWith('openid.')))callbackFail('ST_INPUT');
 if(query.get('openid.mode')==='cancel')callbackFail('ST_CANCELLED');
 await ensureSteam(env);const pending=await env.DB.prepare('SELECT * FROM kp_steam_pending WHERE hash=? AND expires>? ').bind(await kpHash(state),Date.now()).first<Pending>();if(!pending)callbackFail('ST_EXPIRED');
 if(pending.steam!==null||pending.confirmed)callbackFail('ST_ALREADY');
 // A revoked/expired KP session cannot be used to finish an abandoned link.
 const session=await env.DB.prepare('SELECT user FROM kp_sessions WHERE hash=? AND guild=? AND user=? AND (expires=-1 OR expires>?)').bind(pending.session_hash,pending.guild,pending.user,Date.now()).first();if(!session)callbackFail('ST_SESSION');
 const identity=query.get('openid.claimed_id')??'',steam=identity.replace('https://steamcommunity.com/openid/id/','');
 const nonce=query.get('openid.response_nonce')??'',stamp=/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ).{1,128}$/.exec(nonce)?.[1],at=stamp?Date.parse(stamp):NaN;
 const signed=(query.get('openid.signed')??'').split(',');
 if(query.get('openid.ns')!==ns||query.get('openid.mode')!=='id_res'||query.get('openid.op_endpoint')!==provider)callbackFail('ST_INPUT');
 if(!validSteamId(steam)||identity!=='https://steamcommunity.com/openid/id/'+steam||query.get('openid.identity')!==identity)callbackFail('ST_IDENTITY');
 if(query.get('openid.return_to')!==callback+'?state='+state)callbackFail('ST_RETURN');
 if(!Number.isFinite(at)||Math.abs(Date.now()-at)>10*60000)callbackFail('ST_NONCE');
 if(!query.get('openid.sig')||!['op_endpoint','claimed_id','identity','return_to','response_nonce','assoc_handle'].every(k=>signed.includes(k)))callbackFail('ST_SIGNED');
 const fields=new URLSearchParams();for(const [k,v] of query)if(k.startsWith('openid.'))fields.set(k,v);fields.set('openid.mode','check_authentication');
 let verified:Response,reply:string;
 try{verified=await send(provider,{method:'POST',body:fields,redirect:'error',signal:AbortSignal.timeout(10000)});reply=verified.ok?(await verified.text()).slice(0,4096):'';}catch{callbackFail('ST_NETWORK');}
 if(!verified.ok)throw new SteamCallbackError('ST_HTTP',verified.status);
 if(!/^is_valid:true\r?$/m.test(reply))callbackFail('ST_SIGNATURE');
 await env.DB.batch([
  env.DB.prepare('INSERT INTO kp_steam_nonces VALUES(?,?)').bind(await kpHash(nonce),Date.now()+15*60000),
  env.DB.prepare('UPDATE kp_steam_pending SET steam=? WHERE hash=? AND steam IS NULL AND confirmed=0 AND expires>?').bind(steam,pending.hash,Date.now()),
 ]);
}
export async function steamCallback(request:Request,env:SteamEnv,send:typeof fetch=fetch){
 let ok=false,code:CallbackCode|null=null;
 try{await verifyAssertion(request,env,send);ok=true;}catch(error){
  code=error instanceof SteamCallbackError?error.code:'ST_INTERNAL';
  // Never log request URLs, OpenID assertions, Steam IDs, sessions or exception messages.
  console.warn(JSON.stringify({event:'steam_callback_failed',code,...(error instanceof SteamCallbackError&&error.status?{httpStatus:error.status}:{})}));
 }
 const message=ok?'Steamでの確認が終わりました。KESO PLAYに戻り、「接続を確認」からアカウントを確認してください。':callbackErrors[code!];
 const diagnostic=code?`<p>確認コード：${code}</p>`:'';
 return new Response(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Steam接続</title><body><h1>Steam接続</h1><p>${message}</p>${diagnostic}</body></html>`,{status:ok?200:400,headers:{...noStore,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",'X-Content-Type-Options':'nosniff'}});
}
export async function confirmSteamLink(env:SteamEnv,owner:SteamOwner,session:string,state:string){
 const p=await pendingFor(env,owner,session,state);if(!p?.steam||!validSteamId(p.steam))throw Error('Steamで確認してから接続してください。');
 const now=Date.now();
 try{await env.DB.batch([
  env.DB.prepare(`INSERT INTO kp_steam_accounts(guild,user,steam,linked_at,resumed_at) VALUES(?,?,?,?,?) ON CONFLICT(guild,user) DO UPDATE SET active=1,resumed_at=CASE WHEN kp_steam_accounts.active=0 THEN excluded.resumed_at ELSE kp_steam_accounts.resumed_at END,steam=excluded.steam`).bind(owner.guild,owner.user,p.steam,now,now),
  env.DB.prepare('UPDATE kp_steam_pending SET confirmed=1 WHERE hash=?').bind(p.hash),
 ]);}catch{throw Error('この口座またはSteamは別のアカウントに登録済みです。管理者に確認してください。');}
 return steamView(env,owner);
}
export async function steamApi(request:Request,env:SteamEnv,owner:SteamOwner,session:string):Promise<Response>{
 const path=new URL(request.url).pathname;const json=(v:unknown,status=200)=>Response.json(v,{status,headers:noStore});await ensureSteam(env);
 if(request.method==='GET'&&path==='/api/kp/steam/status')return json(await steamView(env,owner));
 if(request.method==='GET'&&path==='/api/kp/steam/library'){
  const account=await env.DB.prepare('SELECT steam FROM kp_steam_accounts WHERE guild=? AND user=? AND active=1').bind(owner.guild,owner.user).first<{steam:string}>();if(!account)throw Error('先にSteamアカウントを接続してください。');
  await steamLimit(env,owner,'library',5);return json({games:await ownedSteamGames(env,account.steam)});
 }
 if(request.method!=='POST')return json({error:'Not found'},404);
 // The outer KP router already validates Origin and the authenticated bearer, never ambient cookies.
 const reader=request.body?.getReader();if(!reader)return json({error:'操作内容が不正です。'},400);const chunks:Uint8Array[]=[];let size=0;while(true){const n=await reader.read();if(n.done)break;size+=n.value.length;if(size>1024){await reader.cancel();return json({error:'入力が長すぎます。'},400);}chunks.push(n.value);}const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}const body=JSON.parse(new TextDecoder().decode(bytes));if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'操作内容が不正です。'},400);
 if(path==='/api/kp/steam/link')return json(await startSteamLink(env,owner,session));
 if(path==='/api/kp/steam/pending'||path==='/api/kp/steam/confirm'){
  if(typeof body.state!=='string'||!/^[a-f0-9]{48}$/.test(body.state))return json({error:'接続をやり直してください。'},400);
  if(path.endsWith('/confirm'))return json(await confirmSteamLink(env,owner,session,body.state));
  const p=await pendingFor(env,owner,session,body.state);if(!p)return json({error:'接続が期限切れです。やり直してください。'},400);
  return json({verified:!!p.steam,steamId:p.steam,confirmed:!!p.confirmed});
 }
 if(path==='/api/kp/steam/disconnect'){
  await env.DB.batch([env.DB.prepare('UPDATE kp_steam_accounts SET active=0 WHERE guild=? AND user=?').bind(owner.guild,owner.user),env.DB.prepare('UPDATE kp_steam_games SET active=0,lease=NULL,lease_until=0 WHERE guild=? AND user=?').bind(owner.guild,owner.user),env.DB.prepare('DELETE FROM kp_steam_pending WHERE guild=? AND user=?').bind(owner.guild,owner.user)]);return json({disconnected:true});
 }
 if(path==='/api/kp/steam/game'){
  if(!Number.isSafeInteger(body.app)||typeof body.active!=='boolean')return json({error:'ゲームを選んでください。'},400);await chooseSteamGame(env,owner,body.app,body.active);return json(await steamView(env,owner));
 }
 return json({error:'Not found'},404);
}
