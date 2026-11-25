// Read-only, dated public references. These are sample descriptions, not Riot
// thresholds, a rank estimator or role-matched ability ratings.
(function(root){
 'use strict';
 const asOf='2026-11-19';
 const sources={
  upforge:{name:'UpForge',date:'2026-11-18',urls:{kd:'https://upforge.gg/valorant/stats/kd-ratio',acs:'https://upforge.gg/valorant/stats/average-combat-score'},population:'連携ユーザー427人の直近competitiveスナップショット。ランク別・ロール混合。',limits:'全プレイヤーの代表標本ではなく、集計期間も本人の保存範囲と一致しません。',method:'公開されたプレイヤー単位の中央値・25/75パーセンタイル。'},
  radianite:{name:'RadianiteDB',date:asOf,url:'https://www.radianitedb.lol/stats/ranks',population:'9,740試合・203,802R。サイトで検索されたプレイヤーの試合の全10人。',limits:'高ランクの検索ユーザーに偏り、ランク別の人数・ばらつきは未公開。平均だけから上位割合は出しません。',method:'公開されたランク別平均。HSは命中部位ベース。'},
  vlr:{name:'VLR.gg / Champions 2026',date:asOf,url:'https://www.vlr.gg/event/stats/2766/valorant-champions-2026',population:'2026-09-24〜10-18、80選手中100R以上の60選手。ロール混合。',limits:'プロ同士の大会成績。対戦相手・パッチ・連携・ロールが違うため、同じ数値でもプロ相当の実力とは言えません。',method:'公開の丸め値から選手を同じ重みで集計した線形R7四分位。HS定義は照合未完了のためプロHS評価はしません。'}
 };
 const ranks={
  iron:{label:'Iron',n:22,kd:[.69,.82,.96],acs:[164,185,212],adr:123,hs:13.2},
  bronze:{label:'Bronze',n:62,kd:[.81,.90,1.08],acs:[180,202,224],adr:133,hs:15.4},
  silver:{label:'Silver',n:62,kd:[.81,.94,1.06],acs:[189,205,229],adr:139,hs:18.3},
  gold:{label:'Gold',n:82,kd:[.93,1.04,1.17],acs:[200,216,239],adr:139,hs:20.9},
  platinum:{label:'Platinum',n:82,kd:[.90,1,1.10],acs:[192,212,230],adr:142,hs:23.4},
  diamond:{label:'Diamond',n:59,kd:[.93,.99,1.11],acs:[196,211,226],adr:142,hs:25.7},
  ascendant:{label:'Ascendant',n:46,kd:[.92,1,1.07],acs:[201,214,223],adr:139,hs:28.1},
  immortal:{label:'Immortal',n:12,kd:[1,1.06,1.17],acs:[201,217,244],adr:136,hs:30.1},
  radiant:{label:'Radiant',n:null,kdMean:1.09,acsMean:231,adr:152,hs:31.7}
 };
 const pro={label:'Champions 2026（全ロール参考）',n:60,minRounds:100,kd:[.92,1.01,1.09],acs:[183.75,199.5,210.25],adr:[122.8,130.3,136.5]};
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 const fmt=(x,key)=>finite(x)?x.toFixed(key==='kd'?2:1):'—';
 function compare(performance,reference='pro',scope='all'){
  const source=reference==='pro'?pro:ranks[reference];if(!source)return {reference,rows:[],scope:'未選択'};
  const o=scope==='all'?performance?.overall:performance?.roles?.find(r=>r.value===scope);
  const values={kd:{value:o?.kd,matches:o?.kdMatches},acs:{value:o?.acs,matches:o?.acsMatches},adr:{value:o?.adr,matches:o?.damageMatches},hs:{value:o?.hsPct,matches:o?.hitMatches}};
  const rows=Object.entries(values).map(([key,own])=>{
   const ref=source[key],isRange=Array.isArray(ref),mean=reference==='pro'?null:key==='kd'?source.kdMean:key==='acs'?source.acsMean:ref;
   const sourceId=reference==='pro'?'vlr':isRange?'upforge':'radianite';
   let level='unknown',label='比較値なし',difference=null;
   if(finite(own.value)&&own.matches>0&&(isRange||finite(mean))){
    const sampleSmall=sourceId==='upforge'&&source.n<15;
    if(own.matches<5||sampleSmall){level='provisional';label=own.matches<5?'本人5試合未満・数値だけ参考':'参照標本が15人未満・参考';}
    else if(isRange){level=own.value>ref[2]?'high':own.value<ref[0]?'low':'typical';label={high:'参考分布の上側',low:'参考分布の下側',typical:'参考分布の中央帯'}[level];}
    else{level='mean-only';difference=own.value-mean;label=Math.abs(difference)<1e-9?'公開平均と同じ':'公開平均より'+(difference>0?'+':'')+fmt(difference,key);}
   }
   return {key,label,value:finite(own.value)?own.value:null,matches:own.matches??0,level,range:isRange?{q25:ref[0],median:ref[1],q75:ref[2]}:null,mean:finite(mean)?mean:null,difference,sourceId,referenceN:sourceId==='upforge'||sourceId==='vlr'?source.n:null};
  });
  return {reference,label:source.label,scope:scope==='all'?'本人の保存範囲全体':scope+'の保存済み試合',rows,asOf,roleMatched:false,rankVerified:false,
   rule:'中央帯は公開サンプルの25〜75パーセンタイル内（境界を含む）。5試合未満は仮の数値比較。平均しかない指標に強弱の境界や上位割合は作りません。参照ランクは選択した目標で、本人の実ランクを取得した判定ではありません。'};
 }
 function personal(performance,reference='pro'){
  const p=performance,o=p?.overall;if(!o)return {signature:'記録から比較の出発点を作る',cards:[],focus:null};
  const bench=compare(p,reference),by=Object.fromEntries(bench.rows.map(r=>[r.key,r]));
  const role=(p.roles||[]).slice().sort((a,b)=>b.matches-a.matches)[0];
  const agents=(p.agents||[]).slice().sort((a,b)=>b.matches-a.matches),agent=agents[0];
  const context=(role&&role.value!=='不明'?role.value+'中心':'ロール未確認')+(agent?' / '+agent.value+' '+agent.matches+'試合':'');
  const cards=[];let focus=null;
  const has=k=>finite(by[k]?.value)&&by[k].matches>=5;
  const high=k=>by[k]?.level==='high',low=k=>by[k]?.level==='low';
  const above=k=>high(k)||(by[k]?.level==='mean-only'&&by[k].difference>=0);
  const below=k=>low(k)||(by[k]?.level==='mean-only'&&by[k].difference<0);
  if(has('hs')&&has('adr')&&above('hs')&&below('adr')){
   cards.push({kind:'check',title:`HS ${fmt(o.hsPct,'hs')}%は参考以上、ADR ${fmt(o.adr,'adr')}は参考より低い`,text:'命中した弾の頭への割合は出ている一方、削る総量は伸びしろ。HSをさらに追う前に、交戦へ参加できた回数と初弾前の準備を確認したい。武器や役割の違いでも出る組み合わせです。'});
   focus={topic:'participation',title:'頭狙いを増やすより、撃てた交戦を増やせるか',action:'最初の3Rで味方の接敵に合流する条件を決める。待つ担当なら、その役割と合流のタイミングを一言伝える。'};
  }else if(has('adr')&&has('kd')&&above('adr')&&low('kd')){
   cards.push({kind:'check',title:`ADR ${fmt(o.adr,'adr')}の出力に対してKD ${fmt(o.kd,'kd')}が低め`,text:'削る量の数字は出ているので、エイムだけを原因にせず、倒し切り・味方の回収・死亡負担を分けて確認します。ダメージが高いことだけで良い交戦だったとは決めません。'});
   focus={topic:'conversion',title:'倒し切りと、死んだ交戦の負担を分ける',action:'削った相手を味方が回収したかを1場面確認。回収できていれば役割を維持し、できなかった場面は位置の報告と撃ち直しを試す。'};
  }else if(has('kd')&&has('acs')&&high('kd')&&low('acs')){
   cards.push({kind:'check',title:`KD ${fmt(o.kd,'kd')}は高めでもACS ${fmt(o.acs,'acs')}は低め`,text:`倒し合いの比と戦闘ペースは別です。KPR ${fmt(o.kpr,'kpr')}・DPR ${fmt(o.dpr,'dpr')}も見て、生存を維持しながら必要な交戦へ参加できていたかを確認します。`});
   focus={topic:'participation',title:'生き残ることと、戦いに関わることを両立する',action:'担当を守りながら、接敵した味方へ合流するか待つかを最初の3Rで明確に選ぶ。'};
  }
  if(!focus&&has('kd')&&has('adr')&&has('hs')&&low('kd')&&below('adr')&&below('hs')){
   cards.push({kind:'check',title:`KD ${fmt(o.kd,'kd')}・ADR ${fmt(o.adr,'adr')}・HS ${fmt(o.hsPct,'hs')}%が参考より低い`,text:'キルの比と削り量の両方に確認点があります。武器の違いもあるのでHSだけを原因にせず、まず録画の1交戦で停止と初弾の高さを確認します。外れていた時だけ射撃練習を優先します。'});
   focus={topic:'precision',title:'止まって撃てたか、初弾を一つ確認する',action:'直近1交戦を見て、移動中に撃ったか・初弾が頭の高さだったかを確認。崩れていた方だけ、射撃場で「横移動→停止→短い射撃」を左右10回。問題なければ交戦へ間に合う準備を見直す。'};
  }else if(!focus&&has('acs')&&has('adr')&&high('acs')&&above('adr')){
   cards.push({kind:'neutral',title:`ACS ${fmt(o.acs,'acs')}・ADR ${fmt(o.adr,'adr')}に戦闘出力の強み候補`,text:`有効${by.acs.matches}/${by.adr.matches}試合で、スコアと削り量の両方が参考より高め。スコアを増やす課題より、どの入口・準備で出せたかを残したい。勝利への貢献や相手の強さまで保証する数字ではありません。`});
   focus={topic:'repeat',title:'出力を再現する準備を残す',action:'キルになった交戦を一つ選び、最初の照準・遮蔽・味方の動く合図を記録する。次の試合の同じ役割で一つ再現する。無理な連続ピークを増やす目標にはしない。'};
  }
  const maps=(p.maps||[]).filter(m=>m.matches>=5&&m.acsMatches>=5&&finite(m.acs));
  const sorted=maps.slice().sort((a,b)=>b.acs-a.acs);
  if(sorted.length>=2&&sorted[0].acs-sorted.at(-1).acs>=15){
   const good=sorted[0],bad=sorted.at(-1);
   cards.push({kind:'check',title:`${good.value} ACS ${fmt(good.acs,'acs')} / ${bad.value} ${fmt(bad.acs,'acs')}`,text:`本人のマップ別で差${fmt(good.acs-bad.acs,'acs')}。各${good.matches}/${bad.matches}試合の記録。キャラ・相手・時期は未補正なので「このマップが弱い」と確定せず、同じキャラでの場面を見比べます。`});
   if(!focus)focus={topic:'map',title:bad.value+'の入口を一つだけ練習する',action:bad.value+'で苦しかった入口を一つ選び、遮蔽から角を一つずつ確認する動きを5回。'+(agent?agent.value+'で使うスキルと移動を合わせて試す。':'')};
  }
  const won=p.outcomes?.find(x=>x.value==='win'),lost=p.outcomes?.find(x=>x.value==='loss');
  if(won?.acsMatches>=5&&lost?.acsMatches>=5&&lost.acs>=won.acs){
   cards.push({kind:'check',title:`敗戦ACS ${fmt(lost.acs,'acs')} / 勝利ACS ${fmt(won.acs,'acs')}`,text:'敗戦でも戦闘スコアが出ています。無意味なキルや本人だけの敗因とは決めず、味方が動く前後のキル・設置後の動きなど、得点のタイミングを見直す材料です。'});
   if(!focus)focus={topic:'timing',title:'戦闘スコアをチームの動きにつなげる',action:'最初の3Rで、味方が動くタイミングと自分がスキルや射撃で支える担当を決める。'};
  }
  const w=p.windows?.find(x=>x.requested===5);
  if(w?.recent?.kdMatches>=2&&w?.previous?.kdMatches>=2&&finite(w.recent.kd)&&finite(w.previous.kd))cards.push({kind:'neutral',title:`直近${w.recent.kdMatches}試合KD ${fmt(w.recent.kd,'kd')} / 直前${w.previous.kdMatches}試合 ${fmt(w.previous.kd,'kd')}`,text:'今回の保存範囲での調子の違いです。マップ・ロール・相手が同じとは限らないため、変化の理由は条件別の記録と合わせて確認します。'});
  if(!cards.length)cards.push({kind:'neutral',title:`KD ${fmt(o.kd,'kd')} / ACS ${fmt(o.acs,'acs')} / ADR ${fmt(o.adr,'adr')} / HS ${fmt(o.hsPct,'hs')}%`,text:'この組み合わせを出発点に、自分の以前の条件別成績と公開参考値を分けて比較します。記録が少ない指標には強弱を決めず、今回の個別課題を試します。'});
  return {signature:context,cards:cards.slice(0,3),focus,comparison:bench};
 }
 root.KesoCoachBenchmarks=Object.freeze({asOf,sources,ranks,pro,compare,personal});
})(globalThis);
