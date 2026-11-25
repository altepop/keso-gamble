// Approved Muse v6 DOM and CSS are in coach.html. This adapter only binds existing
// read-only results and the already selected practice plan; it never fetches or saves.
(function(root){
 'use strict';
 let timerId=null;
 const stop=()=>{if(timerId!==null){clearInterval(timerId);timerId=null;}};
 const known=v=>typeof v==='number'&&Number.isFinite(v);
 const number=(v,d=1)=>known(v)?v.toFixed(d):'未取得';
 const art='assets/';
 const p=(doc,text,cls)=>{const el=doc.createElement('p');el.textContent=text;if(cls)el.className=cls;return el;};
 function render(d,{plan,copy,reader,fill}){
  stop();
  const doc=document,host=doc.createElement('div');host.className='prototype-top';host.dataset.prototypeV6='';
  host.appendChild(doc.getElementById('coach-prototype-template').content.cloneNode(true));
  const $=s=>host.querySelector(s),all=s=>[...host.querySelectorAll(s)];
  const text=(selector,value)=>{$(selector).textContent=value;};
  const paragraphs=(el,lines)=>el.replaceChildren(...lines.filter(Boolean).map(t=>p(doc,copy.polite(t))));
  const chosen=plan.selected,first=chosen[0],o=d.performance?.overall||{},change=reader.trend(d),good=reader.verdicts(d).good;
  const total=plan.totalMinutes;
  const accounts=Array.isArray(d.accounts)?d.accounts:[];
  text('.playerline .micro','KESO // Coach Brief');
  text('.playerline .name',d.person);
  paragraphs($('.playerline .ids'),[accounts.join(' ／ ')||'登録アカウントを確認しています。',accounts.length>1?'複数のアカウントを合わせて確認しています。':'選択したアカウントの記録を確認しています。']);
  // The existing response has no verified current/peak rank. Keep the visual slots,
  // never use the prototype's sample ranks or infer a rank from performance.
  all('.rankbox .r').forEach(el=>el.textContent='未取得');
  const intros=[known(o.matches)?'保存済みの'+o.matches+'試合をもとに確認しました。':'保存済みの記録をもとに、次の一戦の準備をお手伝いします。',first?'本日は「'+copy.title(first.title)+'」を中心にご案内します。':'練習の条件を選び直すところから始めましょう。',change.kind==='good'?'前回から改善された点を残し、次の試合でも再現するための練習です。':'すでにできていることも確認しながら、次の試合で試す内容を整理します。',first?total+'分ほどお時間をいただけますと幸いです。':'下の折りたたみから、時間や練習相手の条件を変更できます。'];
  all('.coach-intro').forEach((el,i)=>el.textContent=intros[i]);
  $('.pdca').dataset.pdcaFlow='';
  text('.pdca-head .micro','KESO // Competitive');
  const cycle=all('.pdca > p');cycle[0].textContent='現在保存されている記録から、分析と本日の練習を表示しています。';cycle[1].textContent='本日の練習を実施し、次の試合で試していただく段階です。';
  const stageKeys=['match','result','analysis','task','next'];
  all('.steps li').forEach((li,i)=>{
   li.dataset.pdcaStep=stageKeys[i];li.classList.remove('done','now');li.removeAttribute('aria-current');
   const sq=li.querySelector('.sq');sq.textContent=String(i+1);
   if((i===0&&o.matches>0)||i===2){li.classList.add('done');sq.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5 9.5 18 20 6.5"/></svg>';}
   if(i===3){li.classList.add('now');li.setAttribute('aria-current','step');}
  });
  // Keep the original opening-talk layout. Observed strengths/changes replace the
  // sample claims about crosshair placement and moving while firing (not logged).
  const talk=$('.talk');talk.dataset.improvement='';talk.setAttribute('aria-label','実測データから確認したこと');
  const evidence=talk.querySelector('.evidence');
  const observation=change.kind==='good'?change:good;
  const talkLines=[change.kind==='good'?'前回から改善された点について、先にお伝えします。':'今回の記録で、続けていただきたい点を先にお伝えします。',copy.title(observation.title),observation.text,observation.action||'良かったと感じる一場面を残し、次の試合でも同じ準備を試してください。'];
  paragraphs(talk,talkLines);talk.appendChild(evidence);
  const evs=[['K/D',number(o.kd,2),'キル数をデス数で割った値です。'],['ACS',number(o.acs),'戦闘スコアを有効なラウンド数で割った値です。']];
  [...evidence.children].forEach((el,i)=>{el.querySelector('.v').textContent=evs[i][1];el.querySelector('p').textContent=evs[i][0]+'です。'+evs[i][2];});
  text('.imgband .cap .micro','Official Art // The Range');
  const heads=all('.sec-head');heads[1].querySelector('.micro').textContent=(first?.id||'PLAN')+' // '+total+' min';
  const drill=$('.drill');drill.dataset.primaryMission='';drill.dataset.practiceId=first?.id||'';drill.setAttribute('aria-label','今日の練習');
  text('.drill-head .pid',first?.id||'PLAN');text('.total-badge .n',String(total));
  text('.drill-head h2',first?copy.title(first.title):'今日の練習を選び直してください');
  const drillNotes=all('.drill-head > p');
  drillNotes[0].textContent=first?'目的は、選定された課題を一つずつ試し、次の試合で変化を確かめることです。':'現在の条件に合う候補がありません。下の条件設定をご確認ください。';
  drillNotes[1].textContent='タイマーで各ブロックの時間を合わせ、上から順に取り組んでください。音は鳴りません。';
  const range=chosen.some(e=>/射撃場|ボット/.test(e.action));
  drillNotes[2].textContent=range?'射撃テストはミディアムからハードへ進めます。移動照準はプラクティスでストレイフをONにしてください。':'練習内容は、これまでの記録と選択した条件に合わせています。';
  if(range)drillNotes[2].dataset.diamondDrill='';
  const blockTemplate=$('.block').cloneNode(true),bar=$('.splitbar'),labels=$('.splitlabels');bar.replaceChildren();labels.replaceChildren();
  all('.block').forEach(el=>el.remove());
  const before=$('.nextcheck');
  chosen.forEach((e,i)=>{
   const block=blockTemplate.cloneNode(true);block.dataset.practiceBlock=e.id;
   block.querySelector('.bno').textContent='BLOCK '+(i+1);
   block.querySelector('.btime').textContent=String(e.minutes).padStart(2,'0')+':00 — '+e.id;
   block.querySelector('h3').textContent=copy.title(e.title);
   const actions=copy.steps(copy.action(e.action)).map(t=>fill(t,plan.context));
   const settings=block.querySelectorAll('.setting > div');
   const facts=[['時間',e.minutes+'分'],['練習相手',e.requires==='partner'?'協力者と一緒に取り組みます':'一人で取り組めます'],['使用キャラ',e.agent||'現在の課題では指定していません'],['進め方','下の手順を上から実施してください']];
   settings.forEach((el,j)=>{el.querySelector('.k').textContent=facts[j][0];el.querySelector('.v').textContent=facts[j][1];});
   block.querySelectorAll(':scope > p').forEach(el=>el.remove());
   const list=block.querySelector('.dsteps');list.replaceChildren(...actions.map(t=>{const li=doc.createElement('li');li.textContent=t;return li;}));
   block.querySelector('.rep .rv').textContent=e.minutes+' MIN';
   block.querySelector('.rep p').textContent=copy.polite(fill(e.check,plan.context).replace(/か。?$/,'かを確認します。'));
   drill.insertBefore(block,before);
   const chunk=doc.createElement('div');chunk.className='on';chunk.style.flex=String(e.minutes);chunk.style.opacity=String(1-i*.25);bar.appendChild(chunk);
   const label=doc.createElement('span');label.style.flex=String(e.minutes);label.textContent='BLOCK '+(i+1)+' — '+e.minutes+' MIN';labels.appendChild(label);
  });
  const timerMinutes=first?.minutes||0;
  text('#clock',String(timerMinutes).padStart(2,'0')+':00');
  const timerButtons=$('.tbtns');timerButtons.replaceChildren();
  chosen.forEach((e,i)=>{const b=doc.createElement('button');b.className='tbtn';b.type='button';b.dataset.min=String(e.minutes);b.textContent='ブロック'+(i+1)+'・'+e.minutes+'分';timerButtons.appendChild(b);});
  for(const [id,label,cls] of [['timerBtn','タイマーを開始する','tbtn main'],['timerReset','リセットする','tbtn']]){const b=doc.createElement('button');b.id=id;b.type='button';b.className=cls;b.textContent=label;b.disabled=!first;timerButtons.appendChild(b);}
  $('.timerbox').dataset.initialMinutes=String(timerMinutes);
  const next=$('.nextcheck');
  next.querySelectorAll(':scope > p')[0].textContent='次の試合が終わりましたら、下の点を確認してください。';
  next.querySelectorAll(':scope > p')[1].textContent='映像やご自身のメモで振り返る内容です。記録から確認できる数字は、次回この画面へ戻った時にご覧いただけます。';
  const checkTemplate=next.querySelector('.checks li').cloneNode(true),checks=next.querySelector('.checks');checks.replaceChildren();
  chosen.forEach(e=>{const li=checkTemplate.cloneNode(true);li.lastElementChild.textContent=copy.polite(fill(e.check,plan.context).replace(/か。?$/,'かを確認します。'));checks.appendChild(li);});
  $('#acceptBtn').disabled=!first;
  text('#acceptNote','承知しました。この画面を開いている間の実施予定として表示します。練習の達成や、映像での確認が完了したことを記録する操作ではありません。');
  const subs=$('.subs'),subTemplate=subs.querySelector('.sub-task').cloneNode(true);subs.replaceChildren();
  chosen.slice(1).forEach(e=>{const b=subTemplate.cloneNode(true);b.dataset.task=e.id;b.querySelector('.pid').textContent=e.id;b.querySelector('.a').textContent=copy.title(e.title);b.querySelector('p').textContent=fill(copy.polite(copy.action(e.action)),plan.context);subs.appendChild(b);});
  const totalLine=$('.total-line');totalLine.replaceChildren(doc.createTextNode('本日の分は、すべて合わせて'),Object.assign(doc.createElement('b'),{textContent:total+'分'}),doc.createTextNode('です。補助の練習も上のブロックに含まれています。決めた順番で、一度通していただければ十分です。'));
  heads[2].querySelector('.micro').textContent='Abyss // Summit';
  heads[2].nextElementSibling.textContent='あわせてマップについてもお伝えします。保存済みの記録で確認できる範囲を、マップごとにご案内します。';
  all('.mapcard').forEach((card,i)=>{
   const mapName=i===0?'Abyss':'Summit';const m=d.performance?.maps?.find(m=>m.value===mapName);
   const lines=m?['保存済みの'+m.matches+'試合について確認しました。',known(m.winPct)?'勝率は'+number(m.winPct)+'%です。':'勝敗を確認できた記録が不足しています。',known(m.kd)?'K/Dは'+number(m.kd,2)+'です。':'キルとデスをそろえて確認できる記録が不足しています。','次にこのマップで遊ぶ際は、本日の課題を試せた一場面を残してください。']:['現在の保存範囲では、'+mapName+'の個人成績を確認できません。','記録が増えましたら、この欄で実測値をご確認いただけます。'];
   const body=card.querySelector('.mbody');paragraphs(body,lines);const stat=doc.createElement('span');stat.className='mapstat';stat.textContent=m?'対象 '+m.matches+'試合 ／ '+(m.knownOutcomes??'未取得')+'試合の勝敗を確認しています。':'対象記録を確認できていません。';body.appendChild(stat);
  });
  // Phase 4: this data comes only from the existing authenticated, owner-scoped
  // coach response; never request another person's metrics or fetch by name.
  // Missing and sparse map samples remain explicitly ungraded.
  const coverage=d.performance?.mapPoolCoverage;
  if(Array.isArray(coverage?.pool)&&coverage.pool.length===7){
   const wrap=doc.createElement('section');wrap.className='coach-map-pool-coverage';
   wrap.dataset.mapPoolVersion=String(coverage.version||'未確認');
   wrap.style.cssText='margin:16px 0;padding:16px;background:var(--bg-2);border:1px solid var(--line);';
   const heading=doc.createElement('h3');heading.textContent='現行7マップの本人記録';
   heading.style.cssText='margin:0 0 8px;font-size:19px;';wrap.appendChild(heading);
   wrap.appendChild(p(doc,'保存済みの本人の試合だけを集計しています。未収集・サンプル不足は苦手という判定ではありません。'));
   const list=doc.createElement('ul');list.style.cssText='padding-left:22px;margin:12px 0;';
   coverage.pool.forEach(m=>{
    const li=doc.createElement('li');li.style.cssText='margin:7px 0;';
    const agents=Array.isArray(m.observedAgents)?m.observedAgents
     .filter(a=>typeof a?.agent==='string'&&Number.isSafeInteger(a.matches)&&a.matches>0)
     .map(a=>a.agent+' '+a.matches+'試合'):[];
    const sample=Number.isSafeInteger(m.matches)&&m.matches>=0?m.matches:0;
    li.textContent=String(m.map)+'：'+sample+'試合 ／ '+String(m.status)+'。'+
     (agents.length?'使用実績 '+agents.join('、')+'。':'エージェントの使用実績は未取得です。');
    // Optional map-position evidence is already owner-scoped by the API.
    // Only aggregated counts are used; do not render frames or coordinates.
    const pos=d.mapPositionCoverage?.pool?.find(v=>v?.map===m.map);
    if(pos&&Number.isSafeInteger(pos.verifiedPositionMatches)&&pos.verifiedPositionMatches>=0&&
     Number.isSafeInteger(pos.sampleMatches)&&pos.sampleMatches>=0&&
     pos.verifiedPositionMatches<=pos.sampleMatches&&
     Number.isSafeInteger(pos.knownOwnVictimLocations)&&pos.knownOwnVictimLocations>=0&&
     Number.isSafeInteger(pos.knownOwnKillerLocations)&&pos.knownOwnKillerLocations>=0&&
     Number.isSafeInteger(pos.observedOwnVictimEvents)&&pos.observedOwnVictimEvents>=pos.knownOwnVictimLocations&&
     Number.isSafeInteger(pos.observedOwnKillerEvents)&&pos.observedOwnKillerEvents>=pos.knownOwnKillerLocations){
     const line=doc.createElement('span');line.style.cssText='display:block;color:var(--ink-3);font-size:12px;';
     line.textContent='位置データ：取得試合 '+pos.verifiedPositionMatches+' / '+pos.sampleMatches+
      '、デス時の位置 '+pos.knownOwnVictimLocations+' / '+pos.observedOwnVictimEvents+
      '、キル時の位置 '+pos.knownOwnKillerLocations+' / '+pos.observedOwnKillerEvents+'。';
     li.appendChild(line);
    }
    list.appendChild(li);
   });
   wrap.appendChild(list);
   const historic=Array.isArray(coverage.outsidePool)?coverage.outsidePool:[];
   if(historic.length)wrap.appendChild(p(doc,'現行プール外の保存試合：'+historic.map(m=>String(m.map)+' '+Number(m.matches)+'試合').join('、')+'。過去の記録として区別しています。'));
   if(coverage.unknownMapMatches>0)wrap.appendChild(p(doc,'マップ名不明の試合が'+coverage.unknownMapMatches+'件あります。7マップの成績へ推測で割り当てません。'));
   $('.remember').parentNode.insertBefore(wrap,$('.remember'));
  }
  // Phase 4: only the owner-scoped aggregate from the authenticated report.
  // Do not render provider coordinates, raw frames, match IDs or roster details.
  const position=d.positionCoverage;
  if(position&&Number.isSafeInteger(position.sampleMatches)&&position.sampleMatches>=0&&
   Number.isSafeInteger(position.verifiedPositionMatches)&&position.verifiedPositionMatches>=0&&
   Number.isSafeInteger(position.observedOwnVictimEvents)&&position.observedOwnVictimEvents>=0&&
   Number.isSafeInteger(position.knownOwnVictimLocations)&&position.knownOwnVictimLocations>=0&&
   Number.isSafeInteger(position.observedOwnKillerEvents)&&position.observedOwnKillerEvents>=0&&
   Number.isSafeInteger(position.knownOwnKillerLocations)&&position.knownOwnKillerLocations>=0&&
   position.verifiedPositionMatches<=position.sampleMatches&&
   position.knownOwnVictimLocations<=position.observedOwnVictimEvents&&
   position.knownOwnKillerLocations<=position.observedOwnKillerEvents){
   const wrap=doc.createElement('section');wrap.className='coach-own-position-coverage';
   wrap.style.cssText='margin:16px 0;padding:16px;background:var(--bg-2);border:1px solid var(--line);';
   const h=doc.createElement('h3');h.textContent='立ち位置データの取得状況';
   h.style.cssText='margin:0 0 8px;font-size:19px;';wrap.appendChild(h);
   wrap.appendChild(p(doc,'保存済みの本人の'+position.sampleMatches+'試合中、位置情報を確認できたのは'+position.verifiedPositionMatches+'試合です。'));
   wrap.appendChild(p(doc,'本人が倒された場面：位置取得 '+position.knownOwnVictimLocations+' / 記録 '+position.observedOwnVictimEvents+'件。'));
   wrap.appendChild(p(doc,'本人が敵を倒した場面：位置取得 '+position.knownOwnKillerLocations+' / 記録 '+position.observedOwnKillerEvents+'件。'));
   wrap.appendChild(p(doc,'取得できない位置は0mとして扱いません。この情報だけで孤立・立ち位置・判断の良し悪しは判定できません。'));
   $('.remember').parentNode.insertBefore(wrap,$('.remember'));
  }
  const remember=all('.remember > p');remember[0].textContent=first?copy.polite(fill(first.check,plan.context).replace(/か。?$/,'かを確認してください。')):'次の試合で確認することを、一つ決めておいてください。';remember[1].textContent='結果だけでなく、決めた手順を試せたかも振り返っていただければ十分です。';
  const detail=$('details');detail.dataset.prototypeNumbers='';
  const metrics=[['ACS',o.acs,1],['ADR',o.adr,1],['HS%',o.hsPct,1],['KAST',null,1],['K/D',o.kd,2],['現在のランク',null,0]];
  all('.stat-grid .stat').forEach((el,i)=>{el.querySelector('.v').textContent=number(metrics[i][1],metrics[i][2])+(i===2&&known(metrics[i][1])?'%':'');el.querySelector('.k').textContent=metrics[i][0]+(i===3?' ／ 公式KASTを算出できる記録がそろっていません。':i===5?' ／ この応答にはランク情報がありません。':' ／ 保存済みの本人の記録です。');});
  const sova=d.performance?.agents?.find(a=>a.value==='Sova');
  paragraphs($('.sova p').parentElement,[]);
  const sovaBody=$('.sova div');const label=doc.createElement('span');label.className='micro';label.textContent='Honest note // Sova';sovaBody.appendChild(label);
  sovaBody.appendChild(p(doc,sova?'ソーヴァは'+sova.matches+'試合、ACSは'+number(sova.acs)+'です。担当やマップの違いもありますので、この数字だけで得意不得意は決めません。':'現在の保存範囲では、ソーヴァの個人成績を確認できません。キャラ別の記録は、下の詳細分析でも確認できます。'));
  const notes=$('.notes');notes.replaceChildren();
  const facts=(d.performance?.notes||[]).slice(0,3);
  (facts.length?facts.map(n=>copy.polite(n.evidence)+' '+copy.polite(n.action)):[plan.quality]).forEach(t=>{const li=doc.createElement('li');li.textContent=copy.polite(t);notes.appendChild(li);});
  text('.caveats','数字の出典は、KESO COACHがすでに保存している本人の戦績です。課題は既存の選定結果をそのまま表示しています。立ち位置、照準、走り撃ち、スキルの判断を映像で確認したという意味ではありません。画像はRiot Gamesの公式アートです。');
  // All URLs come from the literal approved template, never from response text.
  all('img').forEach(img=>{if(!img.getAttribute('src').startsWith(art))throw Error('Unexpected artwork path');});
  return host.outerHTML;
 }
 function mount(host,{onPlan}={}){
  stop();
  const box=host.querySelector('.timerbox');if(!box)return;
  let total=Number(box.dataset.initialMinutes)*60,left=total;
  const clock=host.querySelector('#clock'),button=host.querySelector('#timerBtn');
  const fmt=s=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
  const render=()=>{clock.textContent=fmt(left);};
  const pause=()=>{stop();button.textContent='タイマーを開始する';};
  host.querySelectorAll('[data-min]').forEach(b=>b.addEventListener('click',()=>{pause();total=Number(b.dataset.min)*60;left=total;render();}));
  button.addEventListener('click',()=>{if(timerId!==null){pause();return;}button.textContent='一時停止する';timerId=setInterval(()=>{if(left>0){left--;render();}if(left<=0){pause();button.textContent='終了しました。お疲れさまでした';}},1000);});
  host.querySelector('#timerReset').addEventListener('click',()=>{pause();left=total;render();});
  const accept=host.querySelector('#acceptBtn'),note=host.querySelector('#acceptNote');
  accept.addEventListener('click',async()=>{if(onPlan){accept.disabled=true;try{if(await onPlan()){accept.setAttribute('aria-pressed','true');accept.textContent='今回試す内容を保存しました';note.textContent='保存した予定です。実施後に本人の結果を記録してください。';note.hidden=false;}}finally{accept.disabled=false;}return;}const on=accept.getAttribute('aria-pressed')==='true';accept.setAttribute('aria-pressed',String(!on));accept.textContent=!on?'実施を確定しました':'この内容で実施します';note.hidden=on;});
  host.querySelectorAll('.sub-task').forEach(b=>b.addEventListener('click',()=>b.setAttribute('aria-pressed',String(b.getAttribute('aria-pressed')!=='true'))));
  host.querySelector('#swapBtn').addEventListener('click',()=>{const options=host.querySelector('[data-other-practice]');if(options){options.open=true;options.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}});
  render();
 }
 root.KesoCoachPrototype=Object.freeze({render,mount,stop});
})(globalThis);
