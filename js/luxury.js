// Luxury items: big sinks for KP won at the races (docs/RACING_PLAN.md §11). Shared by the screen and
// the Worker; the Worker validates every purchase. Items aimed at someone need their roast level above "mild".
export const LUXURY=[
 {id:'title',label:'称号',price:20000,detail:'ホームと稼ぎchの結果投稿で、名前に称号が付きます（ずっと）',needs:'title'},
 {id:'crown-name',label:'冠レース命名権',price:30000,detail:'好きな名前のレースを次の空き枠で開催。あなたの名前の馬も出走します',needs:'text'},
 {id:'roast-post',label:'特製煽り投稿',price:30000,detail:'稼ぎchに相手宛ての煽りを投稿します',needs:'target'},
 {id:'convict',label:'戦犯認定',price:50000,detail:'相手が今日いっぱい「本日の戦犯」としてホームに出ます',needs:'target'},
 {id:'crown-target',label:'強制冠レース',price:150000,detail:'「◯◯を笑う会」を開催。相手の名前の馬が出て、相手に見舞金も入ります',needs:'target'},
 {id:'statue',label:'殿堂入りの銅像',price:300000,detail:'引退した愛馬に銅像を建て、殿堂で目立たせます',needs:'retired'},
 {id:'billboard',label:'看板馬',price:2000000,detail:'あなたの馬が1週間、全員のタイトル画面とホームに登場します',needs:'horse'},
];
export const TITLES=['KP長者','養分','競馬の神','万年金欠','ガチャ中毒','穴党','本命党','夜ふかし常連','反面教師','伝説の馬主'];
export const BILLBOARD_MS=7*86400000;
export function validCrownName(text){
 const value=String(text??'').normalize('NFKC').trim();
 if(value.length<1||value.length>16||/[\u0000-\u001f@#`*_~<>|\\/:[\]()]/.test(value)||/https?|www\./i.test(value))throw Error('レース名は1〜16文字で、記号やURLは使えません');
 return value;
}
/** End of the current JST day, for "today only" items. */
export function endOfJstDay(now){const jst=9*3600000;return Math.floor((now+jst)/86400000)*86400000+86400000-jst;}
