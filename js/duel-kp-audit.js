// Pure, read-only ledger check. Called only after an escrow/settlement action, never from polling.
export function duelLedgerExpectations(match){
 const root='duel:',id=String(match.id),stake=match.stake;
 if(!id||!Number.isSafeInteger(stake)||stake<100||stake>100000)throw Error('Invalid duel for audit');
 const entries=[
  {id:root+'stake:a:'+id,guild:match.guild,user:match.user_a,delta:-stake},
  {id:root+'stake:b:'+id,guild:match.guild,user:match.user_b,delta:-stake}
 ];
 if(match.status==='finished'){
  if(!['draw',match.user_a,match.user_b].includes(match.winner))throw Error('Invalid winner');
  if(match.winner==='draw'){
   entries.push({id:root+'payout:a:'+id,guild:match.guild,user:match.user_a,delta:stake});
   entries.push({id:root+'payout:b:'+id,guild:match.guild,user:match.user_b,delta:stake});
  }else{
   const side=match.winner===match.user_a?'a':'b';
   entries.push({id:root+'payout:'+side+':'+id,guild:match.guild,user:match.winner,delta:stake*2});
  }
 }
 return entries;
}
export function checkDuelLedger(match,actual){
 const expected=duelLedgerExpectations(match),byId=new Map(actual.map(r=>[r.id,r]));
 const problems=expected.filter(e=>{
  const found=byId.get(e.id);
  return !found||found.guild!==e.guild||found.user!==e.user||Number(found.delta)!==e.delta||found.kind!=='duel';
 }).map(e=>e.id);
 const prefix='duel:payout:',id=String(match.id);
 const unexpected=actual.filter(r=>r.id?.startsWith(prefix)&&r.id.endsWith(':'+id)&&!expected.some(e=>e.id===r.id)).map(r=>r.id);
 return {ok:problems.length===0&&unexpected.length===0,problems:[...problems,...unexpected]};
}
