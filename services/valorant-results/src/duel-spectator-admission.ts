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
const validSpectatorId=(value:unknown):value is string=>
 typeof value==='string'&&value.trim().length>0&&value.length<=256;
export function decideSpectatorAdmission(input:SpectatorAdmissionInput):SpectatorDecision {
 // Guard untyped runtime callers before comparing identity and authorization data.
 if(!input||!validSpectatorId(input.viewer)||!validSpectatorId(input.viewerGuild))return {allowed:false,reason:'unauthenticated'};
 if(!validSpectatorId(input.matchGuild)||input.viewerGuild!==input.matchGuild)return {allowed:false,reason:'guild_mismatch'};
 if(!validSpectatorId(input.matchId))return {allowed:false,reason:'match_unavailable'};
 // Runtime callers may be untyped. Only a real array with a real element match is a grant;
 // an array's own includes property can be overridden by untrusted input.
 if(!Array.isArray(input.approvedViewerIds)||
  !Array.prototype.includes.call(input.approvedViewerIds,input.viewer))return {allowed:false,reason:'not_authorized'};
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
