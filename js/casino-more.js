// More casino games: マインズ, スロット, ビデオポーカー, バカラ. Pure functions on the wallet state like casino.js; every
// random number comes from the caller (`rand(n)`: an integer 0..n-1, the server's crypto draw for live wallets), and a
// game that is not finished keeps nothing secret in the state, so the saved state never reveals what comes next.
// A finished round always returns {done:{game,…,net}} (net = what the round did to the wallet).
import { CASINO_MIN, CASINO_MAX, validCard } from './casino.js?v=web-efc83c89afcf9cd1';
const validInt=(v,min=0)=>Number.isSafeInteger(v)&&v>=min;
function stake(state,amount){
 if(!validInt(amount,CASINO_MIN)||amount>CASINO_MAX)throw Error(`賭け金は${CASINO_MIN}〜${CASINO_MAX.toLocaleString('ja-JP')} KPの整数です。`);
 if(!validInt(state.cash)||state.cash<amount)throw Error('所持KPが不足しています。');
}
function roll(rand,n){const v=rand(n);if(!Number.isInteger(v)||v<0||v>=n)throw Error('抽選結果が不正です。');return v;}
const remember=(state,key,record,n=20)=>{state[key]=[record,...(state[key]??[])].slice(0,n);};

// ---- マインズ ----
// 5×5の25マスに地雷。安全なマスを開けるほど倍率が上がり、いつでも降りられる。地雷を踏むと賭け金を失う。
// 地雷の位置は先に決めず、開けるたびに「残りの地雷 ÷ 残りのマス」の確率で決める（先に置くのと同じ確率で、
// 保存した状態から地雷の位置が分かることがない）。倍率は公平な倍率の97%、最大100倍で自動的に降りる。
export const MINES_CELLS=25,MINES_CHOICES=[1,3,5,10],MINES_EDGE=0.97,MINES_CAP=100;
export function minesMultiplier(mines,opened){
 let m=MINES_EDGE;
 for(let i=0;i<opened;i++)m*=(MINES_CELLS-i)/(MINES_CELLS-mines-i);
 return opened?Math.min(MINES_CAP,Math.floor(m*100+1e-9)/100):1;
}
const minesPayout=(game)=>Math.floor(game.bet*minesMultiplier(game.mines,game.opened.length));
function activeMines(state){const g=state.mines;if(!g)throw Error('マインズの勝負はありません。');return g;}
export function minesStart(state,amount,mines,now=Date.now()){
 if(state.mines)throw Error('まだ勝負中のマインズがあります。');
 if(!MINES_CHOICES.includes(mines))throw Error(`地雷の数は${MINES_CHOICES.join('・')}個から選んでください。`);
 stake(state,amount);state.cash-=amount;
 state.mines={bet:amount,mines,opened:[],time:now};
 return {game:state.mines,done:null};
}
function minesFinish(state,g,bombs,payout,now){
 state.cash+=payout;state.mines=null;
 const done={game:'mines',bet:g.bet,mines:g.mines,opened:g.opened,bombs,multiplier:payout?minesMultiplier(g.mines,g.opened.length):0,payout,net:payout-g.bet,time:now};
 remember(state,'minesHistory',done);return {game:null,done};
}
// Where the other mines were, for the picture after the round: random among the cells not opened.
function placeRest(g,first,rand){
 const free=Array.from({length:MINES_CELLS},(_,i)=>i).filter(i=>!g.opened.includes(i)&&i!==first),bombs=first===null?[]:[first];
 while(bombs.length<g.mines)bombs.push(free.splice(roll(rand,free.length),1)[0]);
 return bombs.sort((a,b)=>a-b);
}
export function minesPick(state,cell,rand,now=Date.now()){
 const g=activeMines(state);
 if(!Number.isInteger(cell)||cell<0||cell>=MINES_CELLS)throw Error('マスを選んでください。');
 if(g.opened.includes(cell))throw Error('そのマスはもう開いています。');
 const left=MINES_CELLS-g.opened.length;
 if(roll(rand,left)<g.mines)return minesFinish(state,g,placeRest(g,cell,rand),0,now);
 g.opened=[...g.opened,cell];
 const safeLeft=MINES_CELLS-g.mines-g.opened.length;
 if(!safeLeft||minesMultiplier(g.mines,g.opened.length)>=MINES_CAP)return minesFinish(state,g,placeRest(g,null,rand),minesPayout(g),now);
 return {game:g,done:null};
}
export function minesCashout(state,rand,now=Date.now()){
 const g=activeMines(state);
 if(!g.opened.length)throw Error('1マス以上開けてから降りてください。');
 return minesFinish(state,g,placeRest(g,null,rand),minesPayout(g),now);
}

