import {escalationRatingView} from './escalation-rating.ts';
import type {KpEnv} from './kp.ts';
// @ts-expect-error Shared static artwork manifest.
import {escalationArt} from '../../../js/escalation-rank-assets.js';
type RankView=Awaited<ReturnType<typeof escalationRatingView>>;
const clean=(s:unknown)=>String(s??'').replace(/[@`*_~<>|\r\n]/g,'').slice(0,100);
const image=(tier:unknown)=>'https://altepop.github.io/keso-gamble/assets/escalation-ranks/'+escalationArt(tier).key+'.png?art=1';
const color=(tier:unknown)=>parseInt(escalationArt(tier).color.slice(1),16);
const pending=(v:RankView)=>!v.act?'ACT情報が届くのを待ってるで。':v.placementKind==='waiting'?'エピソード情報を確認中や。':`${v.placementKind==='act'?'ACT更新':v.placementKind==='episode'?'エピソード更新':'初回'}認定 ${v.measurementGames}/${v.measurementRequired??3}試合 · あと${Math.max(0,(v.measurementRequired??3)-v.measurementGames)}試合やで。`;
export async function escalationRankReply(env:KpEnv,guild:string,user:string,ranking=false){
 const v=await escalationRatingView(env,guild,user),rank=v.rank??v.inheritedRank;
 if(ranking){
  let place=0;
  const rows=v.leaders.map((r,i)=>{if(i===0||r.rating!==v.leaders[i-1].rating)place=i+1;return `**${place}位** <@${r.user}> — **${r.grade}** · ${r.rank.rr} RR`;});
  return {content:'🏆 **エスカランク・サーバーランキング**\n'+(rows.length?rows.join('\n'):'まだ認定済みのメンバーがおらへんで。'),embeds:[{title:clean(v.act?.name||v.act?.id||'ACT情報待ち'),description:'初回はエスカ3試合。自分の詳細は /kp rank で見られるで。',color:color(v.leaders[0]?.rank.tier),thumbnail:{url:image(v.leaders[0]?.rank.tier)},footer:{text:'今ACTの認定済み上位10人。同RRは同順位。KP残高の順位とは別やで。'}}]};
 }
 const fields=[
  {name:'ACT',value:clean(v.act?.name||v.act?.id||'情報待ち'),inline:true},
  {name:v.rating===null?'認定の進み具合':'今回のシリーズ',value:v.rating===null?pending(v):`${v.seriesWins}勝 ${v.seriesLosses}敗（3勝か3敗で更新）`,inline:true},
  {name:'今ACTの最高',value:v.peakGrade||'認定後に記録',inline:true},
  {name:'今ACTの戦績',value:`${v.wins}勝 ${v.losses}敗`,inline:true},
  {name:'前回の更新',value:v.lastSeriesAt?`${v.lastChange>=0?'+':''}${v.lastChange} RR（成績補正＋${v.lastPerformance}を含む）`:'まだ更新なし',inline:true},
 ];
 if(v.placementConsistencyBonus)fields.push({name:'初回認定ボーナス',value:'3試合ともKDプラス：＋100 RR',inline:false});
 if(v.previousActs.length)fields.push({name:'前ACTの記録',value:v.previousActs.map(a=>`${clean(a.name||a.act)}：${a.grade} ／ 最高 ${a.peakGrade}`).join('\n').slice(0,1000),inline:false});
 return {content:`🎖️ <@${user}> のエスカランクやで。\n${rank?`**${rank.name} · ${rank.rr} RR**`:pending(v)}`,embeds:[{title:rank?rank.name:'未認定',description:rank?`**${rank.rr} RR**${v.rating===null?' · 前ACTから引き継ぎ中':''}`:pending(v),color:color(rank?.tier),thumbnail:{url:image(rank?.tier)},fields,footer:{text:'KESO独自ランク。VALORANT本体とは別。初回3試合／ACT更新1試合／エピソード更新3試合。'}}]};
}
/** Exact public read-only subcommand. Malformed requests stay private. */
export function isEscalationRanking(i:{data?:{name?:string;options?:Array<{name:string;type?:number;options?:unknown[]}>}}){
 const o=i.data?.options;return i.data?.name==='kp'&&o?.length===1&&o[0].type===1&&o[0].name==='ranks'&&(!o[0].options||o[0].options.length===0);
}
