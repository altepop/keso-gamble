import {placementImproves,tsumoRanks,riverSuji} from './mahjong-sanma-context.ts';
import type {PaipuSummary} from './mahjong-summary.ts';
import type {ValueMetric} from './mahjong-sanma-value.ts';
import type {Efficiency} from './mahjong-sanma-efficiency.ts';
import type {AcceptedSanmaReport} from './mahjong-sanma-report.ts';
import {selectSanmaFindings} from './mahjong-sanma-selection.ts';
// Do not import the search engine in the Worker: signed, bounded findings only.
const tile=/^(?:[19]m|[1-9][ps]|5[ps]r|[ESWNPFC])$/;
const int=(v:unknown,a:number,b:number)=>Number.isSafeInteger(v)&&Number(v)>=a&&Number(v)<=b;
const valueMetric=(m:ValueMetric,t:string)=>m&&m.tile===t&&int(m.live,1,108)&&int(m.min,500,96000)&&int(m.max,m.min,96000)&&m.min%100===0&&m.max%100===0&&int(m.hanMin,1,12)&&int(m.hanMax,m.hanMin,12)&&int(m.fuMin,20,160)&&int(m.fuMax,m.fuMin,160);
const metric=(m:Efficiency,t:string)=>m&&m.tile===t&&int(m.shanten,1,6)&&int(m.ukeire,0,108)&&int(m.bonus,0,40)&&Array.isArray(m.improving)&&m.improving.length<=27&&new Set(m.improving).size===m.improving.length&&m.improving.every(t=>typeof t==='string'&&tile.test(t));
export function acceptedSanmaReport(s:PaipuSummary,raw:unknown):AcceptedSanmaReport|null{
 const r=raw as AcceptedSanmaReport;
 if(s.players!==3||!/^3-(tonpu|hanchan)$/.test(s.game)||!r||!(r.version===1&&r.source==='sanma-shape'&&r.model==='sanma-shape-v1'||r.version===2&&r.source==='sanma-rules'&&r.model==='sanma-rules-v2'||r.version===3&&r.source==='sanma-rules'&&r.model==='sanma-rules-v3'||r.version===4&&r.source==='sanma-rules'&&r.model==='sanma-rules-v4'||r.version===5&&r.source==='sanma-rules'&&r.model==='sanma-rules-v5')||r.uuid!==s.uuid||!Array.isArray(r.findings)||!r.findings.length||r.findings.length>4)return null;
 const seen=new Set<string>();
 for(const f of r.findings){
  if(!f||!int(f.seat,0,2)||!int(f.round,0,s.rounds.length-1)||typeof f.actual!=='string'||!tile.test(f.actual)||typeof f.recommended!=='string'||!tile.test(f.recommended))return null;
  if(f.basis==='riichi-choice'){
   if(r.version!==5||f.actual!==f.recommended||typeof f.doubleRiichi!=='boolean'||!int(f.turn,f.doubleRiichi?1:2,16)||f.actual==='N'||!valueMetric(f.damaValue,f.actual)||!valueMetric(f.riichiValue,f.actual)||f.damaValue.live!==f.riichiValue.live||f.riichiValue.min<f.damaValue.max+1000)return null;
  }else if(f.basis==='placement'){
   if((r.version!==4&&r.version!==5)||f.dealer!==2||f.seat===2||!int(f.turn,2,16)||f.actual===f.recommended||f.actual==='N'||f.recommended==='N'||!Array.isArray(f.scores)||!valueMetric(f.actualValue,f.actual)||!valueMetric(f.recommendedValue,f.recommended)||f.recommendedValue.live<f.actualValue.live||!placementImproves(f))return null;
   const label=s.game==='3-tonpu'?'東3局':'南3局';
   if(s.rounds[f.round].label!==label)return null;
  }else if(f.basis==='tsumo-value'||f.basis==='wait-value-tradeoff'){
   if((r.version!==3&&r.version!==4&&r.version!==5)||typeof f.riichi!=='boolean'||typeof f.doubleRiichi!=='boolean'||f.doubleRiichi&&!f.riichi||typeof f.menzen!=='boolean'||f.riichi&&!f.menzen||!int(f.turn,f.doubleRiichi?1:2,16)||f.actual==='N'||f.recommended==='N'||!valueMetric(f.actualValue,f.actual)||!valueMetric(f.recommendedValue,f.recommended))return null;
   const a=f.actualValue,b=f.recommendedValue;
   if(f.basis==='wait-value-tradeoff'){
    if(r.version!==5||f.actual===f.recommended||!(a.live>=b.live+2&&b.min>=a.max+1000||b.live>=a.live+2&&a.min>=b.max+1000))return null;
   }else if(f.actual===f.recommended?JSON.stringify(a)!==JSON.stringify(b):b.live<a.live||b.min<a.max+1000)return null;
  }else if(f.basis==='genbutsu'||f.basis==='push-fold-choice'){
   if(r.version===1||!int(f.turn,6,24)||!int(f.against,0,2)||f.against===f.seat||f.againstRiichi!==true||f.recommendedOnRiver!==true||typeof f.actualOnRiver!=='boolean'||f.actualOnRiver!==(f.actual===f.recommended)||!int(f.shanten,f.basis==='push-fold-choice'?1:3,f.basis==='push-fold-choice'?2:6)||f.actual==='N'||f.recommended==='N')return null;
   if(f.basis==='push-fold-choice'&&(r.version!==5||!f.river||!metric(f.actualMetric,f.actual)||!metric(f.recommendedMetric,f.recommended)))return null;
   if(f.river){
    const rv=f.river,norm=(t:string)=>t.replace(/r$/,'');
    if((r.version!==4&&r.version!==5)||!Array.isArray(rv.tiles)||rv.tiles.length>32||!rv.tiles.every(t=>typeof t==='string'&&tile.test(t))||!Array.isArray(rv.held)||!rv.held.length||rv.held.length>14||!rv.held.every(t=>typeof t==='string'&&tile.test(t)&&rv.tiles.some(r=>norm(r)===norm(t)))||!rv.held.includes(f.recommended)||rv.tiles.some(t=>norm(t)===norm(f.actual))||typeof rv.dealer!=='boolean')return null;
   }
  }else if(f.basis==='shape'){
   if(!int(f.turn,1,10)||!metric(f.actualMetric,f.actual)||!metric(f.recommendedMetric,f.recommended))return null;
   const a=f.actualMetric,b=f.recommendedMetric;
   if(b.bonus<a.bonus||b.shanten>a.shanten||f.actual!==f.recommended&&!(b.shanten<a.shanten||b.shanten===a.shanten&&b.ukeire>=a.ukeire+8))return null;
   if(f.actual===f.recommended&&JSON.stringify(a)!==JSON.stringify(b))return null;
  }else return null;
  const key=[f.seat,f.round,f.turn].join(':');if(seen.has(key))return null;seen.add(key);
 }

 return r;
}
const show=(t:string)=>t.endsWith('r')?'赤'+t.slice(0,-1):({E:'東',S:'南',W:'西',N:'北',P:'白',F:'發',C:'中'} as Record<string,string>)[t]??t;
const clean=(s:string)=>s.replace(/[@`*_~<>|#\\\[\]()\r\n]/g,'').slice(0,16)||'名無し';
export function equalSanmaComments(s:PaipuSummary,raw:unknown,members:Map<number,{name:string}>):string[]{
 const r=acceptedSanmaReport(s,raw);if(!r)return [];
 const chosen=selectSanmaFindings(r.findings.filter(f=>members.has(f.seat)),2);
 return chosen.map(f=>{
  const name=clean(members.get(f.seat)!.name),at=s.rounds[f.round].label+'の'+f.turn+'打目',a=show(f.actual),b=show(f.recommended);
  if(f.basis==='riichi-choice'){
   const range=(m:ValueMetric)=>m.min===m.max?`${m.min}点`:`${m.min}〜${m.max}点`;
   return `🎙️「${name}、${at}は${a}切りで${f.doubleRiichi?'ダブルリーチ':'リーチ'}やね。同じ手をダマでツモると${range(f.damaValue)}、宣言した条件なら${range(f.riichiValue)}ですわ。見えてへん待ち牌は${f.riichiValue.live}枚で、宣言そのものでは増えません。打点と引き換えに1000点を供託し、以後は自由に手を変えたり降りたりできなくなります。この得失を見たいですねぇ。ツモ損・本場供託抜き、一発と裏ドラは含めてへんで。ロンの可否や和了率まで比べた結論ではありません」`;
  }
  if(f.basis==='wait-value-tradeoff'){
   const x=f.actualValue,m=f.recommendedValue,range=(v:ValueMetric)=>v.min===v.max?`${v.min}点`:`${v.min}〜${v.max}点`;
   const premise=f.doubleRiichi?'ダブルリーチ後':f.riichi?'リーチ後':f.menzen?'門前':'副露した手の';
   return `🎙️「${name}、${at}の${a}切りは待ちが見えてへん分で${x.live}枚、${range(x)}。${b}切りなら${m.live}枚で${range(m)}ですわ。待ちの広さを取るか、打点を取るかの分かれ道やね。${premise}ツモ・ツモ損で、本場供託抜きの試算です。枚数だけで和了率は決まりませんし、相手の攻撃や点差まで含めた正解は断定してへんで」`;
  }
  if(f.basis==='placement'){
   const x=f.actualValue,m=f.recommendedValue;
   const ranks=(rs:number[])=>Math.min(...rs)===Math.max(...rs)?`${rs[0]}位`:`${Math.min(...rs)}〜${Math.max(...rs)}位`;
   const points=(v:ValueMetric)=>v.min===v.max?`${v.min}点`:`${v.min}〜${v.max}点`;
   const above=f.scores.map((score,seat)=>({score,seat})).filter(p=>p.score>f.scores[f.seat]).sort((x,y)=>x.score-y.score)[0];
   const gap=above?`一つ上とは${above.score-f.scores[f.seat]}点差。`:'';
   return `🎙️「${name}、${at}は${gap}${a}切りでツモると${points(x)}で、その直後は${ranks(tsumoRanks(f.scores,f.seat,f.dealer,x)!)}。${b}切りなら${points(m)}で${ranks(tsumoRanks(f.scores,f.seat,f.dealer,m)!)}になりますわ。見えてへん待ち牌も${x.live}枚から${m.live}枚で減りません。順位を上げたいなら打点まで比べたいですねぇ。リーチ・裏ドラなし、本場・供託なしのツモ損計算です。ロンの条件や和了率、対局終了までは別の話やで」`;
  }
  if(f.basis==='tsumo-value'){
   const x=f.actualValue,m=f.recommendedValue;
   const range=(v:ValueMetric)=>v.min===v.max?`${v.min}点`:`${v.min}〜${v.max}点`;
   const premise=(f.doubleRiichi?'ダブルリーチ後ツモ':f.riichi?'リーチ後ツモ':f.menzen?'門前ツモ':'ツモ和了')+'・ツモ損で、本場と供託を抜いた試算';
   return `🎙️「${name}、${at}は${a}切りで${range(x)}、${b}切りなら${range(m)}。見えてへん待ち牌も${x.live}枚から${m.live}枚で減りませんねぇ。${premise}ですわ。待ちの広さと打点を一緒に比べたい場面やね。和了しやすさや押し引きまでは、この試算では決められません」`;
  }
  if(f.basis==='genbutsu'||f.basis==='push-fold-choice'){
   const opponent=clean(members.get(f.against)?.name??s.seats[f.against]?.nickname??'リーチした人');
   if(f.basis==='push-fold-choice'){
    const x=f.actualMetric,m=f.recommendedMetric;
    return `🎙️「${name}、${at}は${opponent}のリーチに${a}切り。これなら${x.shanten}向聴で、次に進む牌は見えてへん分で${x.ukeire}枚です。現物の${b}を切ると${m.shanten}向聴・${m.ukeire}枚になりますわ。攻めを残す代わりに現物以外を押すか、手の進み方を変えて守るかの場面やね。${b}の安全はこのリーチ相手に対しての話で、打点や放銃率を含めた押し引きの正解までは計算してへんで」`;
   }
   if(f.river){
    const rv=f.river,suji=riverSuji(f.actual,rv.tiles);
    const relation=suji===null?'字牌なので筋では判断できません':suji?'筋には当たりますが、カンチャンや単騎への安全までは保証しません':'この河に対しては無筋です';
    return `🎙️「${name}、${at}の${a}は${relation}。${rv.dealer?'親の':''}${opponent}の河は${rv.tiles.length>6?'…・':''}${rv.tiles.slice(-6).map(show).join('・')}で、手には現物の${rv.held.map(show).join('・')}が残ってますわ。まだ${f.shanten}向聴なので、守備を選ぶなら${b}切りも比較したいですねぇ。筋だけで当たり牌とは決められませんし、他家への安全と押し引きの正解までは出してへんで」`;
   }
   return `🎙️「${name}、${at}は${f.shanten}向聴で${a}切りやね。${a}は${opponent}の現物ではないけど、手には現物の${b}もありますわ。守備を選ぶなら${b}が比較候補です。ただ、${a}が危険と決まったわけでも、他の相手にも${b}が安全なわけでもありません。押すか降りるかの正解までは出してへんで」`;
  }
  const x=f.actualMetric,m=f.recommendedMetric;
  const reason=m.shanten<x.shanten
   ?`${a}切りでは${x.shanten}向聴、${b}切りなら${m.shanten}向聴です。テンパイまでの距離に差がありますねぇ`
   :`どちらも${m.shanten}向聴ですが、次に手が進む牌は見えてへん分で${x.ukeire}枚と${m.ukeire}枚。${b}切りの方が${m.ukeire-x.ukeire}枚多いですわ`;
  const added=m.improving.filter(t=>!x.improving.includes(t));
  const examples=added.length?`。${added.slice(0,4).map(show).join('・')}${added.length>4?'など':''}でも手が進むようになります`:'';
  return `🎙️「${name}、${at}は${a}切りでしたね。形だけ比べると${b}切りもあります。${reason}${examples}。シャンテン数と受け入れの比較で、役や将来の変化、押し引きは評価してへんで」`;
 });
}
