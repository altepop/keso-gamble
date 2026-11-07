// Bounded adversarial search for the public-information duel boards.
// Uses the exact same legal moves / win rules as the live match. No network or state writes.
import {duelLegalMoves,playDuelMove,duelScore} from '../js/duel-rules.js';
import {connect4LegalMoves,connect4Move} from '../js/duel-mini-games.js';
const opposite=c=>c==='B'?'W':c==='W'?'B':c==='a'?'b':'a';
const pick=(a,random)=>a[Math.floor(Math.min(0.999999,Math.max(0,random()))*a.length)];
const order=(a,b)=>b.score-a.score||a.cell-b.cell;
const CORNERS=[0,7,56,63],ADJ=[[1,8,9],[6,14,15],[48,49,57],[54,55,62]];
function otEval(board,root){
 const opp=opposite(root),s=duelScore(board),empty=board.split('.').length-1;
 if(!empty)return (s[root]-s[opp])*1000;
 let points=(s[root]-s[opp])*(empty>25?0.5:3);
 for(let i=0;i<4;i++){
  const cell=board[CORNERS[i]],mine=cell===root?1:cell===opp?-1:0;
  points+=mine*105;
  if(cell==='.')for(const near of ADJ[i])points+=(board[near]===root?-23:board[near]===opp?23:0);
 }
 for(let i=0;i<64;i++)if(board[i]!=='.'&&(i%8===0||i%8===7||i<8||i>=56))points+=(board[i]===root?1:-1)*5;
 points+=(duelLegalMoves('othello',board,root).length-duelLegalMoves('othello',board,opp).length)*11;
 return points;
}
export function chooseOthello(board,side,level,random){
 const moves=duelLegalMoves('othello',board,side);
 if(!moves.length)throw Error('合法手がありません。');
 if(level==='easy')return {cell:pick(moves,random)};
 const depth=level==='strong'?4:2,maxNodes=level==='strong'?2100:220;
 const deadline=Date.now()+(level==='strong'?420:100);
 let count=0;
 const memo=new Map();
 function search(b,turn,d,alpha,beta){
  if(++count>maxNodes||Date.now()>deadline||d<=0)return otEval(b,side);
  const key=turn+'|'+d+'|'+b;
  if(memo.has(key))return memo.get(key);
  const allowed=duelLegalMoves('othello',b,turn);
  if(!allowed.length)return otEval(b,side);
  const maximizing=turn===side;let best=maximizing?-Infinity:Infinity,cut=false;
  const candidates=allowed.map(cell=>({cell,result:playDuelMove('othello',b,turn,cell)}));
  candidates.sort((x,y)=>otEval(y.result.board,side)-otEval(x.result.board,side));
  if(!maximizing)candidates.reverse();
  for(const {result} of candidates){
   let score;
   if(result.winner)score=result.winner==='draw'?0:result.winner===side?100000+d:-100000-d;
   else score=search(result.board,result.nextColor,d-1,alpha,beta);
   best=maximizing?Math.max(best,score):Math.min(best,score);
   if(maximizing)alpha=Math.max(alpha,best);else beta=Math.min(beta,best);
   if(beta<=alpha||count>=maxNodes||Date.now()>deadline){cut=true;break;}
  }
  if(!cut)memo.set(key,best);
  return best;
 }
 let selected=moves[0],best=-Infinity;
 // Corners prioritized at the root; scoring considers mobility and later replies.
 const sorted=moves.map(cell=>({cell,result:playDuelMove('othello',board,side,cell)}))
  .sort((a,b)=>otEval(b.result.board,side)-otEval(a.result.board,side));
 for(const {cell,result} of sorted){
  if(count>=maxNodes||Date.now()>deadline)break;
  const score=result.winner?(result.winner===side?100000:result.winner==='draw'?0:-100000):
   search(result.board,result.nextColor,depth-1,-Infinity,Infinity);
  if(score>best){best=score;selected=cell;}
 }
 return {cell:selected};
}

