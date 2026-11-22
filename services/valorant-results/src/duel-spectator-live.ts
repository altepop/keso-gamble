/** P10: invited spectator service. All API callers already require authenticated KP sessions. */
import type {KpEnv,KpMapping} from './kp.ts';
import {ensureBoardDuels,type BoardDuel} from './board-duels.ts';
import {kpTargetAllowed} from './kp-target-members.ts';
import {spectatorPublicSnapshot} from './duel-spectator-public.ts';
import {compareSpectatorRevision,decideSpectatorAdmission} from './duel-spectator-admission.ts';
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const SNOWFLAKE=/^\d{15,22}$/;
const MAX_VIEWERS=4;
const FINISHED_VISIBLE_MS=60*60_000;
export class SpectatorAccessError extends Error{
 constructor(public status:number=404){super('spectator_unavailable');}
}
export type SpectatorConsent={guild:string;match_id:string;viewer:string;user_a:string;user_b:string;
 approved_a:number;approved_b:number;updated_at:number};
const installed=new WeakMap<object,Promise<void>>();
async function ensureConsentTable(env:KpEnv){
 const ready=installed.get(env.DB);if(ready)return ready;
 const job=(async()=>{
  await ensureBoardDuels(env);
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS kp_duel_spectator_consent(
   guild TEXT NOT NULL,match_id TEXT NOT NULL,viewer TEXT NOT NULL,
   user_a TEXT NOT NULL,user_b TEXT NOT NULL,
   approved_a INTEGER NOT NULL DEFAULT 0 CHECK(approved_a IN (0,1)),
   approved_b INTEGER NOT NULL DEFAULT 0 CHECK(approved_b IN (0,1)),
   updated_at INTEGER NOT NULL,
   PRIMARY KEY(guild,match_id,viewer)
  ) STRICT`).run();
 })();
 installed.set(env.DB,job);try{await job;}catch(e){installed.delete(env.DB);throw e;}
}
function validMatchId(id:unknown):id is string{return typeof id==='string'&&UUID.test(id);}
async function loadMatch(env:KpEnv,guild:string,id:unknown):Promise<BoardDuel>{
 if(!validMatchId(id))throw new SpectatorAccessError();
 const match=await env.DB.prepare('SELECT * FROM kp_board_duels WHERE guild=? AND id=?')
  .bind(guild,id).first<BoardDuel>();
 if(!match)throw new SpectatorAccessError();
 return match;
}
export function allowedSpectator(viewer:string,guild:string,match:BoardDuel,consent:SpectatorConsent|null,now:number):boolean{
 if(!SNOWFLAKE.test(viewer)||!SNOWFLAKE.test(guild)||!consent)return false;
 if(consent.guild!==guild||consent.match_id!==match.id||consent.viewer!==viewer||
   consent.user_a!==match.user_a||consent.user_b!==match.user_b||
   consent.approved_a!==1||consent.approved_b!==1)return false;
 if(match.status!=='active' && !(match.status==='finished' &&
  Number.isSafeInteger(match.updated_at)&&now>=match.updated_at&&
  now-match.updated_at<=FINISHED_VISIBLE_MS))return false;
 const decision=decideSpectatorAdmission({
  viewer,viewerGuild:guild,matchGuild:match.guild,matchId:match.id,approvedViewerIds:[viewer],
 });
 return decision.allowed;
}
async function loadConsent(env:KpEnv,guild:string,id:string,viewer:string){
 return env.DB.prepare('SELECT * FROM kp_duel_spectator_consent WHERE guild=? AND match_id=? AND viewer=?')
  .bind(guild,id,viewer).first<SpectatorConsent>();
}
export async function saveSpectatorConsent(env:KpEnv,m:KpMapping,actor:string,
 data:{id:unknown;viewer:unknown;approved:unknown}){
 await ensureConsentTable(env);
 const match=await loadMatch(env,m.guildId,data.id);
 if(actor!==match.user_a&&actor!==match.user_b)throw new SpectatorAccessError();
 if(match.status!=='pending'&&match.status!=='active')throw new SpectatorAccessError();
 if(typeof data.viewer!=='string'||!SNOWFLAKE.test(data.viewer)||
  data.viewer===match.user_a||data.viewer===match.user_b||
  !await kpTargetAllowed(env,m,data.viewer))throw new SpectatorAccessError();
 if(typeof data.approved!=='boolean')throw new SpectatorAccessError(400);
 const viewer=data.viewer,now=Date.now();
 await env.DB.prepare(`INSERT INTO kp_duel_spectator_consent
 (guild,match_id,viewer,user_a,user_b,approved_a,approved_b,updated_at)
 SELECT ?,?,?,?,?,0,0,? WHERE
 (SELECT COUNT(*) FROM kp_duel_spectator_consent WHERE guild=? AND match_id=?)<?
 ON CONFLICT(guild,match_id,viewer) DO NOTHING`)
 .bind(m.guildId,match.id,viewer,match.user_a,match.user_b,now,m.guildId,match.id,MAX_VIEWERS).run();
 if(data.approved===false){
  // A revocation clears both consent flags, requiring both people to approve anew.
  await env.DB.prepare(`UPDATE kp_duel_spectator_consent
   SET approved_a=0,approved_b=0,updated_at=? WHERE guild=? AND match_id=? AND viewer=?`)
   .bind(now,m.guildId,match.id,viewer).run();
 }else{
  const column=actor===match.user_a?'approved_a':'approved_b';
  await env.DB.prepare('UPDATE kp_duel_spectator_consent SET '+column+'=1,updated_at=? WHERE guild=? AND match_id=? AND viewer=?')
   .bind(now,m.guildId,match.id,viewer).run();
 }
 const row=await loadConsent(env,m.guildId,match.id,viewer);
 if(!row||row.user_a!==match.user_a||row.user_b!==match.user_b)throw new SpectatorAccessError(429);
 return {viewer,matchId:match.id,approvedByA:row.approved_a===1,
  approvedByB:row.approved_b===1,allowed:row.approved_a===1&&row.approved_b===1};
}
export async function readSpectatorMatch(env:KpEnv,guild:string,viewer:string,id:string,version:number|null){
 await ensureConsentTable(env);
 const match=await loadMatch(env,guild,id);
 const permission=await loadConsent(env,guild,match.id,viewer);
 if(!allowedSpectator(viewer,guild,match,permission,Date.now()))throw new SpectatorAccessError();
 return compareSpectatorRevision(spectatorPublicSnapshot(match),version);
}
