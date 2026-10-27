import voice from '../racing-voice.json' with {type:'json'};
import catalogue from '../meme-quotes.json' with {type:'json'};
import type {RoastLevel} from './racing-crowns.ts';
export type RaceVoiceKind='card'|'crown'|'result';
export type RaceBanterKind='win'|'partial'|'loss';
function hash(key:string){let h=2166136261;for(const c of key)h=Math.imul(h^c.charCodeAt(0),16777619);h^=h>>>16;return h>>>0;}
const pick=(list:string[],key:string)=>list[hash(key)%list.length];
// One intact, source-checked Hitoshii quotation per racing post. The authored
// analogy/aside below is the bot's own wording, never presented as a real quote.
const quote=(id:string)=>{const item=catalogue.quotes.find(q=>q.id===id);if(!item)throw Error('Missing racing catchphrase');return item.text;};
export const raceCatchphrases=[quote('yokatta-kono-kyori'),quote('omatsuri-otoko')] as const;
export function raceCatchphrase(kind:RaceVoiceKind,key:string){
 const preferred=kind==='result'?0:1;
 return raceCatchphrases[hash(kind+':quote:'+key)%4===0?1-preferred:preferred];
}
export function raceAside(kind:RaceVoiceKind,key:string){return pick(voice[kind],kind+':aside:'+key);}
export function raceBanter(kind:RaceBanterKind,level:RoastLevel,key:string){return pick(voice[kind][level],kind+':'+level+':'+key);}
