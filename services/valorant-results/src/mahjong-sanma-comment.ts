import type {PaipuSummary} from './mahjong-summary.ts';
import type {ValueMetric} from './mahjong-sanma-value.ts';
import type {Efficiency} from './mahjong-sanma-efficiency.ts';
import type {AcceptedSanmaReport} from './mahjong-sanma-report.ts';
// Do not import the search engine in the Worker: signed, bounded findings only.
const tile=/^(?:[19]m|[1-9][ps]|5[ps]r|[ESWNPFC])$/;
const int=(v:unknown,a:number,b:number)=>Number.isSafeInteger(v)&&Number(v)>=a&&Number(v)<=b;
const valueMetric=(m:ValueMetric,t:string)=>m&&m.tile===t&&int(m.live,1,108)&&int(m.min,500,96000)&&int(m.max,m.min,96000)&&m.min%100===0&&m.max%100===0&&int(m.hanMin,1,12)&&int(m.hanMax,m.hanMin,12)&&int(m.fuMin,20,160)&&int(m.fuMax,m.fuMin,160);
const metric=(m:Efficiency,t:string)=>m&&m.tile===t&&int(m.shanten,1,6)&&int(m.ukeire,0,108)&&int(m.bonus,0,40)&&Array.isArray(m.improving)&&m.improving.length<=27&&new Set(m.improving).size===m.improving.length&&m.improving.every(t=>typeof t==='string'&&tile.test(t));
export function acceptedSanmaReport(s:PaipuSummary,raw:unknown):AcceptedSanmaReport|null{
 const r=raw as AcceptedSanmaReport;
 if(s.players!==3||!/^3-(tonpu|hanchan)$/.test(s.game)||!r||!(r.version===1&&r.source==='sanma-shape'&&r.model==='sanma-shape-v1'||r.version===2&&r.source==='sanma-rules'&&r.model==='sanma-rules-v2'||r.version===3&&r.source==='sanma-rules'&&r.model==='sanma-rules-v3')||r.uuid!==s.uuid||!Array.isArray(r.findings)||!r.findings.length||r.findings.length>4)return null;
 const seen=new Set<string>();
 for(const f of r.findings){
  if(!f||!int(f.seat,0,2)||!int(f.round,0,s.rounds.length-1)||typeof f.actual!=='string'||!tile.test(f.actual)||typeof f.recommended!=='string'||!tile.test(f.recommended))return null;
  if(f.basis==='tsumo-value'){
   if(r.version!==3||typeof f.riichi!=='boolean'||!int(f.turn,2,16)||f.actual==='N'||f.recommended==='N'||!valueMetric(f.actualValue,f.actual)||!valueMetric(f.recommendedValue,f.recommended))return null;
   const a=f.actualValue,b=f.recommendedValue;
   if(f.actual===f.recommended?JSON.stringify(a)!==JSON.stringify(b):b.live<a.live||b.min<a.max+1000)return null;
  }else if(f.basis==='genbutsu'){
   if(r.version===1||!int(f.turn,6,24)||!int(f.against,0,2)||f.against===f.seat||f.againstRiichi!==true||f.recommendedOnRiver!==true||typeof f.actualOnRiver!=='boolean'||f.actualOnRiver!==(f.actual===f.recommended)||!int(f.shanten,3,6)||f.actual==='N'||f.recommended==='N')return null;
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
 const fs=r.findings.filter(f=>members.has(f.seat));
 const alt=fs.find(f=>f.actual!==f.recommended),praise=fs.find(f=>f.actual===f.recommended);
 const chosen=alt&&praise?[alt,praise]:fs.slice(0,2);
 return chosen.map(f=>{
  const name=clean(members.get(f.seat)!.name),at=s.rounds[f.round].label+'の'+f.turn+'打目',a=show(f.actual),b=show(f.recommended);
  if(f.basis==='tsumo-value'){
   const m=f.recommendedValue;
   const range=m.min===m.max?`${m.min}点`:`${m.min}〜${m.max}点`;
   const premise=(f.riichi?'リーチ後ツモ':'門前ツモ')+'・ツモ損で、本場と供託を抜いた試算';
   if(f.actual===f.recommended)return [
    `🎙️「${name}、${at}の${a}やね。この待ち選びもええですねぇ。見えてへん待ち牌が${m.live}枚、${premise}なら${range}ありますわ」`,
    `🎙️「${at}、${name}は${a}切りですねぇ。${premise}で${range}。待ちの枚数も残せてますわ」`,
   ][(f.round+f.turn+f.seat)%2];
   return [
    `🎙️「${name}、${at}の${a}なあ。${b}でも待ちの枚数を減らさず、${premise}なら${range}になりますねぇ。打点も見るならこっちを考えますわ」`,
    `🎙️「${at}、${name}は${a}ですかぁ。僕は${b}も見たいですねぇ。見えてへん待ち牌は${m.live}枚、${premise}で${range}ですわ」`,
   ][(f.round+f.turn+f.seat)%2];
  }
  if(f.basis==='genbutsu'){
   const opponent=clean(members.get(f.against)?.name??s.seats[f.against]?.nickname??'リーチした人');
   const patterns=f.actual===f.recommended?[
    `🎙️「${name}、${at}の${a}は${opponent}の現物ですねぇ。そのリーチには落ち着いて合わせてますわ」`,
    `🎙️「${at}、${name}は${a}やね。${opponent}が自分で捨ててる牌ですから、そのリーチ相手にはええ選び方やと思いますわ」`,
    `🎙️「${name}、${at}。${a}は${opponent}の河にありますねぇ。対${opponent}ではちゃんと止まれてますわ」`,
   ]:[
    `🎙️「${name}、${at}の${a}ですかぁ。対${opponent}のリーチだけ考えるなら、僕は現物の${b}も考えますねぇ」`,
    `🎙️「${at}、${name}は${a}ね。手がまだ遠いですし、${opponent}の河にある${b}を合わせる手もありますわ」`,
    `🎙️「${name}、${at}やね。${opponent}への受けを優先するなら、現物の${b}も選べますねぇ」`,
   ];
   return patterns[(f.round+f.turn+f.seat)%patterns.length];
  }
  const m=f.recommendedMetric;
  const variant=(f.round+f.turn+f.seat)%3;
  if(f.actual===f.recommended)return [
   `🎙️「${name}、${at}の${a}ね。手の進み方だけなら僕もそれですわ。次に手が進む牌は見えてへん分で${m.ukeire}枚ありますねぇ」`,
   `🎙️「${at}、${name}の${a}切り。これはええですねぇ。牌のつながりだけ見ると僕も同じですわ」`,
   `🎙️「${name}、${at}は${a}やね。受け入れを残せてますねぇ。僕もここはそうしますわ」`,
  ][variant];
  const reason=m.shanten<f.actualMetric.shanten?`${b}なら${m.shanten}向聴で、${a}やと${f.actualMetric.shanten}向聴になりますねぇ`:`次に手が進む牌が、見えてへん分で${f.actualMetric.ukeire}枚から${m.ukeire}枚になるんですよねぇ`;
  return [
   `🎙️「${name}、${at}の${a}なあ。手の進み方だけなら僕は${b}ですかね。${reason}」`,
   `🎙️「${at}、${name}は${a}ですかぁ。形だけ見たら僕は${b}を切りたいですねぇ。${reason}」`,
   `🎙️「${name}、${at}やね。僕は牌のつながりを残して${b}ですわ。${reason}」`,
  ][variant];
 });
}
