/** P10.3 opt-in future call hype cues; pure text only, no audio or external posting.
 * Only confirmed public spectator snapshots may be passed in.
 */
import type {SpectatorSnapshot} from './duel-spectator-public.ts';
export type SpectatorCue={kind:'started'|'turn'|'finished';matchId:string;version:number;text:string};
export function spectatorTextCue(previous:SpectatorSnapshot|null,current:SpectatorSnapshot):SpectatorCue|null {
 if(!current||!Number.isSafeInteger(current.version)||current.version<0)return null;
 // A malformed previous revision cannot establish a trustworthy transition.
 if(previous&&(!Number.isSafeInteger(previous.version)||previous.version<0))return null;
 if(previous&&previous.id!==current.id)return null;
 if(previous&&previous.version>=current.version)return null; // prevent replay/duplication
 if(current.status==='finished'&&previous?.status!=='finished')
  return {kind:'finished',matchId:current.id,version:current.version,text:'対戦が終了しました'};
 if(current.status==='active'&&previous?.status==='pending')
  return {kind:'started',matchId:current.id,version:current.version,text:'対戦が始まりました'};
 if(previous&&current.status==='active'&&previous.turn!==current.turn)
  return {kind:'turn',matchId:current.id,version:current.version,text:'手番が切り替わりました'};
 return null;
}
