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
   typeof f.recommended!=='string'||!TILE.test(f.recommended)||f.actual===f.recommended)return null;
  const key=f.seat+':'+f.round+':'+f.turn;
  if(seen.has(key))return null;
  seen.add(key);
 }
 return r;
}
const tile=(t:string)=>t.endsWith('r')?'赤'+t.slice(0,-1):t;
/** Render up to two independently checked differences, never a fabricated "mistake". */
export function equalC3Comments(summary:PaipuSummary,raw:unknown,members:Map<number,{name:string}>,limit=2):string[]{
 const r=acceptedC3Report(summary,raw);
 if(!r)return [];
 const clean=(name:string)=>name.replace(/[@`*_~<>|#\\\[\]()\r\n]/g,'').slice(0,16)||'名無し';
 return r.findings.filter(f=>members.has(f.seat)).slice(0,limit).map((f,i)=>{
  const name=clean(members.get(f.seat)!.name),round=summary.rounds[f.round].label;
  return i===0
   ? '🎙️ 「'+name+'、'+round+'の'+f.turn+'巡目の'+tile(f.actual)+'なあ。c3は'+tile(f.recommended)+'切りを選んどる。ここはちょっと気になるなあ。」'
   : '🎙️ 「'+name+'の'+round+f.turn+'巡目、'+tile(f.actual)+'か。c3は'+tile(f.recommended)+'やったで。見直してみたいとこやな。」';
 });
}
