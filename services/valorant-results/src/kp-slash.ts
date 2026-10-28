import {isKpRanking} from './kp-command.ts';
import {initializeKp,newKpState} from './kp.ts';
import type {KpEnv,KpMapping} from './kp.ts';
import {ensureQuizKp} from './quiz-kp.ts';
import {operateKp} from './kp-api.ts';
import {racingView} from './racing-kp.ts';
import {ML_DATA,closeMl,mlClosed,mlData,mlLineups,mlResults,seasonStats} from './mleague.ts';
import {enqueue,ensurePosts} from './racing-posts.ts';
import {ensureMahjongClaims} from './mahjong-claims.ts';
import {ensureUnite,uniteUid} from './unite.ts';
// @ts-expect-error Shared browser engine.
import {mlCard,mlOdds,mlOpen,mlStart} from '../../../js/mleague.js';
// @ts-expect-error Shared browser engine.
import {openRaceStart,raceCard,raceOdds,placeSlots} from '../../../js/racing.js';
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
 lines.push('\n例：/mbet match:1-1 player:3 amount:500（その選手のラスに賭ける）','第1試合は19:00、第2試合は第1試合の結果が出るまで。始まったら /mclose で締め切り（開始後の予想は返金）。出なかった選手は返金。');
 return lines.join('\n');
}
/** A user option given as a mention (<@id>, <@!id>) or a bare ID. */
const discordUser=(value:unknown)=>String(value??'').trim().replace(/^<@!?(\d+)>$/,'$1');
export async function runKpCommand(env:KpEnv,interaction:Slash,override?:KpMapping):Promise<string>{
 const mapping=await initializeKp(env,override),user=interaction.member?.user?.id;
 if(!mapping||interaction.guild_id!==mapping.guildId||!user||!/^\d{15,22}$/.test(user))return 'このサーバーの本人の口座で利用してください。';
 const command=interaction.data?.name;if(!['kp','keiba','bet','mleague','mbet','mclose','kpgrant','paifulink','unitelink'].includes(command??''))return '対応していないコマンドです。';
 if(isKpRanking(interaction)){
  // A single server-side snapshot: current spendable KP, not stocks or lifetime earnings.
  const rows=(await env.DB.prepare('SELECT user,balance,RANK() OVER(ORDER BY balance DESC) AS rank,COUNT(*) OVER() AS total FROM kp_wallets WHERE guild=? ORDER BY balance DESC,user ASC LIMIT 10').bind(mapping.guildId).all<{user:string;balance:number;rank:number;total:number}>()).results;
  return '🏆 **KP残高ランキング**\n'+(rows.length?rows.map(r=>`${r.rank}位　<@${r.user}>　**${money(r.balance)}**`).join('\n'):`まだ口座がありません。`)+'\n\n現在使えるKPの上位10人。同額は同順位。株・馬などの評価額は含みません。'+(rows.length?`（全${rows[0].total}人）`:'');
 }
 if(command==='kp'&&interaction.data?.options?.length&&!(interaction.data.options.length===1&&interaction.data.options[0].name==='balance'&&interaction.data.options[0].type===1&&!interaction.data.options[0].options?.length))return '/kp balance または /kp ranking を選んでください。';
 // A verified guild interaction can open an empty wallet, never a starting credit.
 await ensureQuizKp(env);
 await env.DB.batch([
  env.DB.prepare('INSERT OR IGNORE INTO kp_participants(guild,user) VALUES(?,?)').bind(mapping.guildId,user),
  env.DB.prepare('INSERT OR IGNORE INTO kp_wallets(guild,user) VALUES(?,?)').bind(mapping.guildId,user),
  env.DB.prepare('INSERT OR IGNORE INTO kp_state(guild,user,data) VALUES(?,?,?)').bind(mapping.guildId,user,JSON.stringify(newKpState())),
 ]);
 const balance=async()=>Number((await env.DB.prepare('SELECT balance FROM kp_wallets WHERE guild=? AND user=?').bind(mapping.guildId,user).first<{balance:number}>())?.balance??0);
 if(command==='kp'){
  const rows=(await env.DB.prepare('SELECT delta,kind,at FROM kp_ledger WHERE guild=? AND user=? ORDER BY at DESC,id DESC LIMIT 5').bind(mapping.guildId,user).all<{delta:number;kind:string;at:number}>()).results;
  const kinds:Record<string,string>={voice:'通話',quiz:'QUIZ',match:'試合',operation:'購入・取引',prize:'競馬賞金',mahjong:'雀魂',grant:'手動調整',unite:'ユナイト'};
  return '🪙 あなたの残高：**'+money(await balance())+'**\n'+(rows.length?'最近の入出金\n'+rows.map(r=>`${clock(r.at)} ${kinds[r.kind]??'口座'} ${r.delta>=0?'+':''}${money(r.delta)}`).join('\n'):'まだ入出金はありません。通話やQUIZで貯められます。')+'\n/keiba で出走表、/bet で馬券を買えます。';
 }
 if(command==='mleague')return mleagueView(env,Date.now());
 if(command==='unitelink'){
  // Admin-only. The next reads of the profile only record what is there; later ranked games are posted.
  const option=(key:string)=>interaction.data?.options?.find(o=>o.name===key)?.value;
  const target=discordUser(option('user')),uid=uniteUid(option('profile'));
  if(!/^\d{15,22}$/.test(target)||!uid)return '相手（@メンション か ユーザーID）と、UniteAPI のプロフィールURL（https://uniteapi.dev/p/数字）を指定してください。';
  await ensureUnite(env);
  await env.DB.batch([
   env.DB.prepare('DELETE FROM unite_links WHERE guild=? AND (user=? OR uid=?)').bind(mapping.guildId,target,uid),
   env.DB.prepare('INSERT INTO unite_links(guild,user,uid) VALUES(?,?,?)').bind(mapping.guildId,target,uid),
  ]);
  return `🔗 <@${target}> を UniteAPI（${uid}）と結び付けました。数分後から、ランクマッチの結果をアカンbotで速報し、勝ち +300／負け −150 KP を精算します。プロフィールが非公開だと読めません。`;
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
  if((env as {KP_EARNINGS_WEBHOOK_URL?:string}).KP_EARNINGS_WEBHOOK_URL){await ensurePosts(env);await enqueue(env,'kp-grant:'+interaction.id,`🎁 <@${target}> に ${signed}（${reason}）`,created(interaction.id));}
  return `🎁 <@${target}> に ${signed}（${reason}）。残高 ${money(after)}`;
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
  const value=(key:string)=>interaction.data?.options?.find(o=>o.name===key)?.value;
  const day=mlDay(created(interaction.id)),code=/^([12])-([12])$/.exec(String(value('match')??''));
  const fixture=day&&code?ML_DATA.fixtures.find(f=>f.date===day&&f.table===Number(code[1])&&f.game===Number(code[2])):null;
  if(!fixture)return 'その試合はありません。/mleague で卓と試合を確認してください。';
  try{
   const {result}=await operateKp(env,mapping,user,interaction.id,'ml-bet',{match:fixture.id,player:value('player'),type:'last',amount:value('amount')}) as {result:{bet:{player:string;type:string;amount:number;odds:number}}};
   const bet=result.bet;
   return `🀄 予想を購入しました\n${fixture.table}卓 第${fixture.game}試合・${clean(bet.player)}の${bet.type==='top'?'トップ':'ラス'}\n掛け金 ${money(bet.amount)}／確定倍率 ${(bet.odds/10).toFixed(1)}倍\n残高 ${money(await balance())}\n出場しなかった場合は返金。結果は公式発表後に自動で反映されます。`;
  }catch(error){
   const message=error instanceof Error?error.message:'';
   return /[ぁ-んァ-ヶ一-龯]/.test(message)&&!/SQL|D1_|kp_/.test(message)?message:'購入結果を確認できませんでした。/kp の残高を確認してください。';
  }
 }
 if(command==='keiba'){
  const view=await racingView(env,mapping),open=view.open,card={...raceCard(open.id,undefined,open.entries),...(open.crown?{name:open.crown}:{})},odds=raceOdds(card);
  return [`🏇 **${clean(card.name)}**`,`-# ${clock(open.id)}発走・${card.size}頭｜締切 ${clock(card.closeAt)}`,
   '',`**出走馬**　倍率は 1着当て / ${placeSlots(card.size)}着以内当て`,
   ...card.horses.map((h:{number:number;name:string})=>`\`${String(h.number).padStart(2)}\` ${clean(h.name)}　**${(odds.win[h.number]/10).toFixed(1)}倍** / ${(odds.place[h.number]/10).toFixed(1)}倍`),
   '',`🎫 **買い方**　\`/bet race:${clock(open.id)} horse:馬番 amount:100 type:1着当て\``,
   `-# 券種は「1着当て（単勝）」か「${placeSlots(card.size)}着以内当て（複勝）」／100 KP単位・1週間で合計5万KPまで（Mリーグ予想と合算）・購入後の取消不可・この返答は本人にだけ表示`].join('\n');
 }
 const options=interaction.data?.options??[];
 const value=(key:string)=>options.find(o=>o.name===key)?.value;
 try{
  const raceId=slashRace(value('race'),interaction.id);
  const result=await operateKp(env,mapping,user,interaction.id,'race-bet',{raceId,horse:value('horse'),amount:value('amount'),type:value('type')}) as {result:{bet:{raceId:number;horse:number;amount:number;odds:number;type:string}}};
  const bet=result.result.bet;
  return `🎫 馬券を購入しました\n${clock(bet.raceId)}発走・${bet.horse}番・${bet.type==='win'?'1着当て':'3着以内当て'}\n掛け金 ${money(bet.amount)}／確定倍率 ${(bet.odds/10).toFixed(1)}倍\n残高 ${money(await balance())}\n購入後の取消はできません。結果と払い戻しは自動で反映されます。`;
 }catch(error){
  const message=error instanceof Error?error.message:'';
  return /[ぁ-んァ-ヶ一-龯]/.test(message)&&!/SQL|D1_|kp_/.test(message)?message:'購入結果を確認できませんでした。Activityの馬券履歴と /kp の残高を確認してください。';
 }
}
