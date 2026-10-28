// Competitive rank changes. After a new competitive result, the player's MMR history (Henrik) tells the tier
// before and after that match. A demotion is roasted hard and costs 500 KP; a promotion is praised and earns 100 KP.
import type {KpEnv,KpMapping} from './kp.ts';

export interface RankChange {before:number;after:number}
export const RANK_DOWN_KP=500,RANK_UP_KP=100;
const TIERS=['アイアン','ブロンズ','シルバー','ゴールド','プラチナ','ダイヤモンド','アセンダント','イモータル'];
/** Henrik tier ids: 3-5 Iron 1-3 … 24-26 Immortal 1-3, 27 Radiant. */
export function tierName(id:number){
 if(id===27)return 'レディアント';
 const band=TIERS[Math.floor((id-3)/3)];
 return band?`${band}${(id-3)%3+1}`:'ランクなし';
}
type Entry={match_id?:string;tier?:{id?:number}|number;currenttier?:number};
const tierOf=(e:Entry)=>typeof e.tier==='object'?e.tier?.id:typeof e.tier==='number'?e.tier:e.currenttier;
/** Reads either history shape (v2 `{history:[{match_id,tier:{id}}]}` or v1 `[{match_id,currenttier}]`), newest first. */
export function rankChangeFor(data:unknown,matchId:string):RankChange|null{
 const list=(Array.isArray(data)?data:(data as {history?:unknown})?.history) as Entry[]|undefined;
 if(!Array.isArray(list))return null;
 const i=list.findIndex(e=>e?.match_id===matchId);
 if(i<0||i+1>=list.length)return null;
 const after=tierOf(list[i]),before=tierOf(list[i+1]);
 if(!Number.isSafeInteger(after)||!Number.isSafeInteger(before)||after!<3||before!<3)return null;
 return {before:before!,after:after!};
}
function hash(s:string){let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);h^=h>>>16;return h>>>0;}
const DOWN=[
 '{before}から{after}に転落。ランクの階段、下り専用やったんか。',
 '降格おめでとう。{after}の皆さん、新しいお荷物が届きました。',
 '{before}の看板、今日で返上な。似合ってなかったで。',
 'ほんまに人間が打ってたん？ 降格する方が難しいくらいの負け方やったで。',
 'ランク落ちた瞬間の顔、全員で見たかったわ。録画してへんの？',
 '{after}が適正やったって、ランクシステムが証明してくれたな。',
 'エイムもメンタルもランクも、全部まとめて下り坂や。',
 '降格の通知、家族にも見せたれ。どんな顔するか楽しみや。',
 '{before}におった時間、ただのバグやったんちゃうか。',
 '次は{after}からも落ちるんか？ 底がどこか見届けたるわ。',
 'デランク保護も見捨てたレベルの負け方。逆に才能や。',
 'ランク落ちても口だけは{before}のままやな。そこも落とせ。',
 'この降格、KESO TOWNで号外配っとくわ。見出しは「また落ちた」。',
 'チームのせいにする前に、鏡見てこい。犯人そこにおるで。',
 '戻ってくる気あるなら、まず練習場で棒立ちの的から倒しなおせ。',
];
const UP=[
 '{before}から{after}に昇格！ ついに実力が数字に追いついたな。',
 '昇格おめでとう！ {after}の景色、似合ってるで。',
 'ランクアップ！ 今日はKESO TOWNで祝杯や。',
 '{after}到達。積み重ねた練習が報われた瞬間やな。',
 'おめでとう！ この勢いのまま次のランクも狙えるで。',
 '昇格はほんまに価値ある。今日だけは全力で褒めたる。',
];
/** The lines appended to the result: a heading and five roasts for a demotion, a heading and two praises for a promotion. */
export function rankChangeBlock(change:RankChange,key:string){
 if(change.after===change.before)return '';
 const down=change.after<change.before,pool=down?DOWN:UP,n=down?5:2,start=hash('rank:'+key)%pool.length;
 const fill=(s:string)=>s.replaceAll('{before}',tierName(change.before)).replaceAll('{after}',tierName(change.after));
 const lines=Array.from({length:n},(_,i)=>fill(pool[(start+i)%pool.length]));
 return down?`\n🔻 **降格** ${tierName(change.before)} → ${tierName(change.after)}（−${RANK_DOWN_KP} KP）\n`+lines.map(l=>'💀 '+l).join('\n')
  :`\n🔺 **昇格** ${tierName(change.before)} → ${tierName(change.after)}（+${RANK_UP_KP} KP）\n`+lines.map(l=>'🎉 '+l).join('\n');
}
/** One ledger row per match and player: a demotion takes up to the balance, a promotion pays a bonus. */
export async function settleRankChange(env:KpEnv,mapping:KpMapping,user:string,change:RankChange,matchId:string,puuid:string,now:number){
 if(change.after===change.before)return;
 const down=change.after<change.before;
 await env.DB.batch([
  env.DB.prepare('INSERT OR IGNORE INTO kp_wallets(guild,user) VALUES(?,?)').bind(mapping.guildId,user),
  env.DB.prepare(`INSERT OR IGNORE INTO kp_ledger(id,guild,user,delta,kind,at) SELECT ?,?,?,${down?'-MIN(?,balance)':'?'},'match',? FROM kp_wallets WHERE guild=? AND user=?`)
   .bind((down?'rank-down:':'rank-up:')+matchId+':'+puuid,mapping.guildId,user,down?RANK_DOWN_KP:RANK_UP_KP,now,mapping.guildId,user),
 ]);
}
