/** P10 approved on 2026-11-22: registered primary Discord accounts may view
 * all same-guild duels. Explicitly registered secondary accounts are excluded.
 * No spectators table, consent flag, opt-in, public URLs or KP mutation.
 */
import type {KpEnv,KpMapping} from './kp.ts';
import {ensureBoardDuels,type BoardDuel} from './board-duels.ts';
import {kpTargetAllowed} from './kp-target-members.ts';
import {isRegisteredSecondaryDiscordAccount} from './prediction-identity.ts';
import {spectatorPublicSnapshot} from './duel-spectator-public.ts';
import {compareSpectatorRevision} from './duel-spectator-admission.ts';

const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const SNOWFLAKE=/^\d{15,22}$/;
const FINISHED_VISIBLE_MS=60*60_000;
export class SpectatorAccessError extends Error {
 readonly status:number;
 constructor(status=404){super('spectator_unavailable');this.status=status;}
}
export function allowedSpectator(viewer:string,guild:string,match:BoardDuel,now:number):boolean {
 if(!SNOWFLAKE.test(viewer)||!SNOWFLAKE.test(guild)||!match||
   match.guild!==guild||!UUID.test(match.id)||match.user_a===match.user_b)return false;
 return match.status==='active'||(match.status==='finished'&&
  Number.isSafeInteger(match.updated_at)&&now>=match.updated_at&&
  now-match.updated_at<=FINISHED_VISIBLE_MS);
}
export async function isEligibleMainSpectator(env:KpEnv,mapping:KpMapping,user:string):Promise<boolean> {
 if(!SNOWFLAKE.test(user))return false;
 // A known secondary remains denied even if it was registered as a KP participant.
 if(await isRegisteredSecondaryDiscordAccount(mapping,user))return false;
 return kpTargetAllowed(env,mapping,user);
}
export async function readSpectatorMatch(env:KpEnv,mapping:KpMapping,viewer:string,
 id:string,version:number|null){
 if(!UUID.test(id)||!await isEligibleMainSpectator(env,mapping,viewer))
  throw new SpectatorAccessError();
 await ensureBoardDuels(env);
 const match=await env.DB.prepare('SELECT * FROM kp_board_duels WHERE guild=? AND id=?')
  .bind(mapping.guildId,id).first<BoardDuel>();
 if(!match||!allowedSpectator(viewer,mapping.guildId,match,Date.now()))
  throw new SpectatorAccessError();
 // Projection is a strict allowlist. Never return the DB row or private hand.
 return compareSpectatorRevision(spectatorPublicSnapshot(match),version);
}
/** P12: use the existing guild/status/updated_at index separately for
 * active and recently finished rooms, bounded to 25 per mutually exclusive
 * status before the final 25-row merge. No public/private projection changes.
 */
export const SPECTATOR_STATUS_LIST_SQL=`SELECT id,guild,game,status,user_a,user_b,version,updated_at FROM (
 SELECT id,guild,game,status,user_a,user_b,version,updated_at
 FROM kp_board_duels WHERE guild=? AND status='active'
 ORDER BY updated_at DESC LIMIT 25
) UNION ALL SELECT id,guild,game,status,user_a,user_b,version,updated_at FROM (
 SELECT id,guild,game,status,user_a,user_b,version,updated_at
 FROM kp_board_duels WHERE guild=? AND status='finished' AND updated_at>=?
 ORDER BY updated_at DESC LIMIT 25
) ORDER BY updated_at DESC LIMIT 25`;
export async function listSpectatorMatches(env:KpEnv,mapping:KpMapping,viewer:string){
 if(!await isEligibleMainSpectator(env,mapping,viewer))throw new SpectatorAccessError();
 await ensureBoardDuels(env);
 const now=Date.now();
 const rows=(await env.DB.prepare(SPECTATOR_STATUS_LIST_SQL)
  .bind(mapping.guildId,mapping.guildId,now-FINISHED_VISIBLE_MS).all<BoardDuel>()).results;
 return {matches:rows.filter(row=>allowedSpectator(viewer,mapping.guildId,row,now))
  .map(row=>({id:row.id,game:row.game,status:row.status,
   participants:[row.user_a,row.user_b],version:row.version,updatedAt:row.updated_at})),
  sync:'sse-first',source:'server-verified'};
}
