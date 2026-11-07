// Isolated, killable optional analysis. Never contains a Discord or D1 client.
import {parentPort,workerData} from 'node:worker_threads';
import {buildC3Cases} from '../src/mahjong-c3-cases.ts';
import {selectReviewFindings} from '../src/mahjong-review-selection.ts';
import {reviewDecisions} from '../src/mahjong-review-state.ts';
import {sanmaShapeFinding,sanmaShapeEligible,SANMA_ENGINE} from '../src/mahjong-sanma-efficiency.ts';
let four;
parentPort.on('message',async ({summary,actions})=>{
 try{
  if(summary.players===3){
   const all=[];const perSeat=new Map();
   for(const d of reviewDecisions(actions,summary,128)){
    if(!sanmaShapeEligible(d,summary.game)||(perSeat.get(d.seat)??0)>=6)continue;
    perSeat.set(d.seat,(perSeat.get(d.seat)??0)+1);
    const finding=sanmaShapeFinding(d,summary.game);if(finding)all.push(finding);
   }
   const selected=selectReviewFindings(all,3);
   parentPort.postMessage(selected.length?{version:1,source:'sanma-shape',model:SANMA_ENGINE,uuid:summary.uuid,findings:selected.slice(0,4)}:null);
  }else if(summary.players===4&&buildC3Cases(actions,summary,1).length){
   if(!four){
    // Cache restore is cheap; download, SHA verification and model init happen
    // only after a real four-player decision has been extracted.
    const {prepareC3Assets}=await import('./mahjong-c3-download.mjs');
    await prepareC3Assets();
    const {createC3Reviewer}=await import('./mahjong-c3-infer.mjs');
    four=await createC3Reviewer(workerData.root);
   }
   parentPort.postMessage(await four.review(summary,actions));
  }else parentPort.postMessage(null);
 }catch{parentPort.postMessage(null);}
});
