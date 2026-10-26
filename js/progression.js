// Local prototype rules. Approval here simulates verification; it does not query game APIs.
export const ACTIVITIES = [
  {id:'competitive',name:'VALORANT コンペ',reward:500},
  {id:'unrated',name:'VALORANT アンレート',reward:300},
  {id:'deathmatch',name:'VALORANT デスマッチ',reward:150},
  {id:'escalation',name:'VALORANT エスカレーション',reward:200},
  {id:'steam',name:'Steam 実績解除',reward:800},
];
export const MEMBERS=[{id:'riso',name:'リソ（デモ）'},{id:'yuya',name:'ゆーや（デモ）'},{id:'yano',name:'矢野（デモ）'}];
export const ORDERS=[
  {id:'competitive',name:'コンペを1試合プレイさせる',cost:2500},
  {id:'unrated',name:'アンレを1試合プレイさせる',cost:1500},
  {id:'steam',name:'指定のSteam実績を解除させる',cost:3500},
];
export function createProgress(){return {claims:[],directives:[],progressSeq:0};}
function text(value,label,max=160){if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw Error(`${label}を1〜${max}文字で入力してください`);return value.trim();}
const norm=s=>s.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim();
const int=v=>Number.isSafeInteger(v)&&v>=0;
function capacity(state){if(state.claims.length+state.directives.length>=500)throw Error('デモの記録上限に達しました');if(!int(state.progressSeq+1))throw Error('記録番号が上限です');}
function claimKey(activity,reference,game,achievement){return activity==='steam'?JSON.stringify(['steam',norm(game),norm(achievement)]):JSON.stringify(['valorant',norm(reference)]);}
export function submitClaim(state,{activity,reference,game='',achievement=''},now=Date.now()){
 const item=ACTIVITIES.find(x=>x.id===activity);if(!item)throw Error('報酬の種類が不正です');
 reference=text(reference,'試合IDまたは確認資料',240);
 if(activity==='steam'){game=text(game,'ゲーム名',80);achievement=text(achievement,'実績名',120);}else{game='VALORANT';achievement='';}
 const key=claimKey(activity,reference,game,achievement);
 if(state.claims.some(c=>c.key===key))throw Error('同じ試合・実績は申請済みです');
 capacity(state);
 const claim={id:++state.progressSeq,activity,reference,game,achievement,key,reward:item.reward,status:'pending',time:now};state.claims.unshift(claim);return claim;
}
export function approveClaim(state,id,now=Date.now()){
 const claim=state.claims.find(c=>c.id===id);if(!claim||claim.status!=='pending')throw Error('この申請は支給済み、または存在しません');
 const cash=state.cash+claim.reward;
 const stockValue=Object.keys(state.holdings).reduce((sum,key)=>sum+state.holdings[key]*state.prices[key],0);
 if(!int(cash)||!int(cash+stockValue))throw Error('KPが上限を超えています');
 state.cash=cash;claim.status='approved';claim.approvedAt=now;return claim.reward;
}
export function issueDirective(state,{target,task,game='',achievement=''},now=Date.now()){
 if(!MEMBERS.some(m=>m.id===target))throw Error('指名するメンバーを選んでください');
 const item=ORDERS.find(o=>o.id===task);if(!item)throw Error('指令の種類が不正です');
 if(task==='steam'){game=text(game,'ゲーム名',80);achievement=text(achievement,'実績名',120);}else{game='VALORANT';achievement='';}
 if(state.directives.some(d=>d.target===target&&d.status==='active'))throw Error('この相手には未達成の指令があります');
 if(state.cash<item.cost)throw Error('指令に使うKPが不足しています');
 capacity(state);
 const directive={id:++state.progressSeq,target,task,game,achievement,cost:item.cost,status:'active',time:now};state.cash-=item.cost;state.directives.unshift(directive);return directive;
}
export function completeDirective(state,id,now=Date.now()){
 const d=state.directives.find(d=>d.id===id);if(!d||d.status!=='active')throw Error('有効な指令ではありません');d.status='completed';d.completedAt=now;
}
export function hydrateProgress(raw){
 const result=createProgress();const ids=new Set(),keys=new Set();
 for(const c of (Array.isArray(raw.claims)?raw.claims:[]).slice(0,500)){
  try{if(!c||!int(c.id)||c.id===0||ids.has(c.id)||!int(c.time)||!['pending','approved'].includes(c.status))continue;
   const temp={...createProgress(),cash:0};const checked=submitClaim(temp,c,c.time);
   if(c.reward!==checked.reward||keys.has(checked.key))continue;
   if(c.status==='approved'&&!int(c.approvedAt))continue;
   const record={...checked,id:c.id,status:c.status};if(c.status==='approved')record.approvedAt=c.approvedAt;
   result.claims.push(record);ids.add(c.id);keys.add(checked.key);
  }catch{/* Drop malformed records. */}
 }
 for(const d of (Array.isArray(raw.directives)?raw.directives:[]).slice(0,500-result.claims.length)){
  try{if(!d||!int(d.id)||d.id===0||ids.has(d.id)||!int(d.time)||!['active','completed'].includes(d.status))continue;
   const temp={...createProgress(),cash:Number.MAX_SAFE_INTEGER};const checked=issueDirective(temp,d,d.time);
   if(d.cost!==checked.cost||(d.status==='completed'&&!int(d.completedAt)))continue;
   if(d.status==='active'&&result.directives.some(x=>x.target===d.target&&x.status==='active'))continue;
   const record={...checked,id:d.id,status:d.status};if(d.status==='completed')record.completedAt=d.completedAt;
   result.directives.push(record);ids.add(d.id);
  }catch{/* Drop malformed records. */}
 }
 result.progressSeq=Math.max(0,...ids);return result;
}
