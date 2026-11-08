// Isolated, killable optional analysis. Never contains a Discord or D1 client.
import {parentPort,workerData} from 'node:worker_threads';
import {buildC3Cases} from '../src/mahjong-c3-cases.ts';
import {selectReviewFindings} from '../src/mahjong-review-selection.ts';
import {reviewDecisions} from '../src/mahjong-review-state.ts';
import {sanmaDefenseFinding} from '../src/mahjong-sanma-defense.ts';
import {sanmaShapeFinding,sanmaShapeEligible} from '../src/mahjong-sanma-efficiency.ts';
import {reviewSanmaValues} from './mahjong-sanma-value.mjs';
let four;
parentPort.on('message',async ({summary,actions})=>{
 try{
  if(summary.players===3){
   const frames=reviewDecisions(actions,summary,256);
   const values=reviewSanmaValues(frames,summary.game);
   const all=[];const perSeat=new Map(),defenseCounts=new Map();
   for(const d of frames){
    const defensive=(defenseCounts.get(d.seat)??0)<6?sanmaDefenseFinding(d,summary.game):null;
    if(defensive){all.push(defensive);defenseCounts.set(d.seat,(defenseCounts.get(d.seat)??0)+1);continue;}
    if(!sanmaShapeEligible(d,summary.game)||(perSeat.get(d.seat)??0)>=6)continue;
    perSeat.set(d.seat,(perSeat.get(d.seat)??0)+1);
    const finding=sanmaShapeFinding(d,summary.game);if(finding)all.push(finding);
   }
   const selected=selectReviewFindings([...values,...all.filter(f=>f.basis==='genbutsu'),...all.filter(f=>f.basis==='shape')],3);
   parentPort.postMessage(selected.length?{version:values.length?3:2,source:'sanma-rules',model:values.length?'sanma-rules-v3':'sanma-rules-v2',uuid:summary.uuid,findings:selected.slice(0,4)}:null);
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