const LINE_DIR=[[0,1],[1,0],[1,1],[1,-1]];
function strength(board,side,cell){
 const row=Math.floor(cell/15),col=cell%15;
 let score=0;
 for(const [dr,dc] of LINE_DIR){
  let total=1,open=0;
  for(const sign of [-1,1]){
   let r=row+dr*sign,c=col+dc*sign;
   while(r>=0&&r<15&&c>=0&&c<15&&board[r*15+c]===side){
    total++;r+=dr*sign;c+=dc*sign;
   }
   if(r>=0&&r<15&&c>=0&&c<15&&board[r*15+c]==='.')open++;
  }
  if(total>=5)return 1000000;
  if(open===0)continue;
  score+=(total===4?(open===2?15000:2800):
    total===3?(open===2?500:75):total===2?(open===2?22:5):2);
 }
 return score;
}
function candidates(board,side,limit){
 const available=[];
 let hasStone=false;
 for(let i=0;i<225;i++)if(board[i]!=='.'){hasStone=true;break;}
 if(!hasStone)return [112];
 for(let i=0;i<225;i++){
  if(board[i]!=='.')continue;
  const row=Math.floor(i/15),col=i%15;
  let near=false;
  for(let y=Math.max(0,row-2);y<=Math.min(14,row+2)&&!near;y++)
   for(let x=Math.max(0,col-2);x<=Math.min(14,col+2);x++)if(board[y*15+x]!=='.'){near=true;break;}
  if(!near)continue;
  const attack=strength(board,side,i),defense=strength(board,opposite(side),i);
  const center=14-Math.abs(row-7)-Math.abs(col-7);
  available.push({cell:i,score:attack>=1000000?1e9:defense>=1000000?9e8:
   attack*1.06+defense*1.08+center*.2});
 }
 available.sort(order);
 return available.slice(0,limit).map(x=>x.cell);
}
function nextGomoku(board,cell,side){return board.slice(0,cell)+side+board.slice(cell+1);}
function tactical(board,side,limit=20){
 // Rank threats by *actual next-move power* rather than general defense.
 const best=[];
 for(let cell=0;cell<225;cell++)if(board[cell]==='.'){
  const score=strength(board,side,cell);
  if(score>3)best.push({cell,score});
 }
 best.sort((a,b)=>b.score-a.score||a.cell-b.cell);
 return best.slice(0,limit);
}
export function chooseGomoku(board,side,level,random){
 const moves=duelLegalMoves('gomoku',board,side);
 if(!moves.length)throw Error('合法手がありません。');
 if(level==='easy')return {cell:pick(moves,random)};
 const opp=opposite(side),ranked=candidates(board,side,level==='strong'?15:7);
 const ownWinning=tactical(board,side,8).filter(x=>x.score>=1000000);
 if(ownWinning.length)return {cell:ownWinning[0].cell};
 const oppWinning=tactical(board,opp,8).filter(x=>x.score>=1000000);
 if(oppWinning.length)return {cell:oppWinning[0].cell};
 if(level==='normal')return {cell:ranked[0]};
 // Strong plays actively: first force two independent four-in-a-row threats
 // (forks), then calculate opponent's most dangerous answer. A forced win
 // matters more than a static one-step defensive score.
 const attack=tactical(board,side,12).map(x=>x.cell);
 const defense=tactical(board,opp,10).map(x=>x.cell);
 const options=[...new Set([...ranked,...attack,...defense])].filter(x=>board[x]==='.').slice(0,22);
 const deadline=Date.now()+360;
 let best=-Infinity,selected=options[0]??ranked[0],visited=0;
 for(const cell of options){
  if(Date.now()>deadline||visited>150)break;
  const after=nextGomoku(board,cell,side);
  const enemyWins=tactical(after,opp,5).filter(x=>x.score>=1000000);
  if(enemyWins.length)continue;
  const forks=tactical(after,side,8).filter(x=>x.score>=1000000);
  if(forks.length>=2)return {cell}; // opponent cannot block both unless it wins itself
  const ownNow=strength(board,side,cell),enemyNow=strength(board,opp,cell);
  let worst=Infinity;
  const replies=[...new Set([...candidates(after,opp,7),...tactical(after,opp,7).map(x=>x.cell)])].slice(0,12);
  for(const reply of replies){
   if(++visited>150||Date.now()>deadline)break;
   const later=nextGomoku(after,reply,opp);
   const bestOwn=tactical(later,side,8);
   const bestOpp=tactical(later,opp,8);
   const mine=bestOwn[0]?.score??0,theirs=bestOpp[0]?.score??0;
   // Prioritize threats that force a response; avoid pure blocking when there
   // is an opportunity to create an open four or threatening open three.
   const value=mine>=1000000?1e7:
     theirs>=1000000?-1e7:
     mine*1.4-theirs*1.55;
   worst=Math.min(worst,value);
  }
  if(!Number.isFinite(worst))worst=0;
  const score=worst+ownNow*.65+enemyNow*.25+
    (14-Math.abs(Math.floor(cell/15)-7)-Math.abs(cell%15-7))*.2;
  if(score>best){best=score;selected=cell;}
 }
 return {cell:selected};
}
const WINDOWS=(()=>{
 const lines=[];
 for(let r=0;r<6;r++)for(let c=0;c<7;c++)for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){
  if(r+dr*3>=6||c+dc*3<0||c+dc*3>=7)continue;
  lines.push([0,1,2,3].map(k=>(r+dr*k)*7+c+dc*k));
 }
 return lines;
})();
function c4Eval(board,side){
 const opp=opposite(side),score=[0,1,9,70,100000];let total=0;
 for(const cells of WINDOWS){
  let own=0,theirs=0;
  for(const idx of cells){if(board[idx]===side)own++;else if(board[idx]===opp)theirs++;}
  if(!theirs)total+=score[own];else if(!own)total-=score[theirs]*1.08;
 }
 for(let row=0;row<6;row++)if(board[row*7+3]===side)total+=5;
 else if(board[row*7+3]===opp)total-=5;
 return total;
}
export function chooseConnect4(board,side,level,random){
 const moves=connect4LegalMoves(board),opp=opposite(side);
 if(!moves.length)throw Error('合法な列がありません。');
 if(level==='easy')return {cell:pick(moves,random)};
 for(const cell of moves)if(connect4Move(board,side,cell).winner===side)return {cell};
 for(const cell of moves)if(connect4Move(board,opp,cell).winner===opp)return {cell};
 const depth=level==='strong'?7:3;
 const maxNodes=level==='strong'?16500:900,deadline=Date.now()+(level==='strong'?430:120);
 let nodes=0;
 const table=new Map();
 function search(b,turn,d,alpha,beta){
  if(d===0||++nodes>maxNodes||Date.now()>deadline)return c4Eval(b,side);
  const k=b+turn+d;if(table.has(k))return table.get(k);
  const legal=connect4LegalMoves(b).sort((a,b)=>Math.abs(a-3)-Math.abs(b-3));
  if(!legal.length)return 0;
  const maximize=turn===side;let best=maximize?-Infinity:Infinity,exact=true;
  for(const col of legal){
   const result=connect4Move(b,turn,col);
   const score=result.winner?
    (result.winner==='draw'?0:result.winner===side?100000+d:-100000-d):
    search(result.board,result.turnSide,d-1,alpha,beta);
   best=maximize?Math.max(best,score):Math.min(best,score);
   if(maximize)alpha=Math.max(alpha,best);else beta=Math.min(beta,best);
   if(beta<=alpha||nodes>=maxNodes||Date.now()>deadline){exact=false;break;}
  }
  if(exact)table.set(k,best);
  return best;
 }
 let selected=3,best=-Infinity;
 for(const col of moves.slice().sort((a,b)=>Math.abs(a-3)-Math.abs(b-3))){
  if(nodes>maxNodes||Date.now()>deadline)break;
  const result=connect4Move(board,side,col);
  const score=result.winner?(result.winner==='draw'?0:100000):
   search(result.board,opp,depth-1,-Infinity,Infinity);
  if(score>best){best=score;selected=col;}
 }
 return {cell:selected};
}
