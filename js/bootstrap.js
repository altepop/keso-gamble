// Complete Discord's initial handshake before the full app's module graph is loaded.
// A broken/old game module must not leave Discord's native loading cover on screen.
import {prepareDiscordActivity} from './discord-activity-auth.js?v=web-b2981be8c52c0ae3';
import {applyAudioMix} from './audio-mix.js?v=web-b2981be8c52c0ae3';
// Before anything else: the iPhone mix-with-other-audio experiment, only if this device turned it on.
applyAudioMix();
const root=document.getElementById('app');
let stage='Discordの起動確認';
try{
 await prepareDiscordActivity();
 stage='画面の読み込み';
 await import('./app.js?v=web-b2981be8c52c0ae3');
}catch(error){
 console.error('KESO startup failed at '+stage,error);
 root.replaceChildren();
 const main=document.createElement('main');main.className='title-screen';
 const title=document.createElement('h1');title.textContent='KESO PLAY';
 const message=document.createElement('p');message.className='title-note';message.setAttribute('role','alert');message.textContent='画面を開けませんでした。少し待ってから、もう一度開いてください。';
 const detail=document.createElement('p');detail.className='title-note';detail.textContent=`${stage} / ${document.querySelector('meta[name="keso-release"]')?.content??'unknown'}`;
 const retry=document.createElement('button');retry.className='title-start';retry.textContent='もう一度開く';retry.addEventListener('click',()=>globalThis.kesoRetry?globalThis.kesoRetry():location.reload());
 main.append(title,message,detail,retry);root.append(main);
}
