import {skirmishState,skirmishPrompt} from './skirmish.ts';
import {isKpRanking} from './kp-command.ts';
import {initializeKp,newKpState} from './kp.ts';
import type {KpEnv,KpMapping} from './kp.ts';
import {ensureQuizKp} from './quiz-kp.ts';
import {operateKp,previewMlBet,readKpState} from './kp-api.ts';
import {racingView} from './racing-kp.ts';
import {ML_DATA,closeMl,mlClosed,mlData,mlLineups,mlResults,seasonStats} from './mleague.ts';
import {enqueue,ensurePosts} from './racing-posts.ts';
import {ensureMahjongClaims} from './mahjong-claims.ts';
import {ensureUnite,uniteUid} from './unite.ts';
import {nameGiftHorse,decideEntries} from './racing-horses.ts';
import {crownFor} from './racing-crowns.ts';
import {DEBT_INTEREST_PERCENT,DEBT_INTERVAL_MINUTES,DEBT_MAX,debtOf} from './kp-debt.ts';
// @ts-expect-error Shared browser engine.
import {mlCard,mlOdds,mlOpen,mlStart} from '../../../js/mleague.js';
// @ts-expect-error Shared browser engine.
import {openRaceStart,raceCard,raceOdds,placeSlots,payoutFor} from '../../../js/racing.js';
interface Slash {id:string;guild_id?:string;member?:{user?:{id:string}};data?:{name?:string;options?:Array<{name:string;type?:number;options?:unknown[];value?:unknown}>}}
const clock=(at:number)=>new Date(at).toLocaleTimeString('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'});
const clean=(s:string)=>s.replace(/[@`*_~<>|\r\n]/g,'');
const money=(n:number)=>n.toLocaleString('ja-JP')+' KP';
/** Resolve the requested clock using the interaction's creation time, not retry time. */
export function slashRace(time:unknown,id:string){
 if(typeof time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!/^\d{15,22}$/.test(id))throw Error('発走時刻は 21:00 の形で指定してください。/keiba で確認できます。');
 const created=Number((BigInt(id)>>22n)+1420070400000n),day=Math.floor((created+9*3600000)/86400000)*86400000-9*3600000;
 const [h,m]=time.split(':').map(Number),today=day+(h*60+m)*60000;
 return today+86400000===openRaceStart(created)?today+86400000:today;
}
const jstDate=(at:number)=>new Date(at+9*3600000).toISOString().slice(0,10);
/** The match day /mleague and /mbet talk about: today (until midnight), otherwise the next one. */
export function mlDay(now:number){
 const today=jstDate(now);
 return [...new Set(ML_DATA.fixtures.map(f=>f.date))].sort().find(d=>d>=today)??null;
}
const created=(id:string)=>Number((BigInt(id)>>22n)+1420070400000n);
const friendlyError=(error:unknown,fallback:string)=>{const message=error instanceof Error?error.message:'';return /[ぁ-んァ-ヶ一-龯]/.test(message)&&!/SQL|D1_|kp_/.test(message)?message:fallback;};
// ---- /mbet: preview → 購入する / やめる ----
export const MBET_BUTTON=/^mbet:(buy|no):(\d{15,22})$/;
const MBET_TTL_MIN=10;
const draftsReady=new WeakSet<object>();
async function ensureMbetDrafts(env:KpEnv){
 if(draftsReady.has(env.DB))return;
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS ml_bet_drafts(id TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,match TEXT NOT NULL,player TEXT NOT NULL,amount INTEGER NOT NULL,odds INTEGER NOT NULL,created INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'open')").run();
 draftsReady.add(env.DB);
}
function betLines(d:Awaited<ReturnType<typeof mlData>>,fixture:{date:string;table:number;game:number},bet:{player:string;amount:number;odds:number}){
 const team=d.teams.find(t=>t.players.some(p=>p.name===bet.player));
 return `${Number(fixture.date.slice(5,7))}/${Number(fixture.date.slice(8,10))} ${fixture.table}卓 第${fixture.game}試合・**${clean(bet.player)}**のラス（4位）\nチーム ${clean(team?.name??'—')}\n掛け金 ${money(bet.amount)}／倍率 ${(bet.odds/10).toFixed(1)}倍\n的中時の払戻し ${money(payoutFor(bet.amount,bet.odds))}（掛け金込み）`;
}
// ---- /kp bets: the member's own predictions and tickets ----
type OwnBet={match?:string;raceId?:number;player?:string;horse?:number;type:string;amount:number;odds:number;status:string;payout:number;time:number};
const md=(date:string)=>`${Number(date.slice(5,7))}/${Number(date.slice(8,10))}`;
async function myBets(env:KpEnv,mapping:KpMapping,user:string){
 const state=await readKpState(env,mapping,user),d=await mlData(env);
 const label=(b:OwnBet)=>{
  if(b.match){const f=d.fixtures.find(x=>x.id===b.match);return `Mリーグ ${f?`${md(f.date)} ${f.table}卓 第${f.game}試合`:'試合'}・${clean(b.player??'')}の${b.type==='top'?'トップ':'ラス'}`;}
  const day=new Date((b.raceId??0)+9*3600000).toISOString();return `競馬 ${md(day.slice(0,10))} ${clock(b.raceId??0)}発走 ${b.horse}番 ${b.type==='place'?'複勝':'単勝'}`;
 };
 const all:OwnBet[]=[...(state.mlBets??[]),...(state.raceBets??[])].sort((a:OwnBet,b:OwnBet)=>b.time-a.time);
 const pending=all.filter(b=>b.status==='pending'),done=all.filter(b=>b.status!=='pending').slice(0,10);
 const odd=(b:OwnBet)=>`${(b.odds/10).toFixed(1)}倍`;
 const lines=[`🎫 **あなたの予想・馬券**`,'',`**未精算** ${pending.length}件・合計 ${money(pending.reduce((n,b)=>n+b.amount,0))}`];
 lines.push(...pending.slice(0,15).map(b=>`・${label(b)}　${money(b.amount)}（${odd(b)}・当たれば ${money(payoutFor(b.amount,b.odds))}）`));
 if(pending.length>15)lines.push(`・ほか ${pending.length-15}件`);
 if(!pending.length)lines.push('・なし');
 lines.push('',`**最近の精算**`);
 lines.push(...done.map(b=>b.status==='won'?`✅ ${label(b)}　的中 +${money(b.payout-b.amount)}（払戻し ${money(b.payout)}）`:b.status==='refunded'?`↩️ ${label(b)}　返金 ${money(b.payout)}`:`❌ ${label(b)}　外れ −${money(b.amount)}`));
 if(!done.length)lines.push('・まだありません');
 lines.push('','-# Mリーグは公式の結果発表後、競馬はゴールの約1分後に自動で精算されます。');
 return lines.join('\n').slice(0,1990);
}
/** A press on the /mbet preview. Buying uses the preview's id as the operation id, so a double press buys once. */
export async function mbetDecide(env:KpEnv,interaction:Slash&{data?:{custom_id?:string}},override?:KpMapping):Promise<{content:string;components:unknown[]}|null>{
 const m=MBET_BUTTON.exec(interaction.data?.custom_id??''),presser=interaction.member?.user?.id;if(!m||!presser)return null;
 const mapping=await initializeKp(env,override);if(!mapping||interaction.guild_id!==mapping.guildId)return null;
 await ensureMbetDrafts(env);
 const draft=await env.DB.prepare('SELECT id,user,match,player,amount,odds,created,status FROM ml_bet_drafts WHERE id=? AND guild=?').bind(m[2],mapping.guildId).first<{id:string;user:string;match:string;player:string;amount:number;odds:number;created:number;status:string}>();
 if(!draft||draft.user!==presser)return null;
 const d=await mlData(env),fixture=d.fixtures.find(f=>f.id===draft.match);
 const lines=fixture?betLines(d,fixture,draft):'';
 if(m[1]==='no'){
  await env.DB.prepare("UPDATE ml_bet_drafts SET status='cancelled' WHERE id=? AND status='open'").bind(draft.id).run();
  const now=await env.DB.prepare('SELECT status FROM ml_bet_drafts WHERE id=?').bind(draft.id).first<{status:string}>();
  if(now?.status!=='bought')return {content:`↩️ 購入をやめました（KPは使っていません）\n${lines}`,components:[]};
 }
 if(draft.status==='cancelled')return {content:`↩️ この予想はやめています（KPは使っていません）。買う場合はもう一度 /mbet を実行してください。`,components:[]};
 if(draft.status==='open'&&Date.now()>draft.created+MBET_TTL_MIN*60000)return {content:`⌛ 確認から${MBET_TTL_MIN}分を過ぎたので購入していません。もう一度 /mbet を実行してください。`,components:[]};
 try{
  const {result}=await operateKp(env,mapping,presser,'mbet-'+draft.id,'ml-bet',{match:draft.match,player:draft.player,type:'last',amount:draft.amount,odds:draft.odds}) as {result:{bet:{player:string;amount:number;odds:number}}};
  await env.DB.prepare("UPDATE ml_bet_drafts SET status='bought' WHERE id=?").bind(draft.id).run();
  const balance=Number((await env.DB.prepare('SELECT balance FROM kp_wallets WHERE guild=? AND user=?').bind(mapping.guildId,presser).first<{balance:number}>())?.balance??0);
  return {content:[`🀄 **ラス予想を購入しました**`,fixture?betLines(d,fixture,result.bet):'',`残高 ${money(balance)}`,'出場しなかった場合は返金。結果は公式発表後に自動で反映されます。'].join('\n'),components:[]};
 }catch(error){return {content:'⚠️ '+friendlyError(error,'購入結果を確認できませんでした。/kp の残高を確認してください。'),components:[]};}
}
async function mleagueView(env:KpEnv,now:number){
 const day=mlDay(now);if(!day)return 'Mリーグのレギュラーシーズン日程は終了しました。';
 const all=await mlResults(env),stats=seasonStats(all),d=await mlData(env),fixtures=d.fixtures.filter(f=>f.date===day),closed=await mlClosed(env),lineups=await mlLineups(env);
 const lines=[`🀄 **Mリーグ予想** ${Number(day.slice(5,7))}/${Number(day.slice(8,10))} 19:00開始`];
 for(const table of [...new Set(fixtures.map(f=>f.table))]){
  const games=fixtures.filter(f=>f.table===table).sort((a,b)=>a.game-b.game);
  if(!games[0].confirmed){lines.push(`\n**${table}卓**　公式の対戦カードを確認中（確認後に受付開始）`);continue;}
  lines.push(`\n**${table}卓**　${games.map(g=>`第${g.game}試合 ${all.has(g.id)?'終了':closed.has(g.id)&&now>=closed.get(g.id)!.at?'締切（開始報告）':mlOpen(d,g,now,all)?'受付中':now<mlStart(g)-19*3600000?'当日0時から':'締切'}`).join('／')}`);
  for(const g of games)if(lineups.has(g.id))lines.push(`第${g.game}試合 出場：${lineups.get(g.id)!.map(clean).join('・')}`);
  for(const p of mlCard(d,games[0])){const o=mlOdds(p,stats);lines.push(`${p.no}. ${clean(p.name)}（${clean(p.teamName)}）ラス ${(o.last/10).toFixed(1)}倍`);}
 }
 lines.push('\n買い方：/mbet → matchで試合 → playerで選手名・チーム・ラス倍率を確認 → amountに掛け金（例500）→ 確認画面で「購入する」。賭け方はラス（4位）予想のみ。','第1試合は19:00、第2試合は第1試合の結果が出るまで。始まったら /mclose で締め切り（開始後の予想は返金）。出なかった選手は返金。');
 return lines.join('\n');
}
/** A user option given as a mention (<@id>, <@!id>) or a bare ID. */
const discordUser=(value:unknown)=>String(value??'').trim().replace(/^<@!?(\d+)>$/,'$1');
/** Choices for /bet's horse field: the open race's horses with their odds, filtered by what was typed. Discord gives an
 * autocomplete three seconds, so only the open race is read (its crown and runners, side by side), not the whole view. */
export async function betChoices(env:KpEnv,interaction:Slash,override?:KpMapping,now=Date.now()):Promise<Array<{name:string;value:number}>>{
 const mapping=await initializeKp(env,override);if(!mapping)return [];
 const open=openRaceStart(now),[crown,entries]=await Promise.all([crownFor(env,mapping.guildId,open),decideEntries(env,mapping,open,now)]);
 const card={...raceCard(open,undefined,entries),...(crown?{name:crown.name}:{})},odds=raceOdds(card);
 const typed=String((interaction.data?.options as Array<{name:string;value?:unknown;focused?:boolean}>|undefined)?.find(o=>o.focused)?.value??'').trim();
 return card.horses.filter((h:{number:number;name:string})=>!typed||String(h.number)===typed||h.name.includes(typed))
  .map((h:{number:number;name:string})=>({name:`${h.number}番 ${h.name}　1着 ${(odds.win[h.number]/10).toFixed(1)}倍・${placeSlots(card.size)}着内 ${(odds.place[h.number]/10).toFixed(1)}倍｜${clock(open)}発走`.slice(0,100),value:h.number})).slice(0,25);
}
/** When the list is not ready in time, the gate numbers alone: the bet itself still checks the horse and fixes the odds. */
export function betFallbackChoices(now=Date.now()):Array<{name:string;value:number}>{
 const open=openRaceStart(now),size=raceCard(open).size;
 return Array.from({length:size},(_,i)=>({name:`${i+1}番（馬名・倍率の読み込みが遅れています。購入時に確定）｜${clock(open)}発走`.slice(0,100),value:i+1}));
}
/** An autocomplete answer within Discord's limit: the list if it is ready, otherwise the fallback. */
export async function withinDeadline<T>(work:Promise<T>,ms:number,fallback:()=>T):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([work,new Promise<T>(resolve=>{timer=setTimeout(()=>resolve(fallback()),ms);})]);}
 finally{clearTimeout(timer);}
}
/** Exact fixture IDs keep a selection stable across midnight. Old table-game codes remain readable. */
function mbetFixture(d:Awaited<ReturnType<typeof mlData>>,value:unknown,day:string|null){
 const exact=d.fixtures.find(f=>f.id===value);if(exact)return exact;
 const code=/^([12])-([12])$/.exec(String(value??''));
 return code?d.fixtures.find(f=>f.date===day&&f.table===Number(code[1])&&f.game===Number(code[2])):undefined;
}
const searchMl=(s:unknown)=>String(s??'').normalize('NFKC').replace(/\s+/g,'').toLocaleLowerCase('ja-JP');
/** Public race information only. Autocomplete never opens a wallet or buys a prediction. */
export async function mbetChoices(env:KpEnv,interaction:Slash):Promise<Array<{name:string;value:string}>>{
 const options=interaction.data?.options as Array<{name:string;value?:unknown;focused?:boolean}>|undefined,focused=options?.find(o=>o.focused);
 if(!focused||!['match','player'].includes(focused.name))return [];
 const now=Date.now(),day=mlDay(now),d=await mlData(env);
 const [results,closed,lineups]=await Promise.all([mlResults(env),mlClosed(env),mlLineups(env)]);
 const open=(f:typeof d.fixtures[number])=>f.confirmed&&!results.has(f.id)&&mlOpen(d,f,now,results)&&!(closed.has(f.id)&&now>=closed.get(f.id)!.at);
 const typed=searchMl(focused.value).slice(0,100);
 // An empty list says why in its only entry (value 'none'), instead of leaving the member guessing.
 const why=(name:string)=>[{name:('ℹ️ '+name).slice(0,100),value:'none'}];
 const today=new Date(now+9*3600000).toISOString().slice(0,10);
 if(focused.name==='match'){
  const day_=d.fixtures.filter(f=>f.date===day);
  const list=day_.filter(f=>open(f)).map(f=>{
   const teams=f.teams.map(id=>d.teams.find(t=>t.id===id)?.name??id).join('・');
   return {name:`${Number(f.date.slice(5,7))}/${Number(f.date.slice(8,10))} ${f.table}卓 第${f.game}試合｜${teams}｜ラス予想`.slice(0,100),value:f.id,search:searchMl(`${f.id} ${f.date} ${f.table}-${f.game} ${f.table}卓 第${f.game}試合 ${teams}`)};
  });
  const hits=list.filter(c=>!typed||c.search.includes(typed)).slice(0,25).map(({name,value})=>({name,value}));
  if(hits.length)return hits;
  if(list.length)return why(`「${String(focused.value).slice(0,20)}」に合う試合がありません。消して一覧から選んでください`);
  if(!day||!day_.length)return why('今シーズンの受付できる試合はありません');
  const md_=`${Number(day.slice(5,7))}/${Number(day.slice(8,10))}`;
  if(day>today)return why(`次の試合は ${md_}。受付は当日0時から（/mleague で出場候補を確認できます）`);
  if(!day_.every(f=>f.confirmed))return why('公式の対戦カードを確認中です。少し待ってからもう一度タップしてください');
  return why('今日の試合はすべて締め切りました（開始済み・結果待ち・開始報告あり）');
 }
 const chosen=options?.find(o=>o.name==='match')?.value;
 if(!chosen||chosen==='none')return why('先に match で試合を選んでください');
 const fixture=mbetFixture(d,chosen,day);if(!fixture)return why('その試合は見つかりません。match を選び直してください');
 if(!open(fixture))return why('この試合は締め切りました。match で別の試合を選んでください');
 const sitting=lineups.get(fixture.id),stats=seasonStats(results);
 const players=mlCard(d,fixture).filter((p:{name:string})=>!sitting||sitting.includes(p.name));
 const hits=players.filter((p:{name:string;teamName:string;no:number})=>!typed||searchMl(`${p.name} ${p.teamName}`).includes(typed)||String(p.no)===typed)
  .map((p:{name:string;teamName:string})=>({name:`${p.name}｜${p.teamName}｜ラス ${(mlOdds(p,stats).last/10).toFixed(1)}倍｜${sitting?'出場確定':'出場未確定・不出場は返金'}`.slice(0,100),value:p.name})).slice(0,25);
 return hits.length?hits:why(`「${String(focused.value).slice(0,20)}」に合う選手がいません。名前かチーム名の一部で探してください`);
}
export async function runKpCommand(env:KpEnv,interaction:Slash,override?:KpMapping,out?:{components?:unknown[]}):Promise<string>{
 const mapping=await initializeKp(env,override),user=interaction.member?.user?.id;
 if(!mapping||interaction.guild_id!==mapping.guildId||!user||!/^\d{15,22}$/.test(user))return 'このサーバーの本人の口座で利用してください。';
 const command=interaction.data?.name;if(!['kp','keiba','bet','mleague','mbet','mclose','kpgrant','paifulink','unitelink','horsename'].includes(command??''))return '対応していないコマンドです。';
 if(isKpRanking(interaction)){
  // A single server-side snapshot: current spendable KP, not stocks or lifetime earnings.
  const rows=(await env.DB.prepare('SELECT user,balance,RANK() OVER(ORDER BY balance DESC) AS rank,COUNT(*) OVER() AS total FROM kp_wallets WHERE guild=? ORDER BY balance DESC,user ASC LIMIT 10').bind(mapping.guildId).all<{user:string;balance:number;rank:number;total:number}>()).results;
  return '🏆 **KP残高ランキング**\n'+(rows.length?rows.map(r=>`${r.rank}位　<@${r.user}>　**${money(r.balance)}**`).join('\n'):`まだ口座がありません。`)+'\n\n現在使えるKPの上位10人。同額は同順位。株・馬などの評価額は含みません。'+(rows.length?`（全${rows[0].total}人）`:'');
 }
 const sub=interaction.data?.options?.length===1&&interaction.data.options[0].type===1&&!interaction.data.options[0].options?.length?interaction.data.options[0].name:null;
 if(command==='kp'&&interaction.data?.options?.length&&!['balance','bets'].includes(sub??''))return '/kp balance・/kp bets・/kp ranking から選んでください。';
 // A verified guild interaction can open an empty wallet, never a starting credit.
 await ensureQuizKp(env);
 await env.DB.batch([
  env.DB.prepare('INSERT OR IGNORE INTO kp_participants(guild,user) VALUES(?,?)').bind(mapping.guildId,user),
  env.DB.prepare('INSERT OR IGNORE INTO kp_wallets(guild,user) VALUES(?,?)').bind(mapping.guildId,user),
  env.DB.prepare('INSERT OR IGNORE INTO kp_state(guild,user,data) VALUES(?,?,?)').bind(mapping.guildId,user,JSON.stringify(newKpState())),
 ]);
 const balance=async()=>Number((await env.DB.prepare('SELECT balance FROM kp_wallets WHERE guild=? AND user=?').bind(mapping.guildId,user).first<{balance:number}>())?.balance??0);
 if(command==='kp'&&sub==='bets')return myBets(env,mapping,user);
 if(command==='kp'){
  const owed=await debtOf(env,mapping.guildId,user);
  const rows=(await env.DB.prepare('SELECT delta,kind,at FROM kp_ledger WHERE guild=? AND user=? ORDER BY at DESC,id DESC LIMIT 5').bind(mapping.guildId,user).all<{delta:number;kind:string;at:number}>()).results;
  const kinds:Record<string,string>={skirmish:'スカーミッシュの受取',dividend:'株配当','stock-migration':'株の移行端数',voice:'通話',quiz:'QUIZ',match:'試合',operation:'購入・取引',prize:'競馬賞金',mahjong:'雀魂',grant:'手動調整',unite:'ユナイト',debt:'借KP返済'};
  const challenge=await skirmishState(env,mapping.guildId,user);const prompt=challenge?skirmishPrompt(challenge):null;if(prompt&&out)out.components=prompt.components;
  return (prompt?prompt.content+'\n\n':'')+'🪙 あなたの残高：**'+money(await balance())+'**\n'+(owed?`💸 借KP：**${money(owed)}**（${DEBT_INTERVAL_MINUTES}分ごとに利子${DEBT_INTEREST_PERCENT}%、上限${money(DEBT_MAX)}。入ったKPから自動で返済。返し終わるまで株・馬・馬券・カジノ・高級品・指名は使えません）\n`:'')+(rows.length?'最近の入出金\n'+rows.map(r=>`${clock(r.at)} ${kinds[r.kind]??'口座'} ${r.delta>=0?'+':''}${money(r.delta)}`).join('\n'):'まだ入出金はありません。通話やQUIZで貯められます。')+'\n/keiba で出走表、/bet で馬券を買えます。';
 }
 if(command==='mleague')return mleagueView(env,Date.now());
 if(command==='horsename'){
  const named=await nameGiftHorse(env,mapping,user,interaction.data?.options?.find(o=>o.name==='name')?.value);
  if(named.post&&(env as {KP_EARNINGS_WEBHOOK_URL?:string}).KP_EARNINGS_WEBHOOK_URL){await ensurePosts(env);await enqueue(env,'horse-name:'+interaction.id,named.post,created(interaction.id));}
  return named.reply;
 }
 if(command==='unitelink'){
  // Admin-only. The next reads of the profile only record what is there; later ranked games are posted.
  const option=(key:string)=>interaction.data?.options?.find(o=>o.name===key)?.value;
  const target=discordUser(option('user')),uid=uniteUid(option('profile'));
  if(!/^\d{15,22}$/.test(target)||!uid)return '相手（@メンション か ユーザーID）と、UniteAPI のプロフィールURL（https://uniteapi.dev/p/数字）を指定してください。';
  await ensureUnite(env);
  const owner=await env.DB.prepare('SELECT user FROM unite_streaks WHERE guild=? AND uid=?').bind(mapping.guildId,uid).first<{user:string}>();
  if(owner&&owner.user!==target)return 'このプロフィールは別の口座に登録済みです。所有者の変更は自動では行いません。';
  await env.DB.batch([
   env.DB.prepare('DELETE FROM unite_links WHERE guild=? AND (user=? OR uid=?)').bind(mapping.guildId,target,uid),
   env.DB.prepare('INSERT INTO unite_links(guild,user,uid) VALUES(?,?,?)').bind(mapping.guildId,target,uid),
  ]);
  return `🔗 <@${target}> を UniteAPI（${uid}）と結び付けました。数分後から、ランクマッチの結果をアカンbotで速報し、勝ち +400〜800／負け −100〜500 KP（連勝・連敗で変動）を精算します。プロフィールが非公開だと読めません。`;
 }
 if(command==='paifulink'){
  // Admin-only. Replaces any earlier link of either side, so a wrong link is fixed by linking again.
  const option=(key:string)=>interaction.data?.options?.find(o=>o.name===key)?.value;
  const target=discordUser(option('user')),account=Number(option('account'));
  if(!/^\d{15,22}$/.test(target)||!Number.isSafeInteger(account)||account<1)return '相手（@メンション か ユーザーID）と雀魂のアカウントIDを指定してください。';
  await ensureMahjongClaims(env);
  await env.DB.batch([
   env.DB.prepare('DELETE FROM kp_mahjong_links WHERE guild=? AND (user=? OR account=?)').bind(mapping.guildId,target,account),
   env.DB.prepare('INSERT INTO kp_mahjong_links(guild,user,account) VALUES(?,?,?)').bind(mapping.guildId,target,account),
  ]);
  return `🔗 <@${target}> を雀魂アカウント ${account} と結び付けました。これ以降に見つかった対局は自動で精算します。`;
 }
 if(command==='kpgrant'){
  // Admin-only (checked before deferring). One ledger row per interaction, so a retried delivery
  // cannot pay twice; a negative amount takes no more than the balance (wallets cannot go below 0).
  const value=(key:string)=>interaction.data?.options?.find(o=>o.name===key)?.value;
  const target=discordUser(value('user')),amount=Number(value('amount')),reason=clean(String(value('reason')??'').trim()).slice(0,60);
  if(!/^\d{15,22}$/.test(target)||!Number.isSafeInteger(amount)||!amount||Math.abs(amount)>100000||!reason)return '相手・0以外のKP（±10万まで）・理由を指定してください。';
  await env.DB.batch([
   env.DB.prepare('INSERT OR IGNORE INTO kp_participants(guild,user) VALUES(?,?)').bind(mapping.guildId,target),
   env.DB.prepare('INSERT OR IGNORE INTO kp_wallets(guild,user) VALUES(?,?)').bind(mapping.guildId,target),
   env.DB.prepare('INSERT OR IGNORE INTO kp_state(guild,user,data) VALUES(?,?,?)').bind(mapping.guildId,target,JSON.stringify(newKpState())),
   env.DB.prepare(`INSERT OR IGNORE INTO kp_ledger(id,guild,user,delta,kind,at) SELECT ?,?,?,CASE WHEN ?<0 THEN -MIN(-?,balance) ELSE ? END,'grant',? FROM kp_wallets WHERE guild=? AND user=?`)
    .bind('grant:'+interaction.id,mapping.guildId,target,amount,amount,amount,created(interaction.id),mapping.guildId,target),
  ]);
  const row=await env.DB.prepare('SELECT delta FROM kp_ledger WHERE id=?').bind('grant:'+interaction.id).first<{delta:number}>();
  const moved=Number(row?.delta??0),signed=(moved<0?'−':'+')+money(Math.abs(moved));
  const after=Number((await env.DB.prepare('SELECT balance FROM kp_wallets WHERE guild=? AND user=?').bind(mapping.guildId,target).first<{balance:number}>())?.balance??0);
  // silent: nothing is posted anywhere; the reply is ephemeral like every /kpgrant reply.
  const silent=value('silent')===true;
  if(!silent&&(env as {KP_EARNINGS_WEBHOOK_URL?:string}).KP_EARNINGS_WEBHOOK_URL){await ensurePosts(env);await enqueue(env,'kp-grant:'+interaction.id,`🎁 <@${target}> に ${signed}（${reason}）`,created(interaction.id));}
  return `🎁 <@${target}> に ${signed}（${reason}）。残高 ${money(after)}`+(silent?'\n🤫 通知なし（稼ぎchには投稿していません）':'');
 }
 if(command==='mclose'){
  const value=(key:string)=>interaction.data?.options?.find(o=>o.name===key)?.value;
  const now=created(interaction.id),day=mlDay(now),code=/^([12])-([12])$/.exec(String(value('match')??''));
  const fixture=day&&code?(await mlData(env)).fixtures.find(f=>f.date===day&&f.table===Number(code[1])&&f.game===Number(code[2])):null;
  if(!fixture)return 'その試合はありません。/mleague で卓と試合を確認してください。';
  const text=value('at')===undefined?null:String(value('at')).trim();
  if(text!==null&&!/^([01]?\d|2[0-3]):[0-5]\d$/.test(text))return '時刻は 21:42 の形で指定してください。';
  const at=text===null?now:Date.parse(`${fixture.date}T${text.padStart(5,'0')}:00+09:00`);
  try{
   const done=await closeMl(env,mapping,user,fixture,at,now);
   const label=`${fixture.table}卓 第${fixture.game}試合`,time=clock(done.at);
   if((env as {KP_EARNINGS_WEBHOOK_URL?:string}).KP_EARNINGS_WEBHOOK_URL){await ensurePosts(env);await enqueue(env,`ml-close:${fixture.id}:${done.at}`,`⏰ <@${done.user}> が ${label}の開始（${time}）を報告。予想を締め切りました。${time}以降の予想は返金されます。`,now);}
   return `⏰ ${label} を ${time} 開始として締め切りました。${time}以降に買われた予想は、精算時に返金されます。`;
  }catch(error){const message=error instanceof Error?error.message:'';return /[ぁ-んァ-ヶ一-龯]/.test(message)?message:'締め切りを確認できませんでした。もう一度お試しください。';}
 }
 if(command==='mbet'){
  // A preview first: nothing is bought until the member presses 購入する on it (mbetDecide).
  const value=(key:string)=>interaction.data?.options?.find(o=>o.name===key)?.value;
  const d=await mlData(env),fixture=mbetFixture(d,value('match'),mlDay(created(interaction.id)));
  if(value('match')==='none'||value('player')==='none')return 'いまは予想できる候補がありません。候補の一覧に出ていた理由（ℹ️）を確認してください。受付状況は /mleague で見られます。';
  if(!fixture)return 'その試合はありません。/mleague で卓と試合を確認してください。';
  try{
   const {bet,balanceAfter}=await previewMlBet(env,mapping,user,{match:fixture.id,player:value('player'),type:'last',amount:value('amount')});
   await ensureMbetDrafts(env);
   await env.DB.prepare('INSERT OR IGNORE INTO ml_bet_drafts(id,guild,user,match,player,amount,odds,created) VALUES(?,?,?,?,?,?,?,?)').bind(interaction.id,mapping.guildId,user,fixture.id,bet.player,bet.amount,bet.odds,created(interaction.id)).run();
   if(out)out.components=[{type:1,components:[{type:2,style:3,label:'購入する',custom_id:`mbet:buy:${interaction.id}`},{type:2,style:2,label:'やめる',custom_id:`mbet:no:${interaction.id}`}]}];
   return [`🀄 **ラス予想の確認**（まだ購入していません）`,betLines(d,fixture,bet),`購入後の残高 ${money(balanceAfter)}`,`-# ${MBET_TTL_MIN}分以内に「購入する」を押してください。購入後の取消はできません。倍率が変わっていたら購入せずにお知らせします。`].join('\n');
  }catch(error){return friendlyError(error,'予想の内容を確認できませんでした。少し待ってからもう一度 /mbet を実行してください。');}
 }
 if(command==='keiba'){
  const view=await racingView(env,mapping),open=view.open,card={...raceCard(open.id,undefined,open.entries),...(open.crown?{name:open.crown}:{})},odds=raceOdds(card);
  return [`🏇 **${clean(card.name)}**`,`-# ${clock(open.id)}発走・${card.size}頭｜締切 ${clock(card.closeAt)}`,
   '',`**出走馬**　倍率は 1着当て / ${placeSlots(card.size)}着以内当て`,
   ...card.horses.map((h:{number:number;name:string})=>`\`${String(h.number).padStart(2)}\` ${clean(h.name)}　**${(odds.win[h.number]/10).toFixed(1)}倍** / ${(odds.place[h.number]/10).toFixed(1)}倍`),
   '',`🎫 **買い方**　\`/bet\` と打って、horse で馬を一覧から選び、amount に掛け金（例 500）を入れて送信`,
   `-# 券種は選ばなければ1着当て（${placeSlots(card.size)}着以内当てにもできる）／100 KP単位・1週間で合計5万KPまで（Mリーグ予想と合算）・購入後の取消不可・この返答は本人にだけ表示`].join('\n');
 }
 const options=interaction.data?.options??[];
 const value=(key:string)=>options.find(o=>o.name===key)?.value;
 try{
  // The race taking bets when the command was sent; an old client may still send race:HH:MM, which must match it.
  const raceId=value('race')===undefined?openRaceStart(created(interaction.id)):slashRace(value('race'),interaction.id);
  const result=await operateKp(env,mapping,user,interaction.id,'race-bet',{raceId,horse:value('horse'),amount:value('amount'),type:value('type')??'win'}) as {result:{bet:{raceId:number;horse:number;amount:number;odds:number;type:string}}};
  const bet=result.result.bet,view=await racingView(env,mapping,created(interaction.id)),card=raceCard(bet.raceId,undefined,view.open.id===bet.raceId?view.open.entries:undefined);
  const name=view.open.id===bet.raceId&&view.open.crown?view.open.crown:card.name,horse=card.horses[bet.horse-1]?.name??'';
  return [`🎫 **馬券を購入しました**`,`${clean(name)}（${clock(bet.raceId)}発走）`,`**${bet.horse}番 ${clean(horse)}** の${bet.type==='win'?'1着当て':placeSlots(card.size)+'着以内当て'}`,
   `掛け金 ${money(bet.amount)} × 確定倍率 ${(bet.odds/10).toFixed(1)}倍 ＝ 当たれば ${money(Math.floor(bet.amount*bet.odds/10))}`,`残高 ${money(await balance())}`,'-# 購入後の取消はできません。結果と払い戻しは自動で反映されます。'].join('\n');
 }catch(error){
  const message=error instanceof Error?error.message:'';
  return /[ぁ-んァ-ヶ一-龯]/.test(message)&&!/SQL|D1_|kp_/.test(message)?message:'購入結果を確認できませんでした。Activityの馬券履歴と /kp の残高を確認してください。';
 }
}
