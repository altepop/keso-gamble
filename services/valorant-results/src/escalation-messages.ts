/** Escalation uses a five-tier bet, but the existing match report is sent once.
 * Short notes are appended to that report, never to a second low-tier message. */
export type EscalationResult='win'|'loss';
const tierNames=['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ'] as const;
const tierAmounts=[500,1000,2500,5000,15000] as const;
const winLines=[
 '500KPや。大勝負いうには、まだ肩慣らしやな。',
 '1,000KP持って帰り。これでようやく勝負の入口や。',
 '2,500KP獲得。じわじわ財布が調子に乗り始めたで。',
 '5,000KP獲得！ あんた、今日は持っとるな。',
 '15,000KP獲得！！ え、ほんまにⅤ引いたんか！？',
] as const;
const lossLines=[
 '500KP消えた。まだ軽傷や、たぶん。',
 '1,000KP没収。財布が黙って首振っとるわ。',
 '2,500KP飛んだ。嫌な音したな、今。',
 '5,000KP没収！ ちょっと笑えん額になってきたで。',
 '15,000KP没収！！ こんな結果、本人にどう伝えたらええねん。',
] as const;
const fmt=(n:number)=>n.toLocaleString('ja-JP');
export function escalationBigCopy(tier:number,award:number){
 if(!Number.isSafeInteger(tier)||tier<1||tier>5||Math.abs(award)!==tierAmounts[tier-1])throw Error('Invalid escalation tier');
 const win=award>0;
 const outcome:EscalationResult=win?'win':'loss';
 return {tierLabel:tierNames[tier-1],outcome,comment:win?winLines[tier-1]:lossLines[tier-1],nominal:fmt(Math.abs(award))};
}
export function escalationBigNote(tier:number,award:number){
 const d=escalationBigCopy(tier,award);
 return `（🎰 エスカ大勝負 ${d.tierLabel}：${d.outcome==='win'?'勝利 +':'敗北 −'}${d.nominal} KP／${d.comment}）`;
}
/** Separate equal-bot notices are reserved for IV/V: at 15% bet odds,
 * posting every tier would needlessly flood the earnings channel. */
export function escalationBigPost(user:string,tier:number,award:number,net:number,owed=0){
 if(!/^\d{15,22}$/.test(user)||!Number.isSafeInteger(net)||!Number.isSafeInteger(owed)||owed<0)throw Error('Invalid escalation announcement');
 const d=escalationBigCopy(tier,award);
 if(tier<4)return null;
 return [
  tier===5?'🚨🎰 **エスカ大勝負・Ⅴ 当選**':'🎰 **エスカ大勝負・Ⅳ 当選**',
  `<@${user}> のエスカレーションで特別抽選が発生したで。`,
  '',
  `**抽選：第${d.tierLabel}段階／${d.outcome==='win'?'勝利':'敗北'}／基準額 ${award>0?'+':'−'}${d.nominal} KP**`,
  `**この試合の口座増減：${net>0?'+':net<0?'−':'±'}${fmt(Math.abs(net))} KP**`,
  ...(owed>0?[`**借KPに計上：+${fmt(owed)} KP**`]:[]),
  '',
  `💬 ${d.comment}`,
  '-# 大勝負は通常の基本報酬の置き換えです。実際の口座増減は共通ラッキー倍率・成績ボーナス・残高不足による差引上限などで変動します。',
 ].join('\n');
}
