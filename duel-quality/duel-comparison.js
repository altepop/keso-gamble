import {summarizeDuelRenderSamples} from './duel-latency-samples.js';
// Only compare same acquisition method and confirmed display outcomes.
export function compareDuelLocalRenderSamples(samples,{minimumCount=5}={}){
 if(!Array.isArray(samples)||!Number.isInteger(minimumCount)||minimumCount<1)return null;
 const suitable=samples.filter(s=>s?.method==='local-gesture-to-confirmed-render'&&s.confirmed===true);
 const summary=summarizeDuelRenderSamples(suitable);
 if(!summary)return null;
 const ready=Object.entries(summary.byGame).filter(([,v])=>v.count>=minimumCount);
 return {
  eligible:ready.map(([game,v])=>({game,...v})).sort((a,b)=>a.p50-b.p50),
  insufficient:Object.entries(summary.byGame).filter(([,v])=>v.count<minimumCount).map(([game,v])=>({game,count:v.count})),
  note:'端末内の操作から確定表示までの参考時間。同じ計測方法と必要件数の種目だけ比較する。相手への反映保証ではない。',
  samplesObserved:summary.count
 };
}
