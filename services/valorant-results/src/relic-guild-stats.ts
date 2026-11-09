import {ensureRelicEconomy} from './relic-economy.ts';
// Optional UI-only guild-wide relic economy totals. These are not used for
// settlement, wallet balances, security checks, inventory or reward caps.
// Short-lived per-isolate, per-binding cache avoids re-aggregating every relic
// ledger receipt whenever multiple members view the relic screen.
// A different isolate or D1 binding may refresh independently; this is best-effort.
export interface GuildVerifiedRelicStats {n:number;players:number;total:number}
export const GUILD_RELIC_STATS_TTL_MS=3*60_000;
export const GUILD_RELIC_STATS_SQL="SELECT COALESCE(SUM(n),0) AS n,COUNT(*) AS players,COALESCE(SUM(total),0) AS total FROM kp_relic_totals WHERE guild=? AND n>0";
interface Entry {expires:number;promise:Promise<GuildVerifiedRelicStats|null>}
const caches=new WeakMap<D1Database,Map<string,Entry>>();

export async function guildVerifiedRelicStats(
 db:D1Database,guild:string,now=Date.now()
):Promise<GuildVerifiedRelicStats|null>{
 let byGuild=caches.get(db);
 if(!byGuild){byGuild=new Map();caches.set(db,byGuild);}
 const current=byGuild.get(guild);
 if(current && now<current.expires)return current.promise;
 const promise=ensureRelicEconomy(db).then(()=>db.prepare(GUILD_RELIC_STATS_SQL).bind(guild).first<GuildVerifiedRelicStats>())
  .then(row=>{
   if(!row || !Number.isFinite(row.n) || !Number.isFinite(row.players) || !Number.isFinite(row.total)){
    if(byGuild!.get(guild)?.promise===promise)byGuild!.delete(guild);
    return null;
   }
   return row;
  }).catch(()=>{
   // Never cache D1 errors: the next request can recover without a deploy.
   if(byGuild!.get(guild)?.promise===promise)byGuild!.delete(guild);
   return null;
  });
 byGuild.set(guild,{expires:now+GUILD_RELIC_STATS_TTL_MS,promise});
 return promise;
}
