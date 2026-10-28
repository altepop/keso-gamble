// Luck on every settled game (VALORANT, Mahjong Soul, Pokémon UNITE). The draw is fixed by the game and the player,
// so a re-read never changes it and nobody can pick it: 🍀 double 4%, 🍀🍀 triple 1%, 💀 unlucky 3%, otherwise none.
// Luck on a loss wipes the loss out; bad luck halves a gain and doubles a loss.
export type LuckKind='double'|'triple'|'unlucky';
export const LUCK_PERCENT={triple:1,double:4,unlucky:3} as const;
function draw(seed:string){
 let h=2166136261;for(const c of seed)h=Math.imul(h^c.charCodeAt(0),16777619);
 h=Math.imul(h^(h>>>16),0x85ebca6b);h=Math.imul(h^(h>>>13),0xc2b2ae35);
 return ((h^(h>>>16))>>>0)%10000;
}
export function luckFor(seed:string):LuckKind|null{
 const n=draw('luck:'+seed)/100;
 if(n<LUCK_PERCENT.triple)return 'triple';
 if(n<LUCK_PERCENT.triple+LUCK_PERCENT.double)return 'double';
 if(n<LUCK_PERCENT.triple+LUCK_PERCENT.double+LUCK_PERCENT.unlucky)return 'unlucky';
 return null;
}
/** The KP after luck. A zero stays zero. */
export function applyLuck(amount:number,luck:LuckKind|null){
 if(!luck||amount===0)return amount;
 if(luck==='unlucky')return amount>0?Math.floor(amount/2):amount*2;
 return amount>0?amount*(luck==='triple'?3:2):0;
}
/** A short tag for the KP line, matching what actually happened to the amount. */
export function luckLabel(luck:LuckKind|null,base:number){
 if(!luck||base===0)return '';
 if(luck==='unlucky')return base>0?'（💀 アンラッキー：半分没収）':'（💀 アンラッキー：マイナス2倍）';
 return base>0?(luck==='triple'?'（🍀🍀 ラッキー：KP3倍）':'（🍀 ラッキー：KP2倍）'):'（🍀 ラッキー：マイナス帳消し）';
}
/** A fair draw with the given chance, fixed by the seed (used for the deathmatch and team-mode bonuses). */
export function chance(seed:string,percent:number){return draw('chance:'+seed)<percent*100;}
