// Owner-only records. No persistent draft storage and no shared-summary payloads.
(function(root){
 'use strict';
 const headings=Object.freeze({main:'実施記録と個人メモを確認します',practice:'保存した練習を振り返ります',custom:'自分で決めた練習を記録します',notes:'個人メモを残します'});
 const el=(tag,text,attrs={})=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
 let catalogPromise;const clientCatalog=()=>catalogPromise??=crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({policy:'diamond-v1',entries:root.KesoCoachPractice.entries}))).then(bytes=>[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join(''));
 const labels={done:'実施しました',partial:'一部試しました',skipped:'今回は試していません',unknown:'覚えていません'};
 function create({request,copyText=t=>t,onChange=()=>{},onReview=()=>{}}){
  const element=el('section',undefined,{class:'coach-records','data-private-records':''}),status=el('p','',{role:'status','aria-live':'polite'}),guard=el('div',undefined,{'data-record-leave-guard':''});guard.hidden=true;
  const review=root.KesoCoachPracticeReview.create({copyText,onReview});
  let epoch=0,data=null,notes=[],noteCursor=null,goals=[],state=null,pending=false,newRecord=crypto.randomUUID(),newNote=crypto.randomUUID(),open=false;
  const dirty=()=>[...element.querySelectorAll('form[data-dirty="true"]')];
  function clear(){epoch++;review.clear();data=null;notes=[];goals=[];state=null;noteCursor=null;pending=false;open=false;newRecord=crypto.randomUUID();newNote=crypto.randomUUID();element.replaceChildren();status.textContent='';guard.replaceChildren();guard.hidden=true;onChange(null);}
  function capture(){return new Map(dirty().map(f=>[f.dataset.key,[...f.elements].filter(e=>e.name).map(e=>({name:e.name,value:e.value,checked:e.checked}))]));}
  function form(key){const f=el('form',undefined,{'data-key':key});f.__epoch=epoch;f.oninput=()=>{f.dataset.dirty='true';};f.onchange=()=>{f.dataset.dirty='true';};return f;}
  function input(f,label,name,type='text',value='',required=false){const wrap=el('label',label),n=el(type==='textarea'?'textarea':type==='select'?'select':'input',undefined,{name,...type==='textarea'?{rows:'3'}:type==='select'?{}:{type}});if(required)n.required=true;if(type==='number'){n.min='0';n.max=name==='minutes'?'180':'100';n.step='1';}if(type==='date'){n.min='2000-01-01';n.max=data?.policy.todayJst||'';}if(type!=='select')n.value=value??'';wrap.append(n);f.append(wrap);return n;}
  const numeric=n=>n.value===''?null:Number(n.value);
  const fold=(label,attr)=>{const d=el('details',undefined,{class:'coach-disclosure',...(attr?{[attr]:''}:{})});d.append(el('summary',label));const body=el('div',undefined,{class:'detail-body'});d.append(body);return {d,body};};
  async function load(discard=false){
   if(pending)return false;
   const current=epoch;pending=true;status.textContent='本人の記録を読み込んでいます。';
   try{const [r,n,g]=await Promise.all([request('/api/kp/coach/practice/records'),request('/api/kp/coach/notes'),request('/api/kp/coach/goals')]);if(current!==epoch)return false;data=r;notes=n.items;noteCursor=n.nextCursor;goals=g.goals.filter(x=>x.kind==='process');if(discard)element.querySelectorAll('form').forEach(f=>delete f.dataset.dirty);open=true;status.textContent='本人限定の記録を読み込みました。';render();return true;}
   catch(e){if(current===epoch)status.textContent=e.message;return false;}finally{if(current===epoch)pending=false;}
  }
  async function save(f,path,body){
   if(pending||f.__epoch!==epoch)return false;pending=true;const current=epoch;const controls=[...f.elements];controls.forEach(n=>n.disabled=true);status.textContent='本人限定で保存しています。';
   const apply=result=>{if(path.endsWith('/notes')||body.kind==='note'){notes=notes.filter(n=>n.id!==result.item.id);if(result.item.status!=='deleted')notes.unshift(result.item);if(result.item.id===newNote)newNote=crypto.randomUUID();}
    else{if(data.active?.id===result.item.id)data.active=null;data.items=data.items.filter(r=>r.id!==result.item.id);if(result.item.status==='planned')data.active=result.item;else if(result.item.status!=='deleted')data.items.unshift(result.item);if(result.item.id===newRecord)newRecord=crypto.randomUUID();}
    delete f.dataset.dirty;status.textContent=result.item.status==='deleted'?'内容を削除しました。再送しても復活しません。':path.endsWith('/match')&&body.kind==='note'?'本人の試合をメモに関連付けました。':path.endsWith('/match')?'本人の試合と観察指標の設定を保存しました。実施したという証明ではありません。':path.endsWith('/notes')?'本人限定でメモを保存しました。':result.item.status==='planned'?'今回試す予定を保存しました。実施したという申告ではありません。':'本人限定で実施記録を保存しました。内容は本人の申告です。';render(f.dataset.key);
   };
   try{const result=await request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(current!==epoch)return false;apply(result);return true;}
   catch(e){if(current!==epoch)return false;status.textContent=e.message+' 入力内容は残しています。';
    const retry=el('button','同じ内容で再試行します',{type:'button','data-record-retry':''});retry.onclick=()=>void save(f,path,body);f.querySelector('[data-record-retry]')?.remove();f.append(retry);
    if(e.status===409){const latest=el('button','すべての未保存入力を破棄して読み直します',{type:'button','data-record-reload':''});latest.onclick=()=>void load(true);f.querySelector('[data-record-reload]')?.remove();f.append(latest);}return false;
   }finally{if(current===epoch){pending=false;controls.forEach(n=>n.disabled=false);}}
  }
  function allowLeave(action){
   if(pending){status.textContent='保存が終わるまでお待ちください。';return;}
   const forms=dirty();if(!forms.length){action();return;}
   guard.replaceChildren(el('p','未保存の入力があります。保存・破棄・戻るを選んでください。'));guard.hidden=false;
   for(const [label,callback] of [['保存して移動します',async()=>{element.inert=true;try{for(const f of forms)if(!await f.__save())return;guard.hidden=true;action();}finally{element.inert=false;}}],['破棄して移動します',()=>{forms.forEach(f=>delete f.dataset.dirty);guard.hidden=true;render();action();}],['入力に戻ります',()=>{guard.hidden=true;forms[0].querySelector('input,textarea,select')?.focus();}]]){const b=el('button',label,{type:'button'});b.onclick=callback;guard.append(b);}guard.scrollIntoView({block:'center'});
  }
  function resultForm(r){
   const f=form('record:'+r.id);f.dataset.recordForm=r.id;
   for(const item of r.items){f.append(el('p',item.title));const action=item.source==='catalogue'?copyText(item.action):item.action;for(const t of item.source==='catalogue'?action.match(/[^。！？]+[。！？]|[^。！？]+$/gu)||[]:[action])f.append(el('p',t));f.append(el('p','確認方法：'+(item.source==='catalogue'?copyText(item.check.replace(/か。?$/,'かを確認してください。')):item.check)));for(const t of item.guidance||[])f.append(el('p',t));}
   if(r.goal)f.append(el('p','保存時の目標：'+r.goal.action));
   f.append(el('p',r.plannedAt?'予定を保存した時刻を保持しています。':'後から登録した記録です。実施前の起点は作っていません。'));
   const report=input(f,'本人の実施申告','report','select');report.append(el('option','選んでください',{value:''}));for(const [key,label] of Object.entries(labels))report.append(el('option',label,{value:key}));report.value=r.execution?.report||'';report.required=true;
   const minutes=input(f,'使った時間（任意・0〜180分）','minutes','number',r.execution?.minutes??''),attempts=input(f,'確認した回数（任意・0〜100回）','attempts','number',r.execution?.attempts??''),successes=input(f,'試せた回数（任意・0〜100回）','successes','number',r.execution?.successes??'');
   const day=input(f,'実施日（日本時間）','occurredDate','date',r.occurredDate||data.policy.todayJst,true),reflection=input(f,'振り返り（1,000文字まで）','reflection','textarea',r.reflection);
   f.__save=()=>f.reportValidity()?save(f,'/api/kp/coach/practice/records',{id:r.id,op:'update',expectedVersion:r.version,status:report.value==='skipped'?'skipped':'recorded',execution:{report:report.value,minutes:numeric(minutes),attempts:numeric(attempts),successes:numeric(successes)},occurredDate:day.value,reflection:reflection.value}):Promise.resolve(false);
   f.onsubmit=e=>{e.preventDefault();void f.__save();};f.append(el('button',r.status==='planned'?'本人の実施結果を保存します':'修正を保存します',{type:'submit'}));
   const remove=el('button','この実施記録を削除します',{type:'button','data-record-delete':r.id});remove.onclick=()=>void save(f,'/api/kp/coach/practice/records',{id:r.id,op:'delete',expectedVersion:r.version});f.append(remove);const wrapper=el('section');wrapper.append(f);const current=epoch;if(data.policy.matchLinksAvailable)review.mount({host:wrapper,record:r,form,save,request,isCurrent:()=>current===epoch});return wrapper;
  }
  function render(skip){
   review.capture(skip);const drafts=capture();if(skip)drafts.delete(skip);element.replaceChildren(guard,status);const outer=fold(headings.main,'data-record-panel');outer.d.open=open;element.append(outer.d);
   outer.body.append(el('p','実施記録とメモは本人にだけ表示されます。'),el('p','タイマーの終了だけで、実施済みや効果ありとは判定しません。'));
   const read=el('button','記録と目標の状態を読み込みます',{type:'button','data-record-load':''});read.onclick=()=>allowLeave(()=>void load(true));outer.body.append(read);
   if(!data){if(state)outer.body.append(el('p','保存した予定があります。記録を読み込んで確認してください。'));onChange(overview());return;}
   const goalSelect=el('select',undefined,{'data-practice-goal':'','aria-label':'予定に関連付ける目標'});goalSelect.append(el('option','目標は関連付けません',{value:''}));for(const g of goals)goalSelect.append(el('option',g.action,{value:g.goalId}));outer.body.append(el('p','提案された練習は、上の「この内容で実施します」から予定として保存できます。'),goalSelect);
   if(data.active){outer.body.append(el('h3',headings.practice),resultForm(data.active));}
   for(const r of data.items){const d=fold((r.occurredDate||'日付未取得')+'：'+r.items.map(i=>i.title).join('／'));d.body.append(resultForm(r));outer.body.append(d.d);}
   if(data.nextCursor){const more=el('button','前の実施記録を読み込みます',{type:'button','data-record-more':''});more.onclick=async()=>{if(pending)return;pending=true;const current=epoch;try{const r=await request('/api/kp/coach/practice/records?cursor='+encodeURIComponent(data.nextCursor));if(current!==epoch)return;const ids=new Set(data.items.map(x=>x.id));data.items.push(...r.items.filter(x=>!ids.has(x.id)));data.nextCursor=r.nextCursor;render();}catch(e){if(current===epoch)status.textContent=e.message;}finally{if(current===epoch)pending=false;}};outer.body.append(more);}
   const custom=fold(headings.custom,'data-custom-practice'),f=form('custom:'+newRecord);const title=input(f,'練習名（80文字まで）','title','text','',true),action=input(f,'試す行動（200文字まで）','action','textarea','',true),check=input(f,'次に確認すること（120文字まで）','check','textarea','',true),kind=input(f,'記録の種類','status','select');kind.append(el('option','過去の実施を本人申告で記録',{value:'recorded'}),el('option','これから試す予定を保存',{value:'planned'}));
   const report=input(f,'実施申告','report','select');for(const [key,label] of Object.entries(labels))report.append(el('option',label,{value:key}));const day=input(f,'実施日（日本時間）','occurredDate','date',data.policy.todayJst),reflection=input(f,'振り返り（1,000文字まで）','reflection','textarea');
   f.__save=()=>f.reportValidity()?save(f,'/api/kp/coach/practice/records',{id:newRecord,op:'create',expectedVersion:0,items:[{title:title.value,action:action.value,check:check.value}],status:kind.value==='planned'?'planned':report.value==='skipped'?'skipped':'recorded',execution:kind.value==='planned'?null:{report:report.value},occurredDate:kind.value==='planned'?null:day.value,reflection:reflection.value}):Promise.resolve(false);f.onsubmit=e=>{e.preventDefault();void f.__save();};f.append(el('button','本人の練習を保存します',{type:'submit'}));custom.body.append(f);outer.body.append(custom.d);
   const memo=fold(headings.notes,'data-personal-notes');
   for(const n of [{id:newNote,title:'',body:'',recordId:null,version:0},...notes]){const nf=form('note:'+n.id);nf.dataset.noteForm=n.id;const title=input(nf,'題名（80文字まで）','title','text',n.title,true),body=input(nf,'本文（2,000文字まで）','body','textarea',n.body,true),parent=input(nf,'関連付ける実施記録（任意）','recordId','select');parent.append(el('option','人物全体のメモ',{value:''}));for(const r of [data.active,...data.items].filter(Boolean))parent.append(el('option',r.items.map(i=>i.title).join('／'),{value:r.id}));if(n.recordId&&![...parent.options].some(o=>o.value===n.recordId))parent.append(el('option','以前の実施記録（削除済みの場合もあります）',{value:n.recordId}));parent.value=n.recordId||'';
    nf.__save=()=>nf.reportValidity()?save(nf,'/api/kp/coach/notes',{id:n.id,op:n.version?'update':'create',expectedVersion:n.version,title:title.value,body:body.value,recordId:parent.value||null}):Promise.resolve(false);nf.onsubmit=e=>{e.preventDefault();void nf.__save();};nf.append(el('button',n.version?'メモの修正を保存します':'個人メモを保存します',{type:'submit'}));if(n.version){const del=el('button','このメモを削除します',{type:'button','data-note-delete':n.id});del.onclick=()=>void save(nf,'/api/kp/coach/notes',{id:n.id,op:'delete',expectedVersion:n.version});nf.append(del);}memo.body.append(nf);if(n.version&&data.policy.matchLinksAvailable){const current=epoch;review.mount({host:memo.body,record:n,kind:'note',form,save,request,isCurrent:()=>current===epoch});}}
   if(noteCursor){const more=el('button','前のメモを読み込みます',{type:'button','data-note-more':''});more.onclick=async()=>{if(pending)return;pending=true;const current=epoch;try{const r=await request('/api/kp/coach/notes?cursor='+encodeURIComponent(noteCursor));if(current!==epoch)return;const ids=new Set(notes.map(n=>n.id));notes.push(...r.items.filter(n=>!ids.has(n.id)));noteCursor=r.nextCursor;render();}catch(e){if(current===epoch)status.textContent=e.message;}finally{if(current===epoch)pending=false;}};memo.body.append(more);}outer.body.append(memo.d);
   for(const form of element.querySelectorAll('form')){const values=drafts.get(form.dataset.key);if(!values)continue;for(const v of values){const n=[...form.elements].find(n=>n.name===v.name);if(n){n.value=v.value;if(n.type==='checkbox')n.checked=v.checked;}}form.dataset.dirty='true';for(let d=form.closest('details');d&&element.contains(d);d=d.parentElement.closest('details'))d.open=true;}
   onChange(overview());
  }
  const overview=()=>({loaded:!!data,active:data?data.active:state?.status==='planned'?state:null,latest:data?.items?.[0]||null,recordNotes:data?.items?.[0]?notes.filter(n=>n.recordId===data.items[0].id).map(n=>({title:n.title,body:n.body})):[]});
  async function openRecord(id,showReview=false){
   allowLeave(async()=>{
    if(!data&&!await load())return;
    open=true;render();
    const f=id?[...element.querySelectorAll('[data-record-form]')].find(n=>n.dataset.recordForm===id):null;
    let target=f||element.querySelector('[data-record-panel]');
    for(let d=target?.closest('details');d&&element.contains(d);d=d.parentElement?.closest('details'))d.open=true;
    if(showReview&&f){const review=f.parentElement?.querySelector('[data-practice-review]');if(review){review.open=true;target=review;review.querySelector('[data-review-load]')?.click();}}
    target?.scrollIntoView({block:'start',behavior:'auto'});
    (showReview?target?.querySelector('[data-review-load]'):target?.querySelector('select,button'))?.focus({preventScroll:true});
   });
  }
  async function savePlan(ids,context={}){
   const current=epoch;open=true;if(!data&&!await load())return false;if(current!==epoch||pending)return false;
   const catalogVersion=await clientCatalog();if(current!==epoch)return false;if(catalogVersion!==data.policy.catalogVersion){status.textContent='練習内容が更新されています。画面全体を再読み込みして確認してください。';return false;}
   if(dirty().length){allowLeave(()=>void savePlan(ids,context));return false;}
   const f=form('plan');element.append(f);const selected=element.querySelector('[data-practice-goal]')?.value,g=goals.find(g=>g.goalId===selected);
   return save(f,'/api/kp/coach/practice/records',{id:crypto.randomUUID(),op:'create',expectedVersion:0,items:ids.map(practiceId=>({practiceId})),catalogVersion,goal:g?{id:g.goalId,version:g.version}:null,context:{map:context.map||''},status:'planned',execution:null,occurredDate:null,reflection:''});
  }
  const dailyDoneRecord=pred=>[data?.active,...(data?.items||[])].filter(Boolean)
   .find(r=>r.status==='recorded'&&r.execution?.report==='done'&&pred(r))||null;
  const dailyRef=r=>r?{id:r.id,version:r.version}:null;
  async function dailyJudgment(lookup){
   if(!data&&!await load())return null;if(!data)return null;
   const day=lookup?.date||data.policy.todayJst;
   return {
    warm:dailyRef(dailyDoneRecord(r=>r.occurredDate===day&&r.items.some(i=>i.source==='catalogue'&&i.id===lookup?.practiceId))),
    study:dailyRef(dailyDoneRecord(r=>r.occurredDate===day&&r.items.some(i=>i.source==='personal'&&i.title===lookup?.studyTitle)))};
  }
  async function judgeDaily(kind,detail){
   if(!data&&!await load())return null;if(!data||pending)return null;
   const day=data.policy.todayJst;
   const lookup=kind==='practice'?{date:day,practiceId:detail.practiceId}:{date:day,studyTitle:detail.title};
   const existing=await dailyJudgment(lookup);
   const found=kind==='practice'?existing?.warm:existing?.study;if(found)return found;
   let body;
   if(kind==='practice'){
    const catalogVersion=await clientCatalog();if(catalogVersion!==data.policy.catalogVersion){status.textContent='練習内容が更新されています。画面全体を再読み込みして確認してください。';return null;}
    body={id:crypto.randomUUID(),op:'create',expectedVersion:0,items:[{practiceId:detail.practiceId}],catalogVersion,context:{map:detail.map||''},status:'recorded',execution:{report:'done',minutes:null,attempts:null,successes:null},occurredDate:day,reflection:''};
   }else{
    body={id:crypto.randomUUID(),op:'create',expectedVersion:0,items:[{title:detail.title,action:detail.action,check:detail.check}],status:'recorded',execution:{report:'done',minutes:null,attempts:null,successes:null},occurredDate:day,reflection:''};
   }
   const f=form('muse-daily');element.append(f);
   const ok=await save(f,'/api/kp/coach/practice/records',body);f.remove();
   if(!ok)return null;
   const again=await dailyJudgment(lookup);
   return kind==='practice'?again?.warm||null:again?.study||null;
  }
  async function unjudgeDaily(ref){
   if(!ref)return true;if(!data&&!await load())return false;if(!data||pending)return false;
   const f=form('muse-daily');element.append(f);
   const ok=await save(f,'/api/kp/coach/practice/records',{id:ref.id,op:'delete',expectedVersion:ref.version});f.remove();return ok;
  }
  return {element,clear,allowLeave,isDirty:()=>dirty().length>0,setState(v){state=v;render();},savePlan,openRecord,overview,dailyJudgment,judgeDaily,unjudgeDaily};
 }
 root.KesoCoachRecords=Object.freeze({create,headings});
})(globalThis);

