// Mahjong Soul results by paipu URL (/paifu). The game's data is not fetched; another registered
// member opens the paipu, checks the rank and presses 承認. Only then is KP credited, once.
import policy from '../mahjong-kp-policy.json' with {type:'json'};
import {initializeKp,newKpState} from './kp.ts';
import type {KpEnv,KpMapping} from './kp.ts';
import {ensureQuizKp} from './quiz-kp.ts';
import type {PaipuSummary} from './mahjong-summary.ts';
type Game=keyof typeof policy.games;
interface Claim {id:string;user:string;paipu:string;link:string;game:Game;rank:number;amount:number;status:'pending'|'approved'|'rejected';decider:string|null;at:number}
interface PaifuInteraction {id:string;guild_id?:string;member?:{user?:{id:string}};data?:{name?:string;custom_id?:string;options?:Array<{name:string;value?:unknown}>}}
export interface PaifuReply {content:string;components:unknown[];notice?:string}
const DAY=86400000,EXPIRES=3*DAY;
const HOSTS=['game.mahjongsoul.com','mahjongsoul.game.yo-star.com','game.maj-soul.com','game.maj-soul.net'];
const PAIPU=/^(\d{2})(\d{2})(\d{2})-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(_a\d{1,12}(?:_\d)?)?$/i;
const money=(n:number)=>n.toLocaleString('ja-JP')+' KP';
const jstDay=(at:number)=>new Date(at+9*3600000).toISOString().slice(0,10);
export const PAIFU_BUTTON=/^paifu:(ok|ng):(\d{15,22})$/;
/** Accepts a paipu URL from the official clients or the bare paipu id. Throws a message for the user. */
export function parsePaipu(input:unknown,now:number){
 const text=typeof input==='string'?input.trim():'';
 let id=text;
 if(/^https?:\/\//i.test(text)){
  let url:URL;try{url=new URL(text);}catch{throw Error('牌譜URLを読み取れませんでした。雀魂の牌譜画面の「共有」でコピーしたURLを貼ってください。');}
  if(url.protocol!=='https:'||!HOSTS.includes(url.hostname))throw Error('雀魂の牌譜URL（game.mahjongsoul.com など）を貼ってください。');
  id=url.searchParams.get('paipu')??'';
 }
 const m=PAIPU.exec(id);
 if(!m)throw Error('牌譜URLを読み取れませんでした。雀魂の牌譜画面の「共有」でコピーしたURLを貼ってください。');
 const date=Date.UTC(2000+Number(m[1]),Number(m[2])-1,Number(m[3]));
 if(new Date(date).getUTCDate()!==Number(m[3])||date>now+DAY||date<now-(policy.maxAgeDays+1)*DAY)throw Error(`${policy.maxAgeDays}日以内に打った対局の牌譜だけ申請できます。`);
 return {paipu:(m[1]+m[2]+m[3]+'-'+m[4]).toLowerCase(),link:'https://game.mahjongsoul.com/index.html?paipu='+m[0]};
}
export function paifuRequest(interaction:PaifuInteraction,now:number){
 const value=(key:string)=>interaction.data?.options?.find(o=>o.name===key)?.value;
 const game=value('game'),rank=value('rank');
 if(typeof game!=='string'||!Object.hasOwn(policy.games,game))throw Error('対局の種類を選んでください。');
 const rates=policy.games[game as Game].rates;
 if(!Number.isInteger(rank)||(rank as number)<1||(rank as number)>rates.length)throw Error(`${policy.games[game as Game].label}の順位は1〜${rates.length}位で選んでください。`);
 return {...parsePaipu(value('url'),now),game:game as Game,rank:rank as number,amount:rates[(rank as number)-1]};
}
const initialized=new WeakSet<object>();
export async function ensureMahjongClaims(env:KpEnv){
 if(initialized.has(env.DB))return;
 await env.DB.batch([
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS kp_mahjong_claims(id TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,paipu TEXT NOT NULL,link TEXT NOT NULL,game TEXT NOT NULL,rank INTEGER NOT NULL,amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount>=0),day TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),decider TEXT,at INTEGER NOT NULL,decided_at INTEGER)`),
  // A rejected claim can be filed again with the correct rank; a live one blocks duplicates.
  env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS kp_mahjong_claim_user ON kp_mahjong_claims(guild,paipu,user) WHERE status!='rejected'`),
  env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS kp_mahjong_claim_rank ON kp_mahjong_claims(guild,paipu,rank) WHERE status!='rejected'`),
  // Summaries fetched from the game (scripts/mahjong-paipu.mjs) and Discord user -> game account links.
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS kp_mahjong_paipu(guild TEXT NOT NULL,paipu TEXT NOT NULL,summary TEXT,error TEXT,attempts INTEGER NOT NULL DEFAULT 0,at INTEGER NOT NULL,PRIMARY KEY(guild,paipu))`),
  env.DB.prepare('CREATE TABLE IF NOT EXISTS mahjong_paipu_auto(paipu TEXT PRIMARY KEY,account INTEGER NOT NULL,at INTEGER NOT NULL)'),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS kp_mahjong_links(guild TEXT NOT NULL,user TEXT NOT NULL,account INTEGER NOT NULL,PRIMARY KEY(guild,user),UNIQUE(guild,account))`),
  env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS kp_mahjong_apply AFTER UPDATE OF status ON kp_mahjong_claims WHEN OLD.status='pending' AND NEW.status='approved' BEGIN INSERT INTO kp_ledger(id,guild,user,delta,kind,at) VALUES('mahjong:'||NEW.id,NEW.guild,NEW.user,NEW.amount,'mahjong',NEW.decided_at); END`),
 ]);initialized.add(env.DB);
}
export function renderClaim(c:Claim,now:number):PaifuReply{
 const head=`🀄 **雀魂の結果申請**\n<@${c.user}>　${policy.games[c.game].label} **${c.rank}位**（${money(c.amount)}）\n牌譜：<${c.link}>`;
 if(c.status==='approved')return {content:`${head}\n✅ ${c.decider==='paipu'?'牌譜で本人の順位を確認しました。':`<@${c.decider}> が承認。`}${money(c.amount)} を付与しました。`,components:[]};
 if(c.status==='rejected')return {content:`${head}\n❌ ${c.decider===c.user?'申請者が取り下げました。':`<@${c.decider}> が却下しました。`}正しい順位なら /paifu でもう一度申請できます。`,components:[]};
 if(now>c.at+EXPIRES)return {content:`${head}\n⌛ 72時間承認されなかったため期限切れです。`,components:[]};
 return {content:`${head}\n承認待ち：申請者以外の登録メンバーが牌譜を開いて順位を確認し、承認してください（72時間以内）。`,
  components:[{type:1,components:[{type:2,style:3,label:'承認',custom_id:`paifu:ok:${c.id}`},{type:2,style:4,label:'却下・取り下げ',custom_id:`paifu:ng:${c.id}`}]}]};
}
const read=(env:KpEnv,guild:string,id:string)=>env.DB.prepare('SELECT id,user,paipu,link,game,rank,amount,status,decider,at FROM kp_mahjong_claims WHERE guild=? AND id=?').bind(guild,id).first<Claim>();
/** /paifu: files a pending claim keyed by the interaction id, so a retried delivery shows the same claim. */
export async function runPaifuCommand(env:KpEnv,interaction:PaifuInteraction,override?:KpMapping):Promise<PaifuReply>{
 const mapping=await initializeKp(env,override),user=interaction.member?.user?.id,now=Date.now();
 if(!mapping||interaction.guild_id!==mapping.guildId||!user||!/^\d{15,22}$/.test(user)||!/^\d{15,22}$/.test(interaction.id))return {content:'このサーバーの本人の口座で利用してください。',components:[]};
 let claim;try{claim=paifuRequest(interaction,now);}catch(error){return {content:(error as Error).message,components:[]};}
 await ensureQuizKp(env);await ensureMahjongClaims(env);
 const existing=await read(env,mapping.guildId,interaction.id);
 if(existing)return renderClaim(existing,now);
 const day=jstDay(now);
 await env.DB.batch([
  env.DB.prepare('INSERT OR IGNORE INTO kp_participants(guild,user) VALUES(?,?)').bind(mapping.guildId,user),
  env.DB.prepare('INSERT OR IGNORE INTO kp_wallets(guild,user) VALUES(?,?)').bind(mapping.guildId,user),
  env.DB.prepare('INSERT OR IGNORE INTO kp_state(guild,user,data) VALUES(?,?,?)').bind(mapping.guildId,user,JSON.stringify(newKpState())),
  env.DB.prepare(`INSERT OR IGNORE INTO kp_mahjong_claims(id,guild,user,paipu,link,game,rank,amount,day,at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM kp_mahjong_claims WHERE guild=? AND user=? AND day=? AND status!='rejected' AND id NOT LIKE 'auto:%')<?`)
   .bind(interaction.id,mapping.guildId,user,claim.paipu,claim.link,claim.game,claim.rank,claim.amount,day,now,mapping.guildId,user,day,policy.dailyClaims),
 ]);
 const filed=await read(env,mapping.guildId,interaction.id);
 // A paipu already read automatically settles the claim at once.
 if(filed){await settleClaim(env,mapping.guildId,filed,now);return renderClaim((await read(env,mapping.guildId,interaction.id))!,now);}
 const taken=await env.DB.prepare(`SELECT id,user,rank FROM kp_mahjong_claims WHERE guild=? AND paipu=? AND status!='rejected' AND (user=? OR rank=?)`).bind(mapping.guildId,claim.paipu,user,claim.rank).first<{id:string;user:string;rank:number}>();
 if(taken?.user===user)return {content:taken.id.startsWith('auto:')?'この牌譜のKPは、牌譜から自動で付与済みです。':'この牌譜はもう申請済みです。',components:[]};
 if(taken)return {content:`この牌譜の${claim.rank}位はもう <@${taken.user}> が申請しています。順位を確認してください。`,components:[]};
 return {content:`雀魂の申請は1日${policy.dailyClaims}件までです。`,components:[]};
}
/** 承認 by another registered member credits KP once; 却下 by a member or the claimant closes it. */
export async function decidePaifu(env:KpEnv,interaction:PaifuInteraction,override?:KpMapping):Promise<PaifuReply|null>{
 const match=PAIFU_BUTTON.exec(interaction.data?.custom_id??''),mapping=await initializeKp(env,override),user=interaction.member?.user?.id,now=Date.now();
 if(!match||!mapping||interaction.guild_id!==mapping.guildId||!user)return null;
 await ensureMahjongClaims(env);
 const claim=await read(env,mapping.guildId,match[2]);
 if(!claim)return null;
 const member=mapping.accounts.some(a=>a.discordUserId===user),approve=match[1]==='ok';
 const refuse=(notice:string)=>({...renderClaim(claim,now),notice});
 if(claim.status!=='pending'||now>claim.at+EXPIRES)return refuse('この申請はもう締め切られています。');
 if(approve&&user===claim.user)return refuse('自分の申請は承認できません。他のメンバーに牌譜を確認してもらってください。');
 if(!member&&user!==claim.user)return refuse('承認・却下できるのは登録メンバーだけです。');
 const check=approve?await paipuCheck(env,mapping.guildId,claim):null;
 if(check&&'refuse' in check)return refuse(check.refuse);
 await env.DB.prepare(`UPDATE kp_mahjong_claims SET status=?,decider=?,decided_at=?,game=?,amount=? WHERE guild=? AND id=? AND status='pending' AND at>?${approve?' AND user!=?':''}`)
  .bind(approve?'approved':'rejected',user,now,check?.game??claim.game,check?.amount??claim.amount,mapping.guildId,claim.id,now-EXPIRES,...(approve?[user]:[])).run();
 const after=(await read(env,mapping.guildId,claim.id))!;
 // A member's approval of a fetched paipu also teaches which game account is this person's.
 if(after.status==='approved'&&check?.account)await env.DB.prepare('INSERT OR IGNORE INTO kp_mahjong_links(guild,user,account) VALUES(?,?,?)').bind(mapping.guildId,claim.user,check.account).run();
 return renderClaim(after,now);
}
export async function paipuSummary(env:KpEnv,guild:string,paipu:string){
 const row=await env.DB.prepare('SELECT summary FROM kp_mahjong_paipu WHERE guild=? AND paipu=? AND summary IS NOT NULL').bind(guild,paipu).first<{summary:string}>();
 return row?JSON.parse(row.summary) as PaipuSummary:null;
}
/** Compares a claim with the fetched paipu, when there is one. The game type and the amount come
 * from the paipu; a rank held by someone else's linked account, or a different linked account, is refused. */
