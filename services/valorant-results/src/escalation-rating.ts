import type {KpEnv} from './kp.ts';
export const ESCALATION_RATING_POLICY='escalation-power-v1';
export const ESCALATION_MEASUREMENT_GAMES=5;
export const ESCALATION_SERIES_GAINS=[100,70,40] as const;
export function escalationGrade(rating:number){return rating>=2600?'X':rating>=2400?'S+':rating>=2200?'S':rating>=2000?'A':rating>=1800?'B':rating>=1600?'C':'D';}
const ready=new WeakMap<object,Promise<void>>();
/** KP events already provide the immutable receipt and its unique ID. A trigger updates
 * power in the SAME transaction; no second receipt table or per-minute scan is needed. */
export async function ensureEscalationRating(env:KpEnv){
 const previous=ready.get(env.DB);if(previous)return previous;
 const job=(async()=>{await env.DB.batch([
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS kp_escalation_ratings(
   guild TEXT NOT NULL,user TEXT NOT NULL,rating INTEGER NOT NULL DEFAULT 2000 CHECK(rating BETWEEN 0 AND 9007199254740991),
   measured INTEGER NOT NULL DEFAULT 0,measurement_games INTEGER NOT NULL DEFAULT 0,measurement_wins INTEGER NOT NULL DEFAULT 0,
   series_wins INTEGER NOT NULL DEFAULT 0,series_losses INTEGER NOT NULL DEFAULT 0,
   played INTEGER NOT NULL DEFAULT 0,wins INTEGER NOT NULL DEFAULT 0,losses INTEGER NOT NULL DEFAULT 0,
   last_change INTEGER NOT NULL DEFAULT 0,last_series_wins INTEGER NOT NULL DEFAULT 0,last_series_losses INTEGER NOT NULL DEFAULT 0,last_series_at INTEGER,
   at INTEGER NOT NULL,PRIMARY KEY(guild,user))`),
  env.DB.prepare('CREATE INDEX IF NOT EXISTS kp_escalation_rating_board ON kp_escalation_ratings(guild,measured,rating DESC,played DESC,user)'),
  env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS kp_escalation_rating_apply AFTER INSERT ON kp_events
   WHEN NEW.mode='escalation' AND NEW.policy='${ESCALATION_RATING_POLICY}' AND NEW.outcome IN ('win','loss') BEGIN
   INSERT OR IGNORE INTO kp_escalation_ratings(guild,user,at) VALUES(NEW.guild,NEW.user,NEW.at);
   UPDATE kp_escalation_ratings SET
    rating=CASE WHEN measured=0 AND measurement_games+1=5 THEN 1500+200*(measurement_wins+(NEW.outcome='win'))
     WHEN measured=1 AND (series_wins+(NEW.outcome='win')=3 OR series_losses+(NEW.outcome='loss')=3)
     THEN MIN(9007199254740991,MAX(0,rating+CASE WHEN NEW.outcome='win' THEN CASE series_losses WHEN 0 THEN 100 WHEN 1 THEN 70 ELSE 40 END ELSE -CASE series_wins WHEN 0 THEN 100 WHEN 1 THEN 70 ELSE 40 END END)) ELSE rating END,
    last_change=CASE WHEN measured=0 AND measurement_games+1=5 THEN 1500+200*(measurement_wins+(NEW.outcome='win'))-2000
     WHEN measured=1 AND (series_wins+(NEW.outcome='win')=3 OR series_losses+(NEW.outcome='loss')=3)
     THEN MIN(9007199254740991-rating,MAX(-rating,CASE WHEN NEW.outcome='win' THEN CASE series_losses WHEN 0 THEN 100 WHEN 1 THEN 70 ELSE 40 END ELSE -CASE series_wins WHEN 0 THEN 100 WHEN 1 THEN 70 ELSE 40 END END)) ELSE last_change END,
    last_series_wins=CASE WHEN measured=0 AND measurement_games+1=5 THEN measurement_wins+(NEW.outcome='win') WHEN measured=1 AND (series_wins+(NEW.outcome='win')=3 OR series_losses+(NEW.outcome='loss')=3) THEN series_wins+(NEW.outcome='win') ELSE last_series_wins END,
    last_series_losses=CASE WHEN measured=0 AND measurement_games+1=5 THEN 5-measurement_wins-(NEW.outcome='win') WHEN measured=1 AND (series_wins+(NEW.outcome='win')=3 OR series_losses+(NEW.outcome='loss')=3) THEN series_losses+(NEW.outcome='loss') ELSE last_series_losses END,
    last_series_at=CASE WHEN (measured=0 AND measurement_games+1=5) OR (measured=1 AND (series_wins+(NEW.outcome='win')=3 OR series_losses+(NEW.outcome='loss')=3)) THEN NEW.at ELSE last_series_at END,
    series_wins=CASE WHEN measured=0 OR series_wins+(NEW.outcome='win')=3 OR series_losses+(NEW.outcome='loss')=3 THEN 0 ELSE series_wins+(NEW.outcome='win') END,
    series_losses=CASE WHEN measured=0 OR series_wins+(NEW.outcome='win')=3 OR series_losses+(NEW.outcome='loss')=3 THEN 0 ELSE series_losses+(NEW.outcome='loss') END,
    measured=CASE WHEN measurement_games+1>=5 THEN 1 ELSE measured END,
    measurement_games=MIN(5,measurement_games+1),measurement_wins=measurement_wins+CASE WHEN measured=0 AND NEW.outcome='win' THEN 1 ELSE 0 END,
    played=played+1,wins=wins+(NEW.outcome='win'),losses=losses+(NEW.outcome='loss'),at=MAX(at,NEW.at)
   WHERE guild=NEW.guild AND user=NEW.user;
   UPDATE kp_state SET version=version+1 WHERE guild=NEW.guild AND user=NEW.user;
  END`),
 ]);})();ready.set(env.DB,job);try{await job;}catch(error){ready.delete(env.DB);throw error;}
}
interface Rating {user:string;rating:number;measured:number;measurement_games:number;measurement_wins:number;series_wins:number;series_losses:number;played:number;wins:number;losses:number;last_change:number;last_series_wins:number;last_series_losses:number;last_series_at:number|null}
const boards=new WeakMap<object,Map<string,{until:number;rows:Pick<Rating,'user'|'rating'|'played'|'wins'|'losses'>[]}>>();
export function invalidateEscalationBoard(env:KpEnv,guild:string){boards.get(env.DB)?.delete(guild);}
export async function escalationRatingView(env:KpEnv,guild:string,user:string,now=Date.now()){
 await ensureEscalationRating(env);
 const me=await env.DB.prepare('SELECT user,rating,measured,measurement_games,measurement_wins,series_wins,series_losses,played,wins,losses,last_change,last_series_wins,last_series_losses,last_series_at FROM kp_escalation_ratings WHERE guild=? AND user=?').bind(guild,user).first<Rating>();
 let cache=boards.get(env.DB);if(!cache){cache=new Map();boards.set(env.DB,cache);}
 let board=cache.get(guild);
 if(!board||board.until<=now){const rows=(await env.DB.prepare('SELECT user,rating,played,wins,losses FROM kp_escalation_ratings WHERE guild=? AND measured=1 ORDER BY rating DESC,played DESC,user LIMIT 10').bind(guild).all<Pick<Rating,'user'|'rating'|'played'|'wins'|'losses'>>()).results;board={until:now+60000,rows};cache.set(guild,board);}
 return {rating:me?.measured?me.rating:null,grade:me?.measured?escalationGrade(me.rating):'計測中',measurementGames:me?.measurement_games??0,measurementWins:me?.measurement_wins??0,seriesWins:me?.series_wins??0,seriesLosses:me?.series_losses??0,played:me?.played??0,wins:me?.wins??0,losses:me?.losses??0,lastChange:me?.last_change??0,lastSeriesWins:me?.last_series_wins??0,lastSeriesLosses:me?.last_series_losses??0,lastSeriesAt:me?.last_series_at??null,leaders:board.rows.map(r=>({...r,grade:escalationGrade(r.rating)}))};
}
