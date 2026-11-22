/** Phase 11: standalone, zero-KP 三目並べ game.
 * Browser practice only: no D1, wallet, PvE progression or PvP escrow.
 * Board X=human, O=CPU, .=empty. Strong CPU uses exact minimax.
 */
export const TRIO_WIN_LINES=Object.freeze([
 [0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]
]);
const validBoard=board=>typeof board==='string'&&/^[.XO]{9}$/.test(board);
export function trioWinner(board){
 if(!validBoard(board))throw Error('三目並べの盤面が不正です。');
 for(const [a,b,c] of TRIO_WIN_LINES)
  if(board[a]!=='.'&&board[a]===board[b]&&board[b]===board[c])return board[a];
 return board.includes('.')?null:'draw';
}
function validate(board){
 if(!validBoard(board))throw Error('三目並べの盤面が不正です。');
 const x=[...board].filter(v=>v==='X').length,o=[...board].filter(v=>v==='O').length;
 if(x<o||x>o+1)throw Error('三目並べの手番が不正です。');
 const xWin=TRIO_WIN_LINES.some(line=>line.every(i=>board[i]==='X'));
 const oWin=TRIO_WIN_LINES.some(line=>line.every(i=>board[i]==='O'));
 if((xWin&&oWin)||(xWin&&x!==o+1)||(oWin&&x!==o))throw Error('三目並べの勝敗が不正です。');
}
export function trioMove(board,cell,player){
 validate(board);
 if(!['X','O'].includes(player)||!Number.isSafeInteger(cell)||cell<0||cell>8||
  board[cell]!=='.'||trioWinner(board))throw Error('その場所には置けません。');
 const countX=[...board].filter(v=>v==='X').length,countO=[...board].filter(v=>v==='O').length;
 if(player!==(countX===countO?'X':'O'))throw Error('手番が違います。');
 return board.slice(0,cell)+player+board.slice(cell+1);
}
function score(board,turn,depth){
 const terminal=trioWinner(board);
 if(terminal==='O')return 10-depth;
 if(terminal==='X')return depth-10;
 if(terminal==='draw')return 0;
 let best=turn==='O'?-Infinity:Infinity;
 for(let i=0;i<9;i++)if(board[i]==='.'){
  const next=board.slice(0,i)+turn+board.slice(i+1);
  const value=score(next,turn==='O'?'X':'O',depth+1);
  best=turn==='O'?Math.max(best,value):Math.min(best,value);
 }
 return best;
}
export function trioCpuChoice(board,level='strong',random=Math.random){
 validate(board);
 if(!['easy','normal','strong'].includes(level)||typeof random!=='function')
  throw Error('CPU難易度が不正です。');
 if(trioWinner(board))return null;
 const x=[...board].filter(v=>v==='X').length,o=[...board].filter(v=>v==='O').length;
 if(x!==o+1)throw Error('CPUの手番ではありません。');
 const moves=[...board].flatMap((v,i)=>v==='.'?[i]:[]);
 if(level==='easy'){
  const n=random();
  if(!Number.isFinite(n)||n<0||n>=1)throw Error('乱数が不正です。');
  return moves[Math.floor(n*moves.length)];
 }
 const immediate=(turn)=>moves.find(i=>trioWinner(board.slice(0,i)+turn+board.slice(i+1))===turn);
 const win=immediate('O');if(win!==undefined)return win;
 const block=immediate('X');if(block!==undefined)return block;
 if(level==='normal')return moves.includes(4)?4:moves[0];
 // Deterministic full-depth minimax; <=9! leaves, zero private information.
 let best=-Infinity,choice=moves[0];
 for(const cell of moves){
  const next=board.slice(0,cell)+'O'+board.slice(cell+1);
  const value=score(next,'X',1);
  if(value>best||(value===best&&[4,0,2,6,8,1,3,5,7].indexOf(cell)<[4,0,2,6,8,1,3,5,7].indexOf(choice))){
   best=value;choice=cell;
  }
 }
 return choice;
}
export function trioPlayTurn(board,cell,level='strong',random=Math.random){
 const afterHuman=trioMove(board,cell,'X');
 if(trioWinner(afterHuman))return {board:afterHuman,winner:trioWinner(afterHuman),cpuCell:null};
 const cpuCell=trioCpuChoice(afterHuman,level,random);
 const afterCpu=trioMove(afterHuman,cpuCell,'O');
 return {board:afterCpu,winner:trioWinner(afterCpu),cpuCell};
}
