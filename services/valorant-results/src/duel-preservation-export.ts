/** Phase 12: bounded owner-only completed match preservation export.
 * Read-only, no secrets/private hands, no KP-ledger mutation or destructive retention.
 * The HTTP route must authenticate and authorize owner before calling.
 */
import type {KpEnv} from './kp.ts';
const SNOWFLAKE=/^\d{15,22}$/;
export const DUEL_PRESERVATION_BATCH=50;
export async function duelPreservationExport(env:Pick<KpEnv,'DB'>,guild:string,now=Date.now()){
 if(!SNOWFLAKE.test(guild)||!Number.isSafeInteger(now)||now<0)throw Error('Invalid preservation request');
 // Preserve independent 50-row caps per mode while saving one D1 SELECT
 // invocation. Source tables are separately filtered before UNION ALL, and
 // the final sort preserves each mode's original updated_at/id order.
 const result=await env.DB.prepare(`SELECT
   'pve' AS mode,id,game,difficulty,turn AS status,winner,version,created_at,updated_at
   FROM (
     SELECT id,game,difficulty,turn,winner,version,created_at,updated_at
     FROM kp_duel_pve_sessions WHERE guild=? AND turn='finished'
     ORDER BY updated_at DESC,id DESC LIMIT ?
   )
   UNION ALL
   SELECT 'pvp' AS mode,id,game,NULL AS difficulty,status,winner,version,created_at,updated_at
   FROM (
     SELECT id,game,status,winner,version,created_at,updated_at
     FROM kp_board_duels WHERE guild=? AND status IN ('finished','cancelled')
     ORDER BY updated_at DESC,id DESC LIMIT ?
   )
   ORDER BY mode ASC,updated_at DESC,id DESC`)
  .bind(guild,DUEL_PRESERVATION_BATCH,guild,DUEL_PRESERVATION_BATCH)
  .all<{mode:'pve'|'pvp';id:string;game:string;difficulty:string|null;status:string;
    winner:string|null;version:number;created_at:number;updated_at:number}>();
 const pve: Array<{id:string;game:string;difficulty:string;status:string;winner:string|null;version:number;createdAt:number;updatedAt:number}>=[];
 const pvp: Array<{id:string;game:string;status:string;winner:string|null;version:number;createdAt:number;updatedAt:number}>=[];
 for(const row of result.results??[]){
  if(row.mode==='pve'){
   if(row.difficulty===null)throw Error('Invalid PvE preservation row');
   pve.push({id:row.id,game:row.game,difficulty:row.difficulty,status:row.status,
    winner:row.winner,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at});
  }else if(row.mode==='pvp'){
   pvp.push({id:row.id,game:row.game,status:row.status,winner:row.winner,
    version:row.version,createdAt:row.created_at,updatedAt:row.updated_at});
  }else throw Error('Invalid preservation mode');
 }
 // Explicit projection, no guild members, usernames, private hands, wallet, secret, auth or KP amount.
 return {kind:'duel-completed-public-snapshot',generatedAt:now,complete:false,
  maximumPerMode:DUEL_PRESERVATION_BATCH,
  note:'最近の確定対戦のみ。原本・全履歴・復元用バックアップではありません。',
  pve,pvp};
}
