// P9.4 server-only PvE page. Token is never placed in a URL, body or log.
import {pvePanel,duelRewardPanel,pveBuildPanel} from './view.js?v=p95-build';
const app=document.getElementById('pve-root');
const root=location.hostname.endsWith('.discordsays.com')?'/.proxy/kp-api':'https://valorant-results.tealeaforest.workers.dev';
const token=(()=>{try{return localStorage.getItem('keso-kp-session-v1')||sessionStorage.getItem('keso-kp-session-v1');}catch{return null;}})();
const openRewardSection=location.hash==='#duel-rewards';
let rewardProfile=null,build=[],buildBusy=false,buildMessage='';
let owner=null,match=null,busy=false,pending=null,selected=null,picks=[],guess='',game='othello',level='normal',error='',savedId=null;
const save=(k,value)=>{try{if(value===null)sessionStorage.removeItem(k);else sessionStorage.setItem(k,JSON.stringify(value));}catch{}};
const load=k=>{try{return JSON.parse(sessionStorage.getItem(k)||'null');}catch{return null;}};
function render(){
 app.innerHTML='<header class="duel-pve-page-head"><a href="./index.html">← KESO PLAYに戻る</a><h1>⚔️ サーバーCPU攻略</h1></header>'+
 pvePanel({match,connected:!!owner&&!!token,busy,error,pending:!!pending,selected,picks,game,level,savedId:!!savedId,guessDraft:guess,build})+pveBuildPanel(rewardProfile,build,buildBusy,buildMessage)+duelRewardPanel(rewardProfile);
 // On this dedicated page the only panel should open on first visit.
 const panel=app.querySelector('.duel-pve-panel');if(panel)panel.open=true;
 if(openRewardSection)app.querySelector('#duel-rewards details:last-child')?.setAttribute('open','');
}
async function api(path,body){
 if(!token)throw Error('KP口座への接続が必要です。KESO PLAYでログインしてください。');
 let response;
 try{response=await fetch(root+'/api/kp/'+path,{
  method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(15000)
 });}catch{throw Error('通信結果が未確認です。同じ操作IDで結果を確認してください。');}
 let data;try{data=await response.json();}catch{throw Error('サーバー応答が未確認です。再取得してください。');}
 if(!response.ok)throw Error(data.error||'CPU戦の操作を確認できませんでした。');
 return data;
}
async function loadRewards(){
 const firstLoad=!rewardProfile;
 try{rewardProfile=await api('duels/rewards');}catch{return;}
 if(firstLoad&&rewardProfile.collection.some(row=>row.mode==='pve')){
  try{build=(await api('duels/pve/build')).build;}catch{buildMessage='ビルドを取得できませんでした。';}
 }
 render();
 if(firstLoad&&openRewardSection)app.querySelector('#duel-rewards')?.scrollIntoView();
}
async function loadSession(id){
 if(!id||!owner)return;
 busy=true;error='';render();
 try{const data=await api('duels/pve?session='+encodeURIComponent(id));match=data.match;savedId=match.id;save('pve-id:'+owner,savedId);selected=null;picks=[];guess='';}
 catch(e){error=e.message||'CPU戦の読み込みに失敗しました。';}
 finally{busy=false;render();}
}
async function submit(args,retry=false){
 if(!owner||!token){error='認証済みKP口座に接続してください。';render();return;}
 if(busy)return;
 if(pending&&!retry){error='前回操作の結果が未確認です。同じ操作IDで確認してください。';render();return;}
 if(!retry){pending={owner,requestId:crypto.randomUUID(),args,at:Date.now()};save('pve-pending',pending);}
 if(!pending||pending.owner!==owner)return;
 busy=true;error='';render();
 try{
  const output=await api('duels/pve',{...pending.args,requestId:pending.requestId});
  if(!output.match||typeof output.match.id!=='string')throw Error('確定済み試合を確認できませんでした。');
  match=output.match;savedId=match.id;save('pve-id:'+owner,savedId);
  pending=null;save('pve-pending',null);selected=null;picks=[];guess='';
 }catch(e){error='前回の操作結果を確定できませんでした。新しい操作を送らず、同じ操作IDで確認してください。 '+(e.message||'');}
 finally{busy=false;render();}
 if(match?.turn==='finished')void loadRewards();
}
app.addEventListener('input',e=>{if(e.target.id==='pve-guess')guess=e.target.value;});
app.addEventListener('change',async e=>{
 if(e.target.dataset.pveBuild){
  if(buildBusy)return;
  const game=e.target.dataset.pveBuild,style=e.target.value||null;
  buildBusy=true;buildMessage='保存中…';render();
  try{build=(await api('duels/pve/build',{game,style})).build;buildMessage='攻略ビルドを保存しました。';}
  catch{buildMessage='保存結果を確認できませんでした。再読み込みして確認してください。';}
  finally{buildBusy=false;render();app.querySelector('[data-pve-build="'+game+'"]')?.focus();}
  return;
 }
 if(e.target.id==='pve-game')game=e.target.value;
 if(e.target.id==='pve-level')level=e.target.value;
});
app.addEventListener('click',async e=>{
 const el=e.target.closest('button');
 if(!el)return;
 if(el.dataset.pveRetry!==undefined){await submit(pending?.args,true);return;}
 if(el.dataset.pveRefresh!==undefined||el.dataset.pveResume!==undefined){await loadSession(match?.id||savedId);return;}
 if(busy||pending){error='前回の操作を先に確認してください。';render();return;}
 if(el.dataset.pveCard!==undefined){
  const i=Number(el.dataset.pveCard);
  if(!match||match.turn!=='human'||match.game!=='poker'||!Number.isInteger(i)||i<0||i>4)return;
  if(picks.includes(i))picks=picks.filter(x=>x!==i);
  else if(picks.length<3)picks=[...picks,i];
  else error='交換できるカードは3枚までです。';
  render();return;
 }
 if(el.dataset.pveCancel!==undefined){selected=null;render();return;}
 if(el.dataset.pveCell!==undefined&&match?.game==='gomoku'){
  if(match.turn==='human'){selected=Number(el.dataset.pveCell);render();}
  return;
 }
 if(el.dataset.pveSubmit==='start'){await submit({action:'start',game,level});return;}
 if(!match||match.turn!=='human')return;
 let move;
 if(el.dataset.pveConfirm!==undefined){
  const cell=Number(el.dataset.pveConfirm);
  if(match.game!=='gomoku'||selected!==cell)return;
  move={cell};
 }else if(el.dataset.pveCell!==undefined)move={cell:Number(el.dataset.pveCell)};
 else if(el.dataset.pveCol!==undefined)move={cell:Number(el.dataset.pveCol)};
 else if(el.dataset.pveSubmit==='hitblow'){
  const value=document.getElementById('pve-guess')?.value||guess;
  if(!/^[0-9]{4}$/.test(value)||new Set(value).size!==4){error='異なる4桁の数字を入力してください。';render();return;}
  move={guess:value};
 }else if(el.dataset.pveSubmit==='bid')move={choice:'bid',count:Number(document.getElementById('pve-bid-count')?.value),face:Number(document.getElementById('pve-bid-face')?.value)};
 else if(el.dataset.pveSubmit==='challenge')move={choice:'challenge'};
 else if(el.dataset.pveSubmit==='poker')move={cells:[...picks]};
 else return;
 await submit({action:'move',session:match.id,version:match.version,...move});
});
render();
(async()=>{
 if(!token){error='KP口座へログインした後、このページを開き直してください。';render();return;}
 try{
  const state=await api('state');
  if(typeof state.selfUserId!=='string'||!state.selfUserId)throw Error('本人確認に失敗しました。');
  owner=state.selfUserId;
  const saved=load('pve-pending');
  if(saved?.owner===owner&&typeof saved.requestId==='string'&&Date.now()-saved.at<86400000)pending=saved;
  savedId=load('pve-id:'+owner);
  if(savedId&&typeof savedId!=='string')savedId=null;
  if(savedId)await loadSession(savedId);
  void loadRewards();
 }catch(e){error=e.message||'KP口座を確認できませんでした。';}
 render();
})();
