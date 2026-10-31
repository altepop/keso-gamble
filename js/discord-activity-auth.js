export const isDiscordActivity=(host=globalThis.location?.hostname??'')=>host.endsWith('.discordsays.com');
const sdkInstances=new Map();
async function officialSdk(applicationId){
 if(!sdkInstances.has(applicationId)){
  const {DiscordSDK}=await import('./vendor/discord-sdk.js?v=web-a0530d2dcea516c9');
  sdkInstances.set(applicationId,new DiscordSDK(applicationId,{disableConsoleLogOverride:true}));
 }
 return sdkInstances.get(applicationId);
}
async function deadline(task,milliseconds){let timer;try{return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Discordの準備を確認できませんでした。もう一度接続してください。')),milliseconds);})]);}finally{clearTimeout(timer);}}
// The application ID in a Discord Activity origin is public. Prepare only the SDK;
// wallet adoption still requires the server configuration and verified identity below.
export async function prepareDiscordActivity({host=globalThis.location?.hostname??'',sdkFactory=officialSdk}={}){
 const id=/^(\d{15,22})\.discordsays\.com$/.exec(host)?.[1];
 if(!id)return;
 const sdk=await sdkFactory(id);
 await deadline(sdk.ready(),15000);
}
const base64url=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
export async function connectDiscordActivity(wallet,{host=globalThis.location?.hostname??'',sdkFactory=officialSdk}={}){
 if(!isDiscordActivity(host))return {kind:'outside'};
 const config=await wallet.activityConfig();
 if(!config.available)return {kind:'manual'};
 const sdk=await sdkFactory(config.applicationId);
 await deadline(sdk.ready(),15000);
 const codeVerifier=base64url(crypto.getRandomValues(new Uint8Array(32)));
 const codeChallenge=base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(codeVerifier))));
 const {nonce}=await wallet.activityChallenge(codeChallenge);
 let code;
 try{({code}=await deadline(sdk.commands.authorize({client_id:config.applicationId,response_type:'code',scope:['identify'],state:nonce,prompt:'none',code_challenge:codeChallenge,code_challenge_method:'S256'}),120000));}
 catch{throw Error('Discordの接続を完了できませんでした。許可画面を確認して、もう一度接続してください。');}
 const result=await wallet.exchangeActivity({nonce,code,codeVerifier});
 let auth;
 try{auth=await deadline(sdk.commands.authenticate({access_token:result.accessToken}),15000);}
 catch{throw Error('Discordの接続を確認できませんでした。もう一度お試しください。');}
 if(auth?.user?.id!==result.userId)throw Error('接続するDiscordアカウントが一致しません。Activityを開き直してください。');
 // Guild-call Activities can be shown in PiP. Discord gates input there by default.
 // Configure it only after identity is verified; older clients must not lose login.
 if(typeof sdk.commands.setConfig==='function'){
  try{await deadline(sdk.commands.setConfig({use_interactive_pip:true}),3000);}catch{ /* Optional on older Discord clients. */ }
 }
 const state=await wallet.acceptActivitySession(result.token,result.userId);
 return {kind:'connected',state};
}

// Steam linking uses a real external browser. Never navigate the Activity iframe to the provider.
export async function openSteamLogin(url,{host=globalThis.location?.hostname??'',sdkFactory=officialSdk,open=globalThis.open?.bind(globalThis)}={}){
 const target=new URL(url);if(target.origin!=='https://steamcommunity.com'||target.pathname!=='/openid/login')throw Error('Steamの接続先を確認できません。');
 if(isDiscordActivity(host)){const id=/^(\d{15,22})\.discordsays\.com$/.exec(host)?.[1];if(!id)throw Error('Discordの接続を確認してください。');const sdk=await sdkFactory(id);await deadline(sdk.ready(),15000);const result=await deadline(sdk.commands.openExternalLink({url:target.toString()}),15000);if(result?.opened===false)throw Error('Steamのログイン画面を開けませんでした。');}
 else {const tab=open?.(target.toString(),'_blank');if(!tab)throw Error('新しいウィンドウを許可して、もう一度押してください。');try{tab.opener=null;}catch{}}
}

// Discord Activities cannot open ordinary <a target="_blank"> links. Use the native host command.
// Only these two fixed, public companion destinations are allowed; never forward arbitrary URLs.
const COMPANION_GAMES=Object.freeze({loop:'https://keso-loop.tealeaforest.workers.dev/',quiz:'https://valo-quiz.onrender.com/'});
export async function openCompanionGame(game,{host=globalThis.location?.hostname??'',sdkFactory=officialSdk,open=globalThis.open?.bind(globalThis)}={}){
 const url=Object.hasOwn(COMPANION_GAMES,game)?COMPANION_GAMES[game]:null;
 if(!url)throw Error('リンク先を確認できません。');
 if(isDiscordActivity(host)){
 const id=/^(\d{15,22})\.discordsays\.com$/.exec(host)?.[1];
  if(!id)throw Error('Discordの接続を確認してください。');
  const sdk=await sdkFactory(id);
  await deadline(sdk.ready(),15000);
  const result=await deadline(sdk.commands.openExternalLink({url}),15000);
  if(result?.opened===false)throw Error('外部サイトを開けませんでした。Discordの確認画面を確認してください。');
 }else{
  const tab=open?.(url,'_blank');
  if(!tab)throw Error('新しいウィンドウを許可して、もう一度押してください。');
  try{tab.opener=null;}catch{}
 }
}
