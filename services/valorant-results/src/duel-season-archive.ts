/** Roadmap A P12: immutable weekly PvP ranking snapshots, no KP operations.
 * No retroactive reconstruction from deleted matches, and no partial rankings.
 */
import type {KpEnv} from './kp.ts';
import {duelSeasonWindow,duelSeasonRead,DUEL_SEASON_ROW_CAP} from './duel-season.ts';

const DAY=86_400_000;
const JST=9*3_600_000;
const GUILD=/^\d{15,22}$/;
export const SEASON_ARCHIVE_LIMIT=12;
export const WEEKLY_ARCHIVE_MINUTE_JST=10;
export function shouldArchiveDuelSeason(scheduledTime:number){
 if(!Number.isSafeInteger(scheduledTime)||scheduledTime<0)return false;
 const localMinutes=Math.floor((scheduledTime+JST)/60_000);
 // Monday = 0 when 1970-01-01 was Thursday.
 return (Math.floor(localMinutes/1440)+3)%7===0 &&
  localMinutes%1440===WEEKLY_ARCHIVE_MINUTE_JST;
}
export async function ensureDuelSeasonArchive(env:Pick<KpEnv,'DB'>){
 await env.DB.prepare(`CREATE TABLE IF NOT EXISTS kp_duel_season_archive(
  guild TEXT NOT NULL, season_id TEXT NOT NULL,
  starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL,
  finalised_at INTEGER NOT NULL, sampled_matches INTEGER NOT NULL,
  ranking_json TEXT NOT NULL, checksum_format INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(guild,season_id)
 )`).run();
}
export async function archivePreviousDuelSeason(env:Pick<KpEnv,'DB'>,guild:string,scheduledTime:number){
 if(!GUILD.test(guild)||!shouldArchiveDuelSeason(scheduledTime))
  throw Error('Invalid duel season archive window');
 // At Monday 00:10 JST, previous Sunday 23:59:59 is the final moment of last season.
 const previous=duelSeasonWindow(scheduledTime-11*60_000);
 await ensureDuelSeasonArchive(env);
 const existing=await env.DB.prepare('SELECT season_id FROM kp_duel_season_archive WHERE guild=? AND season_id=?')
   .bind(guild,previous.id).first<{season_id:string}>();
 if(existing)return {status:'already-archived' as const,seasonId:previous.id};
 const ranking=await duelSeasonRead(env,guild,previous.endAt-1);
 if(ranking.season.id!==previous.id||ranking.partial||
    ranking.sampledMatches>=DUEL_SEASON_ROW_CAP)
   return {status:'blocked-partial' as const,seasonId:previous.id};
 // D1 is a bounded immutable summary; does not include private board, hands, stakes, or wallet.
 const compact=ranking.rankings.map(r=>({
  user:r.user,rank:r.rank,played:r.played,wins:r.wins,losses:r.losses,draws:r.draws
 }));
 const encoded=JSON.stringify(compact);
 if(encoded.length>120_000)throw Error('Season archive exceeds safe cap');
 await env.DB.prepare(`INSERT OR IGNORE INTO kp_duel_season_archive
 (guild,season_id,starts_at,ends_at,finalised_at,sampled_matches,ranking_json,checksum_format)
 VALUES(?,?,?,?,?,?,?,1)`)
  .bind(guild,previous.id,previous.startAt,previous.endAt,scheduledTime,ranking.sampledMatches,encoded).run();
 return {status:'archived' as const,seasonId:previous.id,sampledMatches:ranking.sampledMatches};
}
export async function listDuelSeasonArchive(env:Pick<KpEnv,'DB'>,guild:string){
 if(!GUILD.test(guild))throw Error('Invalid duel archive guild');
 await ensureDuelSeasonArchive(env);
 const result=await env.DB.prepare(`SELECT season_id,starts_at,ends_at,finalised_at,
 sampled_matches,ranking_json FROM kp_duel_season_archive WHERE guild=?
 ORDER BY starts_at DESC LIMIT ?`).bind(guild,SEASON_ARCHIVE_LIMIT)
 .all<{season_id:string;starts_at:number;ends_at:number;finalised_at:number;sampled_matches:number;ranking_json:string}>();
 return {scope:'owner-only-persisted-pvp',completeRestoreBackup:false,rewardsGranted:false,
  seasons:(result.results??[]).map(r=>({
    id:r.season_id,startsAt:r.starts_at,endsAt:r.ends_at,finalisedAt:r.finalised_at,
    sampledMatches:r.sampled_matches,rankings:JSON.parse(r.ranking_json) as unknown
  }))};
}
