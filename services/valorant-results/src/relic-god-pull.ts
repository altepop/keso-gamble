import type {SummonHistoryEntry} from './relics.ts';

/** Notify only real transcendents in a successfully committed relic summon.
 * God-pull notices are separate from the player's normal summon result UI.
 */
export function transcendentGodPullPost(user:string,draw:Pick<SummonHistoryEntry,'count'|'summary'|'highlights'>):string|null{
 const total=draw.summary.transcendent??0;
 if(!Number.isSafeInteger(total)||total<1||total>draw.count)return null;
 // User is an authenticated Discord member; don't allow arbitrary mention text.
 if(!/^\d{15,22}$/.test(user))return null;
 // Discord content should display relic names without unintended markdown or mentions.
 const clean=(s:string)=>s.replace(/[@\x00-\x1f\x7f`*_~<>|]/g,'').slice(0,100);
 const relics=draw.highlights.filter(h=>h.rarity==='transcendent');
 const names=relics.slice(0,5).map(h=>'💠 **'+clean(h.name)+'**');
 return [
  '🌌💎 **【神引き速報｜超越降臨】**',
  '<@'+user+'> が **'+draw.count.toLocaleString('ja-JP')+'連召喚** で',
  '✨ **超越を'+total.toLocaleString('ja-JP')+'個獲得！** ✨',
  ...(names.length?['',...names]:[]),
  ...(total>names.length?['-# ほか '+(total-names.length)+'個の超越を獲得']:[]),
  '',
  '🎉 これは文句なしの神引きだ！'
 ].join('\n');
}
