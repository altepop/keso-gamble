/* KESO COACH Muse full UI (completed prototype, 2026-11-22) bound to the
   existing read-only member report. This adapter never fetches, never saves
   and never invents a value: anything the report does not contain is shown
   as 未取得 (not fetched) or サンプル不足 (insufficient sample).
   Turning-point detection reads the report's round-sequence metrics, which
   the server computes from the archived per-round kill / economy / ability /
   plant records, plus the MMR snapshot for rank. Criteria the records cannot
   support stay 未取得, and the weapon pickup judgement stays labelled as an
   inference, never a fact. */
(function(root){
'use strict';
let timerIds=[];
const stop=()=>{for(const id of timerIds)clearInterval(id);timerIds=[];};
const NA='未取得';
const known=v=>typeof v==='number'&&Number.isFinite(v);
const fmtInt=v=>known(v)?Math.round(v).toLocaleString('ja-JP'):NA;
const fmtNum=(v,d=1)=>known(v)?v.toFixed(d):NA;
const fmtPct=(v,d=1)=>known(v)?v.toFixed(d)+'%':NA;
const MAP_JA=Object.freeze({Summit:'サミット',Abyss:'アビス',Bind:'バインド',Corrode:'コロード',Haven:'ヘイヴン',Lotus:'ロータス',Sunset:'サンセット',Ascent:'アセント',Icebox:'アイスボックス',Breeze:'ブリーズ',Fracture:'フラクチャー',Pearl:'パール',Split:'スプリット'});
const mapJa=name=>MAP_JA[name]||name||NA;
const todayJst=()=>new Date(Date.now()+9*3600*1000).toISOString().slice(0,10);

function ownOf(report){
 const list=Array.isArray(report?.individual)?report.individual:[];
 return list.find(x=>x.player===report?.profile)||list[0]||null;
}
function overallOf(report){return report?.performance?.overall||null;}
function mapRecord(report,map){
 const row=(Array.isArray(report?.performance?.maps)?report.performance.maps:[]).find(x=>x.value===map);
 if(!row||!known(row.matches)||row.matches<=0)return null;
 const wins=known(row.wins)?row.wins:null;
 const losses=known(row.losses)?row.losses:(known(row.knownOutcomes)&&known(wins)?row.knownOutcomes-wins:null);
 return {matches:row.matches,wins,losses,winPct:row.winPct,acs:row.acs};
}
function sampleChip(matches){
 if(!known(matches)||matches<=0)return ['na',NA];
 if(matches<5)return ['few','サンプル少なめ・評価対象'];
 return ['ok','評価対象'];
}

const refText=(refs,max=3)=>{
 const list=(Array.isArray(refs)?refs:[]).filter(x=>x&&x.map!=null&&known(x.round));
 if(!list.length)return '';
 const shown=list.slice(0,max).map(x=>mapJa(String(x.map))+' 第'+fmtInt(x.round)+'ラウンド');
 return '該当は '+shown.join('、')+(list.length>max?' ほか '+fmtInt(list.length-max)+' 件':'')+' です';};

/* Turning-point criteria (7). The server computes round sequences from the
   archived records (report.roundSequence); when that block is absent the
   criteria fall back to what the older aggregates can honestly support. */
function turningPoints(report){
 const own=ownOf(report),rc=report?.roundContext||null;
 const seq=report?.roundSequence&&known(report.roundSequence.matches)&&report.roundSequence.matches>0?report.roundSequence:null;
 const items=[];
 if(seq&&known(seq.advantage?.rounds)){
  const adv=seq.advantage;
  if(adv.rounds<=0)items.push({id:'advantage',label:'人数有利を守れなかったラウンド（5v4、特に5v3／5v2から負け）',status:'none',
   detail:'集計できた試合では、人数有利を作ったラウンドがありませんでした'});
  else if(known(adv.losses)&&adv.losses>0)items.push({id:'advantage',label:'人数有利を守れなかったラウンド（5v4、特に5v3／5v2から負け）',status:'detected',
   detail:'人数有利を作った '+fmtInt(adv.rounds)+' ラウンドのうち、落としたのは '+fmtInt(adv.losses)+' 件です（勝ちに変えた割合は '+fmtPct(adv.conversionPct)+' です）。'+refText(adv.lossRefs)});
  else items.push({id:'advantage',label:'人数有利を守れなかったラウンド（5v4、特に5v3／5v2から負け）',status:'none',
   detail:'人数有利を作った '+fmtInt(adv.rounds)+' ラウンドは、すべて勝ち切っています'});
 }else items.push({id:'advantage',label:'人数有利を守れなかったラウンド（5v4、特に5v3／5v2から負け）',status:'unknown',
  detail:'ラウンド単位の人数推移は、この集計には含まれていません。人数有利を作った後に落としたラウンドは、データが届き次第ここで検出します'});
 const bands=Array.isArray(rc?.bands)?rc.bands:[];
 const eco=bands.find(b=>b.key==='under1000');
 if(eco&&known(eco.knownOutcomes)&&eco.knownOutcomes>0){
  const w=known(eco.wins)?eco.wins:0,l=eco.knownOutcomes-w;
  items.push({id:'economy',label:'エコ負け・フォース失敗からの連鎖',status:l>0?'detected':'none',
   detail:'購入1,000未満のラウンド（集計）は '+w+' 勝 '+l+' 敗です。連鎖の起点になったラウンドの特定は未取得です'});
 }else items.push({id:'economy',label:'エコ負け・フォース失敗からの連鎖',status:'unknown',detail:'経済バンドの集計が届いていません'});
 if(seq&&known(seq.snowball?.candidates)){
  if(seq.snowball.candidates>0)items.push({id:'weapon',label:'落とした武器が起点になった雪崩',status:'estimated',
   detail:'高額な装備を落とし、相手の勢いの起点になった可能性がある場面が '+fmtInt(seq.snowball.candidates)+' 件あります。'+refText(seq.snowball.refs)+'。武器の拾得そのものは記録に残らないため、これは推定です'});
  else items.push({id:'weapon',label:'落とした武器が起点になった雪崩',status:'none',
   detail:'推定の範囲では、雪崩の起点になった候補は見つかりませんでした。武器の拾得そのものは記録に残らないため、断定はしません'});
 }else items.push({id:'weapon',label:'落とした武器が起点になった雪崩',status:'unknown',
  detail:'武器の拾得そのものは記録に残らないため、候補の断定はしません。その後のキル武器や所持品の変化からの推定が必要な基準です'});
 if(seq&&known(seq.postPlant?.plants)){
  const pp=seq.postPlant;
  if(pp.plants<=0)items.push({id:'postplant',label:'設置後に落としたラウンド',status:'none',
   detail:'集計できた試合では、設置まで進んだラウンドがありませんでした'});
  else if(known(pp.losses)&&pp.losses>0)items.push({id:'postplant',label:'設置後に落としたラウンド',status:'detected',
   detail:'設置まで進んだ '+fmtInt(pp.plants)+' ラウンドのうち、落としたのは '+fmtInt(pp.losses)+' 件です。'+refText(pp.lossRefs)});
  else items.push({id:'postplant',label:'設置後に落としたラウンド',status:'none',
   detail:'設置まで進んだ '+fmtInt(pp.plants)+' ラウンドは、すべて勝ち切っています'});
 }else{
  const plant=rc?.spike?.plant;
  if(plant&&known(plant.events)&&plant.events>0)items.push({id:'postplant',label:'設置後に落としたラウンド',status:'unknown',
   detail:'設置イベントは '+fmtInt(plant.events)+' 件ありますが、設置したラウンドの勝敗は集計に含まれていません'});
  else items.push({id:'postplant',label:'設置後に落としたラウンド',status:'unknown',detail:'設置イベントの集計が届いていません'});
 }
 if(seq&&known(seq.ult?.matches)){
  const ult2=seq.ult;
  if(ult2.matches<=0)items.push({id:'ult',label:'ウルトを使って落としたラウンド',status:'unknown',
   detail:'ウルトを使ったラウンドを判定できる記録が届いていません'});
  else if(!known(ult2.rounds)||ult2.rounds<=0)items.push({id:'ult',label:'ウルトを使って落としたラウンド',status:'none',
   detail:'ウルトを使ったラウンドは、集計できた試合にはありませんでした'});
  else if(known(ult2.losses)&&ult2.losses>0)items.push({id:'ult',label:'ウルトを使って落としたラウンド',status:'detected',
   detail:'ウルトを使った '+fmtInt(ult2.rounds)+' ラウンドのうち、落としたのは '+fmtInt(ult2.losses)+' 件です。'+refText(ult2.lossRefs)});
  else items.push({id:'ult',label:'ウルトを使って落としたラウンド',status:'none',
   detail:'ウルトを使った '+fmtInt(ult2.rounds)+' ラウンドは、すべて勝ち切っています'});
 }else{
  const ult=rc?.abilities?.ultimate;
  if(ult&&known(ult.casts)&&ult.casts>0)items.push({id:'ult',label:'ウルトを使って落としたラウンド',status:'unknown',
   detail:'ウルトの使用は '+fmtInt(ult.casts)+' 回ありますが、使用したラウンドの勝敗は集計に含まれていません'});
  else items.push({id:'ult',label:'ウルトを使って落としたラウンド',status:'unknown',detail:'ウルト使用の集計が届いていません'});
 }
 const pistols=rc?.pistols;
 const flip=seq?.pistolFlip&&known(seq.pistolFlip.pairs)&&seq.pistolFlip.pairs>0?seq.pistolFlip:null;
 if(pistols&&known(pistols.knownOutcomes)&&pistols.knownOutcomes>0){
  const w=known(pistols.wins)?pistols.wins:0,l=pistols.knownOutcomes-w;
  items.push({id:'pistol',label:'ピストルと3ラウンド目の反転',status:(w>0&&l>0)||(flip&&known(flip.against)&&flip.against>0)?'detected':'none',
   detail:'ピストルラウンド（集計）は '+w+' 勝 '+l+' 敗です'+(flip?'。第3ラウンドで流れが反転したのは '+fmtInt(flip.flips)+' 件で、ピストルを取ったのに第3ラウンドを落としたのは '+fmtInt(flip.against)+' 件です':'。3ラウンド目の反転そのものは、ラウンドの並びが必要なため未取得です')});
 }else items.push({id:'pistol',label:'ピストルと3ラウンド目の反転',status:'unknown',detail:'ピストルラウンドの集計が届いていません'});
 if(own&&known(own.firstKillWins)&&known(own.firstKillLosses)&&(own.firstKillWins+own.firstKillLosses)>0){
  const l=own.firstKillLosses;
  const fbRefs=seq?refText(seq.firstBlood?.lostRefs):'';
  items.push({id:'firstblood',label:'ファーストブラッドを取って落としたラウンド',status:l>0?'detected':'none',
   detail:'本人がファーストブラッドを取って落としたラウンドは '+fmtInt(l)+' 件です（集計）。'+(fbRefs||'該当ラウンドの番号は未取得です')});
 }else items.push({id:'firstblood',label:'ファーストブラッドを取って落としたラウンド',status:'unknown',detail:'開幕キルの集計が届いていません'});
 return items;
}

function model(report,options={}){
 const o=overallOf(report)||{};
 const own=ownOf(report);
 const diag=(Array.isArray(report?.fullDiagnosis?.items)?report.fullDiagnosis.items:[])
  .filter(x=>!x.subject||x.subject===report?.profile);
 const brief=x=>({title:String(x.title||''),evidence:String(x.evidence||''),reason:String(x.reason||''),nextAction:String(x.nextAction||'')});
 const weak=diag.filter(x=>['focus','mixed','context'].includes(x.status)).slice(0,4).map(brief);
 const strong=diag.filter(x=>x.status==='good').slice(0,4).map(brief);
 const trend=Array.isArray(report?.matchTrend)?report.matchTrend:[];
 const latest=trend[0]||null;
 const timeline=Array.isArray(report?.performance?.timeline)?report.performance.timeline:[];
 const latestDetail=latest?timeline.find(t=>t.map===latest.map&&t.agent===latest.agent&&(!latest.outcome||t.outcome===latest.outcome))||null:null;
 const planItem=options.plan?.selected?.[0]||null;
 const planTotal=known(options.plan?.totalMinutes)?options.plan.totalMinutes:(planItem&&known(planItem.minutes)?planItem.minutes:null);
 let today=null,study=null;
 const top=root.KesoCoachMuseTop,presets=options.presets||root.KesoCoachMusePresets?.PRESETS||{};
 if(top&&presets){
  today=top.chooseToday({date:options.date||todayJst(),
   agents:(Array.isArray(report?.performance?.agents)?report.performance.agents:[]).map(a=>a.value).filter(Boolean),presets});
 }
 if(today&&today.study){
  const rec=mapRecord(report,today.map);
  study={map:today.map,mapJa:mapJa(today.map),theme:today.study.theme,points:today.study.points,
   sources:today.study.sources,drill:today.warmup,
   reason:rec?('本人の記録では'+mapJa(today.map)+'は '+fmtInt(rec.matches)+' 試合で '+(known(rec.wins)?fmtInt(rec.wins):NA)+' 勝 '+(known(rec.losses)?fmtInt(rec.losses):NA)+' 敗です。この記録をもとに選んでいます')
    :'コンペプール全体を順に回す巡回で選んでいます。マップは絞りません'};
 }
 const accounts=(Array.isArray(report?.individual)?report.individual:[]).map(p=>({
  player:String(p.player||''),matches:known(p.matches)?p.matches:null,
  kd:(known(p.totalKills)&&known(p.totalDeaths)&&p.totalDeaths>0)?p.totalKills/p.totalDeaths:null,
  wins:known(p.matchWins)?p.matchWins:null,losses:known(p.matchLosses)?p.matchLosses:null,
  firstKills:known(p.firstKills)?p.firstKills:null,firstDeaths:known(p.firstDeaths)?p.firstDeaths:null}));
 const maps=(top?top.MAPS:['Haven','Lotus','Bind','Sunset','Abyss','Corrode','Summit']).map(name=>{
  const rec=mapRecord(report,name);
  return {name,ja:mapJa(name),rec};});
 const agents=(Array.isArray(report?.performance?.agents)?report.performance.agents:[])
  .filter(a=>known(a.matches)&&a.matches>0).slice(0,6).map(a=>({
   name:String(a.value||''),matches:a.matches,wins:known(a.wins)?a.wins:null,
   winPct:known(a.winPct)?a.winPct:null,kd:known(a.kd)?a.kd:null,acs:known(a.acs)?a.acs:null}));
 const tp=turningPoints(report);
 const detected=tp.filter(x=>x.status==='detected');
 const estimated=tp.filter(x=>x.status==='estimated');
 const seq=report?.roundSequence&&known(report.roundSequence.matches)?report.roundSequence:null;
 const mmrList=Array.isArray(report?.mmr?.accounts)?report.mmr.accounts:[];
 const mmrByRiot=new Map(mmrList.map(a=>[String(a?.riotId||''),a]));
 const identityAccounts=Array.isArray(report?.accounts)?report.accounts:[];
 // Never borrow another member's MMR when the authenticated report lists accounts.
 const rankEntry=identityAccounts.length
  ?identityAccounts.map(id=>mmrByRiot.get(String(id))).find(a=>a&&a.tierPatched)||null
  :mmrList.length===1&&mmrList[0]?.tierPatched?mmrList[0]:null;
 const rank=rankEntry?{current:String(rankEntry.tierPatched).toUpperCase()+(known(rankEntry.rankingInTier)?' · '+fmtInt(rankEntry.rankingInTier)+' RR':''),
  peak:rankEntry.peakPatched?String(rankEntry.peakPatched).toUpperCase():null,
  change:known(rankEntry.mmrChange)?rankEntry.mmrChange:null}:null;
 return {
  person:String(report?.person||''),profile:String(report?.profile||report?.person||''),
  accountNames:Array.isArray(report?.accounts)?report.accounts.map(String):[],
  matches:known(o.matches)?o.matches:null,
  stats:{acs:known(o.acs)?o.acs:null,adr:known(o.adr)?o.adr:null,kd:known(o.kd)?o.kd:null,
   winPct:known(o.winPct)?o.winPct:null,hsPct:known(o.hsPct)?o.hsPct:null,
   wins:known(o.wins)?o.wins:null,knownOutcomes:known(o.knownOutcomes)?o.knownOutcomes:null,
   kast:seq&&seq.kast&&known(seq.kast.pct)&&known(seq.kast.rounds)&&seq.kast.rounds>0?seq.kast.pct:null},
  rank,seqMatches:seq?seq.matches:null,
  seqLatest:seq?.latest?{tradeDeaths:known(seq.latest.tradeDeaths)?seq.latest.tradeDeaths:null,
   tradeTraded:known(seq.latest.tradeTraded)?seq.latest.tradeTraded:null,tradePct:known(seq.latest.tradePct)?seq.latest.tradePct:null,
   advRounds:known(seq.latest.advRounds)?seq.latest.advRounds:null,advWins:known(seq.latest.advWins)?seq.latest.advWins:null,
   advPct:known(seq.latest.advPct)?seq.latest.advPct:null}:null,
  seqPostPlant:seq?.postPlant?{plants:known(seq.postPlant.plants)?seq.postPlant.plants:null,
   losses:known(seq.postPlant.losses)?seq.postPlant.losses:null,lossRefs:Array.isArray(seq.postPlant.lossRefs)?seq.postPlant.lossRefs:[]}:null,
  weak,strong,accounts,maps,agents,
  latest:latest?{date:String(latest.date||''),map:String(latest.map||''),agent:String(latest.agent||''),
   outcome:String(latest.outcome||''),kills:known(latest.kills)?latest.kills:null,
   deaths:known(latest.deaths)?latest.deaths:null,assists:known(latest.assists)?latest.assists:null,
   acs:latestDetail&&known(latestDetail.acs)?latestDetail.acs:null}:null,
  own:own?{firstKills:known(own.firstKills)?own.firstKills:null,firstDeaths:known(own.firstDeaths)?own.firstDeaths:null,
   firstKillWins:known(own.firstKillWins)?own.firstKillWins:null,firstKillLosses:known(own.firstKillLosses)?own.firstKillLosses:null,
   traded:known(own.firstDeathKillerEliminatedWithin5s)?own.firstDeathKillerEliminatedWithin5s:null}:null,
  turningPoints:tp,topTurning:detected[0]||estimated[0]||null,
  plan:planItem?{id:String(planItem.id||''),title:String(planItem.title||''),minutes:known(planItem.minutes)?planItem.minutes:null,
   totalMinutes:planTotal,action:String(planItem.action||''),check:String(planItem.check||''),
   reasons:Array.isArray(planItem.reasons)?planItem.reasons.map(String):[]}:null,
  study};
}

/* ---------- DOM rendering (template clone + text binding only) ---------- */
function el(doc,tag,cls,text){const n=doc.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
function render(host,report,ctx={}){
 stop();
 const doc=host.ownerDocument||document;
 const m=model(report,{plan:ctx.plan,presets:ctx.presets,date:ctx.date});
 host.classList.add('muse-ui');host.dataset.museUi='';
 const tpl=doc.getElementById('coach-muse-template');
 if(!tpl)return m;
 const wrapEl=doc.createElement('div');wrapEl.className='mu-wrap';
 wrapEl.appendChild(tpl.content.cloneNode(true));host.appendChild(wrapEl);
 const $=s=>host.querySelector(s),all=s=>[...host.querySelectorAll(s)];
 const set=(key,value)=>{const n=host.querySelector('[data-mb="'+key+'"]');if(n)n.textContent=value;};
 const setAll=(key,value)=>all('[data-mb="'+key+'"]').forEach(n=>n.textContent=value);
 /* member bar + hero */
 set('memberName',m.person||NA);
 set('memberNote',m.accountNames.length>1?m.accountNames.length+'アカウント合算':'表示中のメンバー');
 set('person',m.person||NA);
 set('personSub',m.profile&&m.profile!==m.person?m.profile:'');
 set('ids',m.accountNames.length?m.accountNames.join(' ／ ')+(m.matches!=null?' ・ 合算 '+fmtInt(m.matches)+' 試合で確認しています':' ・ 合算の記録を確認しています'):'登録アカウントを確認しています');
 set('combined',m.matches!=null?fmtInt(m.matches)+' MATCHES · WR '+fmtPct(m.stats.winPct):NA);
 set('rankCurrent',m.rank?m.rank.current:NA);
 set('rankPeak',m.rank&&m.rank.peak?m.rank.peak:NA);
 set('flowMatches',m.matches!=null?fmtInt(m.matches)+'試合を合算':'合算データを確認');
 /* weak / strong from the diagnosis, never from sample claims */
 const fillDiag=(key,items,emptyText)=>{
  const box=host.querySelector('[data-mb-list="'+key+'"]');if(!box)return;
  if(!items.length){box.appendChild(el(doc,'li',null,emptyText));return;}
  for(const x of items){const li=el(doc,'li');const b=el(doc,'b',null,x.title);li.appendChild(b);
   const parts=[x.evidence,x.reason].filter(Boolean).join('。');if(parts)li.appendChild(doc.createTextNode('。'+parts+(parts.endsWith('。')?'':'。')));
   box.appendChild(li);}};
 fillDiag('weak',m.weak,'判定できる材料がまだ揃っていません。試合の記録が増えると、ここに根拠と一緒に表示されます');
 fillDiag('strong',m.strong,'良い傾向と判断するための比較データが、まだ不足しています。無いという意味ではありません');
 /* today's warmup (existing practice plan) */
 const copy=ctx.copy;
 const warmTitle=m.plan?('本日のアップ —「'+m.plan.title+'」'):'本日のアップ — 未設定';
 setAll('warmTitle',warmTitle);
 const warmWhy=m.plan?(m.plan.reasons[0]||'本人の記録から選んだ、今日の優先課題です'):'練習の条件がまだ決まっていません。下の欄から条件を選ぶと、今日のアップが用意されます';
 setAll('warmWhy',warmWhy);
 const fillSteps=(key,steps)=>{const box=host.querySelector('[data-mb-list="'+key+'"]');if(!box)return;
  for(const s of steps){const li=el(doc,'li');li.appendChild(el(doc,'b',null,s[0]));if(s[1])li.appendChild(doc.createTextNode(s[1]));box.appendChild(li);}};
 const warmSteps=m.plan&&copy?[['手順：',copy.steps(copy.action(m.plan.action)).join(' ')],['確認：',m.plan.check]]:(m.study?.drill?.steps||[]).map(s=>['',s]);
 fillSteps('warmSteps',warmSteps);fillSteps('warmSteps2',warmSteps);
 const warmMinutes=m.plan?(m.plan.totalMinutes??m.plan.minutes):(m.study?.drill?.durationMinutes??null);
 all('.mu-timerbox').forEach(box=>{const sec=known(warmMinutes)?warmMinutes*60:1200;box.dataset.seconds=String(sec);
  const clock=box.querySelector('.mu-clock');if(clock)clock.textContent=String(Math.floor(sec/60)).padStart(2,'0')+':00';});
 /* today's study (verified presets, rotating over the full pool) */
 if(m.study){
  setAll('studyMapLabel','Knowledge · '+m.study.map);
  setAll('studyTitle','本日の座学 —「'+m.study.theme+'」'+m.study.mapJa);
  setAll('studyWhy','なぜこのテーマか：'+m.study.reason);
  setAll('studyArea','対象エリア：'+m.study.mapJa+'。'+m.study.theme+'を確認します。覚えるのは、このテーマ1件だけです');
  const fillPoints=(key)=>{const box=host.querySelector('[data-mb-list="'+key+'"]');if(!box)return;
   for(const p of m.study.points){const li=el(doc,'li');li.appendChild(el(doc,'b',null,p));box.appendChild(li);}};
  fillPoints('studyPoints');fillPoints('studyPoints2');
  const fillSources=(key)=>{const box=host.querySelector('[data-mb-list="'+key+'"]');if(!box)return;
   for(const s of m.study.sources){const li=el(doc,'li');const a=el(doc,'a',null,s.title);
    a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';li.appendChild(a);box.appendChild(li);}};
  fillSources('studySources');fillSources('studySources2');
  fillSteps('drillSteps',(m.study.drill?.steps||[]).map(s=>['',s]));
 }else{
  setAll('studyTitle','本日の座学 — 未設定');
  setAll('studyWhy','座学のプリセットがまだ登録されていません。未設定の間は、テーマを作って出すことはしません');
 }
 set('leadToday',m.plan||m.study?'今日やることは 2つだけ です。本日のアップ1件と、本日の座学1件。どちらも本人のデータから選んでいます。それ以外は、今日はやりません':'今日の2件は、データが揃い次第ここに表示されます');
 /* rotation panels */
 const mapBox=host.querySelector('[data-mb-list="mapRows"]');
 if(mapBox)for(const row of m.maps){const wrap=el(doc,'div','mu-maprow');
  const body=el(doc,'div');const p=el(doc,'p');
  const b=el(doc,'b',null,row.ja+' — ');p.appendChild(b);
  p.appendChild(doc.createTextNode(row.rec?('対象 '+fmtInt(row.rec.matches)+' 試合'+(known(row.rec.wins)?'、'+fmtInt(row.rec.wins)+' 勝 '+(known(row.rec.losses)?fmtInt(row.rec.losses):NA)+' 敗':'')+'です。数字は本人の保存済み戦績から計算しています'):'この画面で断定できる試合数には達していません。傾向として扱い、断定はしません'));
  body.appendChild(p);wrap.appendChild(body);mapBox.appendChild(wrap);}
 const agentBox=host.querySelector('[data-mb-list="agentRows"]');
 if(agentBox){if(!m.agents.length)agentBox.appendChild(el(doc,'li',null,'エージェント別の集計はまだ届いていません'));
  for(const a of m.agents){const li=el(doc,'li');li.appendChild(el(doc,'b',null,a.name+'：'));
   li.appendChild(doc.createTextNode(fmtInt(a.matches)+' 試合'+(known(a.winPct)?'、勝率 '+fmtPct(a.winPct):'')+(known(a.acs)?'、ACS '+fmtNum(a.acs):'')+' です'));agentBox.appendChild(li);}}
 /* report view */
 if(m.latest){
  set('fDate',m.latest.date||NA);set('fMap',m.latest.map||NA);
  set('fScore',m.latest.outcome==='win'?'勝利':m.latest.outcome==='loss'?'敗北':m.latest.outcome==='draw'?'引き分け':NA);
  set('fAgent',m.latest.agent||NA);set('fAcs',fmtNum(m.latest.acs));
  set('fKd',(known(m.latest.kills)&&known(m.latest.deaths))?fmtInt(m.latest.kills)+' / '+fmtInt(m.latest.deaths):NA);
  set('fTrade',m.seqLatest&&known(m.seqLatest.tradePct)?fmtPct(m.seqLatest.tradePct)+'（デス '+fmtInt(m.seqLatest.tradeDeaths)+' 件中 '+fmtInt(m.seqLatest.tradeTraded)+' 件）':NA);
  set('fAdv',m.seqLatest&&known(m.seqLatest.advPct)?fmtPct(m.seqLatest.advPct)+'（有利 '+fmtInt(m.seqLatest.advRounds)+' ラウンド中 '+fmtInt(m.seqLatest.advWins)+' 勝）':NA);
  set('repConcl',m.seqMatches!=null&&m.seqMatches>0
   ?'結論：対象は直近の完了試合（'+(m.latest.date||NA)+'、'+(m.latest.map||NA)+'）です。分かれ目の判定には、保存済みのラウンド記録から計算した人数推移とキル順序も使っています'
   :'結論：対象は直近の完了試合（'+(m.latest.date||NA)+'、'+(m.latest.map||NA)+'）です。ラウンド単位の項目は未取得のため、読みは合算'+(m.matches!=null?fmtInt(m.matches):'')+'試合の傾向と並べて行います');
 }else set('repConcl','結論：評価できる直近の試合は未取得です。記録が届き次第、ここに表示されます');
 if(m.topTurning){set('tpTitle','ここを1度見てください — '+m.topTurning.label);
  set('tpDetail',m.topTurning.detail+(m.topTurning.detail.includes('該当は')?'。録画でその場面をご確認ください':'。該当ラウンドの番号は未取得ですので、上の優先順を目印に録画から探してください'));}
 const critBox=host.querySelector('[data-mb-list="criteria"]');
 if(critBox)for(const c of m.turningPoints){const row=el(doc,'div','mu-brow');
  row.appendChild(el(doc,'div','mu-bn',c.id==='advantage'?'人数有利':c.id==='economy'?'経済の連鎖':c.id==='weapon'?'武器の雪崩':c.id==='postplant'?'設置後':c.id==='ult'?'ウルト投資':c.id==='pistol'?'序盤の反転':'FB'));
  const bd=el(doc,'div','mu-bd');bd.appendChild(el(doc,'b',null,c.label+'。'));bd.appendChild(doc.createTextNode(c.detail+'。この試合での検出：'));
  bd.appendChild(el(doc,'b',null,c.status==='detected'?'検出あり':c.status==='estimated'?'推定で検出':c.status==='none'?'該当なし':NA));row.appendChild(bd);
  row.appendChild(el(doc,'span','mu-chipst '+(c.status==='detected'||c.status==='estimated'?'few':c.status==='none'?'ok':'na'),c.status==='detected'?'検出あり':c.status==='estimated'?'推定':c.status==='none'?'該当なし':NA));
  critBox.appendChild(row);}
 const prioBox=host.querySelector('[data-mb-list="priority"]');
 if(prioBox){
  const tradedText=m.own&&known(m.own.firstDeaths)?('本人のデス '+fmtInt(m.own.firstDeaths)+' 件のうち、5秒以内に味方が返せたのは '+(known(m.own.traded)?fmtInt(m.own.traded):NA)+' 件です（集計）。該当ラウンドは未取得です'):'開幕デスの集計が届いていません';
  const postPlantText=m.seqPostPlant&&known(m.seqPostPlant.plants)
   ?(m.seqPostPlant.plants>0?('設置まで進んだ '+fmtInt(m.seqPostPlant.plants)+' ラウンドのうち、落としたのは '+fmtInt(m.seqPostPlant.losses)+' 件です。'+refText(m.seqPostPlant.lossRefs)):'集計できた試合では、設置まで進んだラウンドがありませんでした')
   :'設置後の勝敗は集計に含まれていないため、この試合での該当は未取得です';
  const rows=[
   ['優先 1','トレード','トレードされなかったデスがあったラウンド。'+tradedText,'最優先'],
   ['優先 2','設置後','設置したのに落としたラウンド。'+postPlantText,'優先'],
   ['優先 3','ユーティリティ','ユーティリティを残して死んだラウンド。使用回数の集計はありますが、残して死んだ場面の特定は未取得です','優先']];
  for(const [n,k,t,chip] of rows){const row=el(doc,'div','mu-brow');const bn=el(doc,'div','mu-bn',n);bn.appendChild(el(doc,'br'));bn.appendChild(el(doc,'span',null,k));row.appendChild(bn);
   const bd=el(doc,'div','mu-bd',t);row.appendChild(bd);row.appendChild(el(doc,'span','mu-chipst few',chip));prioBox.appendChild(row);}}
 const causeBox=host.querySelector('[data-mb-list="cause"]');
 if(causeBox){if(!m.weak.length)causeBox.appendChild(el(doc,'li',null,'合算データで繰り返し出ている傾向は、まだ判定できていません'));
  for(const x of m.weak){const li=el(doc,'li');li.appendChild(el(doc,'b',null,x.title+'：'));li.appendChild(doc.createTextNode([x.evidence,x.nextAction].filter(Boolean).join('。')));causeBox.appendChild(li);}}
 /* data view */
 set('dataMatches',m.matches!=null?fmtInt(m.matches)+'試合':'未取得');
 set('stAcs',m.stats.acs!=null?'≈'+fmtNum(m.stats.acs,0):NA);
 set('stAdr',m.stats.adr!=null?'≈'+fmtNum(m.stats.adr,0):NA);
 set('stKd',m.stats.kd!=null?'≈'+fmtNum(m.stats.kd,2):NA);
 set('stWr',fmtPct(m.stats.winPct));
 set('stHs',fmtPct(m.stats.hsPct));
 set('stKast',fmtPct(m.stats.kast));
 set('stRank',m.rank?m.rank.current:NA);
 set('stPeak',m.rank&&m.rank.peak?m.rank.peak:NA);
 set('stMatches',fmtInt(m.matches));
 const accBox=host.querySelector('[data-mb-list="accountRows"]');
 if(accBox){if(!m.accounts.length)accBox.appendChild(el(doc,'p',null,'アカウント別の集計はまだ届いていません'));
  for(const a of m.accounts){const row=el(doc,'div','mu-brow');row.appendChild(el(doc,'div','mu-bn',a.player));
   const bd=el(doc,'div','mu-bd');bd.appendChild(doc.createTextNode('対象 '+fmtInt(a.matches)+' 試合、K/D '+(a.kd!=null?fmtNum(a.kd,2):NA)+'、ファーストキル '+fmtInt(a.firstKills)+'、ファーストデス '+fmtInt(a.firstDeaths)+' です'));
   row.appendChild(bd);const [cls,label]=sampleChip(a.matches);row.appendChild(el(doc,'span','mu-chipst '+cls,label));accBox.appendChild(row);}}
 const dmBox=host.querySelector('[data-mb-list="dataMapRows"]');
 if(dmBox)for(const row of m.maps){const r=el(doc,'div','mu-brow');r.appendChild(el(doc,'div','mu-bn',row.ja));
  const bd=el(doc,'div','mu-bd');bd.appendChild(doc.createTextNode(row.rec?('対象 '+fmtInt(row.rec.matches)+' 試合'+(known(row.rec.wins)?'、'+fmtInt(row.rec.wins)+' 勝 '+(known(row.rec.losses)?fmtInt(row.rec.losses):NA)+' 敗':'')+(known(row.rec.winPct)?'、勝率 '+fmtPct(row.rec.winPct):'')+' です'):'この画面で断定できる試合数には達していません。傾向として扱い、断定はしません'));
  r.appendChild(bd);const [cls,label]=row.rec?sampleChip(row.rec.matches):['na','サンプル不足'];r.appendChild(el(doc,'span','mu-chipst '+cls,label));dmBox.appendChild(r);}
 const daBox=host.querySelector('[data-mb-list="dataAgentRows"]');
 if(daBox){if(!m.agents.length)daBox.appendChild(el(doc,'p',null,'エージェント別の集計はまだ届いていません'));
  for(const a of m.agents){const r=el(doc,'div','mu-brow');r.appendChild(el(doc,'div','mu-bn',a.name));
   const bd=el(doc,'div','mu-bd');bd.appendChild(doc.createTextNode(fmtInt(a.matches)+' 試合'+(known(a.winPct)?'、勝率 '+fmtPct(a.winPct):'')+(known(a.kd)?'、K/D '+fmtNum(a.kd,2):'')+(known(a.acs)?'、ACS '+fmtNum(a.acs):'')+' です'));
   r.appendChild(bd);const [cls,label]=sampleChip(a.matches);r.appendChild(el(doc,'span','mu-chipst '+cls,label));daBox.appendChild(r);}}
 /* team + settings */
 set('teamSelf',(m.person||NA)+' ／ ACS '+(m.stats.acs!=null?fmtNum(m.stats.acs,0):NA)+' ／ 勝率 '+fmtPct(m.stats.winPct)+'（'+(m.matches!=null?fmtInt(m.matches):NA)+'試合）');
 const asBox=host.querySelector('[data-mb-list="accountSettings"]');
 if(asBox){if(!m.accountNames.length)asBox.appendChild(el(doc,'p',null,'連携済みのアカウントは未取得です'));
  for(const name of m.accountNames){const row=el(doc,'div','mu-srow');const st=el(doc,'div','mu-st');
   st.appendChild(el(doc,'b',null,name));st.appendChild(el(doc,'span',null,'戦績の取得元です'));row.appendChild(st);
   const right=el(doc,'div');right.appendChild(el(doc,'div','mu-swstat on','連携済み'));row.appendChild(right);asBox.appendChild(row);}}
 /* interactions: view switching, goto, open-details, tabs, timers, buttons */
 const views=all('.mu-view');
 const show=name=>{views.forEach(v=>v.classList.toggle('mu-open',v.id==='mu-view-'+name));
  all('.mu-snav button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.view===name)));
  host.scrollIntoView({block:'start'});};
 all('.mu-snav button').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));
 all('[data-goto]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.goto)));
 all('[data-open]').forEach(b=>b.addEventListener('click',()=>{const d=host.querySelector('#'+CSS.escape(b.dataset.open));if(d){d.open=true;d.scrollIntoView({block:'nearest'});}}));
 all('.mu-tab').forEach(t=>t.addEventListener('click',()=>{
  all('.mu-tab').forEach(x=>x.setAttribute('aria-selected',String(x===t)));
  all('.mu-panelx').forEach(p=>p.classList.toggle('mu-open',p.id==='mu-panel-'+t.dataset.tab));}));
 const fmt=s=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
 all('.mu-timerbox').forEach(box=>{
  const clock=box.querySelector('.mu-clock'),startBtn=box.querySelector('.mu-tstart'),resetBtn=box.querySelector('.mu-treset');
  let left=parseInt(box.dataset.seconds,10)||1200,id=null;
  const renderClock=()=>{if(clock)clock.textContent=fmt(left);};renderClock();
  const halt=()=>{if(id!=null){clearInterval(id);timerIds=timerIds.filter(x=>x!==id);id=null;}if(startBtn)startBtn.textContent='タイマーを開始する';};
  startBtn?.addEventListener('click',()=>{if(id!=null){halt();return;}
   id=setInterval(()=>{left=Math.max(0,left-1);renderClock();if(left<=0)halt();},1000);timerIds.push(id);
   startBtn.textContent='一時停止する';});
  resetBtn?.addEventListener('click',()=>{halt();left=parseInt(box.dataset.seconds,10)||1200;renderClock();});});
 all('[data-mb-btn]').forEach(b=>{b.dataset.label=b.textContent;});
 /* Today's two done toggles are backed by the member's own practice
    records. The host page judges each item through ctx.onDoneChange and
    hands the recorded state back as ctx.doneState, so the buttons, the
    notes and the home PDCA flow bar all read the same recorded judgement.
    A toggle flips optimistically and rolls back when the record cannot be
    saved: the display never claims a judgement the records do not hold.
    This adapter itself still never fetches and never saves. */
 const doneState={warm:!!ctx.doneState?.warm,study:!!ctx.doneState?.study};
 const doneUi={warm:{btn:host.querySelector('[data-mb-btn="warmDone"]'),msg:host.querySelector('[data-mb="warmMsg"]'),err:host.querySelector('[data-mb="warmErr"]'),onText:'実施済みです'},
  study:{btn:host.querySelector('[data-mb-btn="studyDone"]'),msg:host.querySelector('[data-mb="studyMsg"]'),err:host.querySelector('[data-mb="studyErr"]'),onText:'確認済みです'}};
 const setStep=(step,cls)=>{if(!step)return;step.classList.remove('mu-done','mu-now','mu-todo');step.classList.add(cls);};
 const applyFlow=()=>{
  const count=(doneState.warm?1:0)+(doneState.study?1:0);
  const bar=host.querySelector('[data-mb-flow="pdca"]');
  if(count>=2){
   setStep(host.querySelector('[data-mb-step="today"]'),'mu-done');set('flowTodaySub','2件とも完了');
   setStep(host.querySelector('[data-mb-step="comp"]'),'mu-now');set('flowCompSub','いまここ');
   set('cycleProgress','試合 ✓ → 分析 ✓ → 今日の2件 ✓ → コンペ（いま）→ フィードバック');
   bar?.setAttribute('aria-label','PDCAの流れ：試合、分析、今日の2件は完了。現在はコンペ。次は試合後フィードバック');
  }else if(count===1){
   setStep(host.querySelector('[data-mb-step="today"]'),'mu-now');set('flowTodaySub','残り1件');
   setStep(host.querySelector('[data-mb-step="comp"]'),'mu-todo');set('flowCompSub','2試合で試す');
   set('cycleProgress','試合 ✓ → 分析 ✓ → 今日の2件（残り1件）→ コンペ → フィードバック');
   bar?.setAttribute('aria-label','PDCAの流れ：試合と分析は完了。今日の2件は残り1件。次はコンペ、その後に試合後フィードバック');
  }else{
   setStep(host.querySelector('[data-mb-step="today"]'),'mu-now');set('flowTodaySub','いまここ');
   setStep(host.querySelector('[data-mb-step="comp"]'),'mu-todo');set('flowCompSub','2試合で試す');
   set('cycleProgress','試合 ✓ → 分析 ✓ → 今日の2件（いま）→ コンペ → フィードバック');
   bar?.setAttribute('aria-label','PDCAの流れ：試合と分析は完了。現在は今日の2件。次はコンペ、その後に試合後フィードバック');
  }};
 const applyDone=()=>{
  for(const key of ['warm','study']){const ui=doneUi[key];
   if(ui.btn){ui.btn.setAttribute('aria-pressed',String(doneState[key]));
    ui.btn.textContent=doneState[key]?ui.onText:ui.btn.dataset.label||ui.btn.textContent;}
   if(ui.msg)ui.msg.hidden=!doneState[key];}
  applyFlow();};
 let doneBusy=false;
 for(const key of ['warm','study']){const ui=doneUi[key];
  ui.btn?.addEventListener('click',async()=>{
   if(doneBusy)return;const next=!doneState[key];
   if(typeof ctx.onDoneChange!=='function'){doneState[key]=next;applyDone();return;}
   doneBusy=true;doneState[key]=next;applyDone();if(ui.err)ui.err.hidden=true;
   let ok=false;try{ok=await ctx.onDoneChange(key,next);}catch{ok=false;}
   if(!ok){doneState[key]=!next;applyDone();if(ui.err)ui.err.hidden=false;}
   doneBusy=false;});}
 applyDone();
 const accept=host.querySelector('[data-mb-btn="accept"]');
 accept?.addEventListener('click',async()=>{const on=accept.getAttribute('aria-pressed')==='true';
  if(!on&&typeof ctx.onPlan==='function'){try{await ctx.onPlan();}catch{}}
  accept.setAttribute('aria-pressed',String(!on));const note=host.querySelector('[data-mb="acceptNote"]');if(note)note.hidden=!!on;});
 const copyBtn=host.querySelector('[data-mb-btn="warmCopy"]');
 copyBtn?.addEventListener('click',async()=>{const ta=host.querySelector('[data-mb="warmMemo"]');if(!ta)return;
  try{await navigator.clipboard.writeText(ta.value);copyBtn.textContent='コピーしました';setTimeout(()=>copyBtn.textContent='効果メモをコピーする',2000);}catch{ta.focus();ta.select();}});
 const fb=host.querySelector('[data-mb-btn="fallback"]');
 fb?.addEventListener('click',()=>{show('data');const msg=host.querySelector('[data-mb="fallbackMsg"]');if(msg)msg.hidden=false;});
 const rb=host.querySelector('[data-mb-btn="retry"]');
 rb?.addEventListener('click',()=>{const box=host.querySelector('[data-mb="errDemo"]');if(box)box.textContent='再試行しました。この型では、再試行の結果も同じ場所に表示します';});
 return m;
}
root.KesoCoachMuseView=Object.freeze({model,turningPoints,render,stop});
})(typeof globalThis==='object'?globalThis:this);
