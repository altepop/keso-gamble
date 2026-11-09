// iPhone experiment (off by default): ask WebKit to let this page mix with other apps' audio, so a Picture-in-Picture
// video or music keeps playing while the Activity is open. Discord's iOS app pauses other audio when an Activity
// opens (embedded-app-sdk #380, even for an empty page); whether this setting can stop that is unproven, so it is a
// per-device switch the player turns on to try. While off, the page never touches navigator.audioSession.
const KEY='keso.mix-audio.v1';
// Storage is read inside try: a blocked localStorage throws on access and must never stop the Activity from starting.
const local=()=>{try{return globalThis.localStorage;}catch{return null;}};
export function audioMixEnabled(storage=local()){try{return storage?.getItem(KEY)==='on';}catch{return false;}}
export function audioMixSupported(nav=globalThis.navigator){try{return !!nav&&'audioSession' in nav;}catch{return false;}}
/** Applies the saved choice. Returns true when the page now asks to mix ('ambient'). */
export function applyAudioMix(nav=globalThis.navigator,storage=local()){
 if(!audioMixEnabled(storage))return false;
 try{if(!nav?.audioSession)return false;nav.audioSession.type='ambient';return nav.audioSession.type==='ambient';}catch{return false;}
}
export function setAudioMix(on,nav=globalThis.navigator,storage=local()){
 try{storage?.setItem(KEY,on?'on':'off');}catch{}
 if(on)return applyAudioMix(nav,storage);
 try{if(nav?.audioSession)nav.audioSession.type='auto';}catch{}
 return false;
}
