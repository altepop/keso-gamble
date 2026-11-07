// A small, signed C3 finding envelope for the existing 等しいbot paipu post.
// The GitHub Actions paipu fetcher must supply genuine C3 inference results.
// This file does not simulate a model verdict, read D1, or infer mistakes from final ranks.
import type {PaipuSummary} from './mahjong-summary.ts';

export const C3_MODEL='c3-v1.0-observation-1';
export interface C3Finding {
 seat:number;
 round:number;
 turn:number;
 actual:string;
 recommended:string;
}
export interface C3Report {
 version:1;
 source:'c3';
 model:string;
 uuid:string;
 findings:C3Finding[];
}
// Mahjong Soul/MJAI tile names: including red 5, with no user-supplied prose.
const TILE=/^(?:[1-9][mps]|5[mps]r|[ESWNPFC])$/;
const integer=(v:unknown,min:number,max:number)=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
/** Fail closed on malformed, unsupported, or unverifiable analysis packages. */
export function acceptedC3Report(summary:PaipuSummary,raw:unknown):C3Report|null{
 const r=raw as C3Report;
 if(!r||summary.players!==4||!summary.game.startsWith('4-')||
  r.version!==1||r.source!=='c3'||r.model!==C3_MODEL||r.uuid!==summary.uuid||
  !Array.isArray(r.findings)||r.findings.length<1||r.findings.length>4)return null;
 const seen=new Set<string>();
 for(const f of r.findings){
  if(!f||!integer(f.seat,0,3)||!integer(f.round,0,summary.rounds.length-1)||
   !integer(f.turn,1,30)||typeof f.actual!=='string'||!TILE.test(f.actual)||
   typeof f.recommended!=='string'||!TILE.test(f.recommended))return null;
  const key=f.seat+':'+f.round+':'+f.turn;
  if(seen.has(key))return null;
  seen.add(key);
 }
 return r;
}
const tile=(t:string)=>t.endsWith('r')?'赤'+t.slice(0,-1):({E:'東',S:'南',W:'西',N:'北',P:'白',F:'發',C:'中'} as Record<string,string>)[t]??t;
// Each line is a fictional bot persona, not an attributed recording.
// When choices agree, the bot can praise; disagreement is not proof of a blunder.
function hash(v:string){
 let h=2166136261;
 for(const c of v)h=Math.imul(h^c.charCodeAt(0),16777619);
 return (h^(h>>>16))>>>0;
}
const clean=(name:string)=>name.replace(/[@\x60*_~<>|#\\\[\]()\r\n]/g,'').slice(0,16)||'名無し';
function equalLine(f:C3Finding,name:string,round:string,index:number){
 const actual=tile(f.actual),suggested=tile(f.recommended);
 const patterns=f.actual===f.recommended?[
  '🎙️「'+name+'、'+round+'の'+f.turn+'巡目の'+actual+'ねぇ。いや、僕もそれ切りますわ。これはええと思いますよぉ〜」',
  '🎙️「'+round+'の'+f.turn+'巡目、'+name+'の'+actual+'か。うん、僕も同じですわ。こういう一打は好きですねぇ」',
  '🎙️「'+name+'、'+round+'の'+f.turn+'巡目は'+actual+'切りね。僕もここはそうしますねぇ〜。ええ感じやと思いますわ」',
 ]:[
  '🎙️「'+name+'、'+round+'の'+f.turn+'巡目の'+actual+'なあ。僕はここで'+suggested+'切りますけどねぇ〜。ちょっと惜しい気がしますわ」',
  '🎙️「'+round+'の'+f.turn+'巡目、'+name+'の'+actual+'かぁ。僕やったら'+suggested+'ですかねぇ。ここはちょっと違うかなあ」',
  '🎙️「'+name+'、'+round+'の'+f.turn+'巡目やね。'+actual+'は僕ちょっと気になりますわ。僕なら'+suggested+'切りたいですねぇ〜」',
 ];
 return patterns[index%patterns.length];
}
/** Select one honest criticism and one honest praise when both exist.
 * At most two linked-member remarks, bounded and stable across retries.
 * No engine name, numerical \"accuracy\", or invented tactical explanation is posted.
 */
export function equalC3Comments(summary:PaipuSummary,raw:unknown,members:Map<number,{name:string}>,limit=2):string[]{
 const report=acceptedC3Report(summary,raw);
 if(!report||!Number.isSafeInteger(limit)||limit<1)return [];
 const eligible=report.findings.filter(f=>members.has(f.seat));
 const alternative=eligible.filter(f=>f.actual!==f.recommended);
 const praise=eligible.filter(f=>f.actual===f.recommended);
 const chosen:C3Finding[]=[];
 // Keep one spot for a genuine positive note, rather than always roasting the last place.
 if(alternative.length&&praise.length&&limit>=2){
  chosen.push(alternative[0],praise[0]);
 }else chosen.push(...eligible.slice(0,limit));
 return chosen.slice(0,Math.min(limit,2)).map(f=>{
  const name=clean(members.get(f.seat)!.name),round=summary.rounds[f.round].label;
  const variant=hash(summary.uuid+':'+f.seat+':'+f.round+':'+f.turn);
  return equalLine(f,name,round,variant);
 });
}
