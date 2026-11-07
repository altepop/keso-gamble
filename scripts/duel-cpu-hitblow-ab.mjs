// Strict same-secret A/B for Hit & Blow old vs candidate CPU policies.
// Baseline file is made from the fixed pre-change production commit in CI.
import {hitBlowAnswer} from '../js/duel-mini-games.js';
import {cpuHitBlow as previous} from '../duel-preview/cpu-hidden-games-prior.js';
import {cpuHitBlow as current} from '../duel-preview/cpu-hidden-games.js';
import {performance} from 'node:perf_hooks';
const count=Number(process.argv[2]??800);
if(!Number.isInteger(count)||count<1||count>5040)throw Error('Invalid sample count');
const all=[];
for(let a=0;a<10;a++)for(let b=0;b<10;b++)for(let c=0;c<10;c++)for(let d=0;d<10;d++)
 if(new Set([a,b,c,d]).size===4)all.push(''+a+b+c+d);
function random(seed){let s=seed>>>0||11;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};}
function solve(answer,policy,seed){
 const history=[],r=random(seed);let ms=0;
 for(let turn=1;turn<=20;turn++){
  const t=performance.now(),guess=policy(JSON.stringify({turn:'b',history}),'b','strong',r).guess;
  ms+=performance.now()-t;
  const fb=hitBlowAnswer(guess,answer);
  if(history.some(h=>h.guess===guess))throw Error('Repeated guess for '+answer+': '+guess);
  history.push({by:'b',guess,...fb});
  if(fb.hit===4)return {turns:turn,ms};
 }
 throw Error('No solve after 20 guesses: '+answer);
}
const stat={codes:count,oldMean:0,newMean:0,oldWorst:0,newWorst:0,
 oldBetter:0,newBetter:0,same:0,oldCpuMs:0,newCpuMs:0,
 oldTurns:0,newTurns:0,hardCases:[],histOld:{},histNew:{}};
const seedRng=random(0x183da40b),chosen=[];
const seen=new Set();
while(chosen.length<count){const idx=Math.floor(seedRng()*all.length);if(!seen.has(idx)){seen.add(idx);chosen.push(all[idx]);}}
for(let i=0;i<count;i++){
 const answer=chosen[i],rngSeed=0x33aa7cd1+i*97;
 const a=solve(answer,previous,rngSeed),b=solve(answer,current,rngSeed);
 stat.oldTurns+=a.turns;stat.newTurns+=b.turns;
 stat.oldWorst=Math.max(stat.oldWorst,a.turns);stat.newWorst=Math.max(stat.newWorst,b.turns);
 stat.oldCpuMs+=a.ms;stat.newCpuMs+=b.ms;
 stat.histOld[a.turns]=(stat.histOld[a.turns]??0)+1;
 stat.histNew[b.turns]=(stat.histNew[b.turns]??0)+1;
 if(a.turns<b.turns)stat.oldBetter++;else if(a.turns>b.turns)stat.newBetter++;else stat.same++;
 if(b.turns>=a.turns+2&&stat.hardCases.length<12)stat.hardCases.push({answer,old:a.turns,new:b.turns});
}
stat.oldMean=Math.round(stat.oldTurns*1000/count)/1000;
stat.newMean=Math.round(stat.newTurns*1000/count)/1000;
stat.oldCpuMs=Math.round(stat.oldCpuMs);
stat.newCpuMs=Math.round(stat.newCpuMs);
console.log('HITBLOW_AB_RESULT '+JSON.stringify(stat));
