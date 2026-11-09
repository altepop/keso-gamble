// Payment arithmetic, NOT a yaku/hand/strategy evaluator. Rule-dependent
// honba values must be supplied explicitly; unknown rules are not guessed.
export interface SanmaPointInput {han:number;fu:number;yakuman:number;dealer:boolean;tsumo:boolean;honba:number;sticks:number;kiriage?:boolean;ronPerHonba:number;tsumoPerHonba:number}
const int=(v:unknown,a:number,b:number)=>Number.isSafeInteger(v)&&Number(v)>=a&&Number(v)<=b;
const round100=(n:number)=>Math.ceil(n/100)*100;
export function sanmaPoints(v:SanmaPointInput):{main:number;additional:number;paid:number;winner:number}|null{
 if(!v||!int(v.yakuman,0,6)||!int(v.han,0,112)||!int(v.fu,0,160)||typeof v.dealer!=='boolean'||typeof v.tsumo!=='boolean'||!int(v.honba,0,100)||!int(v.sticks,0,100)||!int(v.ronPerHonba,0,5000)||v.ronPerHonba%100||!int(v.tsumoPerHonba,0,5000)||v.tsumoPerHonba%100||(v.kiriage!==undefined&&typeof v.kiriage!=='boolean'))return null;
 if(!v.yakuman&&(!v.han||v.han<5&&!(v.fu===25||v.fu>=20&&v.fu%10===0)))return null;
 const base=v.yakuman?8000*v.yakuman:v.han>=13?8000:v.han>=11?6000:v.han>=8?4000:v.han>=6?3000:v.han>=5?2000:Math.min(2000,v.fu*2**(v.han+2));
 const b=v.kiriage&&((v.han===4&&v.fu===30)||(v.han===3&&v.fu===60))?Math.max(2000,base):base;
 if(!v.tsumo){const main=round100(b*(v.dealer?6:4))+v.honba*v.ronPerHonba;return {main,additional:0,paid:main,winner:main+v.sticks*1000};}
 // Standard tsumo-loss sanma: exactly two payers. Non-dealer receives
 // dealer's 2x base + the other child's 1x; dealer receives 2x from each.
 const main=round100(b*2)+v.honba*v.tsumoPerHonba,additional=round100(b*(v.dealer?2:1))+v.honba*v.tsumoPerHonba;
 return {main,additional,paid:main+additional,winner:main+additional+v.sticks*1000};
}
