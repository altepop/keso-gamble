import legacy from '../taunts.json' with { type: 'json' };
import tones from '../comment-tones.json' with { type: 'json' };
import quotes from '../meme-quotes.json' with { type: 'json' };

export type CommentGroup = keyof typeof tones;
export type Tone = keyof typeof tones.default | 'meme';
export const memeQuotes = quotes.quotes;
// Source-backed quotes are complete messages. Never append authored text or streaks.
export const commentTones = Object.fromEntries(Object.entries(tones).map(([group, pools]) => [
  group, { ...pools, meme: memeQuotes.filter(quote => quote.groups.includes(group)).map(quote => quote.text) },
])) as Record<CommentGroup, Record<Tone, string[]>>;
export const commentToneNames = Object.keys(commentTones.default) as Tone[];
const old = legacy as Record<string,string[]>;
export const commentPools = Object.fromEntries(Object.entries(commentTones).map(([group,pools])=>
  [group,[...new Set([...(old[group]??[]),...Object.values(pools).flat()])]])) as Record<CommentGroup,string[]>;
function hash(key:string):number {
  let seed=2166136261;
  for(const char of key)seed=Math.imul(seed^char.codePointAt(0)!,16777619);
  // Mix the high bits too: otherwise even tone/pool sizes can hide half the lines.
  seed=Math.imul(seed^(seed>>>16),0x85ebca6b);
  seed=Math.imul(seed^(seed>>>13),0xc2b2ae35);
  return (seed^(seed>>>16))>>>0;
}
export const winningCommentGroups:CommentGroup[]=['win','win_high_kills','win_low_kd','close_win','blowout_win','winning_streak','long_winning_streak'];
export const losingCommentGroups:CommentGroup[]=['default','high_kills','low_kd','close_loss','blowout','losing_streak','long_losing_streak'];
// Wins and losses both keep 30% verbatim memes; almost all authored picks are sharp.
const tauntingTones:Tone[]=[...Array<Tone>(45).fill('roast'),...Array<Tone>(12).fill('net'),...Array<Tone>(8).fill('dry'),...Array<Tone>(3).fill('hot'),...Array<Tone>(2).fill('normal'),...Array<Tone>(30).fill('meme')];
const otherTones:Tone[]=[...Array<Tone>(14).fill('roast'),...Array<Tone>(14).fill('net'),...Array<Tone>(14).fill('dry'),...Array<Tone>(14).fill('hot'),...Array<Tone>(14).fill('normal'),...Array<Tone>(30).fill('meme')];
export function selectedTone(matchId:string,identity:string,group:CommentGroup='default'):Tone {
  const choices=winningCommentGroups.includes(group)||losingCommentGroups.includes(group)?tauntingTones:otherTones;
  return choices[hash('tone:'+matchId+':'+identity)%choices.length];
}
export function resultComment(matchId:string,identity:string,group:CommentGroup='default',streak=0):string {
  const tone=selectedTone(matchId,identity,group);
  const choices=tone==='normal'?[...(old[group]??[]),...commentTones[group].normal]:commentTones[group][tone];
  const line=choices[hash('line:'+matchId+':'+identity)%choices.length];
  return '\n💬 '+(tone==='meme'?line:line.replaceAll('{streak}',String(streak)));
}