// ---- スロット ----
// 3リール。リールごとに 🍒6・🍋5・🔔4・⭐3・7️⃣2・💎1 の重み（21）。3つ揃いで配当、🍒2つで1.5倍。
// 本番は賭け金の3%がみんなの共有ジャックポットに積み上がり、💎💎💎で獲得（1,000 KP以上の賭けで全額、未満は割合）。
export const SLOT_SYMBOLS=[['cherry','🍒',6,5],['lemon','🍋',5,10],['bell','🔔',4,20],['star','⭐',3,40],['seven','7️⃣',2,100],['diamond','💎',1,300]];
export const SLOT_WEIGHT=SLOT_SYMBOLS.reduce((n,s)=>n+s[2],0),JACKPOT_PERCENT=3,JACKPOT_FULL_BET=1000,JACKPOT_SEED=10000,JACKPOT_CAP=1000000;
function reel(rand){let r=roll(rand,SLOT_WEIGHT);for(const s of SLOT_SYMBOLS){if(r<s[2])return s[0];r-=s[2];}throw Error('リールが不正です。');}
export function slotPayout(reels,bet){
 if(reels[0]===reels[1]&&reels[1]===reels[2])return bet*SLOT_SYMBOLS.find(s=>s[0]===reels[0])[3];
 return reels.filter(r=>r==='cherry').length===2?Math.floor(bet*3/2):0;
}
/** `jackpot` is the shared pool for live wallets ({amount,version}); the demo plays without one. */
export function playSlot(state,amount,rand,jackpot=null,now=Date.now()){
 stake(state,amount);
 const reels=[reel(rand),reel(rand),reel(rand)],base=slotPayout(reels,amount);
 const hit=reels.every(r=>r==='diamond')&&jackpot&&validInt(jackpot.amount);
 const won=hit?Math.floor(jackpot.amount*Math.min(amount,JACKPOT_FULL_BET)/JACKPOT_FULL_BET):0;
 const payout=base+won;
 state.cash=state.cash-amount+payout;
 const done={game:'slot',bet:amount,reels,payout,jackpot:won,net:payout-amount,time:now,
  ...(jackpot?{pool:{before:jackpot.amount,version:jackpot.version,contribution:Math.floor(amount*JACKPOT_PERCENT/100)}}:{})};
 remember(state,'slots',done);return {done};
}

// ---- ビデオポーカー（ジャックス・オア・ベター）----
// 5枚配られ、残すカードを選んで1回だけ交換。交換のカードは手札にない残り47枚から引く。配当は賭け金込みの倍率。
export const VP_PAYS={royal:250,'straight-flush':50,four:25,'full-house':8,flush:5,straight:4,three:3,'two-pair':2,jacks:1,none:0};
export const VP_NAMES={royal:'ロイヤルストレートフラッシュ','straight-flush':'ストレートフラッシュ',four:'フォーカード','full-house':'フルハウス',flush:'フラッシュ',straight:'ストレート',three:'スリーカード','two-pair':'ツーペア',jacks:'ジャックス・オア・ベター',none:'役なし'};
function freshCard(rand,used){
 const free=[];for(let n=0;n<52;n++){const c={r:n%13+1,s:Math.floor(n/13)};if(!used.some(u=>u.r===c.r&&u.s===c.s))free.push(c);}
 return free[roll(rand,free.length)];
}
export function vpHand(cards){
 const ranks=cards.map(c=>c.r===1?14:c.r).sort((a,b)=>a-b),counts=Object.values(ranks.reduce((m,r)=>(m[r]=(m[r]??0)+1,m),{})).sort((a,b)=>b-a);
 const flush=cards.every(c=>c.s===cards[0].s),wheel=ranks.join()==='2,3,4,5,14';
 const straight=counts[0]===1&&(ranks[4]-ranks[0]===4||wheel);
 if(straight&&flush)return ranks[0]===10?'royal':'straight-flush';
 if(counts[0]===4)return 'four';
 if(counts[0]===3&&counts[1]===2)return 'full-house';
 if(flush)return 'flush';
 if(straight)return 'straight';
 if(counts[0]===3)return 'three';
 if(counts[0]===2&&counts[1]===2)return 'two-pair';
 if(counts[0]===2){const pair=ranks.find((r,i)=>ranks.indexOf(r)!==i);return pair>=11?'jacks':'none';}
 return 'none';
}
export function vpDeal(state,amount,rand,now=Date.now()){
 if(state.vp)throw Error('まだ交換していない手があります。');
 stake(state,amount);state.cash-=amount;
 const cards=[];while(cards.length<5)cards.push(freshCard(rand,cards));
 state.vp={bet:amount,cards,time:now};
 return {hand:state.vp,done:null};
}
export function vpDraw(state,hold,rand,now=Date.now()){
 const h=state.vp;if(!h)throw Error('配られている手がありません。');
 if(!Array.isArray(hold)||hold.length!==5||!hold.every(v=>typeof v==='boolean'))throw Error('残すカードを選んでください。');
 const used=[...h.cards],cards=h.cards.map((c,i)=>{if(hold[i])return c;const n=freshCard(rand,used);used.push(n);return n;});
 const hand=vpHand(cards),payout=h.bet*VP_PAYS[hand];
 state.cash+=payout;state.vp=null;
 const done={game:'video-poker',bet:h.bet,dealt:h.cards,hold,cards,hand,payout,net:payout-h.bet,time:now};
 remember(state,'vpHistory',done);return {hand:null,done};
}

