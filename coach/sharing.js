// Public-in-guild summaries only; no private report, token, or disk cache here.
(function(root){
 'use strict';
 const HEADINGS=Object.freeze({settings:'要約を共有する範囲を決めます',browse:'共有された要約を確認します'});
 const LABELS={winRate:'勝率',kd:'K/D',acs:'ACS',adr:'ADR'};
 const node=(tag,text,attrs={})=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e;};
 const number=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
 const text=v=>typeof v==='string'?v:null;
 const date=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;
 function safeSummary(s){return {subjectId:text(s.subjectId),displayName:text(s.displayName),period:{from:date(s.period?.from),to:date(s.period?.to),timezone:'Asia/Tokyo'},matches:{...Object.fromEntries(['analyzed','candidates','excluded','rowLimit'].map(k=>[k,number(s.matches?.[k])])),limitReached:s.matches?.limitReached===true},metrics:Object.fromEntries(Object.keys(LABELS).filter(k=>s.metrics?.[k]).map(k=>[k,{...Object.fromEntries(['value','validMatches','excludedMatches','numerator','denominator'].map(f=>[f,number(s.metrics[k][f])])),formula:text(s.metrics[k].formula)}]))};}
 function create({request,onView,onSelf}){
  const element=node('section',undefined,{class:'coach-sharing','data-coach-sharing':''});let settings=null,epoch=0,ids=[],mode=false,pending=false;
  const status=node('p','',{role:'status','aria-live':'polite'}),results=node('div',undefined,{'data-shared-results':''}),directory=node('div',undefined,{'data-shared-directory':''}),fallback=node('textarea',undefined,{readonly:'',rows:'6','aria-label':'共有要約のコピー','data-summary-fallback':''});fallback.hidden=true;
  const clearResults=()=>{ids=[];results.replaceChildren();fallback.value='';fallback.hidden=true;};
  function clear(){epoch++;settings=null;mode=false;pending=false;clearResults();directory.replaceChildren();status.textContent='';element.replaceChildren();}
  function invalidate(){if(!ids.length&&!directory.children.length)return;epoch++;pending=false;clearResults();directory.replaceChildren();status.textContent='共有状態を確認し直すため、表示を消去しました。一覧を更新してください。';}
  const field=(form,label,input)=>{const wrap=node('label',label);wrap.append(input);form.append(wrap);return input;};
  async function attempt(task){if(pending)return;pending=true;const current=epoch;status.textContent='確認しています。';try{await task(current);}catch(e){if(current===epoch){clearResults();directory.replaceChildren();status.textContent=e.message;}}finally{if(current===epoch)pending=false;}}
  function drawSummaries(rows){results.replaceChildren();for(const raw of rows){const s=safeSummary(raw),card=node('article',undefined,{class:'shared-summary'});card.append(node('h3',s.displayName),node('p',(s.period.from&&s.period.to?s.period.from+'〜'+s.period.to:'対象期間は未取得です。')+'（日本時間）'),node('p','保存済み '+s.matches.candidates+'試合のうち、'+s.matches.analyzed+'試合を分析しています。'),node('p','除外 '+s.matches.excluded+'試合です。対象は直近最大250試合です。'));
    for(const [key,m] of Object.entries(s.metrics)){card.append(node('p',LABELS[key]+'：'+(typeof m.value==='number'?m.value.toFixed(key==='kd'?2:1)+(key==='winRate'?'%':''):'未取得')),node('p','有効 '+m.validMatches+'試合／除外 '+m.excludedMatches+'試合です。'),node('p',m.formula+'（'+m.numerator+' ÷ '+m.denominator+'）'));
    }if(!Object.keys(s.metrics).length)card.append(node('p','この方は対象期間と試合数だけを共有しています。'));card.append(node('p','相手・役割・マップなどの条件は同じではありません。'),node('p','実力順位を示す比較ではありません。'));results.append(card);
   }
  }
  const endpoint=()=>ids.length===1?'/api/kp/coach/summary?subject='+encodeURIComponent(ids[0]):'/api/kp/coach/comparison?subjects='+ids.map(encodeURIComponent).join(',');
  async function fetchSelected(){const payload=await request(endpoint());return ids.length===1?[payload]:payload.summaries;}
  function render(){
   element.replaceChildren();clearResults();directory.replaceChildren();
   if(!settings)return;
   const prefs=node('details',undefined,{class:'coach-disclosure','data-sharing-settings':''});prefs.append(node('summary',HEADINGS.settings));const body=node('div',undefined,{class:'detail-body'});prefs.append(body);element.append(prefs);
   body.append(node('p','詳細な診断と目標は、常に本人だけに表示されます。'),node('p','選んだ要約だけを、同じサーバーのログイン参加者へ共有できます。'),node('p','共有を解除すると、次の取得・比較・コピー要求から表示を拒否します。'),node('p','すでにコピーされた内容や、閲覧済みの画面は回収できません。'));
   const form=node('form',undefined,{'data-sharing-form':''}),name=field(form,'共有時の表示名（40文字まで）',node('input',undefined,{type:'text',name:'displayName',required:''}));name.value=settings.displayName;
   const visibility=field(form,'要約の公開範囲',node('select',undefined,{name:'visibility'}));visibility.append(node('option','本人のみ',{value:'private'}),node('option','選択した要約をサーバー内で共有',{value:'guild-summary'}));visibility.value=settings.visibility;
   const choices=node('fieldset');choices.append(node('legend','共有する項目を選んでください。'));const boxes=[];
   for(const option of settings.options){const input=node('input',undefined,{type:'checkbox',value:option.key,name:'summaryField'});input.checked=option.key==='matches'||settings.fields.includes(option.key);if(option.key==='matches')input.disabled=true;const label=node('label');label.append(input,document.createTextNode(option.label));choices.append(label);boxes.push(input);}form.append(choices,node('p','指標には有効件数・計算式を添えます。対象期間と試合数は必ず共有します。'));
   const save=node('button','公開設定を保存します',{type:'submit'});form.append(save);body.append(form);
   form.onsubmit=e=>{e.preventDefault();if(pending)return;const captured=epoch;pending=true;save.disabled=true;status.textContent='設定を保存しています。';
    request('/api/kp/coach/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({displayName:name.value,visibility:visibility.value,fields:boxes.filter(b=>b.checked).map(b=>b.value),expectedVersion:settings.version})}).then(data=>{if(captured!==epoch)return;settings=data.settings;clearResults();directory.replaceChildren();status.textContent=settings.visibility==='private'?'要約を本人限定にしました。':'選択した要約だけをサーバー内で共有しました。';render();element.querySelector('[data-sharing-settings]').open=true;}).catch(error=>{if(captured!==epoch)return;status.textContent=error.message+' 入力内容は残しています。';if(error.status===409&&!form.querySelector('[data-settings-reload]')){const reload=node('button','入力を破棄して最新の設定を読み直します',{type:'button','data-settings-reload':''});reload.onclick=()=>void attempt(async current=>{const data=await request('/api/kp/coach/settings');if(current!==epoch)return;settings=data.settings;render();element.querySelector('[data-sharing-settings]').open=true;status.textContent='最新の公開設定を読み込みました。';});form.append(reload);}}).finally(()=>{if(captured===epoch){pending=false;save.disabled=false;}});
   };
   const browse=node('details',undefined,{class:'coach-disclosure','data-sharing-browse':''});browse.append(node('summary',HEADINGS.browse));const area=node('div',undefined,{class:'detail-body'});browse.append(area);area.append(node('p','本人が共有を選んだ人物だけを表示します。読み込みはボタンを押したときだけ行います。'));
   const list=node('button','共有一覧を更新します',{type:'button','data-directory-load':''});list.onclick=()=>void attempt(async current=>{clearResults();directory.replaceChildren();const data=await request('/api/kp/coach/directory');if(current!==epoch)return;
    for(const person of data.people){const input=node('input',undefined,{type:'checkbox',name:'sharedSubject',value:person.subjectId}),label=node('label');label.append(input,document.createTextNode(person.displayName));directory.append(label);}
    status.textContent=data.people.length?'最大5人まで選び、要約を開いてください。':'現在、共有されている要約はありません。';
   });
   const open=node('button','選んだ要約を開きます',{type:'button','data-summary-open':''});open.onclick=()=>void attempt(async current=>{const wanted=[...directory.querySelectorAll('input:checked')].map(i=>i.value);if(!wanted.length||wanted.length>5){status.textContent='1〜5人を選んでください。';return;}clearResults();ids=wanted;const rows=await fetchSelected();if(current!==epoch)return;mode=true;prefs.hidden=true;onView();drawSummaries(rows);status.textContent='共有された要約だけを表示しています。詳細な診断や目標は含みません。';});
   const copy=node('button','共有要約だけを確認してコピーします',{type:'button','data-summary-copy':''});copy.onclick=()=>void attempt(async current=>{if(!ids.length){status.textContent='先に共有要約を開いてください。';return;}const rows=await fetchSelected();if(current!==epoch)return;drawSummaries(rows);
    const text=JSON.stringify({format:'KESO_COACH_GUILD_SUMMARY_V1',summaries:rows.map(s=>{const {subjectId,...safe}=safeSummary(s);return safe;})},null,2);
    try{if(!navigator.clipboard?.writeText)throw Error('unavailable');await navigator.clipboard.writeText(text);if(current!==epoch)return;fallback.value='';fallback.hidden=true;status.textContent='現在共有されている要約だけをコピーしました。';}
    catch{if(current!==epoch)return;fallback.value=text;fallback.hidden=false;fallback.focus();fallback.select();status.textContent='共有要約を選択してコピーしてください。';}
   });
   const back=node('button','自分のコーチングに戻ります',{type:'button','data-summary-self':''});back.onclick=onSelf;
   area.append(list,directory,open,copy,back);element.append(browse,status,results,fallback);if(mode)prefs.hidden=true;
  }
  return {element,clear,invalidate,setData(data){settings=data&&Array.isArray(data.options)?structuredClone(data):null;render();}};
 }
 root.KesoCoachSharing=Object.freeze({create,headings:HEADINGS,safeSummary});
})(globalThis);
