// Self-only v6 review loop. Uses the authenticated records controller; no direct fetch or persistence.
(function(root){
 'use strict';
 const el=(tag,text,attrs={})=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
 const outcomes={done:'実施しました',partial:'一部試しました',skipped:'今回は試していません',unknown:'覚えていません'};
 const headings=Object.freeze({main:'前回の記録から次の試合へ進みます'});
 function create({records}){
  const element=el('section',undefined,{'class':'coach-loop','data-coach-loop':'','aria-label':'本人の振り返りと次の一手'});
  let snapshot=null;
  const paragraph=t=>el('p',t);
  function button(label,action,kind){
   const b=el('button',label,{'type':'button',...(kind?{'data-loop-action':kind}:{})});
   b.addEventListener('click',action);return b;
  }
  const open=(id,review=false)=>{void records.openRecord(id,review);};
  function goToPlan(change=false){
   const overview=document.querySelector('#coach-view-overview');
   if(overview){overview.hidden=false;for(const t of document.querySelectorAll('[data-coach-view]'))t.setAttribute('aria-selected',String(t.dataset.coachView==='overview'));}
   const next=change?overview?.querySelector('[data-other-practice]'):overview?.querySelector('.drill');
   if(change&&next)next.open=true;
   next?.scrollIntoView({block:'start',behavior:'auto'});
   (change?next?.querySelector('summary'):overview?.querySelector('#acceptBtn'))?.focus({preventScroll:true});
  }
  function render(){
   element.replaceChildren();
   if(!snapshot)return;
   const h=el('h2',headings.main);element.append(h,paragraph('本人の実施申告と、試合の観察結果を分けて確認します。'));
   const {loaded,active,latest}=snapshot;
   if(!loaded){
    element.append(paragraph(active?'保存済みの予定があります。実施の結果を記録してください。':'前回の実施内容はまだ読み込んでいません。'));
    element.append(button('前回の記録を読み込みます',()=>open(null,false),'load'));
    element.append(paragraph('読み込みは本人の操作時だけ行います。'));
    return;
   }
   if(active){
    element.append(el('h3','今回保存した練習予定です'));
    element.append(paragraph((active.items||[]).map(x=>x.title).filter(Boolean).join('／')||'予定の詳細を記録画面で確認します。'));
    element.append(paragraph('保存済みの予定であり、実施済みとは判定していません。'));
    element.append(button('実施した内容を記録します',()=>open(active.id,false),'record'));
   }
   if(latest){
    element.append(el('h3','前回ご本人が記録した内容です'));
    const title=(latest.items||[]).map(x=>x.title).filter(Boolean).join('／');
    if(title)element.append(paragraph(title));
    element.append(paragraph('実施申告：'+(outcomes[latest.execution?.report]||'まだ分かりません')+'。'));
    if(latest.reflection)element.append(paragraph('本人の振り返り：'+latest.reflection.slice(0,100)+(latest.reflection.length>100?'…':'')));
    const check=latest.items?.find(x=>x.check)?.check;
    if(check)element.append(paragraph('次の試合で確認すること：'+check));
    element.append(paragraph('前後の数字は未確認です。評価する場合は、保存済みの本人の試合を確認します。'));
    element.append(button('前後の数値を確認します',()=>open(latest.id,true),'review'));
    element.append(paragraph('数値が変わっても、練習の効果が証明されたとは扱いません。'));
   }else if(!active){
    element.append(paragraph('実施記録はまだありません。次の試合で試す行動を選んでください。'));
   }
   const actions=el('div',undefined,{'class':'coach-loop-actions'});
   actions.append(button('続けて試す内容を確認します',()=>goToPlan(false),'continue'),button('練習内容を変更します',()=>goToPlan(true),'change'));
   element.append(el('h3','次の一手を決めます'),actions);
  }
  function update(value){snapshot=value;render();}
  function clear(){snapshot=null;element.replaceChildren();}
  return {element,update,clear};
 }
 root.KesoCoachLoop=Object.freeze({create,headings});
})(globalThis);
