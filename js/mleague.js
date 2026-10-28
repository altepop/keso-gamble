// M.LEAGUE predictions: name the player who takes 1st (トップ) or 4th (ラス) in an official game.
// Pure logic with no DOM or clock reads, shared by the browser and the Worker. Results come only from
// the official site (services/valorant-results/src/mleague.ts); nothing here guesses a result.
import {WEEKLY_LIMIT,MIN_BET,BET_STEP,oddsFromProbability,payoutFor,weekStart} from './racing.js';

export const ML_TYPES={top:{label:'トップ'},last:{label:'ラス'}};
/** Every table starts at 19:00 JST (both tables on two-table days, per the owner). */
export const ML_START='19:00';
/** Prior strength: rates shrink toward 1 in 4 by this many virtual games, so a rookie is 4.0x. */
export const ML_PRIOR_GAMES=20;
const at=(date,time)=>Date.parse(`${date}T${time}:00+09:00`);
const validInt=(v,min=0)=>Number.isSafeInteger(v)&&v>=min;
export const mlStart=fixture=>at(fixture.date,ML_START);
/** The other game of the same table on the same day. */
export const mlPartner=(data,fixture)=>data.fixtures.find(f=>f.date===fixture.date&&f.table===fixture.table&&f.game!==fixture.game);
/** Game 1 closes at 19:00. Game 2 closes when game 1's official result is in (no fixed time, per the
 * owner), and in any case when the day ends, so a result that never arrives cannot keep it open until
 * the next morning. Betting opens 24 hours before the start. */
export function mlOpen(data,fixture,now,results){
 const start=mlStart(fixture);
 if(now<start-86400000)return false;
 if(fixture.game===1)return now<start;
 const first=mlPartner(data,fixture);
 return now<at(fixture.date,'00:00')+86400000&&!(first&&results.has(first.id));
}
/** The 16 players who may sit at this table, numbered team by team. */
export function mlCard(data,fixture){
 return fixture.teams.flatMap(id=>{const team=data.teams.find(t=>t.id===id);return team?team.players.map(p=>({name:p.name,team:team.id,teamName:team.name,games:p.games,top:p.top,last:p.last})):[];})
  .map((p,i)=>({no:i+1,...p}));
}
/** Odds (in tenths) from past official results plus this season's: (count + 5) / (games + 20). */
export function mlOdds(player,season={}){
 const s=season[player.name]??{games:0,top:0,last:0},games=player.games+s.games;
 const rate=count=>(count+ML_PRIOR_GAMES/4)/(games+ML_PRIOR_GAMES);
 return {top:oddsFromProbability(rate(player.top+s.top)),last:oddsFromProbability(rate(player.last+s.last))};
}
export function createMleague(){return {mlBets:[]};}
function validBet(b){return b&&typeof b.id==='string'&&b.id.length<=60&&typeof b.match==='string'&&b.match.length<=20&&typeof b.player==='string'&&b.player.length<=20&&Object.hasOwn(ML_TYPES,b.type)
 &&validInt(b.amount,MIN_BET)&&validInt(b.odds,10)&&['pending','won','lost','refunded'].includes(b.status)&&validInt(b.payout)&&validInt(b.time);}
export function hydrateMleague(raw){
 const ml=createMleague();
 if(Array.isArray(raw?.mlBets))ml.mlBets=raw.mlBets.filter(validBet).slice(0,60).map(b=>({id:b.id,match:b.match,player:b.player,type:b.type,amount:b.amount,odds:b.odds,status:b.status,payout:b.payout,time:b.time}));
 return ml;
}
/** Buys a prediction. Shares the weekly betting limit with horse racing (state.raceWeek). */
export function placeMlBet(state,{match,player,type,amount},now,data,results,season={}){
 const fixture=data.fixtures.find(f=>f.id===match);
 if(!fixture)throw Error('試合を選んでください');
 if(!mlOpen(data,fixture,now,results))throw Error(now<mlStart(fixture)-86400000?'この試合はまだ受付前です（前日19:00から）':'この試合の予想は締め切りました');
 if(!Object.hasOwn(ML_TYPES,type))throw Error('トップかラスかを選んでください');
 const card=mlCard(data,fixture),pick=card.find(p=>p.no===player||p.name===player);
 if(!pick)throw Error('選手を選んでください');
 if(!validInt(amount,MIN_BET)||amount%BET_STEP!==0)throw Error(`金額は${MIN_BET} KP以上、${BET_STEP} KP単位です`);
 if(amount>state.cash)throw Error('KPが不足しています');
 const week=weekStart(now),spent=state.raceWeek?.start===week?state.raceWeek.spent:0;
 if(spent+amount>WEEKLY_LIMIT)throw Error(`1週間に賭けられるのは${WEEKLY_LIMIT.toLocaleString('ja-JP')} KPまでです（競馬と合算・残り${(WEEKLY_LIMIT-spent).toLocaleString('ja-JP')} KP）`);
 const bet={id:`ml-${now}-${state.mlBets.length}`,match,player:pick.name,type,amount,odds:mlOdds(pick,season)[type],status:'pending',payout:0,time:now};
 state.cash-=amount;state.raceWeek={start:week,spent:spent+amount};
 state.mlBets.unshift(bet);
 const pending=state.mlBets.filter(b=>b.status==='pending');
 state.mlBets=[...pending,...state.mlBets.filter(b=>b.status!=='pending').slice(0,Math.max(0,60-pending.length))].sort((a,b)=>b.time-a.time);
 return bet;
}
/** Settles pending bets whose game has an official result: `results` maps a fixture id to {names}
 * in finishing order, and `closedAt` when a member said when the game started (/mclose). A named
 * player who did not play, and any bet bought at or after the stated start, is refunded. */
export function settleMlBets(state,results){
 const settled=[];
 for(const bet of state.mlBets){
  const result=bet.status==='pending'?results.get(bet.match):null;
  if(!result)continue;
  const place=result.names.indexOf(bet.player);
  if(place<0||(Number.isSafeInteger(result.closedAt)&&bet.time>=result.closedAt)){bet.status='refunded';bet.payout=bet.amount;}
  else{const won=bet.type==='top'?place===0:place===result.names.length-1;bet.status=won?'won':'lost';bet.payout=won?payoutFor(bet.amount,bet.odds):0;}
  if(!validInt(state.cash+bet.payout))throw Error('KPが上限を超えています');
  state.cash+=bet.payout;settled.push(bet);
 }
 return settled;
}
