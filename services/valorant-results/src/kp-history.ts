import {ensureSpikeGrowth} from './spikerush-growth.ts';
import type { KpEnv } from './kp.ts';
// The Activity's 入出金履歴: every wallet movement from the ledger (VALORANT, QUIZ, 通話, 雀魂, ユナイト, 手動調整,
// 賞金, 借KP返済, 配当, Activityの操作…), newest first. A VALORANT loss debit (penalty:<id>) is folded into its match
// so one game is one line with its net amount.
export interface HistoryEntry {id:string;kind:string;label:string;detail:string;delta:number;time:number}
const MODES:Record<string,string>={competitive:'コンペ',unrated:'アンレ',swiftplay:'スイフト',spikerush:'スパイクラッシュ',deathmatch:'デスマッチ',teamdeathmatch:'チームデスマッチ',escalation:'エスカレーション',replication:'レプリケーション'};
const KINDS:Record<string,string>={quiz:'VCT QUIZ',voice:'通話',mahjong:'雀魂',unite:'ポケモンユナイト',grant:'手動調整',prize:'競馬の賞金（馬主）',debt:'借KP返済',dividend:'株の配当','stock-migration':'株の移行端数',test:'テスト'};
function gameLabel(id:string){
 const op=id.split(':').slice(3).join(':')||id;
 if(op.startsWith('race-settle:'))return '競馬の払戻し';
 if(op.startsWith('ml-settle:'))return 'Mリーグの精算';
 if(op.startsWith('mbet-'))return 'Mリーグ予想';
 return 'Activityの操作（株・馬券・カジノなど）';
}
export async function ledgerHistory(env:KpEnv,guild:string,user:string,limit=100):Promise<HistoryEntry[]>{
 const rows=(await env.DB.prepare('SELECT id,delta,kind,at FROM kp_ledger WHERE guild=? AND user=? ORDER BY at DESC,id DESC LIMIT ?').bind(guild,user,limit+20).all<{id:string;delta:number;kind:string;at:number}>()).results;
 const matchIds=[...new Set(rows.filter(r=>r.kind==='match').map(r=>r.id.replace(/^penalty:/,'')))];
 const events=new Map<string,{mode:string;match:string}>();
 for(let i=0;i<matchIds.length;i+=50){
  const ids=matchIds.slice(i,i+50);
  for(const e of (await env.DB.prepare(`SELECT id,mode,match FROM kp_events WHERE id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all<{id:string;mode:string;match:string}>()).results)events.set(e.id,e);
 }
 const spikeNotes=new Map<string,string>();
 const spikeIds=[...events].filter(([,e])=>e.mode==='spikerush').map(([id])=>id);
 if(spikeIds.length){
  await ensureSpikeGrowth(env);
  for(let i=0;i<spikeIds.length;i+=50){const ids=spikeIds.slice(i,i+50);for(const r of (await env.DB.prepare(`SELECT id,note FROM spike_rewards WHERE id IN (${ids.map(()=>'?').join(',')}) AND guild=? AND user=?`).bind(...ids,guild,user).all<{id:string;note:string}>()).results)spikeNotes.set(r.id,r.note);}
 }
 const out:HistoryEntry[]=[],byEvent=new Map<string,HistoryEntry>();
 for(const r of rows){
  if(r.kind==='match'&&(events.has(r.id)||r.id.startsWith('penalty:'))){
   const key=r.id.replace(/^penalty:/,''),e=events.get(key),seen=byEvent.get(key);
   if(seen){seen.delta+=Number(r.delta);seen.time=Math.max(seen.time,r.at);continue;}
   const entry={id:key,kind:'match',label:'VALORANT '+(e?MODES[e.mode]??e.mode:'試合'),detail:(e?.match??'')+(spikeNotes.has(key)?' '+spikeNotes.get(key):''),delta:Number(r.delta),time:r.at};
   byEvent.set(key,entry);out.push(entry);continue;
  }
  const label=r.kind==='match'?(r.id.startsWith('rank-down:')?'VALORANT ランク降格':r.id.startsWith('rank-up:')?'VALORANT ランク昇格':'VALORANT'):r.kind==='game'?gameLabel(r.id):KINDS[r.kind]??r.kind;
  out.push({id:r.id,kind:r.kind,label,detail:'',delta:Number(r.delta),time:r.at});
 }
 return out.sort((a,b)=>b.time-a.time).slice(0,limit);
}
