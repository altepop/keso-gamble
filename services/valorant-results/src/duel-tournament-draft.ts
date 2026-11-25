/** P10.4 tournament bracket calculation only.
 * Proposed tournament sizes/formats and operator roles are NOT approved.
 * This module does not create matches, awards KP, or access D1.
 */
export type BracketPair={round:number;slot:number;playerA:string;playerB:string|null};
export type DraftBracket={participants:readonly string[];pairs:readonly BracketPair[];byes:number};
export function draftSingleEliminationBracket(players:readonly string[],maxPlayers:number):DraftBracket{
 if(!Number.isSafeInteger(maxPlayers)||maxPlayers<2||maxPlayers>128)throw Error('invalid configured capacity');
 if(!Array.isArray(players)||players.length<2||players.length>maxPlayers)throw Error('invalid participant count');
 if(players.some(p=>typeof p!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(p))||new Set(players).size!==players.length)throw Error('invalid entrants');
 const size=2**Math.ceil(Math.log2(players.length));
 const pairs:BracketPair[]=[];
 // Allocate one BYE per match before pairing remaining entrants.
 // No empty match or undefined entrant may be produced.
 for(let slot=0;slot<size/2;slot++){
   if(slot<size-players.length){
     pairs.push({round:1,slot,playerA:players[slot]!,playerB:null});
   }else{
     const index=(size-players.length)+2*(slot-(size-players.length));
     pairs.push({round:1,slot,playerA:players[index]!,playerB:players[index+1]!});
   }
 }
 return {participants:[...players],pairs,byes:size-players.length};
}
/** Confirmation must come from an authorized server-side operator policy, not input from a browser. */
export function mayPublishTournament(approvedFormat:boolean,approvedOperatorRole:boolean):boolean{
 return approvedFormat===true&&approvedOperatorRole===true;
}
