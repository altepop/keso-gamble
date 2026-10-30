// Complete Discord's initial handshake before the full app's module graph is loaded.
// A broken/old game module must not leave Discord's native loading cover on screen.
import {prepareDiscordActivity} from './discord-activity-auth.js?v=web-fbdbe83640a6b754';
const root=document.getElementById('app');
let stage='Discordの起動確認';
try{
 await prepareDiscordActivity();
 stage='画面の読み込み';
 await import('./app.js?v=web-fbdbe83640a6b754');
}catch(error){
 console.error('KESO startup failed at '+stage,error);
 root.replaceChildren();
 const main=document.createElement('main');main.className='title-screen';
 const title=document.createElement('h1');title.textContent='KESO PLAY';
 const message=document.createElement('p');message.className='title-note';message.setAttribute('role','alert');message.textContent='画面を開けませんでした。少し待ってから、もう一度開いてください。';
 const detail=document.createElement('p');detail.className='title-note';detail.textContent=`${stage} / ${document.querySelector('meta[name="keso-release"]')?.content??'unknown'}`;
 const retry=document.createElement('button');retry.className='title-start';retry.textContent='もう一度開く';retry.addEventListener('click',()=>location.reload());
 main.append(title,message,detail,retry);root.append(main);
}
