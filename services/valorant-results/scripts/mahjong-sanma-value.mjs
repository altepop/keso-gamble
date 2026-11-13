import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sanmaValueCase,sanmaValueFinding,sanmaPlacementFinding,sanmaTradeoffFinding,sanmaRiichiFinding} from '../src/mahjong-sanma-value.ts';
/** One bounded child per paipu, no shell, credentials or inherited runtime env.
 * Missing calculator affects only conditional value comments, never KP/paipu. */
export function reviewSanmaValues(decisions,game,{python=process.env.SANMA_PYTHON,runner=spawnSync,diagnostics={}}={}){
 Object.assign(diagnostics,{configured:Boolean(python),eligibleCases:0,evaluatedCases:0,findingCount:0,status:python?'no-cases':'not-configured'});
 if(!python)return [];
 const frames=[],cases=[],counts=new Map();
 // Reserve the existing bounded budget for final-round decisions first.
 for(const d of decisions.slice().sort((a,b)=>(Number(b.dealer===2&&b.wind===(game==='3-tonpu'?0:1))*2+Number(Boolean(b.declaringReach)))-(Number(a.dealer===2&&a.wind===(game==='3-tonpu'?0:1))*2+Number(Boolean(a.declaringReach))))){
  if((counts.get(d.seat)??0)>=4)continue;
  const c=sanmaValueCase(d,game);if(!c)continue;
  // The declared discard is first; only it needs the dama counterfactual.
  if(c.riichi)c.candidates.sort((a,b)=>Number(b.tile===d.actual)-Number(a.tile===d.actual));
  frames.push(d);cases.push(c);counts.set(d.seat,(counts.get(d.seat)??0)+1);if(cases.length===12)break;
 }
 diagnostics.eligibleCases=cases.length;
 if(!cases.length)return [];
 diagnostics.status='failed';
 try{
  const r=runner(python,['-I',fileURLToPath(new URL('./mahjong-sanma-value.py',import.meta.url))],{input:JSON.stringify({version:1,cases}),encoding:'utf8',env:{},timeout:8000,maxBuffer:262144,killSignal:'SIGKILL',windowsHide:true});
  if(r.error||r.status!==0)return [];
  const out=JSON.parse(r.stdout);if(out.version!==1||!Array.isArray(out.results)||out.results.length!==frames.length)return [];
  diagnostics.status='ok';
  const findings=out.results.flatMap((result,i)=>{
   if(!Array.isArray(result)||result.length!==cases[i].candidates.length)return [];
   if(result.some(m=>{const c=cases[i].candidates.find(c=>c.tile===m?.tile);return !c||m.live!==c.waits.reduce((sum,w)=>sum+w.left,0);}))return [];
   diagnostics.evaluatedCases++;
   const final=frames[i].dealer===2&&frames[i].wind===(game==='3-tonpu'?0:1);
   const f=final?sanmaPlacementFinding(frames[i],game,result):sanmaValueFinding(frames[i],result)??sanmaRiichiFinding(frames[i],result)??sanmaTradeoffFinding(frames[i],result);return f?[f]:[];
  });
  diagnostics.findingCount=findings.length;return findings;
 }catch{return [];}
}
