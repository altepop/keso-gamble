// Isolated, killable optional analysis. Never contains a Discord or D1 client.
import {parentPort,workerData} from 'node:worker_threads';
import {buildC3Cases} from '../src/mahjong-c3-cases.ts';
import {sampleSanmaDecisions} from '../src/mahjong-sanma-sampling.ts';
import {selectSanmaFindings} from '../src/mahjong-sanma-selection.ts';
import {reviewDecisions} from '../src/mahjong-review-state.ts';
import {sanmaDefenseFinding} from '../src/mahjong-sanma-defense.ts';
import {sanmaShapeFinding,sanmaShapeEligible} from '../src/mahjong-sanma-efficiency.ts';
import {reviewSanmaValues} from './mahjong-sanma-value.mjs';
let four;
parentPort.on('message',async ({summary,actions})=>{
 try{
  if(summary.players===3){
   const frames=reviewDecisions(actions,summary,256,undefined,undefined,true);
   const valueDiagnostics={};
   const values=reviewSanmaValues(frames,summary.game,{diagnostics:valueDiagnostics});
   const shapeEligible=frames.filter(d=>sanmaShapeEligible(d,summary.game));
   const shapeFrames=sampleSanmaDecisions(shapeEligible,6);
   const defenseFrames=sampleSanmaDecisions(frames.filter(d=>!d.riichi[d.seat]&&d.riichi.filter(Boolean).length===1&&d.turn>=6&&d.turn<=24),6);
   const all=[...values];
   for(const d of defenseFrames){const f=sanmaDefenseFinding(d,summary.game);if(f)all.push(f);}
   for(const d of shapeFrames){const f=sanmaShapeFinding(d,summary.game);if(f)all.push(f);}
   const selected=selectSanmaFindings(all);
   const report=selected.length?{version:4,source:'sanma-rules',model:'sanma-rules-v4',uuid:summary.uuid,findings:selected.slice(0,4)}:null;
   parentPort.postMessage({kind:'equal-review-result-v1',report,diagnostic:{status:report?'report':frames.length?'no-findings':'no-decisions',replayed:frames.length,rounds:new Set(frames.map(d=>d.round)).size,shapeEligible:shapeEligible.length,shapeSampled:shapeFrames.length,defenseSampled:defenseFrames.length,valueEvaluated:valueDiagnostics.evaluatedCases,valueStatus:valueDiagnostics.status,findings:selected.length}});
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
 }catch{parentPort.postMessage({kind:'equal-review-result-v1',report:null,diagnostic:{status:'analysis-error'}});}
});
