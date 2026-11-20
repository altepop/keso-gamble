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
  body.append(el('p','同意のないメンバーの情報は表示しません。読み込み・保存・集計は操作したときだけ行います。'),
   load,info,form,view,roster,names,metricHost);
  const blank=()=>{metricHost.replaceChildren();names.replaceChildren();};
  const sync=()=>{const allowed=active&&settings!==null;
   form.hidden=!allowed;view.hidden=!allowed||!settings.joined||!settings.shareMetrics;
   roster.hidden=!allowed||!settings.joined;
   if(!allowed)return;
   joined.checked=Boolean(settings.joined);status.checked=Boolean(settings.shareStatus);metrics.checked=Boolean(settings.shareMetrics);
  };
  const enable=()=>{save.disabled=load.disabled=view.disabled=roster.disabled=false;};
  const clear=()=>{epoch++;active=false;pending=false;enable();settings=null;blank();info.textContent='';
   joined.checked=false;status.checked=false;metrics.checked=false;panel.open=false;sync();};
  const invalidate=()=>{if(!active)return;epoch++;pending=false;enable();settings=null;blank();
   info.textContent='共有状態が変わった可能性があります。最新の同意を読み直してください。';sync();};
  const setActive=()=>{active=true;settings=null;pending=false;enable();blank();
   info.textContent='初期設定は共有OFFです。同意設定を読み込んでから変更してください。';sync();};
  async function guarded(fn){if(!active||pending)return;pending=true;const at=epoch;
   save.disabled=load.disabled=view.disabled=roster.disabled=true;
   try{await fn(at);}catch(e){if(at===epoch){blank();info.textContent=e?.message||'読み込みに失敗しました。';}}
   finally{if(at===epoch){pending=false;save.disabled=load.disabled=view.disabled=roster.disabled=false;}}
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
