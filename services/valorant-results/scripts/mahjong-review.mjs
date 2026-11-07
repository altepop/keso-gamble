import {Worker} from 'node:worker_threads';
import {buildC3Cases} from '../src/mahjong-c3-cases.ts';
/** One lazy worker per existing queue batch; deadlines cannot block paipu/KP.
 * The three-player rollout is opt-in until real-record validation is complete. */
export function createPaipuReviewer({root,fourEnabled=false,sanmaEnabled=false,timeoutMs=45000,budgetMs=90000,workerFactory=options=>new Worker(new URL('./mahjong-review-worker.mjs',import.meta.url),options)}={}){
 let worker,disabled=false,closed=false,spent=0;
 return {
  async review(summary,actions){
   if(closed||disabled||spent>=budgetMs||!(summary.players===3?sanmaEnabled:summary.players===4&&fourEnabled&&root))return null;
   if(summary.players===4&&!buildC3Cases(actions,summary,1).length)return null;
   const started=Date.now();
   try{
    if(!worker){
     const env={C3_ASSETS_ROOT:root??''};
     for(const key of ['HTTP_PROXY','HTTPS_PROXY','NO_PROXY','http_proxy','https_proxy','no_proxy','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE'])if(process.env[key])env[key]=process.env[key];
     worker=workerFactory({workerData:{root},env});
    }
    return await new Promise(resolve=>{
     const done=value=>{clearTimeout(timer);worker?.off('message',message);worker?.off('error',error);worker?.off('exit',exit);resolve(value);};
     const stop=()=>{disabled=true;void worker?.terminate();done(null);};
     const message=value=>done(value),error=()=>stop(),exit=()=>stop();
     const timer=setTimeout(stop,Math.min(timeoutMs,budgetMs-spent));
     worker.once('message',message);worker.once('error',error);worker.once('exit',exit);
     try{worker.postMessage({summary,actions});}catch{stop();}
    });
   }catch{disabled=true;return null;}finally{spent+=Date.now()-started;}
  },
  async close(){closed=true;await worker?.terminate();},
 };
}
