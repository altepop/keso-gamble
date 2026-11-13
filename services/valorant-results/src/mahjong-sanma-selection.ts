import type {SanmaRuleFinding} from './mahjong-sanma-report.ts';

// Editorial priority within the existing bounded analysis, not a skill/EV score.
// Prefer demonstrated value gaps, then lost shanten, then lost ukeire. A mere
// agreement never proves educational value, including in older signed reports.
function priority(f:SanmaRuleFinding):[number,number,number]{
 if(f.basis==='placement')return [5,f.recommendedValue.min-f.actualValue.max,0];
 if(f.basis==='genbutsu'&&f.river)return [4,f.shanten,0];
 if(f.basis==='tsumo-value')return [3,f.recommendedValue.min-f.actualValue.max,f.recommendedValue.live-f.actualValue.live];
 if(f.basis==='shape'){
  const gap=f.actualMetric.shanten-f.recommendedMetric.shanten;
  return [gap>0?2:1,gap>0?gap:f.recommendedMetric.ukeire-f.actualMetric.ukeire,0];
 }
 return [0,f.shanten,0];
}
export function selectSanmaFindings(findings:SanmaRuleFinding[],limit=4):SanmaRuleFinding[]{
 if(!Number.isInteger(limit)||limit<1||limit>4)return [];
 const ranked=findings.filter(f=>f.actual!==f.recommended).slice().sort((a,b)=>{
  const x=priority(a),y=priority(b);
  return y[0]-x[0]||y[1]-x[1]||y[2]-x[2]||a.round-b.round||a.turn-b.turn||a.seat-b.seat;
 });
 const decisions=new Set<string>();
 const unique=ranked.filter(f=>{
  const key=[f.seat,f.round,f.turn].join(':');
  if(decisions.has(key))return false;decisions.add(key);return true;
 });
 const seats=new Set<number>(),chosen:SanmaRuleFinding[]=[];
 // Give other represented players a useful comparison before a second note
 // for one player; never reserve a slot for praise or manufacture a finding.
 for(const f of unique){
  if(seats.has(f.seat))continue;
  seats.add(f.seat);chosen.push(f);if(chosen.length===limit)return chosen;
 }
 for(const f of unique){
  if(chosen.includes(f))continue;
  chosen.push(f);if(chosen.length===limit)break;
 }
 return chosen;
}
