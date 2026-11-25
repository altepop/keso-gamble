// Private goals only. Authentication and HTTP are supplied by the owning page.
(function(root){
 'use strict';
 const HEADINGS=Object.freeze({goals:'ご自身の目標を設定します',rank:'目指すコンペのランクを決めます',process:'次の試合で試す行動を決めます'});
 function create({request}){
  const element=document.createElement('section');element.className='coach-goals';element.dataset.coachGoals='';
  let data=null,epoch=0,pending=false;
  const el=(tag,text,attrs={})=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e;};
  const note=el('p','',{role:'status','aria-live':'polite'});
  function clear(){epoch++;data=null;pending=false;element.replaceChildren();note.textContent='';}
  const field=(form,label,node)=>{const wrap=el('label',label);wrap.append(node);form.append(wrap);return node;};
  function render(){
   element.replaceChildren(el('h2',HEADINGS.goals),el('p','目標は本人にだけ表示されます。登録しなくても分析は利用できます。'),note);
   if(!data){element.append(el('p','目標の保存先を確認できませんでした。分析を更新して、もう一度お試しください。'));return;}
   for(const kind of ['rank','process']){
    const goal=data.goals.find(g=>g.kind===kind),card=el('details');card.dataset.goalKind=kind;card.className='coach-disclosure';
    const label=kind==='rank'?HEADINGS.rank:HEADINGS.process;card.append(el('summary',label));
    const body=el('div',undefined,{class:'detail-body'});card.append(body);element.append(card);
    body.append(el('p',goal?(kind==='rank'?'目標：'+data.policy.rankOptions.find(r=>r.value===goal.targetRank)?.label:goal.action):'まだ設定されていません。必要なときに登録してください。'));
    if(goal?.targetDate)body.append(el('p',goal.targetDate+'（日本時間）'+(goal.targetDate<data.policy.todayJst?'：目標日を過ぎています。目標は継続中です。':'')));
    const form=el('form');form.dataset.goalForm=kind;body.append(form);
    let rank,action,check;const steps=[];
    if(kind==='rank'){
     rank=field(form,'目標ランク（現在の実測ランクとは別です）',el('select',undefined,{name:'targetRank',required:''}));rank.append(el('option','選んでください',{value:''}));
     for(const r of data.policy.rankOptions)rank.append(el('option',r.label,{value:r.value}));rank.value=goal?.targetRank||'';
    }else{
     action=field(form,'取り組む行動（200文字まで）',el('textarea',undefined,{name:'action',required:'',rows:'3'}));action.value=goal?.action||'';
     for(let i=0;i<3;i++){const s=field(form,'手順 '+(i+1)+'（任意・80文字まで）',el('input',undefined,{name:'step'+i,type:'text'}));s.value=goal?.steps[i]||'';steps.push(s);}
     check=field(form,'試合後の確認方法（120文字まで）',el('textarea',undefined,{name:'selfCheck',required:'',rows:'2'}));check.value=goal?.selfCheck||'';
    }
    const date=field(form,'目標日（任意・日本時間）',el('input',undefined,{name:'targetDate',type:'date',min:'2000-01-01',max:'9999-12-31'}));date.value=goal?.targetDate||'';
    const buttons=el('div',undefined,{class:'goal-actions'}),save=el('button',goal?'変更を保存します':'目標を登録します',{type:'submit'});buttons.append(save);form.append(buttons);
    const goalId=goal?.goalId||crypto.randomUUID();
    const payload=status=>({goalId,kind,expectedVersion:goal?.version||0,action:action?.value||'',steps:steps.map(s=>s.value.trim()).filter(Boolean),selfCheck:check?.value||'',targetRank:rank?.value||null,targetDate:date.value||null,status});
    async function submit(status){
     if(pending)return;const body=payload(status),captured=epoch;
     if(Array.from(body.action.trim()).length>200||body.steps.some(s=>Array.from(s).length>80)||Array.from(body.selfCheck.trim()).length>120){note.textContent='文字数の上限を確認してください。入力内容は残しています。';return;}
     pending=true;buttons.querySelectorAll('button').forEach(b=>b.disabled=true);note.textContent='保存しています。';
     try{
      const result=await request('/api/kp/coach/goals',{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}});
      if(captured!==epoch)return;
      data.goals=data.goals.filter(g=>g.goalId!==result.goal.goalId);data.history=data.history.filter(g=>g.goalId!==result.goal.goalId);
      if(result.goal.status==='active')data.goals.push(result.goal);else data.history=[result.goal,...data.history].slice(0,20);
      note.textContent='本人限定で保存しました。達成の記録はご自身の申告であり、自動判定ではありません。';render();element.querySelector('[data-goal-kind="'+kind+'"]').open=true;
     }catch(e){
      if(captured!==epoch)return;note.textContent=e.message+' 入力内容は残しています。';
      if(e.status===409){
       const reload=el('button','入力を破棄して最新の目標を読み直します',{type:'button','data-goal-reload':''});
       // Explicit discard, never an automatic overwrite of a newer version.
       reload.onclick=async()=>{if(pending)return;const current=epoch;pending=true;reload.disabled=true;try{const next=await request('/api/kp/coach/goals');if(current!==epoch)return;data=next;note.textContent='最新の目標を読み込みました。';render();element.querySelector('[data-goal-kind="'+kind+'"]').open=true;}catch(err){if(current===epoch){note.textContent=err.message;reload.disabled=false;}}finally{if(current===epoch)pending=false;}};
       if(!form.querySelector('[data-goal-reload]'))form.append(reload);
      }
     }finally{if(captured===epoch){pending=false;buttons.querySelectorAll('button').forEach(b=>b.disabled=false);}}
    }
    form.onsubmit=e=>{e.preventDefault();if(form.reportValidity())void submit('active');};
    if(goal){for(const [status,label] of [['self-achieved','達成を自己申告で記録します'],['archived','この目標を終了します']]){const b=el('button',label,{type:'button','data-goal-status':status});b.onclick=()=>{if(form.reportValidity())void submit(status);};buttons.append(b);}}
   }
   const history=el('details');history.dataset.goalHistory='';history.className='coach-disclosure';history.append(el('summary','過去の目標を確認します（直近20件）'));
   for(const g of data.history){const item=el('div',undefined,{class:'detail-body'});item.append(el('p',(g.status==='self-achieved'?'本人が達成を記録（自己申告）':'終了')+'：'+(g.kind==='rank'?data.policy.rankOptions.find(r=>r.value===g.targetRank)?.label:g.action)));for(const s of g.steps)item.append(el('p',s));if(g.selfCheck)item.append(el('p','確認方法：'+g.selfCheck));if(g.targetDate)item.append(el('p','目標日：'+g.targetDate+'（日本時間）'));history.append(item);}
   if(!data.history.length)history.append(el('p','過去の目標はまだありません。'));element.append(history);
  }
  return {element,clear,setData(value){data=value&&Array.isArray(value.goals)&&value.policy?structuredClone(value):null;render();}};
 }
 root.KesoCoachGoals=Object.freeze({create,headings:HEADINGS});
})(globalThis);
