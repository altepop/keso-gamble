/** Phase 10 P10.1: fail-closed spectator-facing projection.
 * This pure module does not expose a network route or authorize spectators.
 * Never pass participant-specific private_hand, secret table rows or tokens.
 */
export type SpectatorGame='othello'|'gomoku'|'connect4'|'hitblow'|'bluffdice'|'poker'|'trio';
export type SpectatorStatus='pending'|'active'|'finished'|'cancelled';
export interface SpectatorSource {
  id:string;guild:string;game:SpectatorGame;status:SpectatorStatus;
  user_a:string;user_b:string;turn_user:string|null;winner:string|null;
  version:number;updated_at:number;board:string;
}
export interface SpectatorSnapshot {
  id:string;game:SpectatorGame;status:SpectatorStatus;
  participants:readonly [string,string];turn:string|null;
  winner:string|null;version:number;updatedAt:number;
  publicState:unknown;
}
const GAMES=new Set<SpectatorGame>(['othello','gomoku','connect4','hitblow','bluffdice','poker','trio']);
const STATUS=new Set<SpectatorStatus>(['pending','active','finished','cancelled']);
const BOARD_GAMES=new Set<SpectatorGame>(['othello','gomoku','connect4','trio']);
const safeString=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=256;
function nonnegative(v:unknown):v is number{return Number.isSafeInteger(v)&&Number(v)>=0;}
/** A spectator must first pass caller's explicit guild and opt-in authorization.
 * No API wiring is provided until the publication-policy gate is approved.
 */
export function spectatorPublicSnapshot(source:SpectatorSource):SpectatorSnapshot {
  if(!source||!GAMES.has(source.game)||!STATUS.has(source.status)||
    !safeString(source.id)||!safeString(source.guild)||
    !safeString(source.user_a)||!safeString(source.user_b)||
    // Never pass untyped or structured winner/turn values into a public snapshot.
    (source.turn_user!==null&&!safeString(source.turn_user))||
    (source.winner!==null&&!safeString(source.winner))||
    !nonnegative(source.version)||!nonnegative(source.updated_at)||
    typeof source.board!=='string')throw Error('spectator snapshot unavailable');
  const result:SpectatorSnapshot={
    id:source.id,game:source.game,status:source.status,
    participants:[source.user_a,source.user_b],turn:source.turn_user,
    winner:source.winner,version:source.version,updatedAt:source.updated_at,
    publicState:null,
  };
  if(BOARD_GAMES.has(source.game)){
    // Only board-only games carry wholly public position strings.
    result.publicState={board:source.board};
  }else{
    // Private games use conservative explicit allowlists, not entire board JSON.
    let value:unknown;
    try{value=JSON.parse(source.board);}catch{return result;}
    if(!value||typeof value!=='object'||Array.isArray(value))return result;
    const data=value as Record<string,unknown>;
    if(source.game==='hitblow'){
      const history=Array.isArray(data.history)?data.history:[];
      result.publicState={history:history.slice(-100).map(row=>{
        if(!row||typeof row!=='object')return null;
        const x=row as Record<string,unknown>;
        return {by:typeof x.by==='string'?x.by:null,
          guess:typeof x.guess==='string'?x.guess:null,
          hit:nonnegative(x.hit)?x.hit:null,blow:nonnegative(x.blow)?x.blow:null};
      }).filter(Boolean)};
    }else if(source.game==='bluffdice'){
      const bid=data.bid&&typeof data.bid==='object'?data.bid as Record<string,unknown>:null;
      result.publicState={bid:bid?{by:typeof bid.by==='string'?bid.by:null,
        count:nonnegative(bid.count)?bid.count:null,
        face:nonnegative(bid.face)?bid.face:null}:null};
    }else{
      // Poker reveal semantics require a separate approved policy.
      result.publicState={};
    }
  }
  return result;
}