// ---- バカラ ----
// プレイヤーかバンカーか引き分けに賭ける。カードは52枚から毎回1枚（1デッキを無限に使う）。3枚目は標準ルール。
// プレイヤー勝ちは2倍、バンカー勝ちは1.95倍（5%手数料・切り捨て）、引き分けは9倍。引き分けのときプレイヤー・バンカーへの賭けは返金。
export const BACCARAT_SIDES={player:'プレイヤー',banker:'バンカー',tie:'引き分け'};
const point=cards=>cards.reduce((n,c)=>n+(c.r>=10?0:c.r),0)%10;
function bankerDraws(banker,third){
 const b=point(banker);if(third===null)return b<=5;
 const t=third.r>=10?0:third.r;
 return b<=2||(b===3&&t!==8)||(b===4&&t>=2&&t<=7)||(b===5&&t>=4&&t<=7)||(b===6&&(t===6||t===7));
}
export function baccaratDeal(card){
 const player=[card(),card()],banker=[card(),card()];
 if(![...player,...banker].every(validCard))throw Error('カードが不正です。');
 if(point(player)<8&&point(banker)<8){
  let third=null;
  if(point(player)<=5){third=card();if(!validCard(third))throw Error('カードが不正です。');player.push(third);}
  if(bankerDraws(banker,third)){const c=card();if(!validCard(c))throw Error('カードが不正です。');banker.push(c);}
 }
 const p=point(player),b=point(banker);
 return {player,banker,points:{player:p,banker:b},winner:p>b?'player':b>p?'banker':'tie'};
}
export function baccaratPayout(side,winner,bet){
 if(winner==='tie')return side==='tie'?bet*9:bet;
 if(side!==winner)return 0;
 return side==='banker'?Math.floor(bet*195/100):bet*2;
}
export function playBaccarat(state,amount,side,card,now=Date.now()){
 if(!Object.hasOwn(BACCARAT_SIDES,side))throw Error('プレイヤー・バンカー・引き分けから選んでください。');
 stake(state,amount);
 const deal=baccaratDeal(card),payout=baccaratPayout(side,deal.winner,amount);
 state.cash=state.cash-amount+payout;
 const done={game:'baccarat',bet:amount,side,...deal,payout,net:payout-amount,time:now};
 remember(state,'baccarat',done);return {done};
}

export function createMoreCasino(){return {mines:null,minesHistory:[],slots:[],vp:null,vpHistory:[],baccarat:[]};}
const cards=(a,min,max)=>Array.isArray(a)&&a.length>=min&&a.length<=max&&a.every(validCard);
const cellList=a=>Array.isArray(a)&&a.length<=MINES_CELLS&&a.every(c=>Number.isInteger(c)&&c>=0&&c<MINES_CELLS)&&new Set(a).size===a.length;
const finished=r=>r&&validInt(r.bet,CASINO_MIN)&&validInt(r.payout)&&Number.isSafeInteger(r.net)&&validInt(r.time);
export function hydrateMoreCasino(raw){
 const out=createMoreCasino(),list=(key,ok)=>Array.isArray(raw?.[key])?raw[key].filter(r=>finished(r)&&ok(r)).slice(0,20):[];
 const m=raw?.mines;
 if(m&&validInt(m.bet,CASINO_MIN)&&MINES_CHOICES.includes(m.mines)&&cellList(m.opened)&&m.opened.length<MINES_CELLS-m.mines&&validInt(m.time))out.mines={bet:m.bet,mines:m.mines,opened:m.opened,time:m.time};
 out.minesHistory=list('minesHistory',r=>MINES_CHOICES.includes(r.mines)&&cellList(r.opened)&&cellList(r.bombs));
 out.slots=list('slots',r=>Array.isArray(r.reels)&&r.reels.length===3&&r.reels.every(v=>SLOT_SYMBOLS.some(s=>s[0]===v)));
 const v=raw?.vp;
 if(v&&validInt(v.bet,CASINO_MIN)&&cards(v.cards,5,5)&&validInt(v.time))out.vp={bet:v.bet,cards:v.cards,time:v.time};
 out.vpHistory=list('vpHistory',r=>cards(r.cards,5,5)&&Object.hasOwn(VP_PAYS,r.hand));
 out.baccarat=list('baccarat',r=>Object.hasOwn(BACCARAT_SIDES,r.side)&&cards(r.player,2,3)&&cards(r.banker,2,3));
 return out;
}
