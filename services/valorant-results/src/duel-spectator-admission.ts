/** P10.2: policy-neutral spectator admission and revision contract.
 * This is NOT a public route: the five Phase 10 approval gates remain PROPOSED.
 */
import type {SpectatorSnapshot} from './duel-spectator-public.ts';

export type SpectatorDecision =
  | {allowed:true;viewer:string;guild:string;matchId:string}
  | {allowed:false;reason:'unauthenticated'|'guild_mismatch'|'not_authorized'|'match_unavailable'};
export type SpectatorAdmissionInput={
 viewer:string|null;viewerGuild:string|null;matchGuild:string;matchId:string;
 /** Explicit grant supplied by a future approved authorization service, NEVER inferred. */
 approvedViewerIds:readonly string[];
};
export function decideSpectatorAdmission(input:SpectatorAdmissionInput):SpectatorDecision {
 if(!input.viewer||!input.viewerGuild)return {allowed:false,reason:'unauthenticated'};
 if(input.viewerGuild!==input.matchGuild)return {allowed:false,reason:'guild_mismatch'};
 if(!input.matchId||input.matchId.length>256)return {allowed:false,reason:'match_unavailable'};
 // Runtime callers may be untyped; a string or spoofed includes() is not an explicit grant list.
 if(!Array.isArray(input.approvedViewerIds)||!input.approvedViewerIds.includes(input.viewer))return {allowed:false,reason:'not_authorized'};
 return {allowed:true,viewer:input.viewer,guild:input.matchGuild,matchId:input.matchId};
}
export type SpectatorRevision={kind:'no_change';version:number}|{kind:'snapshot';snapshot:SpectatorSnapshot};
export function compareSpectatorRevision(snapshot:SpectatorSnapshot,seenVersion:number|null):SpectatorRevision {
 if(!Number.isSafeInteger(snapshot.version)||snapshot.version<0)throw Error('invalid snapshot version');
 if(seenVersion!==null&&(!Number.isSafeInteger(seenVersion)||seenVersion<0))throw Error('invalid seen version');
 // An older source revision must never roll back a newer revision seen by the viewer.
 if(seenVersion!==null&&seenVersion>=snapshot.version)return {kind:'no_change',version:seenVersion};
 return {kind:'snapshot',snapshot};
}
