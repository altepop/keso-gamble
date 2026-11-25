// Team participation and metrics use authenticated requests only. No cache,
// owner identifiers or private practice records are ever saved on the device.
(function(root){
 'use strict';
 const el=(tag,text,attrs={})=>{const node=document.createElement(tag);
  if(text!==undefined)node.textContent=text;
  for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);
  return node;
 };
 function create({request}){
  const element=el('section',undefined,{'data-coach-team':'',class:'coach-sharing'});
  const panel=el('details',undefined,{class:'coach-disclosure','data-team-panel':''});
  panel.append(el('summary','チームとの共有を設定・確認します'));
  const body=el('div',undefined,{class:'detail-body'});
  panel.append(body);element.append(panel);
  let epoch=0,active=false,settings=null,pending=false;
  const info=el('p','共有は初期OFFです。本人の許可がある範囲だけ表示します。',{role:'status','aria-live':'polite'});
  const metricHost=el('div',undefined,{'data-team-metrics-view':''});
  const form=el('form',undefined,{'data-team-consent-form':''});
  const input=(name,label)=>{const l=el('label'),c=el('input',undefined,{type:'checkbox',name});
   l.append(c,document.createTextNode(label));form.append(l);return c;};
  const joined=input('joined','このチームに参加します（初期OFF）');
  const status=input('shareStatus','自分のステータス共有を許可します（初期OFF）');
  const metrics=input('shareMetrics','自分のチーム指標への集計参加を許可します（初期OFF）');
  form.append(el('p','指標共有は、同じパーティだと確認できた試合のチーム集計に限ります。個人のメモ・実施記録や対戦相手は共有しません。'));
  const save=el('button','同意設定を保存します',{type:'submit'});
  form.append(save);
  const load=el('button','自分の同意設定を読み込みます',{type:'button','data-team-load':''});
  const view=el('button','許可済みのパーティ指標を確認します',{type:'button','data-team-metrics-load':''});
  const roster=el('button','共有に同意したメンバーを確認します',{type:'button','data-team-roster-load':''});
  const names=el('div',undefined,{'data-team-roster-view':''});

  // The team PDCA card is intentionally loaded only after a member clicks it.
  // Never automatically turn a personal practice record into a team status.
  const pdca=el('details',undefined,{class:'coach-disclosure','data-team-pdca':''});
  pdca.append(el('summary','チームの共有課題と本人申告を確認します'));
  const pdcaBody=el('div',undefined,{class:'detail-body'});
  const pdcaLoad=el('button','共有課題を読み込みます',{type:'button','data-team-pdca-load':''});
  const pdcaStatus=el('p','課題はまだ読み込んでいません。',{role:'status','aria-live':'polite'});
  const taskCard=el('div',undefined,{'data-team-task':''});
  const peers=el('div',undefined,{'data-team-participants':''});
  const history=el('div',undefined,{'data-team-task-history':''});
  const taskForm=el('form',undefined,{'data-team-task-form':''});
  const makeField=(form,tag,name,label,limit)=>{const wrap=el('label',label),input=el(tag,undefined,{name});
   if(limit)input.maxLength=limit;
   wrap.append(input);form.append(wrap);return input;};
  const category=makeField(taskForm,'select','teamCategory','チームで確認する課題の分類');
  for(const c of ['連携','序盤','トレード','守り','リテイク','攻め','その他'])category.append(el('option',c,{value:c}));
  const taskTitle=makeField(taskForm,'input','teamTitle','共有課題の名前（50文字まで）',50);
  const taskAction=makeField(taskForm,'textarea','teamAction','次の試合で試す行動（120文字まで）',120);
  const taskMeasure=makeField(taskForm,'textarea','teamMeasure','試したか確認する方法（120文字まで）',120);
  const taskEnd=makeField(taskForm,'input','teamPeriodEnd','確認の期限');taskEnd.type='date';
  const taskActive=makeField(taskForm,'input','teamActive','現在の課題を有効にします');taskActive.type='checkbox';taskActive.checked=true;
  const reason=makeField(taskForm,'input','teamReason','課題を変更する理由（120文字まで）',120);
  taskForm.append(el('p','作成した本人だけが、この共有課題を変更できます。過去の課題は履歴に残します。'));
  const saveTask=el('button','共有課題を保存します',{type:'submit'});taskForm.append(saveTask);
  const selfForm=el('form',undefined,{'data-team-status-form':''});
  const selfState=makeField(selfForm,'select','teamState','本人の取り組み状況');
  for(const v of ['未着手','実施予定','本人が試した','振り返り待ち','本人が確認','不参加'])selfState.append(el('option',v,{value:v}));
  const selfAction=makeField(selfForm,'textarea','teamSelfAction','今回試す行動の短い自己申告（100文字まで）',100);
  selfForm.append(el('p','本人による申告だけを共有します。メモ・実施記録・戦績は共有しません。'));
  const saveSelf=el('button','自分の状態を共有します',{type:'submit'});selfForm.append(saveSelf);
  pdcaBody.append(el('p','チームで一つの課題を試し、各自が本人の操作で進捗を申告します。'),
   pdcaLoad,pdcaStatus,taskCard,peers,taskForm,selfForm,history);
  pdca.append(pdcaBody);
  let pdcaData=null;
  const clearPdca=()=>{pdcaData=null;taskCard.replaceChildren();peers.replaceChildren();history.replaceChildren();
   taskForm.hidden=true;selfForm.hidden=true;pdcaStatus.textContent='課題はまだ読み込んでいません。';};
  const showPdca=data=>{
   clearPdca();pdcaData=data;
   if(!data?.challenge){taskCard.append(el('p','共有課題はまだありません。本人が作成するとチームに表示されます。'));}
   else{
    const c=data.challenge;
    taskCard.append(el('h3',c.title),el('p','分類：'+c.category),el('p','次の行動：'+c.action),
     el('p','確認方法：'+c.measure),el('p','期限：'+c.periodEnd),
     el('p',c.active?'現在取り組む課題です。':'終了した課題です。'));
   }
   if(data?.canEdit){
    taskForm.hidden=false;
    const c=data.challenge;
    category.value=c?.category||'連携';taskTitle.value=c?.title||'';
    taskAction.value=c?.action||'';taskMeasure.value=c?.measure||'';
    taskEnd.value=c?.periodEnd||'';taskActive.checked=c?.active!==false;reason.value='';
   }
   if(data?.challenge?.active&&settings?.joined&&settings.shareStatus){
    selfForm.hidden=false;
    selfState.value=data.self?.state||'未着手';
    selfAction.value=data.self?.action||'';
   }
   for(const m of Array.isArray(data?.shared)?data.shared.slice(0,5):[])
    if(typeof m.displayName==='string'&&typeof m.state==='string'&&typeof m.action==='string')
     peers.append(el('p',m.displayName.slice(0,40)+'：'+m.state.slice(0,30)+'／'+m.action.slice(0,100)));
   if(!peers.children.length)peers.append(el('p','本人が共有を許可した進捗はまだありません。'));
   const revisions=Array.isArray(data?.history)?data.history.slice(0,5):[];
   if(revisions.length)history.append(el('h3','共有課題の変更履歴'));
   for(const r of revisions)history.append(el('p','第'+r.version+'版：'+r.title+'（'+r.reason+'）'));
   pdcaStatus.textContent='同意済みの共有課題と本人申告だけを表示しています。';
  };
  const reloadPdca=async at=>{const data=await request('/api/kp/coach/team/pdca');
   if(at!==epoch)return;showPdca(data);
  };
  pdcaLoad.onclick=()=>void guarded(async at=>{clearPdca();await reloadPdca(at);});
  taskForm.onsubmit=e=>{e.preventDefault();if(!pdcaData?.canEdit)return;
   const b={expectedVersion:pdcaData.challenge?.version||0,category:category.value,title:taskTitle.value,
    action:taskAction.value,measure:taskMeasure.value,periodEnd:taskEnd.value,
    active:taskActive.checked,reason:reason.value};
   clearPdca();void guarded(async at=>{
    await request('/api/kp/coach/team/challenge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
    if(at===epoch)await reloadPdca(at);
   });
  };
  selfForm.onsubmit=e=>{e.preventDefault();if(!pdcaData?.challenge?.active||!settings?.shareStatus)return;
   const b={challengeVersion:pdcaData.challenge.version,expectedVersion:pdcaData.self?.version||0,
    state:selfState.value,action:selfAction.value};
   clearPdca();void guarded(async at=>{
    await request('/api/kp/coach/team/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
    if(at===epoch)await reloadPdca(at);
   });
  };
  body.append(el('p','同意のないメンバーの情報は表示しません。読み込み・保存・集計は操作したときだけ行います。'),
   load,info,form,view,roster,names,metricHost,pdca);
  // Phase 3-E: consent-only UI. This does not send Discord messages.
  const noticePanel=el('details',undefined,{class:'coach-disclosure','data-team-notice':''});
  noticePanel.append(el('summary','Discord通知の同意とプレビューを確認します'));
  const noticeBody=el('div',undefined,{class:'detail-body'});
  const noticeLoad=el('button','通知設定を読み込みます',{type:'button','data-notice-load':''});
  const noticeStatus=el('p','通知は初期OFFです。',{role:'status','aria-live':'polite'});
  const noticePreview=el('p','',{'data-notice-preview':''});
  const noticeForm=el('form',undefined,{'data-notice-form':''});
  const noticeLabel=el('label'),noticeOptin=el('input',undefined,{type:'checkbox',name:'noticeEnabled'});
  noticeLabel.append(noticeOptin,document.createTextNode('チーム課題通知を受け取ることに同意します'));
  noticeForm.append(noticeLabel,el('p','通知には管理者の配信先設定も必要です。現段階では送信されません。'));
  const noticeSave=el('button','通知の同意を保存します',{type:'submit'});
  noticeForm.append(noticeSave);noticeBody.append(
   el('p','個人のメモ・実施記録・戦績は通知に含みません。通知の設定だけを保存します。'),
   noticeLoad,noticeStatus,noticePreview,noticeForm);noticePanel.append(noticeBody);body.append(noticePanel);
  let noticeState=null;
  const hideNotice=()=>{noticeState=null;noticeForm.hidden=true;noticePreview.textContent='';
   noticeStatus.textContent='通知は初期OFFです。';noticeOptin.checked=false;noticeSave.disabled=false;noticeLoad.disabled=false;};
  const showNotice=data=>{noticeState=data.settings;
   noticeForm.hidden=false;noticeOptin.checked=data.settings?.enabled===true;
   const preview=data.preview;
   noticePreview.textContent=preview?.mode==='送信しないプレビュー'&&preview?.includesPersonalNotes===false&&preview?.includesMatchIds===false
    ?preview.message:'プレビューはまだ分かりません。';
   noticeStatus.textContent=data.deliveryReady===true?'配信準備ができています。':'現在、通知は送信されません。';
  };
  noticeLoad.onclick=()=>void guarded(async at=>{
   hideNotice();const data=await request('/api/kp/coach/team/notification');
   if(at!==epoch)return;showNotice(data);
  });
  noticeForm.onsubmit=e=>{e.preventDefault();if(!noticeState)return;
   const expectedVersion=noticeState.version,enabled=noticeOptin.checked;
   hideNotice();void guarded(async at=>{
    const data=await request('/api/kp/coach/team/notification',{method:'POST',
     headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled,expectedVersion})});
    if(at!==epoch)return;showNotice(data);
   });
  };
  const blank=()=>{metricHost.replaceChildren();names.replaceChildren();clearPdca();hideNotice();};
  const sync=()=>{const allowed=active&&settings!==null;
   form.hidden=!allowed;view.hidden=!allowed||!settings.joined||!settings.shareMetrics;
   roster.hidden=!allowed||!settings.joined;
   pdca.hidden=!allowed||!settings.joined;
    noticePanel.hidden=!allowed||!settings.joined;
   if(!allowed)return;
   joined.checked=Boolean(settings.joined);status.checked=Boolean(settings.shareStatus);metrics.checked=Boolean(settings.shareMetrics);
  };
  const enable=()=>{save.disabled=load.disabled=view.disabled=roster.disabled=pdcaLoad.disabled=saveTask.disabled=saveSelf.disabled=noticeLoad.disabled=noticeSave.disabled=false;};
  const clear=()=>{epoch++;active=false;pending=false;enable();settings=null;blank();info.textContent='';
   joined.checked=false;status.checked=false;metrics.checked=false;panel.open=false;sync();};
  const invalidate=()=>{if(!active)return;epoch++;pending=false;enable();settings=null;blank();
   info.textContent='共有状態が変わった可能性があります。最新の同意を読み直してください。';sync();};
  const setActive=()=>{active=true;settings=null;pending=false;enable();blank();
   info.textContent='初期設定は共有OFFです。同意設定を読み込んでから変更してください。';sync();};
  async function guarded(fn){if(!active||pending)return;pending=true;const at=epoch;
   save.disabled=load.disabled=view.disabled=roster.disabled=pdcaLoad.disabled=saveTask.disabled=saveSelf.disabled=noticeLoad.disabled=noticeSave.disabled=true;
   try{await fn(at);}catch(e){if(at===epoch){blank();info.textContent=e?.message||'読み込みに失敗しました。';}}
   finally{if(at===epoch){pending=false;save.disabled=load.disabled=view.disabled=roster.disabled=pdcaLoad.disabled=saveTask.disabled=saveSelf.disabled=noticeLoad.disabled=noticeSave.disabled=false;}}
  }
  load.onclick=()=>void guarded(async at=>{
   blank();const data=await request('/api/kp/coach/team/consent');
   if(at!==epoch)return;
   settings=data?.settings??null;sync();
   info.textContent=settings?'最新の同意設定を読み込みました。':'まだ分かりません';
  });
  form.onsubmit=e=>{e.preventDefault();if(!settings)return;
   const values={expectedVersion:settings.version,joined:joined.checked,
    shareStatus:joined.checked&&status.checked,shareMetrics:joined.checked&&metrics.checked};
   // Immediately hide stale team analytics, including while the update is pending.
   blank();void guarded(async at=>{
    const data=await request('/api/kp/coach/team/consent',{method:'POST',
     headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});
    if(at!==epoch)return;settings=data.settings;sync();
    info.textContent='本人の同意設定を更新しました。必要な指標は新しく読み込んでください。';
   });
  };
  view.onclick=()=>void guarded(async at=>{
   blank();
   const data=await request('/api/kp/coach/team/metrics');
   if(at!==epoch||!settings?.joined||!settings.shareMetrics)return;
   const {renderVerifiedPartyMetrics}=await import('./team-metrics-view.js');
   if(at!==epoch||!settings?.joined||!settings.shareMetrics)return;
   renderVerifiedPartyMetrics(metricHost,data);
   info.textContent='共有に同意したメンバーだけから計算した結果です。別画面で同意が変わった場合は読み直してください。';
  });
  roster.onclick=()=>void guarded(async at=>{
   blank();const data=await request('/api/kp/coach/team/roster');
   if(at!==epoch||!settings?.joined)return;
   for(const member of Array.isArray(data.members)?data.members.slice(0,5):[]){
    if(typeof member.displayName!=='string'||typeof member.status!=='string')continue;
    names.append(el('p',member.displayName.slice(0,40)+'：'+member.status.slice(0,60)));
   }
   info.textContent='ステータス共有を許可した人だけが対象です。';
  });
  sync();
  return {element,setActive,clear,invalidate};
 }
 root.KesoCoachTeam=Object.freeze({create});
})(globalThis);
