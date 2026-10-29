// Casino games beside the roulette: チンチロ and ブラックジャック. Pure functions on the wallet state; the dice and
// cards come from the caller (the server's crypto draw for live wallets), so a result cannot be picked by the player.
export const CASINO_MIN=100,CASINO_MAX=20000;
const validInt=(v,min=0)=>Number.isSafeInteger(v)&&v>=min;
export function createCasino(){return {chinchiro:[],blackjack:null,bjHistory:[]};}
function checkStake(state,amount,reserve=amount){
 if(!validInt(amount,CASINO_MIN)||amount>CASINO_MAX)throw Error(`賭け金は${CASINO_MIN}〜${CASINO_MAX.toLocaleString('ja-JP')} KPの整数です。`);
 if(!validInt(state.cash)||state.cash<reserve)throw Error(reserve>amount?`チンチロは最大で賭け金の5倍負けるので、所持KPが ${reserve.toLocaleString('ja-JP')} KP 以上必要です。`:'所持KPが不足しています。');
}
export function cryptoInt(n){
 if(!globalThis.crypto?.getRandomValues)throw Error('この環境では暗号学的乱数を利用できません。');
 const v=new Uint32Array(1),max=Math.floor(4294967296/n)*n;
 do globalThis.crypto.getRandomValues(v);while(v[0]>=max);
 return v[0]%n;
}
export const cryptoDie=()=>cryptoInt(6)+1;
export const cryptoCard=()=>{const n=cryptoInt(52);return {r:n%13+1,s:Math.floor(n/13)};};

// ---- チンチロ（親はKESO、子はあなた）----
// 役：ピンゾロ（1・1・1）> ゾロ目 > シゴロ（4・5・6）> 目（2つ揃いの残り）> 目なし（3回振っても出ない）> ヒフミ（1・2・3）。
// 親が先に振り、ピンゾロ・ゾロ目・シゴロ・ヒフミ・目なしなら即決着。親が目なら子が振って目の大小で勝負。
export const CHINCHIRO_HANDS={pinzoro:'ピンゾロ',zoro:'ゾロ目',shigoro:'シゴロ',me:'目',menashi:'目なし',hifumi:'ヒフミ'};
export function chinchiroHand(dice){
 const [a,b,c]=[...dice].sort((x,y)=>x-y);
 if(a===c)return a===1?{kind:'pinzoro'}:{kind:'zoro',point:a};
 if(a===4&&b===5&&c===6)return {kind:'shigoro'};
 if(a===1&&b===2&&c===3)return {kind:'hifumi'};
 if(a===b)return {kind:'me',point:c};
 if(b===c)return {kind:'me',point:a};
 return null;
}
function rollHand(die){
 const rolls=[];
 for(let i=0;i<3;i++){const dice=[die(),die(),die()];if(!dice.every(d=>validInt(d,1)&&d<=6))throw Error('サイコロの目が不正です。');rolls.push(dice);const hand=chinchiroHand(dice);if(hand)return {rolls,hand};}
 return {rolls,hand:{kind:'menashi'}};
}
// What the player (子) wins or loses, in units of the stake.
const PARENT_DECIDES={pinzoro:-5,zoro:-3,shigoro:-2,hifumi:2,menashi:1};
const CHILD_DECIDES={pinzoro:5,zoro:3,shigoro:2,hifumi:-2,menashi:-1};
export function chinchiroUnits(oya,ko){
 if(oya.kind in PARENT_DECIDES)return PARENT_DECIDES[oya.kind];
 if(ko.kind in CHILD_DECIDES)return CHILD_DECIDES[ko.kind];
 return Math.sign(ko.point-oya.point);
}
export function playChinchiro(state,amount,die,now=Date.now()){
 checkStake(state,amount,amount*5);
 const oya=rollHand(die),ko=oya.hand.kind==='me'?rollHand(die):null;
 const units=chinchiroUnits(oya.hand,ko?.hand??{kind:'menashi'}),net=units*amount;
 if(!validInt(state.cash+net))throw Error('所持KPが上限を超えます。');
 const record={amount,oya,ko,units,net,time:now};
 state.cash+=net;state.chinchiro=[record,...(state.chinchiro??[])].slice(0,20);
 return record;
}

