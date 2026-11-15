// One-day KESOTOWN satire event. Only the free namesake "藤村号" has a zero owner prize.
// Normal owned horses, wagers, race physics and all other dates retain their existing rules.
export const FUJIMURA_LATE_NEWS_FROM=Date.parse('2026-11-15T18:00:00+09:00');
export const FUJIMURA_LATE_DAY_START=Date.parse('2026-11-16T00:00:00+09:00');
export const FUJIMURA_LATE_DAY_END=Date.parse('2026-11-17T00:00:00+09:00');
export const FUJIMURA_LATE_KIND='fujimura20';
export const FUJIMURA_LATE_SOURCE_PREFIX='special:fujimura-late-20m:20261116:';

export const FUJIMURA_LATE_TITLES=[
 '藤村20分遅刻・前代未聞の出遅れ杯',
 'ゲートは開いたぞ藤村杯',
 '集合時刻が読めない男記念',
 '遅刻1,200秒・時空歪曲ステークス',
 '時計に負けた藤村記念',
 '置いていかれた20分杯',
 '寝坊じゃなくても大遅刻賞',
 '競走馬より遅い集合記念',
 '藤村にアラームを贈る杯',
 '遅刻王者・時間管理再履修杯',
 '予定時刻行方不明ステークス',
 '全員待機・藤村だけ未出走杯',
 '20分を返せ選手権',
 '藤村の時計は別世界記念',
 'ゲート前にまず集合しろ杯',
 '遅刻の才能だけG1級記念',
 '時間厳守の意味を調べろ杯',
 '20分後のヒーロー気取り賞',
 '遅れて来たのに主役杯',
 '集合時間は目安じゃない記念',
 'お前の馬は定刻に走るぞ杯',
 '遅刻の追い込み届かず賞',
 '反省文は20分前に出せ杯',
 '藤村20分遅刻・最終反省会杯',
] as const;

export const FUJIMURA_LATE_BREAKING_NEWS=[
 '🚨📰 **【KESOTOWN超特大号外】藤村、集合時間に20分遅れの歴史的大失態！**',
 '【社会・交通・競馬／2026年11月15日】',
 '本日、藤村が集合予定時刻を20分も超過した。1,200秒の大出遅れであり、競馬なら次のレースが始まっている長さだ。',
 '時計は止まっていなかった。集合時刻も逃げていなかった。**ただ藤村だけが来なかった。**',
 '🎙️ 編集部「おい藤村！ 馬でもゲートが開けば走り出すぞ。人間が20分もパドックで何してるんだ！ 集合場所をウイニングラン会場と間違えるな！」',
 '🏇 **緊急決定：11月16日（月）0:00〜24:00 JST『藤村20分遅刻・終日反省競馬祭』**',
 '毎時1レース、合計24本の藤村号特別レースを企画。名前を冠した無料出走馬「藤村号」は、**1〜3着でも賞金0 KP・応援分のKPも0**。勝っても財布は増えない、文字どおりの公開反省会だ。',
 '🎫 **一般参加者の馬券・オッズ・的中払戻と、通常の所有馬への賞金は通常どおり。** 藤村本人の通常の財布や試合報酬を没収するものではない。',
 '💬 なお、藤村からの正式な遅刻原因は確認されていない。編集部はまず時計の存在を思い出すよう求めている。',
 '-# ※KESOTOWN内の友人向けパロディニュース。編集部コメント・競馬祭の演出は創作。',
].join('\n');

export function fujimuraLateSlots(hour:number){
 if(!Number.isInteger(hour)||hour<0||hour>23)throw Error('Invalid event hour');
 // Prefer :15, then other valid 15-minute races; none replaces an existing crown.
 return [15,0,45,30].map(min=>FUJIMURA_LATE_DAY_START+hour*3600000+min*60000);
}
export function isFujimuraLateNamesake(crown:{kind:string;user:string}|null,horse:{person?:boolean;owner:string;horseId?:string}){
 return crown?.kind===FUJIMURA_LATE_KIND&&horse.person===true&&horse.owner===crown.user&&horse.horseId==='person-'+crown.user;
}
export function fujimuraLatePrize(crown:{kind:string;user:string}|null,horse:{person?:boolean;owner:string;horseId?:string},prize:number){
 return isFujimuraLateNamesake(crown,horse)?0:prize;
}
