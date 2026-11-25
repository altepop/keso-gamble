// Phase3-E opt-in settings and safe preview. This module never sends to Discord,
// copies private coaching text, or stores any credential or preferences locally.
(function(root){
 'use strict';
 const el=(tag,text,attrs={})=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;
  for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
 function create({request}){
  const element=el('section',undefined,{class:'coach-sharing','data-coach-notifications':''});
  const details=el('details',undefined,{class:'coach-disclosure','data-team-notify-panel':''});
  const body=el('div',undefined,{class:'detail-body'});
  details.append(el('summary','チームのDiscord通知を確認します'),body);element.append(details);
  const note=el('p','初期OFFです。管理者の通知先設定が完了するまで送信されません。',{role:'status','aria-live':'polite'});
  const load=el('button','通知同意を読み込みます',{type:'button','data-notify-load':''});
  const form=el('form',undefined,{'data-notify-form':''});
  const wrap=el('label','自分に関係するチーム通知を許可します（初期OFF）');
  const enabled=el('input',undefined,{type:'checkbox',name:'teamNoticeOptIn'});
  wrap.append(enabled);form.append(wrap);
  const save=el('button','通知の同意を保存します',{type:'submit'});form.append(save);
  const preview=el('div',undefined,{'data-notify-preview':''});
  body.append(el('p','通知を許可しても、自分のメモや試合IDは送信されません。'),
   load,note,form,preview);
  let active=false,pending=false,epoch=0,settings=null;
  const sync=()=>{form.hidden=!(active&&settings);if(settings)enabled.checked=settings.enabled===true;};
  const clear=()=>{epoch++;pending=false;active=false;settings=null;load.disabled=save.disabled=false;
   note.textContent='';preview.replaceChildren();details.open=false;sync();};
  const invalidate=()=>{if(!active)return;epoch++;pending=false;settings=null;load.disabled=save.disabled=false;
   preview.replaceChildren();note.textContent='共有状態を確認し直します。もう一度同意設定を読み込んでください。';sync();};
  const setActive=()=>{active=true;pending=false;settings=null;load.disabled=save.disabled=false;
   preview.replaceChildren();note.textContent='本人の明示操作があるまで通知設定は取得しません。';sync();};
  const draw=data=>{
   settings=data?.settings??null;sync();preview.replaceChildren();
   if(!settings){note.textContent='まだ分かりません';return;}
   const p=data.preview||{};
   if(typeof p.message==='string'&&p.message.length<=200){
    preview.append(el('h3','送信しないプレビュー'),el('p',p.message));
   }
   note.textContent=data.deliveryReady?
    '設定を確認しました。通知先の制御を引き続き確認してください。':
    '同意設定は取得できました。通知の配信はまだ停止中です。';
  };
  async function act(fn){if(!active||pending)return;pending=true;const at=epoch;load.disabled=save.disabled=true;
   try{await fn(at);}catch(e){if(at===epoch){settings=null;sync();preview.replaceChildren();note.textContent=e?.message||'通信に失敗しました。';}}
   finally{if(at===epoch){pending=false;load.disabled=save.disabled=false;}}
  }
  load.onclick=()=>void act(async at=>{const data=await request('/api/kp/coach/team/notification');if(at!==epoch)return;draw(data);});
  form.onsubmit=e=>{e.preventDefault();if(!settings)return;
   const data={enabled:enabled.checked,expectedVersion:settings.version};
   preview.replaceChildren();void act(async at=>{
    const saved=await request('/api/kp/coach/team/notification',{method:'POST',
     headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    if(at!==epoch)return;draw(saved);
   });
  };
  sync();return {element,clear,invalidate,setActive};
 }
 root.KesoCoachNotifications=Object.freeze({create});
})(globalThis);
