import {reviewDiagnostic} from './mahjong-review-diagnostics.mjs';
import {Worker} from 'node:worker_threads';
import {buildC3Cases} from '../src/mahjong-c3-cases.ts';
/** One lazy worker per existing queue batch; deadlines cannot block paipu/KP.
 * The three-player rollout is opt-in until real-record validation is complete. */
export function createPaipuReviewer({root,fourEnabled=false,sanmaEnabled=false,timeoutMs=45000,budgetMs=90000,workerFactory=options=>new Worker(new URL('./mahjong-review-worker.mjs',import.meta.url),options)}={}){
 let worker,disabled=false,closed=false,spent=0;
 return {
  async review(summary,actions,onDiagnostic=()=>{}){
   const emit=raw=>{try{onDiagnostic(reviewDiagnostic(raw));}catch{/* Optional diagnostics cannot break settlement. */}};
   const skip=status=>{emit({status});return null;};
   if(closed)return skip('closed');
   if(disabled)return skip('worker-disabled');
   if(spent>=budgetMs)return skip('budget-exhausted');
   if(![3,4].includes(summary.players))return skip('unsupported-mode');
   if(!(summary.players===3?sanmaEnabled:fourEnabled&&root))return skip('disabled');
   if(summary.players===4&&!buildC3Cases(actions,summary,1).length)return skip('no-decisions');
   const started=Date.now();
   try{
    if(!worker){
     const env={C3_ASSETS_ROOT:root??''};
     if(process.env.SANMA_PYTHON)env.SANMA_PYTHON=process.env.SANMA_PYTHON;
     for(const key of ['HTTP_PROXY','HTTPS_PROXY','NO_PROXY','http_proxy','https_proxy','no_proxy','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE'])if(process.env[key])env[key]=process.env[key];
     worker=workerFactory({workerData:{root},env});
    }
    return await new Promise(resolve=>{
     const done=(value,diagnostic)=>{emit(diagnostic??{status:value?'report':'no-findings'});clearTimeout(timer);worker?.off('message',message);worker?.off('error',error);worker?.off('exit',exit);resolve(value);};
     const stop=status=>{disabled=true;void worker?.terminate();done(null,{status});};
     const message=value=>value?.kind==='equal-review-result-v1'?done(value.report,value.diagnostic):done(value),error=()=>stop('worker-error'),exit=()=>stop('worker-exit');
     const timer=setTimeout(()=>stop('timeout'),Math.min(timeoutMs,budgetMs-spent));
     worker.once('message',message);worker.once('error',error);worker.once('exit',exit);
     try{worker.postMessage({summary,actions});}catch{stop('send-error');}
    });
   }catch{disabled=true;return skip('setup-error');}finally{spent+=Date.now()-started;}
  },
  async close(){closed=true;await worker?.terminate();},
 };
}
