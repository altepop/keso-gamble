// Self-only v6 review loop. Uses the authenticated records controller; no direct fetch or persistence.
(function(root){
 'use strict';
 const el=(tag,text,attrs={})=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
 const outcomes={done:'実施しました',partial:'一部試しました',skipped:'今回は試していません',unknown:'覚えていません'};
 const headings=Object.freeze({main:'前回の記録から次の試合へ進みます'});
 function create({records}){
  const element=el('section',undefined,{'class':'coach-loop','data-coach-loop':'','aria-label':'本人の振り返りと次の一手'});
  let snapshot=null,lastObservation=null;
  const metrics={kd:'K/D',kpr:'KPR',dpr:'DPR',acs:'ACS',adr:'ADR',hs:'HS%'};
  const brief=(v,n=36)=>{const a=Array.from(String(v||''));return a.length>n?a.slice(0,n).join('')+'…':a.join('');};
  const fmt=v=>typeof v==='number'&&Number.isFinite(v)?v.toFixed(2):'まだ分かりません';
  const paragraph=t=>el('p',t);
  function button(label,action,kind){
   const b=el('button',label,{'type':'button',...(kind?{'data-loop-action':kind}:{})});
   b.addEventListener('click',action);return b;
  }
  function recordCopyText(record,linkedNotes=[]){
   const items=(Array.isArray(record.items)?record.items:[]).slice(0,3);
   const check=items.find(x=>typeof x?.check==='string')?.check||'未記録';
   const lines=['KESO COACH｜本人専用の実施記録','実施日：'+(record.occurredDate||'まだ分かりません'),
    '練習：'+(items.map(x=>x.title).filter(x=>typeof x==='string').join('／')||'未記録'),
    '本人の実施申告：'+(outcomes[record.execution?.report]||'まだ分かりません'),
    '振り返り：'+(record.reflection||'未記録'),'次の試合で確認：'+check,
    '注：本人の記録です。実施・改善の客観的証明ではありません。'];
   for(const note of linkedNotes.slice(0,20))lines.push('本人の関連メモ：'+note.title+'\n'+note.body);
   return lines.join('\n');
  }
  async function copyRecord(record){
   const includeNotes=element.querySelector('[data-copy-include-notes]')?.checked===true;
   const linkedNotes=includeNotes?(snapshot?.recordNotes||[]):[];
   const content=recordCopyText(record,linkedNotes);
   const old=element.querySelector('[data-private-copy-fallback]');
   old?.remove();
   try{
    if(!navigator.clipboard?.writeText)throw Error('clipboard unavailable');
    await navigator.clipboard.writeText(content);
    element.querySelector('[data-private-copy-status]')?.replaceChildren(document.createTextNode(includeNotes?'本人の実施記録と選択した関連メモをコピーしました。共有用診断は含まれません。':'本人の実施記録をコピーしました。共有用診断や個人メモは含まれません。'));
   }catch{
    const field=el('textarea',undefined,{'data-private-copy-fallback':'','readonly':'','aria-label':'本人の記録を手動でコピー'});
    field.value=content;field.style.width='100%';field.style.minHeight='140px';field.style.fontSize='16px';
    element.append(field);field.focus();field.select();
    element.querySelector('[data-private-copy-status]')?.replaceChildren(document.createTextNode('自動コピーが使えないため、本人の記録を表示しました。必要な場合だけ手動でコピーしてください。'));
   }
  }
  const open=(id,review=false)=>{void records.openRecord(id,review);};
  function goToPlan(change=false){
   const overview=document.querySelector('#coach-view-overview');
   if(overview){
    for(const panel of document.querySelectorAll('.coach-dashboard-view'))panel.hidden=panel!==overview;
    for(const t of document.querySelectorAll('[data-coach-view]')){const selected=t.dataset.coachView==='overview';t.setAttribute('aria-selected',String(selected));t.tabIndex=selected?0:-1;}
   }
   const next=change?overview?.querySelector('[data-other-practice]'):(overview?.querySelector('[data-quick-start]')||overview?.querySelector('.drill'));
   if(change&&next)next.open=true;
   next?.scrollIntoView({block:'start',behavior:'auto'});
   (change?next?.querySelector('summary'):next)?.focus({preventScroll:true});
  }
  function render(){
   element.replaceChildren();
   if(!snapshot)return;
   const h=el('h2',headings.main);element.append(h,paragraph('本人の実施申告と、試合の観察結果を分けて確認します。'));
   const {loaded,active,latest}=snapshot;
   if(!loaded){
    element.append(paragraph(active?'保存済みの予定があります。実施の結果を記録してください。':'前回の実施内容はまだ読み込んでいません。'));
    element.append(button('前回の記録を読み込みます',()=>open(null,false),'load'));
    if(!active)element.append(button('今日の練習へ進みます',()=>goToPlan(false),'continue'));
    element.append(paragraph('読み込みは本人の操作時だけ行います。'));
    return;
   }
   if(active){
    element.append(el('h3','今回保存した練習予定です'));
    element.append(paragraph(brief((active.items||[]).map(x=>x.title).filter(Boolean).join('／'),42)||'予定の詳細を記録画面で確認します。'));
    element.append(paragraph('保存済みの予定であり、実施済みとは判定していません。'));
    element.append(button('実施した内容を記録します',()=>open(active.id,false),'record'));
   }
   if(latest){
    element.append(el('h3','前回ご本人が記録した内容です'));
    const title=(latest.items||[]).map(x=>x.title).filter(Boolean).join('／');
    if(title)element.append(paragraph(brief(title,42)));
    element.append(paragraph('実施申告：'+(outcomes[latest.execution?.report]||'まだ分かりません')+'。'));
    if(latest.reflection)element.append(paragraph('本人の振り返り：'+brief(latest.reflection,36)));
    const check=latest.items?.find(x=>x.check)?.check;
    if(check)element.append(paragraph('次の試合で確認すること：'+brief(check,36)));
    if(lastObservation?.id===latest.id){
     const r=lastObservation.review,c=r.observation?.comparisons?.[0];
     if(c&&c.before?.value!=null&&c.after?.value!=null){
      element.append(paragraph((metrics[c.key]||'選択した指標')+'：前'+fmt(c.before.value)+'（'+c.before.valid+'試合）→後'+fmt(c.after.value)+'（'+c.after.valid+'試合）です。'));
      element.append(paragraph(c.state==='provisional'?'暫定の傾向です。原因は断定できません。':'まだ分かりません。試合数や条件差を確認してください。'));
     }else element.append(paragraph(r.backfilled?'後からの記録は、前後の自動比較の評価範囲外です。':'まだ分かりません。比較に使える数値が不足しています。'));
     if(r.nextStep?.explanation)element.append(paragraph('次の提案：'+brief(r.nextStep.explanation,34)));
    }else element.append(paragraph('前後の数字は未確認です。評価する場合は、保存済みの本人の試合を確認します。'));
    if(snapshot.recordNotes?.length){
     const label=el('label','関連付けた個人メモもコピーに含めます（初期OFF）');
     const check=el('input',undefined,{'type':'checkbox','data-copy-include-notes':'','aria-label':'関連付けた本人の個人メモを含める'});
     check.checked=false;label.prepend(check);element.append(label);
     element.append(paragraph('読み込んだ範囲の関連メモだけを選択時に含めます。'));
    }
    element.append(button('本人の実施記録をコピーします',()=>void copyRecord(latest),'copy'));
    element.append(el('p','',{'role':'status','aria-live':'polite','data-private-copy-status':''}));
    element.append(paragraph('個人メモは初期OFFです。試合ID・共有用の診断はコピーに含めません。'));
    element.append(button('前後の数値を確認します',()=>open(latest.id,true),'review'));
    element.append(paragraph('数値が変わっても、練習の効果が証明されたとは扱いません。'));
   }else if(!active){
    element.append(paragraph('実施記録はまだありません。次の試合で試す行動を選んでください。'));
   }
   const actions=el('div',undefined,{'class':'coach-loop-actions'});
   actions.append(button('続けて試す内容を確認します',()=>goToPlan(false),'continue'),button('練習内容を変更します',()=>goToPlan(true),'change'));
   element.append(el('h3','次の一手を決めます'),actions);
  }
  function update(value){
   if(lastObservation&&(!value?.latest||value.latest.id!==snapshot?.latest?.id||value.latest.version!==snapshot.latest.version))lastObservation=null;
   snapshot=value;render();
  }
  function showObservation(id,review){
   if(snapshot?.latest?.id!==id)return;
   lastObservation={id,review};render();
  }
  function clear(){snapshot=null;lastObservation=null;element.replaceChildren();}
  return {element,update,clear,showObservation};
 }
 root.KesoCoachLoop=Object.freeze({create,headings});
})(globalThis);
