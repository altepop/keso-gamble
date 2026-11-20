import {verifyCoachDiscordSignature} from './coach-discord-signature.ts';
import {validCoachAdminChannelConfiguration} from './coach-team-admin-channel-policy.ts';
export type CoachSignedChannelCommand={channelId:string;enabled:boolean;expectedVersion:number};
const snowflake=(s:unknown):s is string=>typeof s==='string'&&/^\d{15,22}$/.test(s);
// Validate the *signed* Discord interaction. Never accept role or signature flags from JSON.
export async function parseSignedCoachAdminChannelCommand(input:{
 publicKeyHex:string;signatureHex:string;timestamp:string;rawBody:string;
 expectedGuildId:string;expectedApplicationId:string;nowSeconds:number;
}):Promise<CoachSignedChannelCommand|null>{
 if(!await verifyCoachDiscordSignature(input))return null;
 let v:any;
 try{v=JSON.parse(input.rawBody);}catch{return null;}
 if(!v||typeof v!=='object'||Array.isArray(v)||v.type!==2||
  v.application_id!==input.expectedApplicationId||!snowflake(v.application_id)||
  v.guild_id!==input.expectedGuildId||!snowflake(v.guild_id)||
  !snowflake(v.member?.user?.id))return null;
 const perm=v.member?.permissions;
 if(typeof perm!=='string'||!/^\d{1,20}$/.test(perm))return null;
 try{if((BigInt(perm)&8n)!==8n)return null;}catch{return null;}
 if(v.data?.name!=='coach_notice_channel'||!Array.isArray(v.data.options)||
  v.data.options.length!==3)return null;
 const options=v.data.options;
 const has=(name:string,type:number)=>options.filter((o:any)=>o&&o.name===name&&o.type===type);
 const channel=has('channel',7),enabled=has('enabled',5),version=has('expected_version',4);
 if(channel.length!==1||enabled.length!==1||version.length!==1||
  typeof enabled[0].value!=='boolean'||!Number.isSafeInteger(version[0].value))return null;
 const channelId=channel[0].value,expectedVersion=version[0].value;
 if(typeof channelId!=='string')return null;
 if(!validCoachAdminChannelConfiguration({
  signatureVerified:true,administratorPermissionVerified:true,
  guildId:v.guild_id,expectedGuildId:input.expectedGuildId,channelId,
  enabled:enabled[0].value,expectedVersion,
  timestampMs:Number(input.timestamp)*1000,nowMs:input.nowSeconds*1000
 }))return null;
 return {channelId,enabled:enabled[0].value,expectedVersion};
}
