// Synthetic comparisons, not measured player averages or production data.
import {initialSpikeProfile,quoteSpike,SPIKE_ROSTER} from '../../services/valorant-results/src/spikerush-growth.ts';
const agents=SPIKE_ROSTER.agents,m={agent:agents[0].id,kills:6,assists:2,deaths:6,win:true,startedAt:0,endedAt:480000};
let p=initialSpikeProfile();
const stages=new Set([0,5,10,20,30,40,58,100]);
for(let n=0;n<=100;n++){
 if(stages.has(n)){
  const average=winRate=>{
   let total=0,carryN='0',carryD='1';
   for(let i=0;i<600;i++){
    const q=quoteSpike({...p,recent:[],carryN,carryD},{...m,win:i%100<winRate*100},1);
    total+=q.amount;({carryN,carryD}=q.next);
   }
   return +(total/600).toFixed(3);
  };
  console.log(JSON.stringify({games:n,unlocked:p.unlocked,win0:average(0),win50:average(.5),win65:average(.65),win100:average(1)}));
 }
 p=quoteSpike(p,{...m,agent:agents[n%agents.length].id},1).next;
}
