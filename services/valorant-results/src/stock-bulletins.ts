// Fictional KESO PLAY bulletins. This public payload deliberately carries no actor or operation identifiers.
export interface StockImpact {name:string;symbol:string;before:number;after:number}
const up=[
 'なんやこの上がり方。昨日まで何しとったんや、アホか。',
 '急に有能になるなや。こっちは心の準備ができてへんぞ。',
 'こんなん予想できるかい。後出しで知ってた言う奴もアホやな。',
 'どんだけ上がんねん。チャートを縦に描くのやめえや。',
 '景気ええやんけ。調子乗ってコケたら笑たるからな。',
 '投資家が浮かれとるわ。お前ら落ち着け、アホか。',
 'どないなっとんねん。こんなんニュース読む方も困るわ。',
 '株主だけ大喜びやな。買いそびれた奴は泣いとるで。',
 '突然やる気出しよったな。昨日の経営陣と同一人物か？',
 '数字の勢いだけは一丁前やな。ほんまよう分からんわ。'
];
const down=[
 '何しとんねんボケ。株価より先に経営陣の常識が暴落しとるわ。',
 'これ株価ちゃうぞ、崖を転がる石ころや。誰か止めたれ。',
 'アホか。謝罪会見する前にまともな経営をせえや。',
 '株主の財布を何やと思っとんねん。ほんまええ加減にせえよ。',
 '経営会議で誰も止めへんかったんか。全員寝とったんかい。',
 'これを好材料って言うなら、経営陣からやり直せや。',
 '損切りのボタンまで震えとるわ。何やっとんねん。',
 'どんだけ下げんねん。もう地面に穴掘っとるやんけ。',
 'リスク管理どこ置いてきた。居酒屋に忘れたんかボケ。',
 'あかん、説明が意味不明すぎる。株主に謝っとけや。'
];
const scrub=(s:string)=>s.replace(/@/g,'＠').replace(/[<>`*_~|]/g,'').replace(/[\r\n]+/g,' ').trim();
const choose=(list:string[],seed:string)=>{
 let h=2166136261;for(const c of seed)h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;
 return list[h%list.length];
};
export function stockBulletin(impacts:StockImpact[],headline:string,body:string,seed:string){
 if(!impacts.length||impacts.length>4)throw Error('Invalid stock bulletin');
 const change=impacts.map(i=>(i.after/i.before-1)*100);
 const size=Math.max(...change.map(Math.abs)),upward=change.filter(n=>n>0).length;
 const tag=size>=45?'🔴 **【KESO市場・臨時特報】**':size>=20?'🚨 **【KESO経済・緊急速報】**':'📰 **【KESO経済速報】**';
 const intro=impacts.length>1?'🌪️ 複数銘柄に波及':upward?'📈 株価急騰':'📉 株価急落';
 const prices=impacts.map((i,k)=>`${change[k]<0?'📉':'📈'} ${scrub(i.name)}：${i.before.toLocaleString('ja-JP')} → **${i.after.toLocaleString('ja-JP')} KP**（${change[k]>=0?'+':''}${change[k].toFixed(1)}%）`);
 const roast=choose(upward===impacts.length?up:upward===0?down:[...up,...down],seed);
 const message=[tag,'',`**${intro}｜${scrub(headline)}**`,'',scrub(body),'',...prices,'',`🗣️ **等しいbot**「${roast}」`,'','-# ※KESO PLAY内の架空ニュース'].join('\n');
 if(message.length>1900)throw Error('Discord message too long');
 return JSON.stringify({username:'等しいbot',content:message,allowed_mentions:{parse:[]}});
}
