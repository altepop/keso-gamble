import type {KpEnv} from './kp.ts';
import {kpEventId,kpMatchNet} from './kp.ts';
import type {Match} from './results.ts';
import {enqueue,ensurePosts} from './racing-posts.ts';

export const DM_CHALLENGE_PRIZE=5000;
export const DM_CHALLENGE_POLICY='dm-daily-40k-v1';
export const dmDay=(at:number)=>new Date(at+9*3_600_000).toISOString().slice(0,10);
const ready=new WeakMap<object,Promise<void>>();

/** One armed challenge per person and Japan-calendar day; receipts pay via an atomic D1 trigger. */
export async function ensureDmChallenge(env:KpEnv){
 const cached=ready.get(env.DB);if(cached)return cached;
 const task=Promise.resolve(env.DB.batch([
  env.DB.prepare("INSERT OR IGNORE INTO kp_settings(key,value) VALUES('dm_challenge_started_at',?)").bind(String(Date.now())),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS dm_challenges(
   guild TEXT NOT NULL,user TEXT NOT NULL,puuid TEXT NOT NULL,day TEXT NOT NULL,
   armed_at INTEGER NOT NULL,match TEXT,award INTEGER,
   PRIMARY KEY(guild,user,day))`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS dm_challenge_claims(
   id TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,puuid TEXT NOT NULL,
   day TEXT NOT NULL,match TEXT NOT NULL,started_at INTEGER NOT NULL,
   award INTEGER NOT NULL CHECK(award IN (0,5000)),at INTEGER NOT NULL,
   UNIQUE(guild,user,day))`),
  env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS dm_challenge_apply AFTER INSERT ON dm_challenge_claims BEGIN
   UPDATE dm_challenges SET match=NEW.match,award=NEW.award
    WHERE guild=NEW.guild AND user=NEW.user AND puuid=NEW.puuid AND day=NEW.day
      AND match IS NULL AND armed_at<=NEW.started_at;
   SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'DM challenge conflict') END;
   INSERT INTO kp_events(id,guild,user,puuid,match,mode,outcome,amount,policy,at)
    VALUES(NEW.id,NEW.guild,NEW.user,NEW.puuid,NEW.match,'deathmatch',NULL,NEW.award,'dm-daily-40k-v1',NEW.at);
   INSERT INTO kp_reward_notes(id,note) VALUES(NEW.id,
    CASE WHEN NEW.award=5000 THEN '（🎯 デスマッチ一発勝負成功：+5,000 KP）'
    ELSE '（🎯 デスマッチ一発勝負失敗：0 KP。本日の挑戦は終了）' END);
  END`),
 ])).then(()=>{});
 ready.set(env.DB,task);try{await task;}catch(e){ready.delete(env.DB);throw e;}
}
/** Arming does not choose a past match: only the first later-started completed public deathmatch counts. */
export async function startDmChallenge(env:KpEnv,guild:string,user:string,now=Date.now()){
 await ensureDmChallenge(env);
 if(!Number.isSafeInteger(now)||now<0)throw Error('Invalid DM challenge time');
 const day=dmDay(now);
 const changed=await env.DB.prepare(`INSERT INTO dm_challenges(guild,user,puuid,day,armed_at)
  SELECT a.guild,a.user,a.puuid,?,? FROM kp_accounts a
  WHERE a.guild=? AND a.user=? ON CONFLICT(guild,user,day) DO NOTHING`)
  .bind(day,now,guild,user).run();
 if(changed.meta.changes)return `🎯 **デスマッチ一発勝負を予約！**\n今日の次のデスマッチ1試合だけが対象だ。\n**40キルで1位なら5,000 KP確定！** それ以外は0 KP。途中退出や負けでもやり直しなし。\n日本時間0時に翌日の挑戦権が復活する。 /dm status で確認できる。`;
 const row=await env.DB.prepare('SELECT match,award FROM dm_challenges WHERE guild=? AND user=? AND day=?').bind(guild,user,day).first<{match:string|null;award:number|null}>();
 if(!row)return 'Riotアカウントの紐付けが必要だ。/valo status で確認してほしい。';
 return row.match ? `今日は挑戦済みだ（${row.award===DM_CHALLENGE_PRIZE?'成功！ +5,000 KP':'失敗・0 KP'}）。次は日本時間0時から。` :
  '今日のチャレンジはすでに予約済みだ。次に始めるデスマッチ1試合が対象になる。';
}
export async function dmChallengeStatus(env:KpEnv,guild:string,user:string,now=Date.now()){
 await ensureDmChallenge(env);
 const row=await env.DB.prepare('SELECT armed_at,match,award FROM dm_challenges WHERE guild=? AND user=? AND day=?')
  .bind(guild,user,dmDay(now)).first<{armed_at:number;match:string|null;award:number|null}>();
 return !row?'🎯 今日のデスマッチチャレンジは未予約だ。 /dm start で挑戦を開始できる（1日1回）。':
  !row.match?'🎯 **挑戦待機中**。予約後に始める最初のデスマッチ1試合が対象だ。':
  row.award===DM_CHALLENGE_PRIZE?'🏆 **本日のチャレンジ成功！ +5,000 KP**。次は日本時間0時から。':
  '💀 **本日のチャレンジ失敗・0 KP**。次は日本時間0時から。';
}
/** 40 kills end the public FFA Deathmatch immediately, unlike an incomplete score left by an early leaver. */
export function dmChallengeWon(raw:Match,puuid:string){
 const mine=raw.players.find(p=>p.puuid===puuid);
 return raw.metadata?.queue?.id==='deathmatch'&&raw.metadata.is_completed===true
  &&raw.players.length>=2&&mine?.stats?.kills===40
  &&raw.players.every(p=>Number.isSafeInteger(p.stats?.kills)&&p.stats!.kills!>=0
   &&(p.puuid===puuid||p.stats!.kills!<40));
}
/** Returns the settled wallet delta. Matches without a pre-armed challenge are 0 KP, not a repeatable farm. */
export async function settleDmMatch(env:KpEnv,input:{guild:string;user:string;puuid:string;raw:Match;start:number;now:number}):Promise<number|null>{
 const {guild,user,puuid,raw,start,now}=input;
 if(raw.metadata.queue.id!=='deathmatch'||!raw.metadata.is_completed||!Number.isSafeInteger(start)||!Number.isSafeInteger(now)||start>now+60_000)throw Error('Invalid DM match');
 // Incomplete Henrik stats must not burn the day's only attempt. Retry the match when data is complete.
 if(raw.players.length<2||!raw.players.some(p=>p.puuid===puuid)||raw.players.some(p=>!Number.isSafeInteger(p.stats?.kills)||p.stats!.kills!<0))return null;
 await ensureDmChallenge(env);
 const id=kpEventId(guild,raw.metadata.match_id,puuid),day=dmDay(start);
 const current=await env.DB.prepare('SELECT match,armed_at FROM dm_challenges WHERE guild=? AND user=? AND puuid=? AND day=?')
  .bind(guild,user,puuid,day).first<{match:string|null;armed_at:number}>();
 if(current&&!current.match&&current.armed_at<=start){
  const award=dmChallengeWon(raw,puuid)?DM_CHALLENGE_PRIZE:0;
  const claim=await env.DB.prepare(`INSERT INTO dm_challenge_claims(id,guild,user,puuid,day,match,started_at,award,at)
   SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM dm_challenges
    WHERE guild=? AND user=? AND puuid=? AND day=? AND armed_at<=? AND match IS NULL)
    AND NOT EXISTS(SELECT 1 FROM kp_events WHERE id=?)
    ON CONFLICT DO NOTHING`)
    .bind(id,guild,user,puuid,day,raw.metadata.match_id,start,award,now,guild,user,puuid,day,start,id).run();
  if(claim.meta.changes){
   if(award){try{
    await ensurePosts(env);
    await enqueue(env,'dm-win:'+id,`🎯🏆 <@${user}> がデスマッチの**1日1回の一発勝負**を制覇！ **40キル・1位で +5,000 KP**！`,now);
   }catch{console.warn('dm_challenge_win_post_pending');}}
   return award;
  }
 }
 // An unarmed/wrong-day/replayed match is still finalized at zero. This prevents retrospective claims.
 await env.DB.batch([
  env.DB.prepare(`INSERT INTO kp_events(id,guild,user,puuid,match,mode,outcome,amount,policy,at)
   SELECT ?,?,?,?,?,'deathmatch',NULL,0,?,?
   WHERE EXISTS(SELECT 1 FROM kp_accounts WHERE guild=? AND puuid=? AND user=?)
   ON CONFLICT(id) DO NOTHING`).bind(id,guild,user,puuid,raw.metadata.match_id,DM_CHALLENGE_POLICY,now,guild,puuid,user),
  env.DB.prepare(`INSERT OR IGNORE INTO kp_reward_notes(id,note) SELECT ?,''
   WHERE EXISTS(SELECT 1 FROM kp_events WHERE id=?)`).bind(id,id),
 ]);
 return await kpMatchNet(env,id)??0;
}