export async function paipuCheck(env:KpEnv,guild:string,claim:Pick<Claim,'user'|'paipu'|'rank'>):Promise<null|{refuse:string}|{game:Game;amount:number;account:number;nickname:string;auto:boolean}>{
 const summary=await paipuSummary(env,guild,claim.paipu);
 if(!summary||!Object.hasOwn(policy.games,summary.game))return null;
 const player=summary.seats.find(s=>s.rank===claim.rank);
 if(!player)return {refuse:`牌譜は${summary.players}人戦です。順位を確認してください。`};
 const links=(await env.DB.prepare('SELECT user,account FROM kp_mahjong_links WHERE guild=? AND (user=? OR account=?)').bind(guild,claim.user,player.accountId).all<{user:string;account:number}>()).results;
 const mine=links.find(l=>l.user===claim.user),owner=links.find(l=>l.account===player.accountId);
 if(owner&&owner.user!==claim.user)return {refuse:`牌譜の${claim.rank}位は別のメンバーの雀魂アカウントです。`};
 if(mine&&mine.account!==player.accountId)return {refuse:`牌譜の${claim.rank}位は、登録済みのあなたの雀魂アカウントではありません。`};
 const game=summary.game as Game;
 return {game,amount:policy.games[game].rates[claim.rank-1],account:player.accountId,nickname:player.nickname,auto:Boolean(mine)};
}

