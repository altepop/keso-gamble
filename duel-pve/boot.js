// Discord Activity requires the SDK handshake before showing this standalone route.
import {prepareDiscordActivity} from '../js/discord-activity-auth.js?v=p94c';
const main=document.getElementById('pve-root');
try{
 await prepareDiscordActivity();
 await import('./controller.js?v=p95-build');
}catch(error){
 console.error('Legacy standalone PvE bootstrap failed',error);
 main.replaceChildren();
 const title=document.createElement('h1');title.textContent='CPU戦を開けませんでした';
 const text=document.createElement('p');text.role='alert';text.textContent='Discordの接続を確認し、KESO PLAYから開き直してください。';
 // Legacy deep links may still be cached by Discord. Prefer the existing
 // Activity history entry rather than triggering a second SDK startup.
 const back=document.createElement('button');back.type='button';back.textContent='前の決闘画面に戻る';
 back.addEventListener('click',()=>{if(history.length>1)history.back();else location.replace('./index.html');});
 const fallback=document.createElement('a');fallback.href='./index.html';fallback.textContent='KESO PLAYを開き直す';
 main.append(title,text,back,fallback);
}
