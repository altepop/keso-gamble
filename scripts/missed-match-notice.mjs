// One-off owner-approved correction: record a finished match that the monitor missed (the match API never
// returned it), so win/loss streaks and daily/ACT records count it. Writes ONE row to notifications with
// sent=1 (nothing is posted) and a "manual-" match id. No KP, ledger, reward, mastery or race rows change.
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export const D1_B_ID='bf23ab40-814f-4626-9e0b-36739ac41750';
const MODES=new Set(['spikerush','competitive','unrated_normal','swiftplay','hurm','escalation','deathmatch','skirmish_2v2']);
export async function run({discordId,mode,outcome,endedAt,query}){
 if(!/^\d{15,22}$/.test(discordId??''))throw Error('discord_id must be a Discord user ID');
 if(!MODES.has(mode))throw Error('Unsupported mode');
 if(!['win','loss','draw'].includes(outcome))throw Error('outcome must be win, loss or draw');
 const at=Date.parse(endedAt);
 if(!Number.isFinite(at)||at>Date.now()||at<Date.now()-30*86400000)throw Error('ended_at must be an ISO time within the last 30 days');
 const links=await query('SELECT riot FROM kp_accounts WHERE user=?',[discordId]);
 if(links.length!==1)throw Error('Expected exactly one linked Riot account');
 const riot=links[0].riot;
 const near=await query('SELECT count(*) AS n FROM notifications WHERE riot_id=? AND ended_at BETWEEN ? AND ?',[riot,at-5*60000,at+5*60000]);
 if(Number(near[0]?.n)>0)throw Error('A match is already recorded within 5 minutes of that time');
 // ACT of the closest recorded match of the same mode (the missed one was played between them).
 const act=(await query('SELECT act_id,act_name FROM notifications WHERE riot_id=? AND mode=? AND act_id IS NOT NULL ORDER BY abs(ended_at-?) LIMIT 1',[riot,mode,at]))[0]??{act_id:null,act_name:null};
 const id='manual-'+at;
 const label={spikerush:'スパイクラッシュ',competitive:'コンペ',unrated_normal:'アンレート',swiftplay:'スイフトプレイ',hurm:'チームデスマッチ',escalation:'エスカレーション',deathmatch:'デスマッチ',skirmish_2v2:'スカーミッシュ'}[mode];
 const inserted=await query('INSERT INTO notifications(riot_id,match_id,message,ended_at,mode,act_id,act_name,outcome,sent,team_id) VALUES(?,?,?,?,?,?,?,?,1,NULL) ON CONFLICT DO NOTHING RETURNING match_id',
  [riot,id,`（手動補正）取りこぼした${label}の試合：${outcome==='win'?'勝ち':outcome==='loss'?'負け':'引き分け'}`,at,mode,act.act_id,act.act_name,outcome]);
 if(inserted.length!==1)throw Error('Not recorded (already present)');
 const rows=await query('SELECT outcome FROM notifications WHERE riot_id=? AND mode=? AND act_id IS ? ORDER BY ended_at DESC,match_id DESC LIMIT 60',[riot,mode,act.act_id]);
 let streak=0;for(const r of rows){if(r.outcome!==rows[0].outcome||r.outcome==='draw')break;streak++;}
 return {mode:label,outcome,endedAt:new Date(at).toISOString(),current:rows[0]?.outcome==='draw'?'—':streak+(rows[0]?.outcome==='win'?'連勝':'連敗')};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const {CLOUDFLARE_API_TOKEN:token,CLOUDFLARE_ACCOUNT_ID:account,DISCORD_ID:discordId,MODE:mode,OUTCOME:outcome,ENDED_AT:endedAt,GITHUB_STEP_SUMMARY:file}=process.env;
 if(!token||!account)throw Error('Cloudflare credentials are missing');
 const api='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+D1_B_ID+'/query';
 const query=async(sql,params)=>{
  if(!/^\s*(SELECT|INSERT INTO notifications\()/i.test(sql))throw Error('Only reads and one notifications row are allowed');
  const res=await fetch(api,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)});
  if(!res.ok)throw Error('D1 HTTP '+res.status);
  const body=await res.json();
  if(body.success!==true||!body.result?.[0]?.success)throw Error('D1 query failed');
  return body.result[0].results;
 };
 const r=await run({discordId,mode,outcome,endedAt,query});
 const text=`## Missed match recorded\n\n${r.mode}・${r.outcome}・ended ${r.endedAt}. Current streak in that mode and ACT (latest match): ${r.current}. Nothing was posted; no KP changed.\n`;
 console.log(text);if(file)appendFileSync(file,text);
}