/** Applies a fetched paipu to one pending claim: auto-approval for a linked account, otherwise the
 * game type and amount are corrected and a member's approval is awaited. Returns a line for the post. */
export async function settleClaim(env:KpEnv,guild:string,c:Pick<Claim,'id'|'user'|'paipu'|'rank'>&{status:string},now:number):Promise<string|null>{
 if(c.status!=='pending')return null;
 const check=await paipuCheck(env,guild,c);
 if(!check)return null;
 if('refuse' in check)return `⚠️ <@${c.user}> の${c.rank}位申請：${check.refuse}`;
 if(check.auto){
  const done=await env.DB.prepare(`UPDATE kp_mahjong_claims SET status='approved',decider='paipu',decided_at=?,game=?,amount=? WHERE guild=? AND id=? AND status='pending'`).bind(now,check.game,check.amount,guild,c.id).run();
  return done.meta.changes?`✅ <@${c.user}> ${c.rank}位を牌譜で確認。+${check.amount.toLocaleString('ja-JP')} KP`:null;
 }
 await env.DB.prepare(`UPDATE kp_mahjong_claims SET game=?,amount=? WHERE guild=? AND id=? AND status='pending'`).bind(check.game,check.amount,guild,c.id).run();
 return `🔎 <@${c.user}> の${c.rank}位は牌譜では「${check.nickname.replace(/[@`*_~<>|#\\\[\]()\r\n]/g,'').slice(0,16)}」。初回なので他のメンバーの承認を待っています（承認後は自動確認）。`;
}

