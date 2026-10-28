import voice from '../racing-voice.json' with {type:'json'};
import catalogue from '../meme-quotes.json' with {type:'json'};
import type {RoastLevel} from './racing-crowns.ts';
export type RaceVoiceKind='card'|'crown'|'result';
export type RaceBanterKind='win'|'partial'|'loss';
function hash(key:string){let h=2166136261;for(const c of key)h=Math.imul(h^c.charCodeAt(0),16777619);h^=h>>>16;return h>>>0;}
const pick=(list:string[],key:string)=>list[hash(key)%list.length];
// One intact, source-checked quotation (meme-quotes.json) per racing post, chosen to fit the moment.
// The authored aside below is the bot's own wording, never presented as a real quote.
const quote=(id:string)=>{const item=catalogue.quotes.find(q=>q.id===id);if(!item)throw Error('Missing racing catchphrase');return item.text;};
const CATCHPHRASES:Record<RaceVoiceKind,string[]>={
 card:['omatsuri-otoko','vtr-don','next-vtr','maniae','san-ga-aru','ittanna','chotto-matte','aji-koi-usui','macchan-imanowha','gooku-majika'],
 crown:['omatsuri-otoko','umaremo-elite','nametemasuka','ryoukai-oniisan','microsleep-ten','nenai-challenge','kiitete-kusa','oniisan-yamero'],
 result:['yokatta-kono-kyori','gooku-majika','tousan-korette','jun-no-kachida','akan-kattana','kiitete-kusa','yokunaiwaa','iiwaa','shibakuzo','niisan-akan','hantei-okashii','bachikon-strike','aji-koi'],
};
export const raceCatchphrases=[...new Set(Object.values(CATCHPHRASES).flat())].map(quote);
export function raceCatchphrase(kind:RaceVoiceKind,key:string){const list=CATCHPHRASES[kind];return quote(list[hash(kind+':quote:'+key)%list.length]);}
export function raceAside(kind:RaceVoiceKind,key:string){return pick(voice[kind],kind+':aside:'+key);}
export function raceBanter(kind:RaceBanterKind,level:RoastLevel,key:string){return pick(voice[kind][level],kind+':'+level+':'+key);}
