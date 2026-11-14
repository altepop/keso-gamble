// @ts-expect-error Shared deterministic festival schedule.
import {festivalRace,RACE_INTERVAL,CLOSE_BEFORE} from '../../../js/racing.js';
const DAY=86400000,JST=9*3600000;
export function festivalReminders(now:number){
 const day=Math.floor((now+JST)/DAY)*DAY-JST;
 const hour=Math.floor((now-day)/3600000);
 // Only this one-hour catch-up window can touch D1; no new queries on ordinary ticks.
 if(hour!==9)return [];
 const due:Array<{race:number;stage:string}>=[];
 for(const days of [3,1,0])for(let minute=19*60;minute<24*60;minute+=15){
  const race=day+days*DAY+minute*60000;
  if(festivalRace(race))due.push({race,stage:days===3?'three-days':days===1?'tomorrow':'today'});
 }
 return due;
}
export function festivalAnnouncement(race:number,stage:string){
 const when=new Date(race).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit'});
 const clock=(t:number)=>new Date(t).toLocaleTimeString('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'});
 const shout=stage==='three-days'?'【3日後】財布の桁、変わるかもしれへんで！':stage==='tomorrow'?'【明日】いよいよ一枚勝負や！': '【本日】今夜、億り人が生まれるかもしれへん！';
 return ['🎆🎆🎆 **一枚で億り人杯** 🎆🎆🎆',`**${shout}**`,`🏇 **${when}（日本時間）発走**`,
  '🎫 全員 **1,000 KPで1人1枚だけ**。追加も買い直しもなしや。',
  '🤫 オッズはゴールまで秘密。的中したら **最大1億KP** の払戻し！ 外れたら0 KPや。',
  `🕘 馬券は当日の **${clock(race-RACE_INTERVAL)}〜${clock(race-CLOSE_BEFORE)}** に発売や。今はまだ買えへんで。`,
  '`/bet` のamountに **1000** を入れるか、Activityの「勝負 → 競馬」から一枚選んでな。',
  '金持ちもそうでないやつも一枚きりや。祭りの時間、空けときや！'].join('\n');
}

/** Exactly one pre-sale hype slot per festival, with no queries on ordinary minutes. */
export function festivalHypeRace(now:number):number|null{
 const next=Math.ceil(now/RACE_INTERVAL)*RACE_INTERVAL;
 for(let race=next;race<=now+30*60000;race+=RACE_INTERVAL){
  if(now>=race-30*60000&&now<race-RACE_INTERVAL&&festivalRace(race))return race;
 }
 return null;
}
export function festivalHypeAnnouncement(race:number){
 const when=new Date(race).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit'});
 const open=new Date(race-RACE_INTERVAL).toLocaleTimeString('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'});
 const close=new Date(race-CLOSE_BEFORE).toLocaleTimeString('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'});
 return [
  '@everyone',
  '🎆 **【本日の大勝負】一枚で億り人杯、まもなく開催！** 🎆',
  '💰 **たった1,000 KPの馬券1枚から、最大1億KPの払戻しを狙える！**',
  `🏇 **${when} 発走｜馬券発売 ${open}〜${close}（日本時間）**`,
  '🎟️ 1人1枚だけ。単勝・複勝・3連単から1つ選ぶ一発勝負。追加購入も変更もできへんで！',
  '🤫 **倍率はゴールまで非公開。** 結果が出るまで誰にも分からへん。',
  '📲 **KESO PLAY「勝負 → 競馬」** または Discordの `/bet` で馬券を買うてな。掛け金は **1,000 KP固定**。',
  '📣 出走表は発売開始時にもお知らせするで。次の開催がいつになるかは分からん、今夜の一枚をお忘れなく！',
  '-# ※1億KPは払戻総額の上限。当選・高額払戻しを保証するものではありません。'
 ].join('\n');
}
