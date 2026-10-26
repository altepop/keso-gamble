import legacy from '../taunts.json' with { type: 'json' };
import tones from '../comment-tones.json' with { type: 'json' };
export const commentTones = tones;
export type CommentGroup = keyof typeof tones;
export type Tone = keyof typeof tones.default;
export const commentToneNames = Object.keys(tones.default) as Tone[];
const old = legacy as Record<string,string[]>;
export const commentPools = Object.fromEntries(Object.entries(tones).map(([group,pools])=>
  [group,[...new Set([...(old[group]??[]),...Object.values(pools).flat()])]])) as Record<CommentGroup,string[]>;
function hash(key:string):number {
  let seed=2166136261;
  for(const char of key)seed=Math.imul(seed^char.codePointAt(0)!,16777619);
  return seed>>>0;
}
export function selectedTone(matchId:string,identity:string):Tone {
  return commentToneNames[hash('tone:'+matchId+':'+identity)%commentToneNames.length];
}
export function resultComment(matchId:string,identity:string,group:CommentGroup='default',streak=0):string {
  const tone=selectedTone(matchId,identity);
  const choices=tone==='normal'?[...(old[group]??[]),...tones[group].normal]:tones[group][tone];
  return '\n💬 '+choices[hash('line:'+matchId+':'+identity)%choices.length].replaceAll('{streak}',String(streak));
}
