// Explicit owner-only reads. These observations never certify a practice or a causal effect.
(function(root){
 'use strict';
 const metrics={kd:'K/D',kpr:'KPR',dpr:'DPR',acs:'ACS',adr:'ADR',hs:'HS%'};
 const headings=Object.freeze({main:'本人の試合と数値を確認します',self:'本人が残した記録です',observed:'試合から確認できた数値です',next:'次の試合で確認します'});
 const el=(tag,text,attrs={})=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
 const time=v=>new Date(v).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',hour12:false});
 const value=n=>n===null?'未取得':Number(n).toFixed(2);
 function create({copyText=t=>t,onReview=()=>{}}={}){
  const fingerprints=new Map(),drafts=new Map(),mounted=new Map();
  function mount({host,record,kind='record',form,save,request,isCurrent}){
   const fold=el('details',undefined,{class:'coach-disclosure','data-practice-review':record.id});fold.append(el('summary',headings.main));const body=el('div',undefined,{class:'detail-body'}),status=el('p','',{role:'status','aria-live':'polite'});fold.append(body);host.append(fold);body.append(status);
   const selectorHost=el('div'),reviewHost=el('div',undefined,{'data-observation-result':''});
   let reading=false,selection=null,linkForm=null;
   const alive=()=>isCurrent()&&host.isConnected;
   const readButton=el('button','本人の試合を選びます',{type:'button','data-match-load':''});
   async function loadMatches(cursor){
    if(reading||!alive())return;reading=true;readButton.disabled=true;status.textContent='保存済みの本人のコンペを確認しています。';
    try{const out=await request('/api/kp/coach/practice/matches?record='+record.id+'&kind='+kind+(cursor?'&cursor='+encodeURIComponent(cursor):''));if(!alive())return;
     showMatches(out,cursor);
    }catch(e){if(alive())status.textContent=e.message;}finally{if(alive()){reading=false;readButton.disabled=false;}}
   }
   function showMatches(out,cursor){
     if(!cursor){selectorHost.replaceChildren();linkForm=form('link:'+kind+':'+record.id);linkForm.dataset.matchForm=record.id;
      const label=el('label','この試合で試したという本人の記録'),select=el('select',undefined,{name:'matchRef','data-match-choice':''});select.append(el('option','関連付けを外します',{value:''}));label.append(select);linkForm.append(label);selection={select,items:[],version:out.recordVersion};
      if(out.linked)selection.items.push(out.linked);
      if(kind==='record'){
       for(const [name,labelText,initial] of [['primaryMetric','主指標',record.primaryMetric||'dpr'],['support1','補助指標1（任意）',record.supportingMetrics?.[0]||''],['support2','補助指標2（任意）',record.supportingMetrics?.[1]||'']]){const wrap=el('label',labelText),n=el('select',undefined,{name});if(name!=='primaryMetric')n.append(el('option','使いません',{value:''}));for(const [k,v] of Object.entries(metrics))n.append(el('option',v,{value:k}));n.value=initial;wrap.append(n);linkForm.append(wrap);}
      }
      linkForm.__save=()=>{
       const selected=selection.items.find(x=>x.matchRef===select.value),payload={id:record.id,kind,expectedVersion:selection.version,matchRef:select.value||null,endedAt:selected?.endedAt??null};
       if(kind==='record'){payload.primaryMetric=linkForm.elements.primaryMetric.value;payload.supportingMetrics=['support1','support2'].map(k=>linkForm.elements[k].value).filter(Boolean);}
       return save(linkForm,'/api/kp/coach/practice/match',payload);
      };
      linkForm.onsubmit=e=>{e.preventDefault();void linkForm.__save();};linkForm.append(el('button',kind==='note'?'この試合をメモに関連付けます':'試合と指標の設定を保存します',{type:'submit','data-match-save':''}));selectorHost.append(linkForm);
     }
     selection.items.push(...out.items.filter(m=>!selection.items.some(x=>x.matchRef===m.matchRef)));
     const selected=cursor?selection.select.value:out.linked?.matchRef||'';selection.select.replaceChildren(el('option','関連付けを外します',{value:''}));
     for(const m of selection.items)selection.select.append(el('option',time(m.endedAt)+'／'+m.map+'／'+m.agent+'／'+({win:'勝利',loss:'敗北',draw:'引分',unknown:'勝敗未取得'}[m.outcome]),{value:m.matchRef}));selection.select.value=selected;
     selectorHost.querySelector('[data-match-more]')?.remove();if(out.nextCursor){const more=el('button','前の試合候補を確認します',{type:'button','data-match-more':''});more.onclick=()=>void loadMatches(out.nextCursor);selectorHost.append(more);}
     status.textContent='本人の試合候補を確認しました。関連付けは本人の申告であり、行動を実施した証明ではありません。';
     if(out.excluded)selectorHost.append(el('p',out.excluded+'件は、ロスターから本人1アカウントの参加を確認できないため除外しました。'));
   }
   const cacheKey='link:'+kind+':'+record.id;
   mounted.set(cacheKey,()=>alive()&&linkForm?.dataset.dirty==='true'?{items:selection.items,linked:selection.items.find(x=>x.matchRef===selection.select.value)||null,recordVersion:record.version,excluded:0,nextCursor:null}:null);
   if(drafts.has(cacheKey))showMatches({...drafts.get(cacheKey),recordVersion:record.version});
   readButton.onclick=()=>{if(linkForm?.dataset.dirty==='true'){status.textContent='先に試合の選択を保存してください。入力は残しています。';return;}void loadMatches();};body.append(el('p','試合の関連付けと、前後比較に使う試合の選定は別です。良い試合だけを選んで比較することはできません。'),readButton,selectorHost);
   if(kind!=='record')return;
   const review=el('button','前後の数値を確認します',{type:'button','data-review-load':''});
   review.onclick=async()=>{
    if(reading||!alive())return;reading=true;review.disabled=true;status.textContent='本人の記録と、保存済み試合の数値を確認しています。';
    try{const previous=fingerprints.get(record.id),r=await request('/api/kp/coach/practice/review?record='+record.id+(previous?'&previous='+previous:''));if(!alive())return;fingerprints.set(record.id,r.evaluationVersion);renderReview(reviewHost,r);onReview(record.id,r);status.textContent=r.revisedComparedWithPrevious?'記録または試合データの更新を検出し、観察結果を再計算しました。':'現在保存されているデータで観察結果を確認しました。';}
    catch(e){if(alive())status.textContent=e.message;}finally{if(alive()){reading=false;review.disabled=false;}}
   };body.append(review,reviewHost);
  }
  function renderReview(host,r){
   host.replaceChildren();host.append(el('h3',headings.self),el('p',({done:'実施しました',partial:'一部試しました',skipped:'今回は試していません',unknown:'覚えていません'}[r.selfReport.execution?.report]||'実施申告は未記録です。')));
   if(r.selfReport.reflection)host.append(el('blockquote',r.selfReport.reflection));host.append(el('p','上記は本人の申告です。練習や行動の実施を自動で検証したものではありません。'));
   host.append(el('h3',headings.observed),el('p','確認時刻：'+time(r.evaluatedAt)+'。評価ルール：'+r.ruleVersion+'。'));
   if(r.linked){host.append(el('p','本人が関連付けた試合：'+time(r.linked.match.endedAt)+'／'+r.linked.match.map+'／'+r.linked.match.agent+'。'));renderMetrics(host,r.linked.metrics);}
   if(r.linkedUnavailable)host.append(el('p','以前関連付けた試合は、現在の本人対応から確認できません。数値を表示していません。'));
   if(r.backfilled)host.append(el('p','後から登録した記録です。実施前の起点がないため、自動の前後比較は行いません。'));
   if(r.observation){const o=r.observation;host.append(el('p','予定保存時刻：'+time(r.anchor)+'。この終了時刻の前後30日以内で、最大10試合ずつを観察しています。'));
    for(const c of o.comparisons){const card=el('section',undefined,{'data-review-metric':c.key});card.append(el('h4',metrics[c.key]+'：'+(c.state==='provisional'?'暫定の傾向です':'観察中です')));
     const table=el('table'),caption=el('caption','同じ定義の指標を前後で比較します。'),head=el('tr');for(const h of ['期間','値','有効数','分子／分母'])head.append(el('th',h,{scope:'col'}));table.append(caption,head);
     for(const [label,v] of [['起点より前',c.before],['起点以降',c.after]]){const tr=el('tr');for(const cell of [label,value(v.value),v.valid+'/'+v.total,v.numerator+'／'+v.denominator])tr.append(el('td',cell));table.append(tr);}card.append(table,el('p','数値の差：'+value(c.difference)+'。練習による効果とは断定しません。'));host.append(card);
    }
    const detail=el('details',undefined,{class:'coach-disclosure'});detail.append(el('summary','分母・除外理由・条件の違いを確認します'));const inner=el('div',undefined,{class:'detail-body'});detail.append(inner);
    for(const [name,s] of [['起点より前',o.before],['起点以降',o.after]]){inner.append(el('h4',name),el('p','対象'+s.candidateMatches+'試合のうち、ロスターが有効な試合は'+s.validRosters+'件です。'));
     if(s.period)inner.append(el('p','対象期間：'+time(s.period.firstEndedAt)+'〜'+time(s.period.lastEndedAt)+'。'));
     for(const [k,m] of Object.entries(s.metrics))inner.append(el('p',metrics[k]+'：除外'+m.excluded+'件です。取得時点：'+(m.coverage.recordedAt?time(m.coverage.recordedAt.oldest)+'〜'+time(m.coverage.recordedAt.newest):'未取得')+'。欠損や分母0を、指標の値0とは扱いません。'),el('pre',JSON.stringify({exclusionReasons:m.exclusionReasons,rosterExclusions:m.rosterExclusions,missingFields:m.missingFields,source:m.source,missingTimestamps:m.coverage.missingTimestamps},null,2)));
     for(const [key,label] of [['maps','マップ'],['agents','エージェント'],['roles','ロール'],['acts','ACT'],['parties','パーティー'],['compositions','構成']])inner.append(el('p',label+'：'+(s.conditions[key].map(x=>x.value+' '+x.matches+'件').join('／')||'未取得')+'。'));
    }
    inner.append(el('p','同時期に保存された別の練習予定は'+r.otherPlannedRecords+'件です。実際に同時に実施したかは未確認です。'));
    for(const g of o.sameMapAgent){inner.append(el('h4',g.map+'／'+g.agent));for(const key of Object.keys(g.before.metrics)){const a=g.before.metrics[key],b=g.after.metrics[key];inner.append(el('p',metrics[key]+'：前'+value(a.value)+'（'+a.valid+'試合）→後'+value(b.value)+'（'+b.valid+'試合）です。'));}}
    host.append(detail);
   }
   host.append(el('h3',headings.next),el('p',r.nextStep.explanation));for(const item of r.selfReport.items)host.append(el('p','保存した確認方法（'+(item.source==='personal'?'本人の選択':'提案された練習')+'）'),el('blockquote',item.source==='catalogue'?copyText(item.check.replace(/か。?$/,'かを確認してください。')):item.check,item.source==='catalogue'?{'data-catalogue-check':''}:{}));
   const caveats=el('details',undefined,{class:'coach-disclosure'});caveats.append(el('summary','数値から分からないことを確認します'));for(const t of r.limitations)caveats.append(el('p',t));host.append(caveats);
  }
  function renderMetrics(host,ms){for(const [k,m] of Object.entries(ms))host.append(el('p',metrics[k]+'：'+value(m.value)+'（分子'+m.numerator+'／分母'+m.denominator+'、有効'+m.valid+'試合）です。'));}
  return {mount,capture(skip){drafts.clear();for(const [key,get] of mounted){const d=get();if(d&&key!==skip)drafts.set(key,d);}mounted.clear();},clear(){fingerprints.clear();drafts.clear();mounted.clear();}};
 }
 root.KesoCoachPracticeReview=Object.freeze({create,headings});
})(globalThis);
