import type {PaipuSummary} from './mahjong-summary.ts';
import type {SanmaReport,Efficiency} from './mahjong-sanma-efficiency.ts';
// Do not import the search engine in the Worker: signed, bounded findings only.
const tile=/^(?:[19]m|[1-9][ps]|5[ps]r|[ESWNPFC])$/;
const int=(v:unknown,a:number,b:number)=>Number.isSafeInteger(v)&&Number(v)>=a&&Number(v)<=b;
const metric=(m:Efficiency,t:string)=>m&&m.tile===t&&int(m.shanten,1,6)&&int(m.ukeire,0,108)&&int(m.bonus,0,40)&&Array.isArray(m.improving)&&m.improving.length<=27&&new Set(m.improving).size===m.improving.length&&m.improving.every(t=>typeof t==='string'&&tile.test(t));
export function acceptedSanmaReport(s:PaipuSummary,raw:unknown):SanmaReport|null{
 const r=raw as SanmaReport;
 if(s.players!==3||!/^3-(tonpu|hanchan)$/.test(s.game)||!r||r.version!==1||r.source!=='sanma-shape'||r.model!=='sanma-shape-v1'||r.uuid!==s.uuid||!Array.isArray(r.findings)||!r.findings.length||r.findings.length>4)return null;
 const seen=new Set<string>();
 for(const f of r.findings){
  if(!f||!int(f.seat,0,2)||!int(f.round,0,s.rounds.length-1)||!int(f.turn,1,10)||f.basis!=='shape'||typeof f.actual!=='string'||!tile.test(f.actual)||typeof f.recommended!=='string'||!tile.test(f.recommended)||!metric(f.actualMetric,f.actual)||!metric(f.recommendedMetric,f.recommended))return null;
  const a=f.actualMetric,b=f.recommendedMetric;
  if(b.bonus<a.bonus||b.shanten>a.shanten||f.actual!==f.recommended&&!(b.shanten<a.shanten||b.shanten===a.shanten&&b.ukeire>=a.ukeire+8))return null;
  if(f.actual===f.recommended&&JSON.stringify(a)!==JSON.stringify(b))return null;
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
  const name=clean(members.get(f.seat)!.name),at=s.rounds[f.round].label+'の'+f.turn+'打目',a=show(f.actual),b=show(f.recommended),m=f.recommendedMetric;
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
