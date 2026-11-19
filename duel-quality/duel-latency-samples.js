// Read-only, opt-in measurement model for confirmed UI updates.
// This does not instrument the network and cannot establish end-to-end latency.
export function summarizeDuelRenderSamples(samples, {maxSamples=100}={}){
 if(!Array.isArray(samples)||!Number.isInteger(maxSamples)||maxSamples<1||maxSamples>1000)return null;
 const clean=samples.filter(s=>s&&['othello','connect4','gomoku','hitblow','bluffdice','poker'].includes(s.game)
  &&Number.isFinite(s.ms)&&s.ms>=0&&s.ms<=60000&&s.confirmed===true)
  .slice(-maxSamples);
 if(!clean.length)return {count:0,byGame:{}};
 const byGame={};
 for(const game of ['othello','connect4','gomoku','hitblow','bluffdice','poker']){
  const sorted=clean.filter(s=>s.game===game).map(s=>s.ms).sort((a,b)=>a-b);
  if(!sorted.length)continue;
  const percentile=p=>sorted[Math.ceil(p*sorted.length)-1];
  byGame[game]={count:sorted.length,p50:percentile(.5),p95:percentile(.95),max:sorted[sorted.length-1]};
 }
 return {count:clean.length,byGame};
}
