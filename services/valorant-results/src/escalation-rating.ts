import type {KpEnv} from './kp.ts';
import type {Match} from './results.ts';
import {assessRewardReadiness} from './reward-readiness.ts';
export const ESCALATION_RATING_POLICY='escalation-power-v1';
export const ESCALATION_MEASUREMENT_GAMES=3;
export const ESCALATION_SERIES_GAINS=[100,70,40] as const;
export interface EscalationAct {id:string;name:string|null;startedAt:number;endedAt:number;episode?:string|null}
export interface EscalationPowerProof {act:EscalationAct;performance:number}
/** Henrik season.short is an eNaN code; unknown labels never imply a new episode. */
export function escalationEpisode(name:unknown):string|null{
 if(typeof name!=='string')return null;
 const match=/^(e|v)([1-9]\d{0,3})a([1-9]\d?)$/i.exec(name.trim());
 return match?match[1].toLowerCase()+Number(match[2]):null;
}
export const ESCALATION_RANKS=['アイアン','ブロンズ','シルバー','ゴールド','プラチナ','ダイヤモンド','アセンダント','イモータル','レディアント'] as const;
/** 100 visible points = one division; 300 = one whole rank. This is KESO's own ladder. */
export function escalationRank(rating:number){
 const points=Math.max(0,Math.floor(Number.isFinite(rating)?rating:0)),tier=Math.min(8,Math.floor(points/300));
 const division=tier===8?null:Math.floor(points%300/100)+1;
 return {tier,division,name:ESCALATION_RANKS[tier]+(division?' '+['Ⅰ','Ⅱ','Ⅲ'][division-1]:''),rr:tier===8?points-2400:points%100};
}
export function matchAct(raw:Match):EscalationAct|null{
 const id=raw.metadata?.season?.id,startedAt=Date.parse(raw.metadata?.started_at),duration=raw.metadata?.game_length_in_ms;
 if(raw.metadata?.is_completed!==true||typeof id!=='string'||!id.trim()||id.length>100||!Number.isSafeInteger(startedAt)||startedAt<0||!Number.isSafeInteger(duration)||duration<=0||!Number.isSafeInteger(startedAt+duration)||startedAt+duration>Date.now()+60000)return null;
 const short=raw.metadata.season?.short;
 return{id:id.trim().toLowerCase(),episode:escalationEpisode(short),name:typeof short==='string'&&short.trim()?short.trim().slice(0,80):null,startedAt,endedAt:startedAt+duration};
}
export function escalationPerformance(raw:Match,puuid:string):number{
 const p=raw.players.filter(p=>p.puuid===puuid);if(p.length!==1)return 0;
 const s=p[0].stats,k=s?.kills,d=s?.deaths,a=s?.assists;
 const valid=(n:unknown):n is number=>Number.isSafeInteger(n)&&Number(n)>=0;
 let extra=valid(k)&&k>=30?1:0;
 if(valid(k)&&valid(d)&&k>=15){if(d===0||k>=1.5*d)extra++;if(d===0||k>=2*d)extra++;}
 if(valid(a)&&a>=15)extra++;
 return Math.min(3,extra);
}
export function escalationPowerProof(raw:Match,puuid:string):EscalationPowerProof|null{
 const ready=assessRewardReadiness(raw,puuid),act=matchAct(raw);
 return act&&act.episode&&ready.status==='ready'&&ready.mode==='escalation'&&['win','loss'].includes(ready.outcome??'')?{act,performance:escalationPerformance(raw,puuid)}:null;
}
export function escalationGrade(rating:number){return escalationRank(rating).name;}
const ready=new WeakMap<object,Promise<void>>();
const finishMeasure='measured=0 AND measurement_games+1=measurement_required';
const finishSeries="measured=1 AND (series_wins+(NEW.outcome='win')=3 OR series_losses+(NEW.outcome='loss')=3)";
const measureBonus='MIN(5,measurement_performance+NEW.performance)';
const seriesBonus='MIN(5,series_performance+NEW.performance)';
const seriesDelta=`CASE WHEN NEW.outcome='win' THEN CASE series_losses WHEN 0 THEN 100 WHEN 1 THEN 70 ELSE 40 END ELSE -CASE series_wins WHEN 0 THEN 100 WHEN 1 THEN 70 ELSE 40 END END+${seriesBonus}`;
const placementWins="measurement_wins+(NEW.outcome='win')";
// Keep the internal estimate across resets. At most +one whole rank on an episode placement.
const placementRating=`CASE placement_kind
 WHEN 'initial' THEN 200*(${placementWins})+${measureBonus}
 WHEN 'act' THEN seed_rating+CASE WHEN NEW.outcome='win' THEN 20+${measureBonus} ELSE 0 END
 ELSE MAX(0,seed_rating-600+MIN(900,MAX(0,seed_mmr-seed_rating+100*(2*(${placementWins})-measurement_required)+${measureBonus}))) END`;
