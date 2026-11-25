// Phase 3-E2: validation for authenticated administrator configuration only.
// A verified interaction signature and administrator permission are required by the caller.
// No endpoint, D1 mutation or delivery is registered in this stage.
export type CoachAdminChannelInput={
 signatureVerified:boolean; administratorPermissionVerified:boolean;
 guildId:string; expectedGuildId:string; channelId:string;
 timestampMs:number; nowMs:number; expectedVersion:number;
 enabled:boolean;
};
const snowflake=(s:string)=>/^\d{15,22}$/.test(s);
export const COACH_ADMIN_MAX_AGE_MS=5*60*1000;
export function validCoachAdminChannelConfiguration(i:CoachAdminChannelInput):boolean{
 if(i.signatureVerified!==true||i.administratorPermissionVerified!==true)return false;
 if(!snowflake(i.guildId)||i.guildId!==i.expectedGuildId||!snowflake(i.channelId))return false;
 if(typeof i.enabled!=='boolean'||!Number.isSafeInteger(i.expectedVersion)||
  i.expectedVersion<0||i.expectedVersion>2147483647)return false;
 if(!Number.isSafeInteger(i.timestampMs)||!Number.isSafeInteger(i.nowMs)||
  i.timestampMs<0||i.nowMs<0)return false;
 const age=i.nowMs-i.timestampMs;
 return age>=0&&age<=COACH_ADMIN_MAX_AGE_MS;
}