/** KP for every linked member in a fetched game, without /paifu. Recorded as an automatic claim
 * (id auto:<paipu>:<user>) so the same uniqueness rules stop a second credit; not counted in the daily cap. */
export async function autoCredit(env:KpEnv,guild:string,summary:PaipuSummary,now:number){
 if(!Object.hasOwn(policy.games,summary.game))return [];
 const game=summary.game as Game,lines:string[]=[];
 const links=(await env.DB.prepare('SELECT user,account FROM kp_mahjong_links WHERE guild=?').bind(guild).all<{user:string;account:number}>()).results;
 for(const seat of summary.seats){
  const link=seat.accountId>0?links.find(l=>l.account===seat.accountId):undefined;
  if(!link)continue;
  const id=`auto:${summary.uuid}:${link.user}`,amount=policy.games[game].rates[seat.rank-1];
  await env.DB.batch([
   env.DB.prepare('INSERT OR IGNORE INTO kp_wallets(guild,user) VALUES(?,?)').bind(guild,link.user),
   env.DB.prepare('INSERT OR IGNORE INTO kp_state(guild,user,data) VALUES(?,?,?)').bind(guild,link.user,JSON.stringify(newKpState())),
   env.DB.prepare('INSERT OR IGNORE INTO kp_mahjong_claims(id,guild,user,paipu,link,game,rank,amount,day,at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(id,guild,link.user,summary.uuid,'https://game.mahjongsoul.com/index.html?paipu='+summary.uuid,game,seat.rank,amount,jstDay(summary.end||now),now),
  ]);
  const done=await env.DB.prepare(`UPDATE kp_mahjong_claims SET status='approved',decider='paipu',decided_at=? WHERE guild=? AND id=? AND status='pending'`).bind(now,guild,id).run();
  if(done.meta.changes)lines.push(`✅ <@${link.user}> ${seat.rank}位 +${amount.toLocaleString('ja-JP')} KP（牌譜から自動）`);
 }
 return lines;
}
