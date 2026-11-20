// Discord Activity requires the SDK handshake before showing this standalone route.
import {prepareDiscordActivity} from '../js/discord-activity-auth.js?v=p94c';
const main=document.getElementById('pve-root');
try{
 await prepareDiscordActivity();
 await import('./controller.js?v=p95');
}catch(error){
 main.replaceChildren();
 const title=document.createElement('h1');title.textContent='CPU戦を開けませんでした';
 const text=document.createElement('p');text.role='alert';text.textContent='Discordの接続を確認し、KESO PLAYから開き直してください。';
 const back=document.createElement('a');back.href='../index.html';back.textContent='KESO PLAYに戻る';
 main.append(title,text,back);
}
