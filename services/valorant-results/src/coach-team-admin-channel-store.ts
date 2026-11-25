import {parseSignedCoachAdminChannelCommand} from './coach-team-signed-admin-command.ts';
// Not registered as an HTTP handler; no production D1 writes are triggered.
// This persistence adapter is intentionally disable-only until delivery approval.
export async function saveSignedCoachChannelDisabled(db:D1Database,input:{
 publicKeyHex:string;signatureHex:string;timestamp:string;rawBody:string;
 expectedGuildId:string;expectedApplicationId:string;nowSeconds:number;
}):Promise<{version:number}|null>{
 const command=await parseSignedCoachAdminChannelCommand(input);
 if(!command||command.enabled!==false)return null;
 let message:any;
 try{message=JSON.parse(input.rawBody);}catch{return null;}
 const admin=message?.member?.user?.id;
 const interactionId=message?.id;
 if(typeof admin!=='string'||!new RegExp('^[0-9]{15,22}$').test(admin)||
  typeof interactionId!=='string'||!new RegExp('^[0-9]{15,22}$').test(interactionId))return null;
 // Atomic uniqueness gate: duplicate signed interactions are never applied twice.
 // Requires the additive receipt migration; missing table fails closed before channel writes.
 // An unsuccessful CAS may consume a receipt (fail closed), not accidentally enable notices.
 const receipt=await db.prepare(`INSERT OR IGNORE INTO coach_team_admin_interaction_receipts
 (guild,interaction_id,consumed_at) VALUES(?,?,?) RETURNING interaction_id`)
  .bind(input.expectedGuildId,interactionId,input.nowSeconds*1000).first<{interaction_id:string}>();
 if(!receipt)return null;
 if(command.expectedVersion===0){
  return await db.prepare(`INSERT OR IGNORE INTO coach_team_notice_channels
  (guild,team_id,channel_id,enabled,version,configured_by,updated_at)
  VALUES(?,'coach-roster-v1',?,0,1,?,?) RETURNING version`)
   .bind(input.expectedGuildId,command.channelId,admin,input.nowSeconds*1000).first<{version:number}>();
 }
 return await db.prepare(`UPDATE coach_team_notice_channels SET channel_id=?,enabled=0,
  version=version+1,configured_by=?,updated_at=?
  WHERE guild=? AND team_id='coach-roster-v1' AND version=? RETURNING version`)
  .bind(command.channelId,admin,input.nowSeconds*1000,input.expectedGuildId,command.expectedVersion)
  .first<{version:number}>();
}
