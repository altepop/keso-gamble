import type {KpEnv} from './kp.ts';
import {ensurePosts} from './racing-posts.ts';
/** Call only after match completion, subject identity and KP link/start eligibility are verified. */
export async function settleUntilWin(env:KpEnv,guild:string,user:string,match:string,start:number,outcome:string|null){
 if(outcome==='win'){
  await env.DB.prepare("UPDATE kp_directives SET status='completed' WHERE guild=? AND target=? AND task='competitive_until_win' AND status='active' AND at<=?").bind(guild,user,start).run();
 }else if(outcome==='loss'||outcome==='draw'){
  const d=await env.DB.prepare("SELECT id FROM kp_directives WHERE guild=? AND target=? AND task='competitive_until_win' AND status='active' AND at<=?").bind(guild,user,start).first<{id:string}>();
  if(!d)return;
  await ensurePosts(env);
  const body={content:`⚑ <@${user}> ${outcome==='loss'?'負けたで。':'引き分けや。'}負け怖コンペはまだ終わらへん！\n次もコンペやで。1勝したら指令達成や。追加の指令代はかからへん。`,allowed_mentions:{parse:[],users:[user]}};
  // One reminder per directive and real match, even if the API or inbox retries it.
  await env.DB.prepare('INSERT OR IGNORE INTO kp_posts(id,body,at) VALUES(?,?,?)').bind('until-win:'+d.id+':'+match,JSON.stringify(body),Date.now()).run();
 }
}
