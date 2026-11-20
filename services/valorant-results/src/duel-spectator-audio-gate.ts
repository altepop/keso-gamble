/** Phase 10 P10.3 — audio/voice delivery safety gate (NOT active).
 * Callers must use a server-authorized publication grant and separately
 * approved audio policy. This code never plays sound or posts to Discord.
 */
import type {SpectatorCue} from './duel-spectator-cues.ts';
export type CuePermission={
  publicationApproved:boolean;
  audioPolicyApproved:boolean;
  viewerOptedIn:boolean;
  channelOptedIn:boolean;
  muted:boolean;
  reducedMotion:boolean;
};
export type CueDelivery=
  | {ok:false;reason:'publication_unapproved'|'audio_unapproved'|'not_opted_in'|'muted'|'invalid_cue'}
  | {ok:true;event:{kind:SpectatorCue['kind'];matchId:string;version:number;caption:string}};
export function prepareSpectatorAudioCue(cue:SpectatorCue|null,permission:CuePermission):CueDelivery{
  // Runtime permission data is not trustworthy merely because TypeScript types it.
  // Require literal booleans for every approval, opt-in and suppression flag.
  if(!permission||permission.publicationApproved!==true)return {ok:false,reason:'publication_unapproved'};
  if(permission.audioPolicyApproved!==true)return {ok:false,reason:'audio_unapproved'};
  if(permission.viewerOptedIn!==true||permission.channelOptedIn!==true)return {ok:false,reason:'not_opted_in'};
  if(permission.muted!==false||permission.reducedMotion!==false)return {ok:false,reason:'muted'};
  if(!cue||!['started','turn','finished'].includes(cue.kind)||
    !/^[a-zA-Z0-9-]{1,128}$/.test(cue.matchId)||
    !Number.isSafeInteger(cue.version)||cue.version<0)return {ok:false,reason:'invalid_cue'};
  const captions={started:'対戦が始まりました',turn:'手番が切り替わりました',finished:'対戦が終了しました'};
  return {ok:true,event:{kind:cue.kind,matchId:cue.matchId,version:cue.version,caption:captions[cue.kind]}};
}
