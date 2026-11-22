/** Phase 12: bounded owner-only completed match preservation export.
 * Read-only, no secrets/private hands, no KP-ledger mutation or destructive retention.
 * The HTTP route must authenticate and authorize owner before calling.
 */
import type {KpEnv} from './kp.ts';
const SNOWFLAKE=/^\d{15,22}$/;
export const DUEL_PRESERVATION_BATCH=50;
export async function duelPreservationExport(env:Pick<KpEnv,'DB'>,guild:string,now=Date.now()){
 if(!SNOWFLAKE.test(guild)||!Number.isSafeInteger(now)||now<0)throw Error('Invalid preservation request');
 const [pve,pvp]=await Promise.all([
  env.DB.prepare(`SELECT id,game,difficulty,turn,winner,version,created_at,updated_at
   FROM kp_duel_pve_sessions WHERE guild=? AND turn='finished'
   ORDER BY updated_at DESC,id DESC LIMIT ?`).bind(guild,DUEL_PRESERVATION_BATCH).all<{
    id:string;game:string;difficulty:string;turn:string;winner:string|null;version:number;created_at:number;updated_at:number
   }>(),
  env.DB.prepare(`SELECT id,game,status,winner,version,created_at,updated_at
   FROM kp_board_duels WHERE guild=? AND status IN ('finished','cancelled')
   ORDER BY updated_at DESC,id DESC LIMIT ?`).bind(guild,DUEL_PRESERVATION_BATCH).all<{
    id:string;game:string;status:string;winner:string|null;version:number;created_at:number;updated_at:number
   }>()
 ]);
 // Explicit projection, no guild members, usernames, private hands, wallet, secret, auth or KP amount.
 return {kind:'duel-completed-public-snapshot',generatedAt:now,complete:false,
  maximumPerMode:DUEL_PRESERVATION_BATCH,
  note:'最近の確定対戦のみ。原本・全履歴・復元用バックアップではありません。',
  pve:(pve.results??[]).map(r=>({id:r.id,game:r.game,difficulty:r.difficulty,status:r.turn,winner:r.winner,version:r.version,createdAt:r.created_at,updatedAt:r.updated_at})),
  pvp:(pvp.results??[]).map(r=>({id:r.id,game:r.game,status:r.status,winner:r.winner,version:r.version,createdAt:r.created_at,updatedAt:r.updated_at}))};
}
