// Pure duel mini-game rules. The secret argument is server-only: never serialize it into a public room.
export const EXTRA_DUEL_GAMES={
 connect4:{name:'四目並べ',size:7},
 hitblow:{name:'Hit & Blow',size:0},
 bluffdice:{name:'ブラフダイス',size:0},
 poker:{name:'5カード・ドローポーカー',size:0}
};
const opposite=side=>side==='a'?'b':'a';
const validSide=side=>side==='a'||side==='b';
export function connect4Board(){return '.'.repeat(42);}
export function connect4LegalMoves(board){
 if(typeof board!=='string'||board.length!==42||!/^[.ab]+$/.test(board))throw Error('盤面が不正です。');
 return Array.from({length:7},(_,i)=>i).filter(x=>board[x]==='.');
}
export function connect4Move(board,side,column){
 if(!validSide(side)||!Number.isInteger(column)||!connect4LegalMoves(board).includes(column))throw Error('その列には置けません。');
 const arr=[...board];let row=5;while(row>=0&&arr[row*7+column]!=='.')row--;
 if(row<0)throw Error('その列は満杯です。');
 arr[row*7+column]=side;
 let won=false;
 for(const [dr,dc] of [[1,0],[0,1],[1,1],[1,-1]]){
  let count=1;for(const dir of [-1,1]){
   let r=row+dr*dir,c=column+dc*dir;
   while(r>=0&&r<6&&c>=0&&c<7&&arr[r*7+c]===side){count++;r+=dr*dir;c+=dc*dir;}
  }
  if(count>=4)won=true;
 }
 const next=arr.join('');
 return {board:next,turnSide:won||!next.includes('.')?null:opposite(side),winner:won?side:!next.includes('.')?'draw':null};
}
export function hitBlowAnswer(guess,code){
 if(typeof guess!=='string'||!/^[0-9]{4}$/.test(guess)||new Set(guess).size!==4)throw Error('異なる数字4桁を入力してください。');
 return {hit:[...guess].filter((v,i)=>v===code[i]).length,blow:[...guess].filter((v,i)=>v!==code[i]&&code.includes(v)).length};
}
// Pure rank calculation; a showdown can be described from publicly revealed cards.
export const POKER_HAND_NAMES=['','ハイカード','ワンペア','ツーペア','スリーカード','ストレート','フラッシュ','フルハウス','フォーカード','ストレートフラッシュ'];
export function pokerHandScore(hand){
 if(!Array.isArray(hand)||hand.length!==5||new Set(hand).size!==5||hand.some(c=>!Number.isInteger(c)||c<0||c>=52))throw Error('カードの形式が不正です。');
 const ranks=hand.map(c=>Math.floor(c/4)+2),desc=[...ranks].sort((x,y)=>y-x);
 const flush=hand.every(c=>c%4===hand[0]%4);
 const uniq=[...new Set(desc)],high=uniq.length===5?(desc[0]-desc[4]===4?desc[0]:JSON.stringify(desc)==='[14,5,4,3,2]'?5:0):0;
 const groups=[...new Set(ranks)].map(rank=>({rank,n:ranks.filter(r=>r===rank).length})).sort((a,b)=>b.n-a.n||b.rank-a.rank);
 const pack=groups.flatMap(g=>Array(g.n).fill(g.rank));
 if(flush&&high)return [9,high];
 if(groups[0].n===4)return [8,...pack];
 if(groups[0].n===3&&groups[1].n===2)return [7,...pack];
 if(flush)return [6,...desc];
 if(high)return [5,high];
 if(groups[0].n===3)return [4,...pack];
 if(groups[0].n===2)return [3,...pack];
 if(groups[0].n===2)return [2,...pack];
 return [1,...desc];
}
export function pokerHandName(hand){return POKER_HAND_NAMES[pokerHandScore(hand)[0]];}
export function comparePokerHands(a,b){
 const left=pokerHandScore(a),right=pokerHandScore(b);
 for(let i=0;i<Math.max(left.length,right.length);i++){if((left[i]??0)>(right[i]??0))return 1;if((left[i]??0)<(right[i]??0))return -1;}
 return 0;
}
export function validBluffBid(bid,count,face){
 return Number.isSafeInteger(count)&&count>=1&&count<=10&&Number.isSafeInteger(face)&&face>=1&&face<=6&&(!bid||count>bid.count||(count===bid.count&&face>bid.face));
}
function digits(rand){const array=Array.from({length:10},(_,i)=>String(i));for(let i=9;i>0;i--){const j=rand(i+1);[array[i],array[j]]=[array[j],array[i]];}return array.slice(0,4).join('');}
function dice(rand){return Array.from({length:5},()=>rand(6)+1);}
function shuffledDeck(rand){const a=Array.from({length:52},(_,i)=>i);for(let i=51;i>0;i--){const j=rand(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
export function miniStart(game,rand){
 if(game==='connect4')return {board:connect4Board(),secret:null};
 if(game==='hitblow')return {board:JSON.stringify({history:[],turn:'a'}),secret:JSON.stringify({privateA:digits(rand),privateB:digits(rand)})};
 if(game==='bluffdice')return {board:JSON.stringify({round:1,winsA:0,winsB:0,turn:'a',bid:null,history:[]}),
   secret:JSON.stringify({privateA:dice(rand),privateB:dice(rand)})};
 if(game==='poker'){
  const deck=shuffledDeck(rand);
  return {board:JSON.stringify({doneA:false,doneB:false,turn:'a',swapsA:null,swapsB:null}),
   secret:JSON.stringify({privateA:deck.splice(0,5),privateB:deck.splice(0,5),deck})};
 }
 throw Error('ゲームを選んでください。');
}
export function miniPrivate(game,secret,side){
 if(!secret||!validSide(side))return null;
 const s=JSON.parse(secret),v=side==='a'?s.privateA:s.privateB;
 return {kind:game,value:v};
}
export function miniMove(game,board,secret,side,body,rand){
 if(!validSide(side))throw Error('不正なプレイヤーです。');
 if(game==='connect4')return {...connect4Move(board,side,Number(body.cell)),secret:null};
 const pub=JSON.parse(board),sec=JSON.parse(secret);
 if(pub.turn!==side)throw Error('今はあなたの番ではありません。');
 if(game==='hitblow'){
  const guess=String(body.guess??''),code=side==='a'?sec.privateB:sec.privateA;
  const result=hitBlowAnswer(guess,code);
  pub.history.push({by:side,guess,...result});

  if(result.hit===4){pub.turn=null;pub.reveal={a:sec.privateA,b:sec.privateB};return {board:JSON.stringify(pub),secret,winner:side,turnSide:null};}
   if(pub.history.length>=40){pub.turn=null;pub.reveal={a:sec.privateA,b:sec.privateB};return {board:JSON.stringify(pub),secret,winner:'draw',turnSide:null};}
  pub.turn=opposite(side);return {board:JSON.stringify(pub),secret,winner:null,turnSide:pub.turn};
 }
 if(game==='bluffdice'){
  const action=String(body.choice??'');
  if(action==='bid'){
   const count=Number(body.count),face=Number(body.face);
   if(!Number.isSafeInteger(count)||count<1||count>10||!Number.isSafeInteger(face)||face<1||face>6)throw Error('宣言する個数・目を選んでください。');
   if(!validBluffBid(pub.bid,count,face))throw Error('前より強い宣言が必要です。');
   pub.bid={count,face,by:side};pub.turn=opposite(side);
   return {board:JSON.stringify(pub),secret,winner:null,turnSide:pub.turn};
  }
  if(action!=='challenge'||!pub.bid||pub.bid.by===side)throw Error('宣言を疑うことはできません。');
  const all=[...sec.privateA,...sec.privateB],actual=all.filter(d=>d===pub.bid.face).length;
  const roundWinner=actual>=pub.bid.count?pub.bid.by:side;
  if(roundWinner==='a')pub.winsA++;else pub.winsB++;
  pub.history.push({round:pub.round,bid:pub.bid,actual,winner:roundWinner,diceA:sec.privateA,diceB:sec.privateB});
  const winner=pub.winsA>=2?'a':pub.winsB>=2?'b':null;
  if(winner){
   pub.turn=null;pub.bid=null;return {board:JSON.stringify(pub),secret,winner,turnSide:null};
  }
  pub.round++;pub.bid=null;pub.turn=opposite(roundWinner);
  sec.privateA=dice(rand);sec.privateB=dice(rand);
  return {board:JSON.stringify(pub),secret:JSON.stringify(sec),winner:null,turnSide:pub.turn};
 }
 if(game==='poker'){
  if(pub[side==='a'?'doneA':'doneB'])throw Error('カード交換はもう終了しました。');
  const cells=body.cells;
  if(!Array.isArray(cells)||cells.length>3||new Set(cells).size!==cells.length||cells.some(i=>!Number.isInteger(i)||i<0||i>4))throw Error('交換するカードは0〜3枚で選んでください。');
  const key=side==='a'?'privateA':'privateB';
  for(const i of cells)sec[key][i]=sec.deck.shift();
  pub[side==='a'?'doneA':'doneB']=true;
  pub[side==='a'?'swapsA':'swapsB']=cells.length;
  if(pub.doneA&&pub.doneB){
   const cmp=comparePokerHands(sec.privateA,sec.privateB);
   pub.turn=null;pub.showdown={a:sec.privateA,b:sec.privateB};
   return {board:JSON.stringify(pub),secret:JSON.stringify(sec),winner:cmp===0?'draw':cmp>0?'a':'b',turnSide:null};
  }
  pub.turn=opposite(side);return {board:JSON.stringify(pub),secret:JSON.stringify(sec),winner:null,turnSide:pub.turn};
 }
 throw Error('未対応のゲームです。');
}