const placementPerformance=`((${placementRating})-(${placementRating.replaceAll(measureBonus,'0')}))`;
const nextRating=`CASE WHEN ${finishMeasure} THEN (${placementRating}) WHEN ${finishSeries} THEN MIN(9007199254740991,MAX(0,rating+(${seriesDelta}))) ELSE rating END`;
/** ACTs are observed from verified match times, never from the receipt time or the phone clock. */
export async function ensureEscalationRating(env:KpEnv){
 const previous=ready.get(env.DB);if(previous)return previous;
 const job=(async()=>{await env.DB.batch([
  env.DB.prepare('CREATE TABLE IF NOT EXISTS kp_escalation_current_acts(guild TEXT PRIMARY KEY,act TEXT NOT NULL,name TEXT,episode TEXT,started_at INTEGER NOT NULL)'),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS kp_escalation_ratings(
   guild TEXT NOT NULL,user TEXT NOT NULL,act TEXT NOT NULL,act_name TEXT,episode TEXT NOT NULL,started_at INTEGER NOT NULL,placement_kind TEXT NOT NULL,measurement_required INTEGER NOT NULL,seed_rating INTEGER NOT NULL,seed_mmr INTEGER NOT NULL,mmr INTEGER NOT NULL DEFAULT 300,peak_rating INTEGER NOT NULL DEFAULT 0,rating INTEGER NOT NULL DEFAULT 300 CHECK(rating BETWEEN 0 AND 9007199254740991),
   measured INTEGER NOT NULL DEFAULT 0,measurement_games INTEGER NOT NULL DEFAULT 0,measurement_wins INTEGER NOT NULL DEFAULT 0,measurement_performance INTEGER NOT NULL DEFAULT 0,
   series_wins INTEGER NOT NULL DEFAULT 0,series_losses INTEGER NOT NULL DEFAULT 0,series_performance INTEGER NOT NULL DEFAULT 0,
   played INTEGER NOT NULL DEFAULT 0,wins INTEGER NOT NULL DEFAULT 0,losses INTEGER NOT NULL DEFAULT 0,
   last_change INTEGER NOT NULL DEFAULT 0,last_performance INTEGER NOT NULL DEFAULT 0,last_series_wins INTEGER NOT NULL DEFAULT 0,last_series_losses INTEGER NOT NULL DEFAULT 0,last_series_at INTEGER,
   at INTEGER NOT NULL,PRIMARY KEY(guild,user,act))`),
  env.DB.prepare('CREATE INDEX IF NOT EXISTS kp_escalation_rating_board ON kp_escalation_ratings(guild,act,measured,rating DESC,played DESC,user)'),
  env.DB.prepare('CREATE INDEX IF NOT EXISTS kp_escalation_rating_inherit ON kp_escalation_ratings(guild,user,measured,started_at DESC)'),
  env.DB.prepare('CREATE INDEX IF NOT EXISTS kp_escalation_rating_history ON kp_escalation_ratings(guild,user,at DESC,act)'),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS kp_escalation_power_matches(id TEXT PRIMARY KEY,guild TEXT NOT NULL,user TEXT NOT NULL,act TEXT NOT NULL,act_name TEXT,episode TEXT NOT NULL,started_at INTEGER NOT NULL,ended_at INTEGER NOT NULL,outcome TEXT NOT NULL CHECK(outcome IN ('win','loss')),performance INTEGER NOT NULL CHECK(performance BETWEEN 0 AND 3))`),
  env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS kp_escalation_power_apply AFTER INSERT ON kp_escalation_power_matches BEGIN
   INSERT INTO kp_escalation_current_acts(guild,act,name,episode,started_at) VALUES(NEW.guild,NEW.act,NEW.act_name,NEW.episode,NEW.started_at)
    ON CONFLICT(guild) DO UPDATE SET act=excluded.act,name=excluded.name,episode=excluded.episode,started_at=CASE WHEN excluded.act=act THEN started_at ELSE excluded.started_at END
    WHERE (excluded.act!=act AND excluded.started_at>started_at) OR (excluded.act=act AND ((name IS NULL AND excluded.name IS NOT NULL) OR (episode IS NULL AND excluded.episode IS NOT NULL)));
   INSERT OR IGNORE INTO kp_escalation_ratings(guild,user,act,act_name,episode,started_at,placement_kind,measurement_required,seed_rating,seed_mmr,rating,mmr,at)
    SELECT NEW.guild,NEW.user,NEW.act,NEW.act_name,NEW.episode,NEW.started_at,
     CASE WHEN p.act IS NULL THEN 'initial' WHEN p.episode=NEW.episode THEN 'act' ELSE 'episode' END,
     CASE WHEN p.episode=NEW.episode THEN 1 ELSE 3 END,COALESCE(p.rating,300),COALESCE(p.mmr,300),COALESCE(p.rating,300),COALESCE(p.mmr,300),NEW.ended_at
    FROM (SELECT 1) LEFT JOIN kp_escalation_ratings p ON p.guild=NEW.guild AND p.user=NEW.user AND p.act=(
     SELECT act FROM kp_escalation_ratings WHERE guild=NEW.guild AND user=NEW.user AND measured=1 AND started_at<NEW.started_at ORDER BY started_at DESC LIMIT 1);
   UPDATE kp_escalation_ratings SET
    rating=${nextRating},
    peak_rating=CASE WHEN measured=1 OR (${finishMeasure}) THEN MAX(peak_rating,(${nextRating})) ELSE peak_rating END,
    mmr=CASE WHEN (${finishMeasure}) AND placement_kind='initial' THEN (${placementRating}) ELSE MIN(9007199254740991,MAX(0,mmr+CASE WHEN NEW.outcome='win' THEN 30 ELSE -30 END+NEW.performance)) END,
    last_change=CASE WHEN ${finishMeasure} THEN (${placementRating})-seed_rating
     WHEN ${finishSeries} THEN MIN(9007199254740991-rating,MAX(-rating,(${seriesDelta}))) ELSE last_change END,
    last_performance=CASE WHEN ${finishMeasure} THEN ${placementPerformance} WHEN ${finishSeries} THEN ${seriesBonus} ELSE last_performance END,
    last_series_wins=CASE WHEN ${finishMeasure} THEN ${placementWins} WHEN ${finishSeries} THEN series_wins+(NEW.outcome='win') ELSE last_series_wins END,
    last_series_losses=CASE WHEN ${finishMeasure} THEN measurement_required-(${placementWins}) WHEN ${finishSeries} THEN series_losses+(NEW.outcome='loss') ELSE last_series_losses END,
    last_series_at=CASE WHEN (${finishMeasure}) OR (${finishSeries}) THEN NEW.ended_at ELSE last_series_at END,
    series_performance=CASE WHEN measured=0 OR series_wins+(NEW.outcome='win')=3 OR series_losses+(NEW.outcome='loss')=3 THEN 0 ELSE ${seriesBonus} END,
    series_wins=CASE WHEN measured=0 OR series_wins+(NEW.outcome='win')=3 OR series_losses+(NEW.outcome='loss')=3 THEN 0 ELSE series_wins+(NEW.outcome='win') END,
    series_losses=CASE WHEN measured=0 OR series_wins+(NEW.outcome='win')=3 OR series_losses+(NEW.outcome='loss')=3 THEN 0 ELSE series_losses+(NEW.outcome='loss') END,
    measurement_performance=CASE WHEN measured=0 THEN ${measureBonus} ELSE measurement_performance END,
    measured=CASE WHEN measurement_games+1>=measurement_required THEN 1 ELSE measured END,
    measurement_games=MIN(measurement_required,measurement_games+1),measurement_wins=measurement_wins+CASE WHEN measured=0 AND NEW.outcome='win' THEN 1 ELSE 0 END,
    played=played+1,wins=wins+(NEW.outcome='win'),losses=losses+(NEW.outcome='loss'),act_name=COALESCE(NEW.act_name,act_name),at=MAX(at,NEW.ended_at)
   WHERE guild=NEW.guild AND user=NEW.user AND act=NEW.act;
   UPDATE kp_state SET version=version+1 WHERE guild=NEW.guild AND user=NEW.user;
  END`),
 ]);})();ready.set(env.DB,job);try{await job;}catch(error){ready.delete(env.DB);throw error;}
}
export function escalationPowerStatement(env:KpEnv,e:{id:string;guild:string;user:string;outcome:string|null},proof:EscalationPowerProof){
 const a=proof.act,episode=a?.episode??escalationEpisode(a?.name);
 if(!episode||!['win','loss'].includes(e.outcome??'')||!a||typeof a.id!=='string'||!a.id.trim()||a.id.length>100||!Number.isSafeInteger(a.startedAt)||!Number.isSafeInteger(a.endedAt)||a.endedAt<=a.startedAt||!Number.isInteger(proof.performance)||proof.performance<0||proof.performance>3)throw Error('Invalid escalation power proof');
 return env.DB.prepare(`INSERT INTO kp_escalation_power_matches(id,guild,user,act,act_name,episode,started_at,ended_at,outcome,performance)
 SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM kp_events WHERE id=? AND guild=? AND user=? AND mode='escalation' AND policy=? AND outcome=?) ON CONFLICT(id) DO NOTHING`)
 .bind(e.id,e.guild,e.user,a.id,a.name,episode,a.startedAt,a.endedAt,e.outcome,proof.performance,e.id,e.guild,e.user,ESCALATION_RATING_POLICY,e.outcome);
}
interface CurrentAct {id:string;name:string|null;episode:string|null;startedAt:number}
const currentActs=new WeakMap<object,Map<string,{until:number;act:CurrentAct|null}>>();
const boards=new WeakMap<object,Map<string,{until:number;rows:BoardRow[]}>>();
interface BoardRow {user:string;rating:number;played:number;wins:number;losses:number}
export function invalidateEscalationBoard(env:KpEnv,guild:string){currentActs.get(env.DB)?.delete(guild);const map=boards.get(env.DB);if(map)for(const key of map.keys())if(key.startsWith(guild+'\0'))map.delete(key);}
export async function observeEscalationAct(env:KpEnv,guild:string,act:EscalationAct){
 const result=await env.DB.prepare(`INSERT INTO kp_escalation_current_acts(guild,act,name,episode,started_at) VALUES(?,?,?,?,?)
 ON CONFLICT(guild) DO UPDATE SET act=excluded.act,name=excluded.name,episode=excluded.episode,started_at=CASE WHEN excluded.act=act THEN started_at ELSE excluded.started_at END WHERE (excluded.act!=act AND excluded.started_at>started_at) OR (excluded.act=act AND ((name IS NULL AND excluded.name IS NOT NULL) OR (episode IS NULL AND excluded.episode IS NOT NULL)))`).bind(guild,act.id,act.name,act.episode??null,act.startedAt).run();
 if(result.meta.changes)invalidateEscalationBoard(env,guild);return result.meta.changes>0;
}
export async function syncEscalationPower(env:KpEnv,guild:string,user:string,id:string,raw:Match,puuid:string){
 const expected=['match',guild,raw.metadata?.match_id,puuid].map(v=>encodeURIComponent(String(v))).join(':');
 if(id!==expected)return false;
 const proof=escalationPowerProof(raw,puuid);if(!proof)return false;
 const outcome=assessRewardReadiness(raw,puuid);if(outcome.status!=='ready')return false;
 const rows=await env.DB.batch([escalationPowerStatement(env,{id,guild,user,outcome:outcome.outcome},proof),
  env.DB.prepare("UPDATE kp_reward_notes SET note=REPLACE(note,'（エスカランク：ACT・エピソード情報取得待ち）','（エスカランク：ACT情報を反映）') WHERE id=? AND EXISTS(SELECT 1 FROM kp_escalation_power_matches WHERE id=?)").bind(id,id),
 ]);
 if(rows[0].meta.changes)invalidateEscalationBoard(env,guild);return rows[0].meta.changes>0;
}
interface ActHistory {act:string;name:string|null;episode:string;rating:number;peakRating:number;measured:number;played:number;wins:number;losses:number;seriesWins:number;seriesLosses:number}
interface Rating extends BoardRow {placement_kind:string;measurement_required:number;seed_rating:number;peak_rating:number;episode:string;act:string;act_name:string|null;measured:number;measurement_games:number;measurement_wins:number;measurement_performance:number;series_wins:number;series_losses:number;series_performance:number;last_change:number;last_performance:number;last_series_wins:number;last_series_losses:number;last_series_at:number|null}
export async function escalationRatingView(env:KpEnv,guild:string,user:string,now=Date.now()){
 await ensureEscalationRating(env);
 let actCache=currentActs.get(env.DB);if(!actCache){actCache=new Map();currentActs.set(env.DB,actCache);}
 let current=actCache.get(guild);
 if(!current||current.until<=now){const act=await env.DB.prepare('SELECT act AS id,name,episode,started_at AS startedAt FROM kp_escalation_current_acts WHERE guild=?').bind(guild).first<CurrentAct>();current={act,until:now+60000};actCache.set(guild,current);}
 const act=current.act;
 const me=act?await env.DB.prepare('SELECT user,act,act_name,episode,placement_kind,measurement_required,seed_rating,peak_rating,rating,measured,measurement_games,measurement_wins,measurement_performance,series_wins,series_losses,series_performance,played,wins,losses,last_change,last_performance,last_series_wins,last_series_losses,last_series_at FROM kp_escalation_ratings WHERE guild=? AND user=? AND act=?').bind(guild,user,act.id).first<Rating>():null;
 let boardCache=boards.get(env.DB);if(!boardCache){boardCache=new Map();boards.set(env.DB,boardCache);}
 const key=guild+'\0'+(act?.id??'');let board=boardCache.get(key);
 if(!board||board.until<=now){const rows=act?(await env.DB.prepare('SELECT user,rating,played,wins,losses FROM kp_escalation_ratings WHERE guild=? AND act=? AND measured=1 ORDER BY rating DESC,played DESC,user LIMIT 10').bind(guild,act.id).all<BoardRow>()).results:[];board={until:now+60000,rows};boardCache.set(key,board);if(boardCache.size>16)boardCache.delete(boardCache.keys().next().value!);}
 const previousActs=act?(await env.DB.prepare('SELECT act,act_name AS name,episode,rating,peak_rating AS peakRating,measured,played,wins,losses,series_wins AS seriesWins,series_losses AS seriesLosses FROM kp_escalation_ratings WHERE guild=? AND user=? AND act!=? ORDER BY at DESC,act LIMIT 3').bind(guild,user,act.id).all<ActHistory>()).results:[];
 const previous=previousActs.find(a=>a.measured);
 const placementKind=me?.placement_kind??(act&&!act.episode?'waiting':!previous?'initial':previous.episode===act?.episode?'act':'episode');
 const history=previousActs.map(a=>({...a,grade:a.measured?escalationGrade(Number(a.rating)):'未認定',peakGrade:a.measured?escalationGrade(Number(a.peakRating)):'未認定'}));
 return {act:act?{id:act.id,name:act.name,episode:act.episode}:null,rating:me?.measured?me.rating:null,rank:me?.measured?escalationRank(me.rating):null,grade:me?.measured?escalationGrade(me.rating):'認定中',placementKind,measurementRequired:me?.measurement_required??(placementKind==='waiting'?null:placementKind==='act'?1:3),inheritedRank:me&&me.placement_kind!=='initial'?escalationRank(me.seed_rating):previous?escalationRank(previous.rating):null,peakGrade:me?.measured?escalationGrade(me.peak_rating):null,measurementGames:me?.measurement_games??0,measurementWins:me?.measurement_wins??0,measurementPerformance:me?.measurement_performance??0,seriesWins:me?.series_wins??0,seriesLosses:me?.series_losses??0,seriesPerformance:me?.series_performance??0,played:me?.played??0,wins:me?.wins??0,losses:me?.losses??0,lastChange:me?.last_change??0,lastPerformance:me?.last_performance??0,lastSeriesWins:me?.last_series_wins??0,lastSeriesLosses:me?.last_series_losses??0,lastSeriesAt:me?.last_series_at??null,leaders:board.rows.map(r=>({...r,grade:escalationGrade(r.rating),rank:escalationRank(r.rating)})),previousActs:history};
}
