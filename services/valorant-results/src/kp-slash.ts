import {isKpRanking} from './kp-command.ts';
import {initializeKp,newKpState} from './kp.ts';
import type {KpEnv,KpMapping} from './kp.ts';
import {ensureQuizKp} from './quiz-kp.ts';
import {operateKp} from './kp-api.ts';
import {racingView} from './racing-kp.ts';
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
export async function runKpCommand(env:KpEnv,interaction:Slash,override?:KpMapping):Promise<string>{
 const mapping=await initializeKp(env,override),user=interaction.member?.user?.id;
 if(!mapping||interaction.guild_id!==mapping.guildId||!user||!/^\d{15,22}$/.test(user))return 'このサーバーの本人の口座で利用してください。';
 const command=interaction.data?.name;if(!['kp','keiba','bet'].includes(command??''))return '対応していないコマンドです。';
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
  const kinds:Record<string,string>={voice:'通話',quiz:'QUIZ',match:'試合',operation:'購入・取引',prize:'競馬賞金',mahjong:'雀魂'};
  return '🪙 あなたの残高：**'+money(await balance())+'**\n'+(rows.length?'最近の入出金\n'+rows.map(r=>`${clock(r.at)} ${kinds[r.kind]??'口座'} ${r.delta>=0?'+':''}${money(r.delta)}`).join('\n'):'まだ入出金はありません。通話やQUIZで貯められます。')+'\n/keiba で出走表、/bet で馬券を買えます。';
 }
 if(command==='keiba'){
  const view=await racingView(env,mapping),open=view.open,card={...raceCard(open.id,undefined,open.entries),...(open.crown?{name:open.crown}:{})},odds=raceOdds(card);
  return [`🏇 **${clean(card.name)}** ${clock(open.id)}発走／${clock(card.closeAt)}締切`,
   `倍率：1着当て / ${placeSlots(card.size)}着以内当て`,
   ...card.horses.map((h:{number:number;name:string})=>`${h.number}番 ${clean(h.name)}　${(odds.win[h.number]/10).toFixed(1)}倍 / ${(odds.place[h.number]/10).toFixed(1)}倍`),
   `購入例：/bet race:${clock(open.id)} horse:1 amount:100 type:win`,
   '100 KP単位。購入後は取消できません。返答は本人にだけ表示されます。'].join('\n');
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
