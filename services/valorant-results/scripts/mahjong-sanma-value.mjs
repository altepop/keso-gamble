import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sanmaValueCase,sanmaValueFinding} from '../src/mahjong-sanma-value.ts';
/** One bounded child per paipu, no shell, credentials or inherited runtime env.
 * Missing calculator affects only conditional value comments, never KP/paipu. */
export function reviewSanmaValues(decisions,game,{python=process.env.SANMA_PYTHON,runner=spawnSync}={}){
 if(!python)return [];
 const frames=[],cases=[],counts=new Map();
 for(const d of decisions){
  if((counts.get(d.seat)??0)>=4)continue;
  const c=sanmaValueCase(d,game);if(!c)continue;
  frames.push(d);cases.push(c);counts.set(d.seat,(counts.get(d.seat)??0)+1);if(cases.length===12)break;
 }
 if(!cases.length)return [];
 try{
  const r=runner(python,['-I',fileURLToPath(new URL('./mahjong-sanma-value.py',import.meta.url))],{input:JSON.stringify({version:1,cases}),encoding:'utf8',env:{},timeout:8000,maxBuffer:262144,killSignal:'SIGKILL',windowsHide:true});
  if(r.error||r.status!==0)return [];
  const out=JSON.parse(r.stdout);if(out.version!==1||!Array.isArray(out.results)||out.results.length!==frames.length)return [];
  return out.results.flatMap((result,i)=>{
   if(!Array.isArray(result)||result.length!==cases[i].candidates.length)return [];
   if(result.some(m=>{const c=cases[i].candidates.find(c=>c.tile===m?.tile);return !c||m.live!==c.waits.reduce((sum,w)=>sum+w.left,0);}))return [];
   const f=sanmaValueFinding(frames[i],result);return f?[f]:[];
  });
 }catch{return [];}
}