// ---- ブラックジャック ----
// 1デッキを無限に使う（毎回52枚から1枚）。ディーラーの2枚目はあなたが止めてから引く（ホールカードなし）。
// ディーラーはソフト17で止まる。ブラックジャックは3:2。ダブルは最初の2枚だけ。スプリットなし。
// ディーラーがブラックジャックのとき、ダブルで足した分は返す（負けは最初の賭け金だけ）。
export const SUITS=['♠','♥','♦','♣'],RANKS=['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
export const validCard=c=>c&&validInt(c.r,1)&&c.r<=13&&validInt(c.s)&&c.s<=3;
export function bjTotal(cards){
 let total=0,aces=0;for(const c of cards){total+=c.r===1?11:Math.min(c.r,10);if(c.r===1)aces++;}
 while(total>21&&aces){total-=10;aces--;}
 return {total,soft:aces>0};
}
const natural=cards=>cards.length===2&&bjTotal(cards).total===21;
function draw(card){const c=card();if(!validCard(c))throw Error('カードが不正です。');return {r:c.r,s:c.s};}
function finish(state,hand,result,payout,now){
 if(!validInt(state.cash+payout))throw Error('所持KPが上限を超えます。');
 state.cash+=payout;
 const record={bet:hand.bet,doubled:hand.doubled,player:hand.player,dealer:hand.dealer,result,payout,net:payout-hand.bet*(hand.doubled?2:1),time:now};
 state.blackjack=null;state.bjHistory=[record,...(state.bjHistory??[])].slice(0,20);
 return {hand:null,done:record};
}
function dealerPlays(state,hand,card,now){
 hand.dealer.push(draw(card));
 const stake=hand.bet*(hand.doubled?2:1),me=bjTotal(hand.player).total;
 if(natural(hand.dealer))return natural(hand.player)?finish(state,hand,'push',stake,now):finish(state,hand,'dealer-blackjack',hand.doubled?hand.bet:0,now);
 if(natural(hand.player))return finish(state,hand,'blackjack',Math.floor(hand.bet*5/2),now);
 while(bjTotal(hand.dealer).total<17)hand.dealer.push(draw(card));
 const them=bjTotal(hand.dealer).total;
 return them>21||me>them?finish(state,hand,'win',stake*2,now):me===them?finish(state,hand,'push',stake,now):finish(state,hand,'lose',0,now);
}
function active(state){const hand=state.blackjack;if(!hand)throw Error('配られている手がありません。');return hand;}
export function bjStart(state,amount,card,now=Date.now()){
 if(state.blackjack)throw Error('まだ勝負中の手があります。');
 checkStake(state,amount);
 state.cash-=amount;
 const hand={bet:amount,doubled:false,player:[draw(card),draw(card)],dealer:[draw(card)],time:now};
 state.blackjack=hand;
 return natural(hand.player)?dealerPlays(state,hand,card,now):{hand,done:null};
}
export function bjHit(state,card,now=Date.now()){
 const hand=active(state);hand.player.push(draw(card));
 const total=bjTotal(hand.player).total;
 if(total>21)return finish(state,hand,'bust',0,now);
 return total===21?dealerPlays(state,hand,card,now):{hand,done:null};
}
export function bjStand(state,card,now=Date.now()){return dealerPlays(state,active(state),card,now);}
export function bjDouble(state,card,now=Date.now()){
 const hand=active(state);
 if(hand.player.length!==2||hand.doubled)throw Error('ダブルは最初の2枚のときだけです。');
 if(state.cash<hand.bet)throw Error('ダブルには同じ額のKPが必要です。');
 state.cash-=hand.bet;hand.doubled=true;hand.player.push(draw(card));
 return bjTotal(hand.player).total>21?finish(state,hand,'bust',0,now):dealerPlays(state,hand,card,now);
}

export function hydrateCasino(raw){
 const casino=createCasino();
 const dice=d=>Array.isArray(d)&&d.length===3&&d.every(v=>validInt(v,1)&&v<=6);
 const roll=r=>r&&Array.isArray(r.rolls)&&r.rolls.length>=1&&r.rolls.length<=3&&r.rolls.every(dice)&&r.hand&&Object.hasOwn(CHINCHIRO_HANDS,r.hand.kind);
 if(Array.isArray(raw?.chinchiro))casino.chinchiro=raw.chinchiro.filter(c=>c&&validInt(c.amount,CASINO_MIN)&&roll(c.oya)&&(c.ko===null||roll(c.ko))&&Number.isSafeInteger(c.net)&&validInt(c.time)).slice(0,20);
 const cards=a=>Array.isArray(a)&&a.length>=1&&a.length<=12&&a.every(validCard);
 const h=raw?.blackjack;
 if(h&&validInt(h.bet,CASINO_MIN)&&typeof h.doubled==='boolean'&&cards(h.player)&&cards(h.dealer)&&validInt(h.time))casino.blackjack={bet:h.bet,doubled:h.doubled,player:h.player,dealer:h.dealer,time:h.time};
 if(Array.isArray(raw?.bjHistory))casino.bjHistory=raw.bjHistory.filter(r=>r&&validInt(r.bet,CASINO_MIN)&&cards(r.player)&&cards(r.dealer)&&typeof r.result==='string'&&validInt(r.payout)&&validInt(r.time)).slice(0,20);
 return casino;
}
