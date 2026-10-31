import {roulettePayout} from './engine.js?v=web-006591321c248406';
export const wheelOrder=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
export const redNumbers=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
export const covered=(type,choice,n)=>roulettePayout(type,choice,n,100)>0;
export const outcomeAngle=n=>(360-wheelOrder.indexOf(n)*360/37)%360;
export function wheelView(type,choice,numbers=[]){
 const point=(angle,r)=>{const a=(angle-90)*Math.PI/180;return [160+Math.cos(a)*r,160+Math.sin(a)*r];};
 return `<svg viewBox="0 0 320 320" role="img" aria-label="0から36のルーレット盤"><g>${wheelOrder.map((n,i)=>{
  const angle=i*360/37,a=point(angle-180/37,155),b=point(angle+180/37,155),t=point(angle,133),selected=type==='numbers'?numbers.includes(n):covered(type,choice,n);
  return `<g data-pocket="${n}" class="wheel-pocket ${selected?'selected':''}"><path d="M160 160 L${a} A155 155 0 0 1 ${b} Z" fill="${n===0?'#078650':redNumbers.has(n)?'#b42338':'#111827'}"/><text x="${t[0]}" y="${t[1]}" transform="rotate(${angle} ${t[0]} ${t[1]})" text-anchor="middle" dominant-baseline="central">${n}</text></g>`;
 }).join('')}</g><circle cx="160" cy="160" r="106" fill="#071126" stroke="#cab06a" stroke-width="3"/></svg>`;
}
