import type {coachPerformance} from './coach-performance.ts';
import type {CoachCombatObservation} from './coach-round-contribution.ts';
type Performance=ReturnType<typeof coachPerformance>;
type Game=Performance['timeline'][number];
type Topic='reset'|'cover'|'conversion'|'participation'|'pressure'|'timing'|'repeat'|'foundation';
type Lesson={title:string;meaning:string;why:string;alternatives:string;practice:{name:string;minutes:number;steps:string[]};nextGame:string;selfCheck:string;track:'kpr'|'dpr'|'reset'|'cover'|'manual'};
const curriculum:Record<Topic,Lesson>={
 reset:{title:'1キルのあと、次の相手へ撃ち続ける前に仕切り直す',meaning:'敵を倒す力は出ている一方、キル直後にも倒されている。取った人数差を維持できた場面を増やせるかが今回の確認点。',why:'連続して覗くと、弾数・照準・位置の情報で次の敵が有利になりやすい。遮蔽へ戻って味方と撃ち直せば、最初のキルをラウンドの有利へつなげやすい。',alternatives:'味方がすぐ取り返した交戦や、退けないエントリーもある。5秒以内の死亡だけで再ピークのミスとは決めない。',practice:{name:'キル後のリセット',minutes:4,steps:['デスマッチで1キル取ったら、次の敵を探す前に近くの遮蔽へ戻る。まず5回だけ行う。','遮蔽の中で残弾とミニマップを確認し、同じ角へ出直すか別の角へ移るかを選ぶ。','キルを連ねる成績ではなく「倒す→戻る→次を選ぶ」の手順を途切れずできた回数を数える。']},nextGame:'次のコンペは最初の3回のキル後だけ、続けて戦う理由があるかを一度確認する。退くと味方を孤立させる場面は一緒に戦う。',selfCheck:'最初の3キル後、退くか続けるかを自分で選べたか。録画がなければ試合直後のメモでよい。',track:'reset'},
 cover:{title:'味方が撃てる距離で、同じ交戦に参加する',meaning:'本人が倒された後、5秒以内に味方が相手を倒した記録が少ない。今回は味方と同じ戦いへ参加できる配置を確認したい。',why:'同じ敵へすぐ撃てる位置なら、最初の味方が倒されても取り返す機会を作れる。「近くにいる」だけでなく、壁やスモークで射線が切れていないかが大事。',alternatives:'セーブ・引き判断・別サイト守備でも取り返しは減る。位置上のトレード機会や孤立の確定値ではなく、味方全員の判断が関係する。',practice:{name:'二人で同じ角へ出る順番',minutes:5,steps:['デュオで練習できるならカスタムで角を1つ選び、先頭とカバー役を交代して5回ずつ出る。','カバー役は味方が見た角へすぐ照準を出せる位置を探す。真後ろに重なって同時に倒される位置は避ける。','一人ならデスマッチで他人を追う代わりに、コンペの開始前に味方と「同じ角を一緒に見る」を1回決める。']},nextGame:'攻撃の最初の3ラウンドで、誰をカバーするか1人決める。スキルを使う間は、誰が代わりに撃つか短く伝える。',selfCheck:'同じ敵へ撃てた交戦は何回あったか。取り返せなかった時は壁・距離・判断のどれだったか1つメモする。',track:'cover'},
 conversion:{title:'ダメージを出した後の、倒し切り方を確かめる',meaning:'自分の直前の記録に比べ、与ダメージのペースは保たれているのにキルのペースが落ちている。単に撃ち合いへ参加していない場合とは読み方が違う。',why:'削れていることとキルになっていることは別。相手を撃った後の追い方や、味方が仕留められるタイミングまで見れば、必要なのが射撃練習か連携かを分けられる。',alternatives:'削り役として味方が倒し切った場合や、違う武器・相手の回復でも同じ数字になる。命中率不足や倒し切りのミスをログだけでは確定しない。',practice:{name:'止まって短く撃つ確認',minutes:5,steps:['まず倒し切れなかった交戦を1つ思い出す。味方が回収できたなら、無理に個人キルを増やす練習へ変えない。','撃ち合いで照準が崩れたなら射撃場で「横移動→停止→2〜3発→移動」を左右10回ずつ行う。連射しながら追い続けない。','味方とのタイミングが合わなかったなら、次の試合で削った相手の場所を一言伝える練習に置き換える。']},nextGame:'撃ち合う前に足を止め、短い射撃の後に再照準する交戦を3回だけ意識する。削った敵を無理に追う目標にはしない。',selfCheck:'見直した1交戦は「照準」「距離」「味方の回収」のどれだったか。選んだ練習を次の交戦で試せたか。',track:'kpr'},
 participation:{title:'生き残った時間を、味方と戦える時間にする',meaning:'自分の直前の記録に比べてデスは増えていないが、ラウンド当たりのキルが減っている。今回は生存を増やすだけでなく、交戦へ間に合っていたかを見たい。',why:'生存していても味方の接敵に参加できなければ、味方は少ない人数で戦うことになる。エイムの回数を増やす前に、待つ役割だったか移動が遅れたかを分ける。',alternatives:'センチネルの別サイト守備や、味方が先に全員倒した試合でもキルは減る。役割を捨てて前に出る指示ではない。',practice:{name:'交戦までの移動を短くする',minutes:4,steps:['直近の1ラウンドで、味方が接敵した時に自分が何を見ていたかを思い出す。録画がなければ次の試合で1回メモする。','自分が見る必要のない角を見続けていたなら、カスタムでその場所から味方の射線へ入る道を2通り歩く。','罠・スモーク・裏取りを見る担当だったなら、その役割を味方へ伝えて合流する条件を1つ決める。']},nextGame:'最初の3ラウンドは、接敵した味方へ合流するか担当位置を守るかを意識して選ぶ。合流する時はナイフのまま交戦へ入らない。',selfCheck:'参加できなかった交戦を1つ挙げ、待つ役割だったのか、移動が間に合わなかったのかを区別できたか。',track:'kpr'},
 pressure:{title:'デスの増加を、撃ち合いの回数と分けて考える',meaning:'今回はキルを増やせた分以上に死亡の負担が出ている。K/Dを上げる練習を全部エイムへ寄せる前に、選んだ交戦と倒され方を確認したい。',why:'二つの角へ同時に体を出すと、一方へ照準を合わせても別方向から撃たれやすい。見る角を一つに区切ることで、照準を置いた相手と戦いやすくなる。',alternatives:'エントリー・味方のカバー・不利なリテイクで必要な死亡もある。D>KやDPRの上昇だけで無駄なデスとは決めない。',practice:{name:'一つずつ角を確認する',minutes:5,steps:['カスタムで苦手な入口を1つ選ぶ。遮蔽から出る位置を少しずつ変え、見える角を一つずつ増やす。','敵がいそうな高さへ照準を置き、横移動を止めてから撃つ動作を左右5回ずつ練習する。相手がいなくてもできる。','実戦で死んだ1場面を選び、二方向へ同時に出たのか、味方のために出たのかを分ける。録画がなければ一行メモする。']},nextGame:'次の試合の最初の3交戦は、撃ち合う角を一つにしてから体を出す。生存のために必要なエントリーやカバーを放棄しない。',selfCheck:'倒された1場面で、どの角に照準を置き、どこから撃たれたか説明できるか。',track:'dpr'},
 timing:{title:'キル数の次は、味方と戦うタイミングを見る',meaning:'キルと死亡のペースは自分の直前の記録を保っているが、試合は負けている。キル数だけでは説明できないラウンドの進め方を振り返る回。',why:'同じ1キルでも、味方が動く前に人数差を作る場合と、味方が倒された後に取る場合では、その後の選択肢が違う。キルの価値を数字だけで決めず、味方が利用できるタイミングだったかを見る。',alternatives:'チームの敗戦を個人の責任とはしない。相手の強さ・役割・攻守・味方の判断も関係し、遅いキルや無意味なキルだったとは断定していない。',practice:{name:'ラウンド開始前の短い作戦',minutes:3,steps:['次の試合で使うエージェントの役割を一文で決める。「最初に入る」「味方の進行へスモーク」「裏を見る」などでよい。','同じ入口にいる味方1人へ、先に出る人とスキルを使うタイミングを短く伝える。','試合後に1ラウンドだけ、作戦どおり味方が動けたかを見直す。キルを取れたかだけで採点しない。']},nextGame:'最初の3ラウンドで、味方が動くタイミングに合わせて自分の役割を1つ実行する。',selfCheck:'自分のキル・スキル・見張りで、味方が何をできるようになったかを1ラウンドだけ説明する。',track:'manual'},
 repeat:{title:'うまくいった交戦の準備を再現する',meaning:'自分の直前の記録に比べてキルのペースが上がり、死亡のペースは下がった。今回は問題を無理に探すより、再現できる準備を残したい。',why:'当たった感覚だけでなく、照準の位置・出る角・味方とのタイミングを言葉にすると、調子が変わっても同じ準備を試しやすい。',alternatives:'相手や武器、マップが違う影響もある。一試合で実力が上がった、練習が成功したとは確定しない。',practice:{name:'成功した入り方を一つ残す',minutes:3,steps:['良かった交戦を1つ選び、照準を置いた場所・遮蔽・味方の位置を一行ずつメモする。','カスタムで同じ角への入り方を5回だけ繰り返す。違う場所なら似た距離と角度を探す。','キルを保証しようとせず、撃つ前の準備を同じ順番で行えるか確認する。']},nextGame:'最初の3交戦で、前回メモした準備を一つだけ再現する。',selfCheck:'前回と同じ準備ができたか。敵の強さや運以外に、自分が再現できた要素を一つ挙げる。',track:'kpr'},
 foundation:{title:'止まってから撃つ順番を確かめる',meaning:'今回の記録を今後の比較の出発点にする。得意不得意を決める前でも、短い基礎練習と一試合ごとの答え合わせは始められる。',why:'移動したままの射撃と、止まってからの射撃を体感で区別できると、外した時に照準と足のどちらを直すか考えやすくなる。',alternatives:'今回のデータが移動撃ちの失敗を示したわけではない。これは個人の弱点診断ではなく、比較材料を作るための共通練習。',practice:{name:'移動・停止・射撃を分ける',minutes:3,steps:['射撃場で動かずに短い射撃を10回行い、当たる感覚を確認する。','左右へ移動してから足を止め、同じ射撃を左右10回ずつ行う。速さより順番を優先する。','止まったつもりで外れた時は、その1回だけ射撃を遅らせて違いを確かめる。']},nextGame:'次の試合の最初の3交戦だけ、足を止めてから撃つ順番を意識する。必要なカバーを遅らせる目標にはしない。',selfCheck:'最初の3交戦のうち、移動と射撃を分けて行えた場面を1つ説明できるか。',track:'manual'}
};
const f=(x:number)=>x.toFixed(3);
function rate(g:Game,key:'kpr'|'dpr'|'adr'|'apr'){
 const value=key==='kpr'?g.kills:key==='dpr'?g.deaths:key==='apr'?g.assists:g.adr===null?null:g.adr*g.rounds!;
 return value===null||!g.rounds?null:{value:value/g.rounds,numerator:value,rounds:g.rounds,matches:1};
}
function lessonFor(g:Game,older:Game[],event:CoachCombatObservation|null){
 const same=older.filter(x=>g.agent!=='不明'&&g.map!=='不明'&&x.agent===g.agent&&x.map===g.map);
 const agent=older.filter(x=>g.agent!=='不明'&&x.agent===g.agent);
 const scope=same.length>=2?'同じマップ・エージェント':agent.length>=2?'同じエージェント（マップ未補正）':'保存済みの直前試合（マップ・役割未補正）';
 const baseline=(same.length>=2?same:agent.length>=2?agent:older).slice(0,5);
 const metrics=(['kpr','dpr','adr','apr'] as const).map(key=>{
  const valid=baseline.map(x=>rate(x,key)).filter(x=>x!==null),rounds=valid.reduce((s,x)=>s+x.rounds,0),numerator=valid.reduce((s,x)=>s+x.numerator,0);
  return {key,label:{kpr:'1R当たりのキル（KPR）',dpr:'1R当たりのデス（DPR）',adr:'1R当たりの与ダメージ（ADR）',apr:'1R当たりのアシスト（APR）'}[key],current:rate(g,key),baseline:rounds?{value:numerator/rounds,numerator,rounds,matches:valid.length}:null};
 });
 const k=metrics[0],d=metrics[1],a=metrics[2];
 const compared=Boolean(g.rounds&&g.rounds>=12&&k.current&&d.current&&k.baseline&&d.baseline&&k.baseline.matches>=2&&d.baseline.matches>=2&&k.baseline.rounds>=20&&d.baseline.rounds>=20);
 // The displayed 0.1/R boundary must not change because 0.65-0.75 rounds
 // to -0.09999999999999998 in binary floating point.
 const kd=compared?Number((k.current!.value-k.baseline!.value).toFixed(9)):null,dd=compared?Number((d.current!.value-d.baseline!.value).toFixed(9)):null;
 let topic:Topic='foundation';
 if(compared&&kd!<=-.1&&a.current&&a.baseline&&a.baseline.matches>=2&&a.current.value>=a.baseline.value-1e-9)topic='conversion';
 else if(compared&&kd!<=-.1&&dd!<=.05)topic='participation';
 else if(compared&&dd!>=.1&&kd!<.1)topic='pressure';
 else if(event&&event.enemyKills>=4&&event.diedAfterKill5s>=2&&event.diedAfterKill5s/event.enemyKills>=1/3)topic='reset';
 else if(event&&event.enemyKnownKillerDeaths>=4&&event.teammateRetaliations5s/event.enemyKnownKillerDeaths<.25)topic='cover';
 else if(compared&&kd!>=.1&&dd!<=-.1)topic='repeat';
 else if(compared&&g.outcome==='loss'&&kd!>=0&&dd!<=0)topic='timing';
 else if(g.kills!==null&&g.deaths!==null&&g.deaths>g.kills)topic='pressure';
 else if(g.kills!==null&&g.deaths!==null&&g.kills>g.deaths)topic='repeat';
 const evidence=metrics.filter(m=>m.current).map(m=>`${m.label} ${f(m.current!.value)} (${Number(m.current!.numerator.toFixed(3))}/${m.current!.rounds}R)`+(m.baseline?`・直前 ${f(m.baseline.value)} (${Number(m.baseline.numerator.toFixed(3))}/${m.baseline.rounds}R、${m.baseline.matches}試合)`:'・以前の比較値はまだない'));
 if(event)evidence.push(`全10人K/D照合済み ${event.rounds}R：敵キル${event.enemyKills}回、その各キルの後5秒以内に本人死亡${event.diedAfterKill5s}回。既知の敵による死亡${event.enemyKnownKillerDeaths}回、味方の5秒以内の取り返し${event.teammateRetaliations5s}回。`);
 let lesson=curriculum[topic];
 if(topic==='pressure')lesson={...lesson,title:'倒され方と交戦の選び方を分けて考える',meaning:compared&&dd!>=.1?`本人の直前の記録に比べ、死亡のペースが${f(dd!)} / R増え、キルの増加は${f(kd!)} / Rだった。今回は死亡した交戦の選び方を確認したい。`:`今回は${g.kills}K・${g.deaths}Dで、キルよりデスが多かった。これだけで以前より悪化したとは決めず、まず死亡した交戦の選び方を一つ確認する。`};
 if(topic==='repeat'&&!(compared&&kd!>=.1&&dd!<=-.1))lesson={...lesson,meaning:`今回は${g.kills}K・${g.deaths}Dで、キルがデスを上回った。相手や役割の違いもあるため上達の証明にはしないが、うまくいった準備を具体化して次へ持ち越せる。`};
 // The role plan uses this match only; historical sessions never see future data.
 const rolePlans:Record<string,string>={
  'デュエリスト':'味方の準備ができた合図で入る入口を一つ決める。最初に入った後、カバーが届く所まで進む動きをカスタムで5回試す。',
  'コントローラー':'味方が入る合図に合わせて必要なスモークを置き、武器へ戻して同じ交戦に参加する手順を5回試す。',
  'イニシエーター':'味方一人と仕掛ける合図を決め、索敵や妨害の後に武器へ戻して追従する手順を5回試す。',
  'センチネル':'担当する裏・別入口と合流条件を一つ決める。守る地点から退く遮蔽と、味方へ合流する経路を5回歩く。'
 };
 const rolePlan=rolePlans[g.role];
 if(rolePlan)lesson={...lesson,meaning:`${g.map} / ${g.agent}（${g.role}）の記録。`+lesson.meaning,practice:{...lesson.practice,steps:[lesson.practice.steps[0],lesson.practice.steps[1],rolePlan]},nextGame:lesson.nextGame+` ${g.agent}では、練習した役割の手順を最初の3Rで一度試す。`,alternatives:lesson.alternatives+' 役割別の手順は次回の練習案であり、今回のスキル使用・位置取りを観測した判定ではない。'};
 return {topic,lesson,metrics,evidence,scope,baselineMatches:baseline.length,event};
}
function followUp(current:ReturnType<typeof lessonFor>,previous:ReturnType<typeof lessonFor>|null){
 if(!previous)return {status:'baseline',title:'この試合を出発点にする',text:'以前の試合との比較はまだない。今日の短い練習を試し、次の1試合で確認ポイントを振り返る。',practiceVerified:false};
 const track=previous.lesson.track;
 if(track==='manual')return {status:'self-check',title:'前の試合の練習案を振り返る',text:previous.lesson.selfCheck+' 実行したかはログで確認できないため、練習済みや失敗とは判定しない。',practiceVerified:false};
 let now:number|null=null,before:number|null=null,nowBase='',beforeBase='';
 if(track==='reset'||track==='cover'){
  const a=current.event,b=previous.event;
  if(track==='reset'&&a?.enemyKills&&b?.enemyKills){now=a.diedAfterKill5s/a.enemyKills;before=b.diedAfterKill5s/b.enemyKills;nowBase=`${a.diedAfterKill5s}/${a.enemyKills}キル`;beforeBase=`${b.diedAfterKill5s}/${b.enemyKills}キル`;}
  if(track==='cover'&&a?.enemyKnownKillerDeaths&&b?.enemyKnownKillerDeaths){now=a.teammateRetaliations5s/a.enemyKnownKillerDeaths;before=b.teammateRetaliations5s/b.enemyKnownKillerDeaths;nowBase=`${a.teammateRetaliations5s}/${a.enemyKnownKillerDeaths}死亡`;beforeBase=`${b.teammateRetaliations5s}/${b.enemyKnownKillerDeaths}死亡`;}
 }else{
  const a=current.metrics.find(m=>m.key===track)?.current,b=previous.metrics.find(m=>m.key===track)?.current;
  now=a?.value??null;before=b?.value??null;nowBase=a?`${a.numerator}/${a.rounds}R`:'';beforeBase=b?`${b.numerator}/${b.rounds}R`:'';
 }
 if(now===null||before===null)return {status:'self-check',title:'前の試合の練習案はメモで確認',text:previous.lesson.selfCheck+' 比較する指標が今回は揃わないため、数値で成否は付けない。',practiceVerified:false};
 const sign=track==='dpr'||track==='reset'?-1:1,change=(now-before)*sign;
 const other=track==='dpr'?'kpr':track==='kpr'?'dpr':null;
 const otherNow=current.metrics.find(m=>m.key===other)?.current?.value,otherBefore=previous.metrics.find(m=>m.key===other)?.current?.value;
 const tradeoff=otherNow!==undefined&&otherBefore!==undefined&&(other==='dpr'?otherNow>otherBefore:otherNow<otherBefore);
 const status=change>1e-9?(tradeoff?'mixed':'improving'):change< -1e-9?'review':'steady';
 return {status,title:status==='improving'?'前回の確認指標は改善方向':status==='mixed'?'一方は改善し、もう一方も確認したい':status==='steady'?'前回の確認指標は同じ水準':'前回の確認指標をもう一度見直す',
  text:`前の試合から挙げる練習案「${previous.lesson.title}」の指標 ${track.toUpperCase()}：前回 ${f(before)} (${beforeBase}) → 今回 ${f(now)} (${nowBase})。各1試合の比較。`+(tradeoff?'キルとデスのもう一方は悪化方向のため、片方だけで成功としない。':'')+' 相手・攻守・役割が異なる影響もある。練習を実行した証拠や、練習の効果が証明されたという意味ではない。',practiceVerified:false};
}
export function coachMatchFeedback(p:Performance,events:ReadonlyMap<number,CoachCombatObservation|null>=new Map()){
 const games=p.timeline,times=new Map<number,number>();
 for(const g of games){const at=Date.parse(g.date!);times.set(at,(times.get(at)??0)+1);}
 const select=(i:number)=>{
  const g=games[i],at=Date.parse(g.date!);
  return lessonFor(g,games.slice(i+1).filter(x=>Date.parse(x.date!)<at).slice(0,10),times.get(at)===1?events.get(at)??null:null);
 };
 const sessions=games.slice(0,12).map((g,i)=>{
  const previousIndex=games.findIndex((x,j)=>j>i&&Date.parse(x.date!)<Date.parse(g.date!));
  const current=select(i),previous=previousIndex>=0?select(previousIndex):null;
  return {date:g.date,map:g.map,agent:g.agent,outcome:g.outcome,kills:g.kills,deaths:g.deaths,assists:g.assists,rounds:g.rounds,
   topic:current.topic,lesson:current.lesson,evidence:current.evidence,scope:current.scope,baselineMatches:current.baselineMatches,metrics:current.metrics,
   eventVerified:current.event!==null,previousTopic:previous?.topic??null,followUp:followUp(current,previous)};
 });
 return {version:1,sessions,starter:sessions.length?null:curriculum.foundation,
  quality:{availableChronologicalMatches:p.quality.timeSeries.valid,shown:sessions.length,limit:12,undatedExcluded:p.quality.timeSeries.excluded,ambiguousTimeMatches:games.filter(g=>times.get(Date.parse(g.date!))!>1).length,eventVerified:sessions.filter(s=>s.eventVerified).length},
  rules:'比較は本人の過去だけを使う。同条件2件を優先し最大5件、変化抽出は各2試合/20R以上・今回12R以上・KPR/DPR差0.1をローカルな練習選択の目安とする。ダメージとキルの変化、交戦参加、死亡ペースの変化を先に確認し、次にキル直後死亡と味方の取り返しを確認する。キル直後死亡は4キル以上かつ2件以上/3分の1以上、取り返しは既知の敵による4死亡以上/4分の1未満。実力・判断ミスの基準や公式値ではない。',
  delivery:'新しい試合の保存後に「この人の解説を更新」を押すと、最新の解説を読めます。表示は保存済みの直近最大12試合です。記録の取得には待ち時間があり、試合直後の通知や全履歴の回収を保証するものではありません。'};
}
