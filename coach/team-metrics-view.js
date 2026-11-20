// Read-only Phase 3-C renderer. Host is visible ONLY after the server checks
// team membership and opt-in. Never fetches, stores, or posts any data.
const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
const formatRate=value=>typeof value==='number'&&Number.isFinite(value)
  ?(value*100).toFixed(1)+'%':'まだ分かりません';
const formatKd=value=>typeof value==='number'&&Number.isFinite(value)
  ?value.toFixed(2):'まだ分かりません';
const row=(name,value)=>{
 const p=el('p',name+'：'+value);
 p.style.cssText='font-size:16px;line-height:1.9;margin:6px 0;overflow-wrap:anywhere';
 return p;
};
export function renderVerifiedPartyMetrics(host,report){
 if(!host||typeof host.replaceChildren!=='function')throw TypeError('Valid host required');
 host.replaceChildren();
 if(!report||report.scope!=='consented-team-only'||report.ruleVersion!=='party-verified-v1'){
  host.append(row('パーティ指標','まだ分かりません'));
  return;
 }
 const main=el('section');main.dataset.coachPartyMetrics='';
 main.style.cssText='box-sizing:border-box;width:100%;min-width:0;max-width:100%;padding:16px;border:1px solid #61717e;border-radius:8px;background:#14232f;color:#ece8e1;overflow-wrap:anywhere';
 const heading=el('h2','同じパーティで遊んだ試合を確認します');
 heading.style.cssText='font-size:20px;line-height:1.6;margin:0 0 10px';main.append(heading);
 main.append(row('同一パーティと確認できた試合',String(report.overall.matches)+'試合'));
 const wins=report.overall.winRate,kd=report.overall.kd;
 main.append(row('勝率',formatRate(wins.value)+'（勝利'+wins.numerator+'／勝敗確定'+wins.denominator+'試合）'));
 main.append(row('チーム参加者のK/D',formatKd(kd.value)+'（キル'+kd.numerator+'／デス'+kd.denominator+'、有効'+kd.validPlayerSamples+'人・試合）'));
 main.append(row('勝敗不明',String(report.overall.unknownOutcomes)+'試合'));
 main.append(row('K/Dの欠損',String(kd.excludedPlayerSamples)+'人・試合'));
 // The authorized API intentionally omits excluded/inspected counts that could reveal solo games.
 if(Number.isSafeInteger(report.quality?.excludedMatches))main.append(row('同一パーティ未確認などの除外',String(report.quality.excludedMatches)+'試合'));
 if(report.quality?.limitReached)main.append(row('取得上限','最大250試合を確認しています。全履歴とは限りません'));
 const group=el('div');group.dataset.coachPartyMaps='';
 for(const m of report.maps||[]){
  const card=el('section');
  card.style.cssText='box-sizing:border-box;min-width:0;margin:12px 0;padding:12px;background:#233542;border-radius:8px;overflow-wrap:anywhere';
  const title=el('h3',m.map);title.style.cssText='font-size:18px;line-height:1.6;margin:0';
  card.append(title,row('有効試合',m.matches+'試合'),
   row('勝率',formatRate(m.winRate.value)+'（'+m.winRate.numerator+'／'+m.winRate.denominator+'）'),
   row('K/D',formatKd(m.kd.value)+'（'+m.kd.numerator+'／'+m.kd.denominator+'）'));
  group.append(card);
 }
 main.append(group);
 main.append(row('トレード距離など位置解析',report.positionBasedTradeDistance==='評価範囲外'?'評価範囲外':'まだ分かりません'));
 main.append(row('読み方','同じ味方チームにいたことだけで、同一パーティとは数えていません。数値は練習効果の証明ではありません。'));
 host.append(main);
}
