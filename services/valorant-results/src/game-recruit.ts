import {GAME_IDS,type RecruitView} from './game-center.ts';
import type {KpEnv} from './kp.ts';
const ID=/^\d{15,22}$/;
const READY=new WeakMap<object,Promise<void>>();
export const RECRUIT_LIFETIME_MS=2*3600_000;
type Row={id:string;guild:string;game:string;owner:string;slots:number;created_at:number;expires_at:number;message_id:string|null;channel_id:string|null};
export async function ensureGameRecruits(db:D1Database) {
 const existing=READY.get(db);if(existing)return existing;
 const job=db.batch([
  db.prepare("CREATE TABLE IF NOT EXISTS gc_recruits(id TEXT PRIMARY KEY,guild TEXT NOT NULL,game TEXT NOT NULL,owner TEXT NOT NULL,slots INTEGER NOT NULL CHECK(slots BETWEEN 2 AND 10),created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,message_id TEXT UNIQUE,channel_id TEXT)"),
  db.prepare("CREATE TABLE IF NOT EXISTS gc_recruit_members(recruit_id TEXT NOT NULL,user TEXT NOT NULL,joined_at INTEGER NOT NULL,PRIMARY KEY(recruit_id,user),FOREIGN KEY(recruit_id) REFERENCES gc_recruits(id))"),
  db.prepare("CREATE INDEX IF NOT EXISTS gc_recruits_expiry ON gc_recruits(expires_at)"),
 ]).then(()=>{});
 READY.set(db,job);try{await job;}catch(e){READY.delete(db);throw e;}
}
async function snapshot(db:D1Database,row:Row):Promise<RecruitView>{
 const participants=(await db.prepare('SELECT user FROM gc_recruit_members WHERE recruit_id=? ORDER BY joined_at,user LIMIT 10')
  .bind(row.id).all<{user:string}>()).results.map(x=>x.user);
 return {id:row.id,game:row.game,owner:row.owner,slots:row.slots,expires_at:row.expires_at,participants};
}
export async function createRecruit(env:Pick<KpEnv,'DB'>,id:string,guild:string,owner:string,
 game:string,slots=5,now=Date.now()):Promise<RecruitView> {
 if(!ID.test(id)||!ID.test(guild)||!ID.test(owner)||!GAME_IDS.has(game)||
    !Number.isSafeInteger(slots)||slots<2||slots>10)throw Error('募集対象・人数を確認してください。');
 await ensureGameRecruits(env.DB);
 const old=await env.DB.prepare('SELECT * FROM gc_recruits WHERE id=?').bind(id).first<Row>();
 if(old){
  if(old.guild!==guild||old.owner!==owner||old.game!==game||old.slots!==slots)throw Error('募集IDは使用済みだ。');
  return snapshot(env.DB,old);
 }
 const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM gc_recruits WHERE guild=? AND owner=? AND expires_at>?')
  .bind(guild,owner,now).first<{n:number}>();
 if((count?.n??0)>=3)throw Error('参加募集中の投稿は一人3件までだ。');
 await env.DB.batch([
  env.DB.prepare('INSERT OR IGNORE INTO gc_recruits(id,guild,game,owner,slots,created_at,expires_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM gc_recruits WHERE guild=? AND owner=? AND expires_at>?)<3')
   .bind(id,guild,game,owner,slots,now,now+RECRUIT_LIFETIME_MS,guild,owner,now),
  env.DB.prepare('INSERT OR IGNORE INTO gc_recruit_members(recruit_id,user,joined_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM gc_recruits WHERE id=? AND guild=? AND owner=?)')
   .bind(id,owner,now,id,guild,owner),
 ]);
 const row=await env.DB.prepare('SELECT * FROM gc_recruits WHERE id=? AND guild=? AND owner=?')
  .bind(id,guild,owner).first<Row>();
 if(!row)throw Error('参加募集中の投稿は一人3件までだ。');
 if(row.game!==game||row.slots!==slots)throw Error('募集IDは使用済みだ。');
 return snapshot(env.DB,row);
}
export async function linkRecruitMessage(db:D1Database,id:string,guild:string,channel:string,message:string){
 if(![id,guild,channel,message].every(v=>ID.test(v)))return false;
 await ensureGameRecruits(db);
 const result=await db.prepare('UPDATE gc_recruits SET channel_id=?,message_id=? WHERE id=? AND guild=? AND (message_id IS NULL OR message_id=?)')
   .bind(channel,message,id,guild,message).run();
 return result.meta.changes===1;
}
export async function changeRecruit(env:Pick<KpEnv,'DB'>,id:string,guild:string,user:string,
 joining:boolean,now=Date.now(),messageId?:string,channelId?:string){
 if(![id,guild,user].every(v=>ID.test(v)))throw Error('参加者を確認できない。');
 await ensureGameRecruits(env.DB);
 const row=await env.DB.prepare('SELECT * FROM gc_recruits WHERE id=? AND guild=?')
  .bind(id,guild).first<Row>();
 if(!row||row.expires_at<now)throw Error('この募集は終了している。');
 if(messageId&&(row.message_id!==messageId||row.channel_id!==channelId))
  throw Error('この募集の投稿が一致しない。');
 if(joining){
  await env.DB.prepare('INSERT OR IGNORE INTO gc_recruit_members(recruit_id,user,joined_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM gc_recruits r WHERE r.id=? AND r.guild=? AND r.expires_at>=? AND (SELECT COUNT(*) FROM gc_recruit_members WHERE recruit_id=r.id)<r.slots)')
   .bind(id,user,now,id,guild,now).run();
 }else{
  await env.DB.prepare('DELETE FROM gc_recruit_members WHERE recruit_id=? AND user=?')
   .bind(id,user).run();
 }
 return snapshot(env.DB,row);
}
export async function reactionRecruit(env:Pick<KpEnv,'DB'>,guild:string,channel:string,message:string,
 user:string,joining:boolean,now=Date.now()):Promise<RecruitView|null>{
 if(![guild,channel,message,user].every(x=>ID.test(x)))return null;
 await ensureGameRecruits(env.DB);
 const row=await env.DB.prepare('SELECT id FROM gc_recruits WHERE guild=? AND channel_id=? AND message_id=? AND expires_at>=?')
  .bind(guild,channel,message,now).first<{id:string}>();
 if(!row)return null;
 return changeRecruit(env,row.id,guild,user,joining,now,message,channel);
}
export async function pruneGameRecruits(db:D1Database,now=Date.now()) {
 await ensureGameRecruits(db);
 const old=(await db.prepare('SELECT id FROM gc_recruits WHERE expires_at<? ORDER BY expires_at LIMIT 30')
  .bind(now-86400_000).all<{id:string}>()).results.map(x=>x.id);
 if(!old.length)return 0;
 const marks=old.map(()=>'?').join(',');
 await db.batch([
  db.prepare('DELETE FROM gc_recruit_members WHERE recruit_id IN ('+marks+')').bind(...old),
  db.prepare('DELETE FROM gc_recruits WHERE id IN ('+marks+')').bind(...old),
 ]);
 return old.length;
}
