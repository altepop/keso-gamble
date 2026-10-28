// Presentation only: reveal the already-confirmed operation, never draw or settle here.
const copy=value=>structuredClone(value);
export function casinoFrames(action,before,result){
 const frames=[],base={cash:before.cash,chinchiro:[],blackjack:null,bjHistory:[]};
 const add=(view,stage,ms)=>frames.push({view:copy(view),stage,ms});
 if(action==='chinchiro'){
  const shown={...copy(result),oya:{rolls:[],hand:null},ko:null};
  for(const side of ['oya','ko']){
   if(!result[side])continue;
   shown[side]={rolls:[],hand:null};
   result[side].rolls.forEach((dice,index)=>{
    // Stop each real die separately. The last die stays unreadable until it lands.
    add({...base,chinchiro:[shown]},{phase:'rolling',side,round:index+1,stopped:[]},index?700:1000);
    add({...base,chinchiro:[shown]},{phase:'landing',side,round:index+1,stopped:dice.slice(0,1)},index?240:380);
    add({...base,chinchiro:[shown]},{phase:'landing',side,round:index+1,stopped:dice.slice(0,2)},dice[0]===dice[1]?1100:index?550:800);
    shown[side].rolls.push(copy(dice));
    const final=index===result[side].rolls.length-1;
    if(final)shown[side].hand=copy(result[side].hand);
    add({...base,chinchiro:[shown]},{phase:final?'hand':'reroll',side,round:index+1},final?750:400);
   });
  }
  add({...base,chinchiro:[result]},{phase:'settled',net:result.net},950);
  return frames;
 }
 const target=result.done??result.hand;if(!target)return frames;
 const starting=action==='bj-start';
 const previous=starting?{player:[],dealer:[]}:before.blackjack??{player:[],dealer:[]};
 // Only keep a common prefix if another device has advanced the server's hand.
 const prefix=(old,now)=>{let n=0;while(n<old.length&&n<now.length&&old[n].r===now[n].r&&old[n].s===now[n].s)n++;return now.slice(0,n);};
 const shown={bet:target.bet,doubled:!!target.doubled,player:prefix(previous.player,target.player),dealer:prefix(previous.dealer,target.dealer),time:target.time};
 const reveal=(side,index)=>{shown[side].push(copy(target[side][index]));add({...base,blackjack:shown},{phase:'dealing',side,index},320);};
 if(starting){reveal('player',0);reveal('dealer',0);reveal('player',1);}
 else for(let i=shown.player.length;i<target.player.length;i++)reveal('player',i);
 if(result.done){
  if(result.done.result!=='bust'){
   add({...base,blackjack:shown},{phase:'dealer-turn'},450);
   for(let i=shown.dealer.length;i<target.dealer.length;i++)reveal('dealer',i);
  }
  add({...base,blackjack:null,bjHistory:[result.done]},{phase:'settled',net:result.done.net},1050);
 }
 return frames;
}
