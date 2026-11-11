import players from '../players.json' with { type: 'json' };
import type { Match } from './results.ts';
import type { Player } from './index.ts';
import type { KpEnv, KpMapping } from './kp.ts';
import { initializeKp } from './kp.ts';
import { storedMode, modeLabel } from './modes.ts';

export const PREDICTION_BUTTON = /^vp:bet:(\d{15,22}):(win|loss)$/;
export const PREDICTION_MODAL = /^vp:submit:(\d{15,22}):(win|loss)$/;
const VALID_ID = /^\d{15,22}$/;
const MIN = 100, MAX = 100000, WINDOW = 60 * 60000, EXPIRY = 6 * 3600000;
const safe = (s: string) => s.replace(/[@<>\x60*_~|\r\n]/g, '').slice(0, 70);
const money = (n: number) => n.toLocaleString('ja-JP') + ' KP';
const oddsText = (n: number) => (n / 100).toFixed(2) + '倍';
const allowedModes = ['competitive','unrated_normal','swiftplay','spikerush','escalation'];
interface Event {
  id: string; guild: string; riot: string; mode: string; name: string; created_at: number;
  closes_at: number; win_odds: number; loss_odds: number; wins: number; losses: number;
  act_name: string | null; status: string;
}
const ready = new WeakMap<object, Promise<void>>();
export async function ensurePredictions(db: D1Database) {
  const existing = ready.get(db); if (existing) return existing;
  const job = db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS vp_events(id TEXT PRIMARY KEY,guild TEXT NOT NULL,riot TEXT NOT NULL,mode TEXT NOT NULL,name TEXT NOT NULL,created_at INTEGER NOT NULL,closes_at INTEGER NOT NULL,win_odds INTEGER NOT NULL,loss_odds INTEGER NOT NULL,wins INTEGER NOT NULL,losses INTEGER NOT NULL,act_name TEXT,status TEXT NOT NULL DEFAULT \'open\' CHECK(status IN (\'open\',\'resolved\',\'cancelled\')),match_id TEXT,outcome TEXT)'),
    db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS vp_one_open ON vp_events(guild,riot,mode) WHERE status=\'open\''),
    db.prepare('CREATE INDEX IF NOT EXISTS vp_open_by_mode ON vp_events(riot,mode,created_at) WHERE status=\'open\''),
    db.prepare('CREATE INDEX IF NOT EXISTS vp_expire ON vp_events(created_at) WHERE status=\'open\''),
    db.prepare('CREATE TABLE IF NOT EXISTS vp_tickets(event_id TEXT NOT NULL,user TEXT NOT NULL,side TEXT NOT NULL CHECK(side IN (\'win\',\'loss\')),stake INTEGER NOT NULL CHECK(stake BETWEEN 100 AND 100000),odds INTEGER NOT NULL CHECK(odds BETWEEN 110 AND 500),purchased_at INTEGER NOT NULL,status TEXT NOT NULL DEFAULT \'pending\' CHECK(status IN (\'pending\',\'won\',\'lost\',\'refunded\')),payout INTEGER NOT NULL DEFAULT 0 CHECK(payout BETWEEN 0 AND 500000),PRIMARY KEY(event_id,user),FOREIGN KEY(event_id) REFERENCES vp_events(id))'),
    db.prepare('CREATE TRIGGER IF NOT EXISTS vp_debit AFTER INSERT ON vp_tickets BEGIN INSERT INTO kp_ledger(id,guild,user,delta,kind,at) SELECT \'vp:stake:\'||NEW.event_id||\':\'||NEW.user,e.guild,NEW.user,-NEW.stake,\'valorant_prediction\',NEW.purchased_at FROM vp_events e WHERE e.id=NEW.event_id; END'),
    db.prepare('CREATE TRIGGER IF NOT EXISTS vp_credit AFTER UPDATE OF status ON vp_tickets WHEN OLD.status=\'pending\' AND NEW.status!=\'pending\' AND NEW.payout>0 BEGIN INSERT INTO kp_ledger(id,guild,user,delta,kind,at) SELECT \'vp:pay:\'||NEW.event_id||\':\'||NEW.user,e.guild,NEW.user,NEW.payout,\'valorant_prediction\',CAST(strftime(\'%s\',\'now\') AS INTEGER)*1000 FROM vp_events e WHERE e.id=NEW.event_id; END'),
  ]).then(() => {});
  ready.set(db,job);
  try { await job; } catch(e) { ready.delete(db); throw e; }
}
export function predictionOdds(wins: number, losses: number) {
  const p = Math.max(.2, Math.min(.8, (wins + 3) / (wins + losses + 6)));
  return { win: Math.max(110, Math.min(500, Math.floor(92 / p))),
    loss: Math.max(110, Math.min(500, Math.floor(92 / (1 - p))) };
}
export function predictionCard(e: Event) {
  const until = new Date(e.closes_at + 9*3600000).toISOString().slice(11,16);
  const caption = [modeLabel(e.mode), e.act_name ? 'ACT ' + safe(e.act_name) : 'ACT未取得',
    '記録 ' + e.wins + '勝' + e.losses + '敗'].join(' · ');
  return { flags: 32768, components: [{
    type: 17, accent_color: 0x5865f2,
    components: [
      {type:10,content:'## 🎯 ' + safe(e.name) + ' の次の1試合\n' + caption},
      {type:10,content:'### 🟢 勝利　' + oddsText(e.win_odds) + '　　🔴 敗北　' + oddsText(e.loss_odds)},
      {type:1,components:[
        {type:2,style:3,label:'勝利を予想',custom_id:'vp:bet:' + e.id + ':win'},
        {type:2,style:4,label:'敗北を予想',custom_id:'vp:bet:' + e.id + ':loss'},
      ]},
      {type:10,content:'-# 受付 ' + until + ' JSTまで · 100〜100,000 KP · 1人1回\n-# 試合開始後の予想・引き分け・対象試合が見つからない場合は返金。倍率は固定。'},
    ],
  }] };
}
export function predictionModal(id: string, side: 'win' | 'loss') {
  return { type:9, data:{title:(side==='win'?'勝利':'敗北')+'予想のKP入力',
    custom_id:'vp:submit:'+id+':'+side,
    components:[{type:18,label:'予想KP（100〜100000）',
      component:{type:4,custom_id:'amount',style:1,placeholder:'例：1000',required:true,min_length:3,max_length:6}}]} };
}
export function predictionAmount(data: unknown) {
  const nodes = (data as {components?:Array<{component?:unknown;components?:unknown[]}>})?.components ?? [];
  const inputs = nodes.flatMap(n => n.component ? [n.component] : n.components ?? []) as Array<{type?:number;custom_id?:string;value?:unknown}>;
  const value = inputs.find(n=>n.type===4&&n.custom_id==='amount')?.value;
  if (typeof value!=='string'||!/^[1-9]\d{2,5}$/.test(value)) return null;
  const num = Number(value);
  return Number.isSafeInteger(num)&&num>=MIN&&num<=MAX?num:null;
}
export async function openPrediction(env:KpEnv,id:string,guild:string,riot:string,mode:string,
  roster:Player[]=players,now=Date.now(),override?:KpMapping) {
  if (!VALID_ID.test(id)||!VALID_ID.test(guild)||!allowedModes.includes(mode)) throw Error('予想対象を確認できません。');
  const mapping=await initializeKp(env,override);
  if (!mapping||mapping.guildId!==guild) throw Error('KPが利用できません。');
  const player=roster.find(p=>p.riotId===riot);
  if(!player)throw Error('対象者を登録済み一覧から選んでください。');
  await ensurePredictions(env.DB);
  await expirePredictions(env,now);
  const old=await env.DB.prepare('SELECT id FROM vp_events WHERE guild=? AND riot=? AND mode=? AND status=\'open\' LIMIT 1')
    .bind(guild,riot,mode).first<{id:string}>();
  if(old)throw Error('この対象者・モードは受付中です。既存のカードを使用してください。');
  const act=await env.DB.prepare('SELECT act_id,act_name FROM notifications WHERE riot_id=? AND mode=? AND act_id IS NOT NULL AND outcome IN (\'win\',\'loss\') ORDER BY ended_at DESC,match_id DESC LIMIT 1')
    .bind(riot,mode).first<{act_id:string;act_name:string|null}>();
  const count=act?await env.DB.prepare('SELECT SUM(CASE WHEN outcome=\'win\' THEN 1 ELSE 0 END) AS wins,SUM(CASE WHEN outcome=\'loss\' THEN 1 ELSE 0 END) AS losses FROM notifications WHERE riot_id=? AND mode=? AND act_id=?')
    .bind(riot,mode,act.act_id).first<{wins:number;losses:number}>():null;
  const wins=count?.wins??0,losses=count?.losses??0,odds=predictionOdds(wins,losses);
  const e:Event={id,guild,riot,mode,name:safe(player.name||riot.split('#')[0]),created_at:now,
    closes_at:now+WINDOW,win_odds:odds.win,loss_odds:odds.loss,wins,losses,act_name:act?.act_name??null,status:'open'};
  const inserted=await env.DB.prepare('INSERT OR IGNORE INTO vp_events(id,guild,riot,mode,name,created_at,closes_at,win_odds,loss_odds,wins,losses,act_name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id,guild,riot,mode,e.name,now,e.closes_at,odds.win,odds.loss,wins,losses,e.act_name).run();
  if(inserted.meta.changes!==1)throw Error('同じ対象の予想がすでに始まっています。');
  return predictionCard(e);
}
export async function buyPrediction(env:KpEnv,id:string,guild:string,user:string,side:'win'|'loss',
  amount:number,at=Date.now(),override?:KpMapping):Promise<string> {
  if(!VALID_ID.test(id)||!VALID_ID.test(guild)||!VALID_ID.test(user)||!['win','loss'].includes(side)||
    !Number.isSafeInteger(amount)||amount<MIN||amount>MAX)return '入力を確認してください。';
  const mapping=await initializeKp(env,override);
  if(!mapping||mapping.guildId!==guild)return 'KPが利用できません。';
  await ensurePredictions(env.DB);
  const e=await env.DB.prepare('SELECT * FROM vp_events WHERE id=? AND guild=?').bind(id,guild).first<Event>();
  if(!e)return 'この予想カードは見つかりません。';
  if(mapping.accounts.some(a=>a.discordUserId===user&&a.riotId.toLowerCase()===e.riot.toLowerCase()))
    return '自分の試合には予想できません。';
  if(e.status!=='open'||at<e.created_at||at>e.closes_at)return '予想の受付は終了しています。';
  const existing=await env.DB.prepare('SELECT stake FROM vp_tickets WHERE event_id=? AND user=?')
    .bind(id,user).first<{stake:number}>();
  if(existing)return 'このカードにはすでに '+money(existing.stake)+' を予想済みです。';
  const odds=side==='win'?e.win_odds:e.loss_odds;
  const row=await env.DB.prepare('INSERT OR IGNORE INTO vp_tickets(event_id,user,side,stake,odds,purchased_at) SELECT e.id,w.user,?,?,?,? FROM vp_events e JOIN kp_wallets w ON w.guild=e.guild AND w.user=? WHERE e.id=? AND e.guild=? AND e.status=\'open\' AND e.created_at<=? AND e.closes_at>=? AND w.balance>=? AND NOT EXISTS(SELECT 1 FROM vp_tickets t WHERE t.event_id=e.id AND t.user=w.user)')
    .bind(side,amount,odds,at,user,id,guild,at,at,amount).run();
  if(row.meta.changes!==1)return '購入できませんでした。残高・受付期限・購入済みかを確認してください。';
  return '🎫 **予想を受け付けました**\n'+safe(e.name)+'｜'+modeLabel(e.mode)+'\n'
    +(side==='win'?'勝利':'敗北')+'に '+money(amount)+'（'+oddsText(odds)+'）\n的中時 '+money(Math.floor(amount*odds/100))+'。試合終了後に自動判定します。';
}
export async function settlePredictions(env:KpEnv,match:Match,riot:string,now=Date.now(),override?:KpMapping) {
  if(!match.metadata?.is_completed||!match.metadata.match_id)return 0;
  const start=Date.parse(match.metadata.started_at);if(!Number.isFinite(start))return 0;
  await ensurePredictions(env.DB);
  const mode=storedMode(match.metadata.queue.id);
  const events=(await env.DB.prepare('SELECT * FROM vp_events WHERE riot=? AND mode=? AND status=\'open\' AND created_at<? ORDER BY created_at LIMIT 5')
    .bind(riot,mode,start).all<Event>()).results;
  if(!events.length)return 0;
  const mapping=await initializeKp(env,override);if(!mapping)return 0;
  const row=await env.DB.prepare('SELECT puuid FROM tracked_players WHERE riot_id=?').bind(riot).first<{puuid:string}>();
  const player=match.players.find(p=>p.puuid===row?.puuid);
  if(!player)return 0;
  const team=match.teams.find(t=>t.team_id===player.team_id);
  const rival=match.teams.find(t=>t.team_id!==player.team_id);
  const outcome=team?.won?'win':rival?.won?'loss':'draw';
  for(const e of events) {
    if(e.guild!==mapping.guildId)continue;
    const done=await env.DB.batch([
      env.DB.prepare('UPDATE vp_events SET status=\'resolved\',match_id=?,outcome=? WHERE id=? AND status=\'open\' AND created_at<?')
        .bind(match.metadata.match_id,outcome,e.id,start),
      env.DB.prepare('UPDATE vp_tickets SET status=CASE WHEN purchased_at>=? OR ?=\'draw\' THEN \'refunded\' WHEN side=? THEN \'won\' ELSE \'lost\' END,payout=CASE WHEN purchased_at>=? OR ?=\'draw\' THEN stake WHEN side=? THEN CAST(stake*odds/100 AS INTEGER) ELSE 0 END WHERE event_id=? AND status=\'pending\' AND EXISTS(SELECT 1 FROM vp_events WHERE id=? AND status=\'resolved\' AND match_id=?)')
        .bind(start,outcome,outcome,start,outcome,outcome,e.id,e.id,match.metadata.match_id),
    ]);
    if(done[0].meta.changes)console.info('vp_settled',{event:e.id,match:match.metadata.match_id,outcome,at:now});
  }
  return events.length;
}
export async function expirePredictions(env:Pick<KpEnv,'DB'>,now=Date.now()) {
  await ensurePredictions(env.DB);
  const events=(await env.DB.prepare('SELECT id FROM vp_events WHERE status=\'open\' AND created_at<? ORDER BY created_at LIMIT 10')
    .bind(now-EXPIRY).all<{id:string}>()).results;
  for(const e of events)await env.DB.batch([
    env.DB.prepare('UPDATE vp_events SET status=\'cancelled\' WHERE id=? AND status=\'open\'').bind(e.id),
    env.DB.prepare('UPDATE vp_tickets SET status=\'refunded\',payout=stake WHERE event_id=? AND status=\'pending\' AND EXISTS(SELECT 1 FROM vp_events WHERE id=? AND status=\'cancelled\')').bind(e.id,e.id),
  ]);
  return events.length;
}
