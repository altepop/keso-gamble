// Pure, deterministic rules shared by Discord Activity and the KP server.
// Board cells: "." empty, "B" black, "W" white. No client-submitted outcome is trusted.
export const DUEL_GAMES={othello:{name:'オセロ',size:8},gomoku:{name:'五目並べ',size:15}};
const dirs=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const opponent=c=>c==='B'?'W':'B';
export function initialDuelBoard(game){
 const entry=DUEL_GAMES[game];if(!entry)throw Error('対戦ゲームが不正です。');
 const n=entry.size,board=Array(n*n).fill('.');
 if(game==='othello'){
  const c=n/2;board[(c-1)*n+c-1]='W';board[(c-1)*n+c]='B';
  board[c*n+c-1]='B';board[c*n+c]='W';
 }
 return board.join('');
}
export function duelScore(board){return {B:board.split('B').length-1,W:board.split('W').length-1};}
export function duelLegalMoves(game,board,color){
 const n=DUEL_GAMES[game]?.size;
 if(!n||typeof board!=='string'||board.length!==n*n||!/^[.BW]+$/.test(board)||!['B','W'].includes(color))throw Error('盤面が不正です。');
 if(game==='gomoku')return [...board].flatMap((cell,i)=>cell==='.'?[i]:[]);
 const found=[];
 for(let i=0;i<board.length;i++)if(board[i]==='.'){
  const r=Math.floor(i/n),c=i%n;
  if(dirs.some(([dr,dc])=>{
   let y=r+dr,x=c+dc,count=0;
   while(y>=0&&x>=0&&y<n&&x<n&&board[y*n+x]===opponent(color)){count++;y+=dr;x+=dc;}
   return count>0&&y>=0&&x>=0&&y<n&&x<n&&board[y*n+x]===color;
  }))found.push(i);
 }
 return found;
}
export function playDuelMove(game,board,color,index){
 const n=DUEL_GAMES[game]?.size;
 if(!n||!Number.isSafeInteger(index)||index<0||index>=n*n||!['B','W'].includes(color)||duelLegalMoves(game,board,color).includes(index)===false)
  throw Error('そこには置けません。');
 const next=[...board],r=Math.floor(index/n),c=index%n;next[index]=color;
 if(game==='othello'){
  for(const [dr,dc] of dirs){
   const captures=[];let y=r+dr,x=c+dc;
   while(y>=0&&x>=0&&y<n&&x<n&&next[y*n+x]===opponent(color)){
    captures.push(y*n+x);y+=dr;x+=dc;
   }
   if(captures.length&&y>=0&&x>=0&&y<n&&x<n&&next[y*n+x]===color)
    for(const cell of captures)next[cell]=color;
  }
  const result=next.join(''),other=opponent(color),opponentMoves=duelLegalMoves(game,result,other);
  const ownMoves=opponentMoves.length?[]:duelLegalMoves(game,result,color);
  const ended=opponentMoves.length===0&&ownMoves.length===0;
  const score=duelScore(result);
  return {board:result,nextColor:ended?null:opponentMoves.length?other:color,
   winner:ended?(score.B===score.W?'draw':score.B>score.W?'B':'W'):null,passed:!ended&&!opponentMoves.length,score};
 }
 // Free-style five-in-a-row: 5+ contiguous stones wins, no forbidden opening.
 let win=false;
 for(const [dr,dc] of [[1,0],[0,1],[1,1],[1,-1]]){
  let total=1;
  for(const sign of [-1,1]){
   let y=r+dr*sign,x=c+dc*sign;
   while(y>=0&&x>=0&&y<n&&x<n&&next[y*n+x]===color){
    total++;y+=dr*sign;x+=dc*sign;
   }
  }
  if(total>=5)win=true;
 }
 const result=next.join('');
 return {board:result,nextColor:win||!result.includes('.')?null:opponent(color),
   winner:win?color:!result.includes('.')?'draw':null,passed:false,score:duelScore(result)};
}
