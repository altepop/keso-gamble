// Golden temple Hold & Respin. Pure server-side draw, replay-only client data.
// The legacy 3-altar ceremony is readable for older settled results, but new spins use this 15-cell feature.
// Cells are row-major in a 5 x 3 board; units are tenths of a bet to avoid floating-point KP.
export const TEMPLE_COLUMNS=5,TEMPLE_ROWS=3,TEMPLE_SIZE=TEMPLE_COLUMNS*TEMPLE_ROWS,TEMPLE_RESPINS=3;
export const TEMPLE_INITIAL_CELLS=Object.freeze([0,1,5,6,10,11]);
export const TEMPLE_COIN_TABLE=Object.freeze([[2,80],[3,140],[5,300],[8,200],[10,150],[15,60],[20,40],[50,20],[100,8],[300,2]]);
export const TEMPLE_FILL_UNITS=100; // Full board: an additional 10x.
const draw=(rand,n)=>{
 const v=rand(n);
 if(!Number.isInteger(v)||v<0||v>=n)throw Error('黄金神殿の抽選が不正です。');
 return v;
};
function coin(rand){
 let n=draw(rand,1000);
 for(const [units,weight] of TEMPLE_COIN_TABLE){if(n<weight)return units;n-=weight;}
 throw Error('黄金コインの配当抽選が不正です。');
}
export const templeCoinKP=(bet,units)=>Math.floor(bet*units/10);
export const templeGridAt=(bonus,step=0)=>{
 const grid=Array.isArray(bonus?.grid)&&bonus.grid.length===TEMPLE_SIZE?[...bonus.grid]:Array(TEMPLE_SIZE).fill(0);
 const steps=Array.isArray(bonus?.steps)?bonus.steps:[];
 for(const turn of steps.slice(0,Math.max(0,step)))for(const landed of turn.landed??[])if(Number.isInteger(landed.cell)&&landed.cell>=0&&landed.cell<TEMPLE_SIZE)grid[landed.cell]=landed.units;
 return grid;
};
export function createTempleRespin(bet,rand){
 if(!Number.isSafeInteger(bet)||bet<1)throw Error('神殿の賭け金が不正です。');
 const grid=Array(TEMPLE_SIZE).fill(0);
 for(const cell of TEMPLE_INITIAL_CELLS)grid[cell]=coin(rand);
 const steps=[];let remaining=TEMPLE_RESPINS;
 // Finite even in the all-hit random fixture; every landed coin remains fixed.
 while(remaining>0&&steps.length<36&&grid.some(u=>u===0)){
  const landed=[];
  for(let cell=0;cell<TEMPLE_SIZE;cell++){
   if(grid[cell]!==0)continue;
   if(draw(rand,1000)<80){const units=coin(rand);grid[cell]=units;landed.push({cell,units});}
  }
  remaining=landed.length?TEMPLE_RESPINS:remaining-1;
  if(!grid.includes(0))remaining=0;
  steps.push({landed,remaining});
 }
 // The browser gets the full predetermined timeline; it must never draw or settle again.
 const initial=Array(TEMPLE_SIZE).fill(0);
 for(const cell of TEMPLE_INITIAL_CELLS)initial[cell]=grid[cell];
 // Initial cells were never mutable, so the above is the exact starting layout.
 const filled=!grid.includes(0),units=grid.reduce((a,b)=>a+b,0)+(filled?TEMPLE_FILL_UNITS:0);
 const total=templeCoinKP(bet,units);
 return {kind:'temple',mode:'respin',grid:initial,steps,filled,fillUnits:filled?TEMPLE_FILL_UNITS:0,total};
}
