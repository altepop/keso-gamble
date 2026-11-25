// KESO-authored practice experiments; sources support principles, not proven doses.
(function(root){
 'use strict';
 const data={
  "sources":{
  "riotGuide": {
    "title": "Riot公式 Beginner’s Guide",
    "url": "https://playvalorant.com/en-us/news/announcements/beginners-guide/",
    "level": "mechanics",
    "limit": "射撃・マップ・購入・連携の基礎。個別ドリルの効果検証ではない。",
    "checkedAt": "2026-11-19"
  },
  "arsenal": {
    "title": "Riot公式 武器一覧",
    "url": "https://playvalorant.com/en-us/arsenal/",
    "level": "mechanics",
    "limit": "武器の特徴。練習回数・上達効果を規定する資料ではない。",
    "checkedAt": "2026-11-19"
  },
  "maps": {
    "title": "Riot公式 マップ一覧",
    "url": "https://playvalorant.com/en-us/maps/",
    "level": "mechanics",
    "limit": "マップ構造の確認用。固有の定点座標は収録しない。",
    "checkedAt": "2026-11-19"
  },
  "aimBasics": {
    "title": "Aimlabs VALORANT Aim Basics",
    "url": "https://aimlabs.com/articles/aimlabs/the-valorant-aim-basics-routine-your-new-favorite-playlist/",
    "level": "practice",
    "limit": "小さい修正・切替・追従等の実務資料。ゲーム内ランク上昇の保証ではない。",
    "checkedAt": "2026-11-19"
  },
  "aimPro": {
    "title": "Aimlabs / TenZの練習資料",
    "url": "https://www.aimlabs.com/articles/valorant/how-to-start-valorant-aim-training-like-the-pros/",
    "level": "practice",
    "limit": "照準と動きをゲーム内でも確かめる実務資料。原文ルーティンの転載ではない。",
    "checkedAt": "2026-11-19"
  },
  "sensitivity": {
    "title": "Aimlabs PC Sensitivity Guide",
    "url": "https://support.aimlabs.com/hc/en-us/articles/38493112353815-PC-Sensitivity-Guide",
    "level": "practice",
    "limit": "ゲーム設定・DPI・cm/360の照合。万人向けの最適感度は示さない。",
    "checkedAt": "2026-11-19"
  },
  "focusStudy": {
    "title": "Lamers James & O’Connor 2023",
    "url": "https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0288937",
    "level": "research-limited",
    "limit": "Aim Labの37人で注意の向け方による有意な主効果なし。外的注意が必ず有利とは扱わない。",
    "checkedAt": "2026-11-19"
  },
  "training": {
    "title": "Nagorsky & Wiemeyer 2020",
    "url": "https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0237584",
    "level": "research-limited",
    "limit": "5ゲームの自己報告調査・枠組み。VALORANT個別ドリルの介入試験ではない。",
    "checkedAt": "2026-11-19"
  },
  "fourStance": {
    "title": "4スタンス倶楽部（提唱元）",
    "url": "https://www.4stance.com/4stance04",
    "level": "experimental",
    "limit": "提唱内容の確認用。身体タイプの自動判定やVALORANTへの効果の根拠には使わない。",
    "checkedAt": "2026-11-19"
  },
  "fourPolicy": {
    "title": "REASH PROJECTの判定に関する説明",
    "url": "https://www.reash-project.net/news/20200116.html",
    "level": "experimental",
    "limit": "提唱元も個々の身体を観察した確認を求める。戦績からのタイプ判定には対応しない。",
    "checkedAt": "2026-11-19"
  },
  "omen": {
    "title": "Riot公式 Omen",
    "url": "https://playvalorant.com/en-us/agents/omen/",
    "level": "mechanics",
    "limit": "役割とスキルの仕様。お勧めの適性・暗記負担はKESO側の試用仮説。",
    "checkedAt": "2026-11-19"
  },
  "gekko": {
    "title": "Riot公式 Gekko",
    "url": "https://playvalorant.com/en-us/agents/gekko/",
    "level": "mechanics",
    "limit": "役割とスキルの仕様。お勧めの適性・暗記負担はKESO側の試用仮説。",
    "checkedAt": "2026-11-19"
  },
  "sage": {
    "title": "Riot公式 Sage",
    "url": "https://playvalorant.com/en-us/agents/sage/",
    "level": "mechanics",
    "limit": "役割とスキルの仕様。お勧めの適性・暗記負担はKESO側の試用仮説。",
    "checkedAt": "2026-11-19"
  },
  "sova": {
    "title": "Riot公式 Sova",
    "url": "https://playvalorant.com/en-us/agents/sova/",
    "level": "mechanics",
    "limit": "役割とスキルの仕様。お勧めの適性・暗記負担はKESO側の試用仮説。",
    "checkedAt": "2026-11-19"
  },
  "breach": {
    "title": "Riot公式 Breach",
    "url": "https://playvalorant.com/en-us/agents/breach/",
    "level": "mechanics",
    "limit": "役割とスキルの仕様。お勧めの適性・暗記負担はKESO側の試用仮説。",
    "checkedAt": "2026-11-19"
  },
  "reyna": {
    "title": "Riot公式 Reyna",
    "url": "https://playvalorant.com/en-us/agents/reyna/",
    "level": "mechanics",
    "limit": "役割とスキルの仕様。お勧めの適性・暗記負担はKESO側の試用仮説。",
    "checkedAt": "2026-11-19"
  },
  "cypher": {
    "title": "Riot公式 Cypher",
    "url": "https://playvalorant.com/en-us/agents/cypher/",
    "level": "mechanics",
    "limit": "役割とスキルの仕様。お勧めの適性・暗記負担はKESO側の試用仮説。",
    "checkedAt": "2026-11-19"
  },
  "killjoy": {
    "title": "Riot公式 Killjoy",
    "url": "https://playvalorant.com/en-us/agents/killjoy/",
    "level": "mechanics",
    "limit": "役割とスキルの仕様。お勧めの適性・暗記負担はKESO側の試用仮説。",
    "checkedAt": "2026-11-19"
  },
  "brimstone": {
    "title": "Riot公式 Brimstone",
    "url": "https://playvalorant.com/en-us/agents/brimstone/",
    "level": "mechanics",
    "limit": "役割とスキルの仕様。お勧めの適性・暗記負担はKESO側の試用仮説。",
    "checkedAt": "2026-11-19"
  }
},
  "categories":{
  "aim": "照準・マウス操作",
  "gun": "停止・射撃の制御",
  "peek": "角の見方・生存",
  "map": "マップ・移動経路",
  "team": "カバー・情報共有",
  "decision": "判断・人数差・買い物",
  "utility": "定点・スキルの練習",
  "role": "ロール・キャラ運用",
  "review": "録画・振り返り",
  "habit": "設定・練習設計・個人差"
},
  "entries":[
   {"id":"P001","category":"aim","title":"小さな照準修正","action":"射撃場で頭から少し外して構え、小さい修正だけで1発当てる。左右各10回。","check":"大きく振り直さず当てた回数を20回中で記録。","tags":["precision"],"sourceIds":["aimBasics"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P002","category":"aim","title":"頭の高さを先に作る","action":"カスタムの入口を3つ選び、頭の高さに照準を置いてから出る。","check":"出てから上下に直した入口はどこか。","tags":["precision"],"sourceIds":["aimBasics"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P003","category":"aim","title":"フリックの行き過ぎ確認","action":"静止ボット2体の間を1発ずつ20往復。速さより外した方向を見る。","check":"手前で止まるか、通り過ぎるかを分ける。","tags":["precision"],"sourceIds":["aimBasics"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P004","category":"aim","title":"ターゲット切替後の1発","action":"ボットを1体倒したら次の頭へ照準を置き直し、止めてから撃つ。10組。","check":"次の敵への移動中に撃った組を数える。","tags":["precision","conversion"],"sourceIds":["aimBasics"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P005","category":"aim","title":"横移動する相手を追う","action":"Aimlabsの水平トラッキングを1分ずつ2回。別ソフトがなければ協力者の横移動を射撃場で追う。","check":"方向転換で照準が離れた場面を一つ残す。","tags":["precision"],"sourceIds":["aimBasics"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P006","category":"aim","title":"見えてから急いで撃たない","action":"静止ボット10体に照準が乗ったことを確認して1発ずつ撃つ。","check":"早撃ちの外れと、照準修正後の外れを分ける。","tags":["precision"],"sourceIds":["aimBasics"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P007","category":"aim","title":"遠距離の小さい的","action":"射撃場で距離を離し、同じ武器で10発ずつ2セット撃つ。","check":"近距離と比べて初弾の外れ方が変わるか。","tags":["precision"],"sourceIds":["aimBasics"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P008","category":"aim","title":"出現位置を決めない照準","action":"ランダム出現ボットを10体。予測した場所で待ち過ぎず、見えた頭へ修正する。","check":"反応が遅れたのか修正が外れたのか。","tags":["precision"],"sourceIds":["aimBasics"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P009","category":"aim","title":"照準を動かす量の削減","action":"{{map}}の通路を3本歩き、次に見る角へ順番に照準を置く。","check":"壁や床へ照準を置いていた区間を一つ特定。","tags":["precision","map"],"sourceIds":["aimBasics"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P010","category":"aim","title":"照準練習から実戦へ移す","action":"射撃場で成功した頭の高さの準備をデスマッチの3交戦だけで試す。","check":"射撃場ではできても実戦で崩れた条件は何か。","tags":["precision","repeat"],"sourceIds":["aimBasics"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P011","category":"gun","title":"停止してから初弾","action":"射撃場で横移動し、移動キーを離して照準が落ち着いてから1発。左右10回。","check":"移動中の誤射を数える。反対キー入力を必須にしない。","tags":["precision"],"sourceIds":["arsenal","aimPro"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P012","category":"gun","title":"短いバーストの区切り","action":"Vandalで2〜3発撃って休み、照準が戻ってから次を撃つ。10セット。","check":"連射が長くなったセットは何回か。","tags":["precision","conversion"],"sourceIds":["arsenal","aimPro"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P013","category":"gun","title":"連射と撃ち直しの比較","action":"同じ距離で連射5回、遮蔽へ戻って撃ち直す動き5回を比べる。","check":"距離ごとに弾が散った方を記録。","tags":["conversion","reset"],"sourceIds":["arsenal","aimPro"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P014","category":"gun","title":"しゃがむ前の一呼吸","action":"デスマッチ3交戦で初弾前の自動的なしゃがみを抑え、必要な時だけ使う。","check":"しゃがまなくても照準を合わせられたか。","tags":["precision"],"sourceIds":["arsenal","aimPro"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P015","category":"gun","title":"反動の形を確認","action":"射撃場の壁に同じ武器で3回撃ち、弾の散り方を観察する。","check":"毎回同じ軌道だと決めず、短く切る位置を選ぶ。","tags":["precision"],"sourceIds":["arsenal","aimPro"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P016","category":"gun","title":"武器ごとの交戦距離","action":"Spectreと普段のライフルで近距離・遠距離の的を各5回撃つ。","check":"苦しい距離で持ち替えず戦っていなかったか。","tags":["map","conversion"],"sourceIds":["arsenal","aimPro"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P017","category":"gun","title":"ADSを使う条件","action":"同じ遠距離の的をADSあり・なし各5回撃つ。スコアより見やすさを比べる。","check":"拡大が必要な距離と近距離での負担を一つずつ。","tags":["precision"],"sourceIds":["arsenal","aimPro"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P018","category":"gun","title":"リロードする前に隠れる","action":"カスタムで敵を倒した想定から遮蔽へ戻り、そこでリロードする動きを5回。","check":"敵の射線で武器を下げた場面はないか。","tags":["pressure","reset"],"sourceIds":["arsenal","aimPro"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P019","category":"gun","title":"武器を持って角へ入る","action":"{{map}}で安全な移動と接敵する角を分け、角の前に銃へ戻す道を3回歩く。","check":"銃へ戻す地点を毎回説明できたか。","tags":["pressure","participation"],"sourceIds":["arsenal","aimPro"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P020","category":"gun","title":"ピストルの射撃間隔","action":"次に使うピストルを射撃場で20発。照準が戻る間隔を自分で確かめる。","check":"急いだ連射と制御した射撃の命中を別々に残す。","tags":["precision"],"sourceIds":["arsenal","aimPro"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P021","category":"peek","title":"一度に一つの角","action":"{{map}}の入口一つで、見える敵位置が一つずつ増えるように少しずつ出る。5往復。","check":"二方向が同時に見えた地点を特定。","tags":["pressure"],"sourceIds":["riotGuide","training"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P022","category":"peek","title":"角から離れて見る","action":"カスタムで同じ角を近い位置・離れた位置から各3回見る。","check":"遮蔽との距離で見える範囲がどう変わるか。","tags":["pressure"],"sourceIds":["riotGuide","training"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P023","category":"peek","title":"情報取りと勝負を分ける","action":"入口一つで、情報だけ取って戻る動きと撃つ前提の出方を各5回練習。","check":"覗く前に目的を言えたか。","tags":["pressure","participation"],"sourceIds":["riotGuide","training"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P024","category":"peek","title":"キル後の退路","action":"1キルした想定で戻る遮蔽を先に決め、そこへ退く動きを5回。","check":"退路を塞ぐ味方や別角がある時の代案は何か。","tags":["reset"],"sourceIds":["riotGuide","training"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P025","category":"peek","title":"同じ角を連続で出ない選択","action":"録画の再ピークを一つ選び、別角へ移る・待つ場合の動きをカスタムで確認。","check":"再ピークが必要だった理由を説明できるか。","tags":["reset"],"sourceIds":["riotGuide","training"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P026","category":"peek","title":"待ち位置を相手の出方に合わせる","action":"同じ入口で相手が小さく出る想定と大きく出る想定の照準位置を各5回比較。","check":"一つの置き幅を全状況へ固定していないか。","tags":["precision","pressure"],"sourceIds":["riotGuide","training"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P027","category":"peek","title":"オフアングルの逃げ道","action":"普段と違う待ち位置を一つ試し、撃った後に隠れる場所まで歩く。","check":"意表を突けても退けない位置ではなかったか。","tags":["pressure","reset"],"sourceIds":["riotGuide","training"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P028","category":"peek","title":"足音を出す境界","action":"カスタムで目的地まで走る区間・歩く区間を決めて3回移動する。","check":"静かにする目的と間に合う目的を分けられたか。","tags":["map","timing"],"sourceIds":["riotGuide","training"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P029","category":"peek","title":"高低差を順に確認","action":"{{map}}で高所と足元の両方がある地点を一つ選び、見る順序を5回練習。","check":"地上だけに照準を置いていなかったか。","tags":["map","pressure"],"sourceIds":["riotGuide","training"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P030","category":"peek","title":"スモーク端を一つずつ見る","action":"カスタムでスモークの出口を想定し、味方と別々の角を担当する位置を歩く。","check":"両端を一人で同時に見ようとしていないか。","tags":["cover","pressure"],"sourceIds":["riotGuide","training"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P031","category":"map","title":"入口の危険箇所メモ","action":"{{map}}の苦手な入口を一つ選び、敵が立てる場所を実際に歩いて3つ記録。","check":"入口を覚えるだけでなく見る順が決まったか。","tags":["map","pressure"],"sourceIds":["maps"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P032","category":"map","title":"二つの合流経路","action":"別サイトから味方へ合流する道を2本歩き、武器へ戻す地点も決める。","check":"短い道と安全な道の違いを言えるか。","tags":["participation","map"],"sourceIds":["maps"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P033","category":"map","title":"コール名を三つ覚える","action":"{{map}}で味方へ伝えられなかった地点3つを選び、ピンと呼び名を合わせる。","check":"次の試合で場所を一言で共有できたか。","tags":["map","cover"],"sourceIds":["maps"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P034","category":"map","title":"設置場所から逆算する","action":"一つの設置位置を選び、設置後に守れる射線へ移動する道を歩く。","check":"設置者とカバー役が同じ敵を見られるか。","tags":["map","timing"],"sourceIds":["maps"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P035","category":"map","title":"守備位置から退く経路","action":"サイトを守る場所から、味方を待てる場所への退き方を3回確認。","check":"敵の侵入を見てからでも逃げられる条件は何か。","tags":["map","pressure","reset"],"sourceIds":["maps"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P036","category":"map","title":"リテイクの二入口","action":"一つのサイトへ入り直す入口を2つ選び、同時に入る合図を決める。","check":"入口ごとに見なければならない角は何か。","tags":["map","cover","timing"],"sourceIds":["maps"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P037","category":"map","title":"味方を見られる高さ","action":"上下の位置を一つずつ歩き、同じ敵へ撃てる場所と撃てない場所を分ける。","check":"距離が近くてもカバーできない組合せを見つけたか。","tags":["map","cover"],"sourceIds":["maps"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P038","category":"map","title":"マップ装置を先に触る","action":"扉・ロープ等、{{map}}で使える装置を一つカスタムで試す。装置がなければ迂回路を確認。","check":"音・移動制約・別入口を一つ説明できるか。","tags":["map"],"sourceIds":["maps"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P039","category":"map","title":"時間の足りない移動を再現","action":"録画で間に合わなかった移動を一つ選び、同じ経路をカスタムで歩く。","check":"判断前の待ち時間と移動時間を分けられたか。","tags":["map","participation","timing"],"sourceIds":["maps"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P040","category":"map","title":"得意マップの準備を移植","action":"得意マップの交戦前の準備を一つ書き、{{map}}の似た入口で試す。","check":"場所を丸暗記せず、遮蔽やカバーの原理を移せたか。","tags":["map","repeat"],"sourceIds":["maps"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P041","category":"team","title":"同じ敵を撃てる間隔","action":"協力者と角一つを見て、先頭と後ろを交代して各5回出る。","check":"壁に遮られず同じ敵を見られた回数。","tags":["cover"],"sourceIds":["riotGuide","training"],"minutes":3,"requires":"partner","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P042","category":"team","title":"スキル中の銃担当","action":"味方一人と、片方がスキルを持つ間はもう片方が銃で角を見る手順を3回。","check":"二人とも武器を下げた瞬間はあったか。","tags":["cover","utility"],"sourceIds":["riotGuide","training"],"minutes":3,"requires":"partner","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P043","category":"team","title":"短い敵情報の報告","action":"次の試合3回だけ、場所・人数・移動方向の順で見た情報を報告する。","check":"推測を見た事実と混ぜず伝えられたか。","tags":["cover","timing"],"sourceIds":["riotGuide","training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P044","category":"team","title":"助けが必要な合図","action":"開始前に味方一人へ、カバーが欲しい場面の短い言い方を決める。","check":"困ってから長く説明せず合図できたか。","tags":["cover","participation"],"sourceIds":["riotGuide","training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P045","category":"team","title":"フラッシュの合図合わせ","action":"協力者と投げる合図・顔を向ける方向・出るタイミングを3回合わせる。","check":"味方も巻き込んだ時の理由を一つ直せたか。","tags":["cover","timing","utility"],"sourceIds":["riotGuide","training"],"minutes":3,"requires":"partner","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P046","category":"team","title":"二人の射線を分ける","action":"協力者と交差する射線を作り、互いの射線を塞がない待ち方を3回確認。","check":"同じ一発で二人とも狙われる並びにならなかったか。","tags":["cover"],"sourceIds":["riotGuide","training"],"minutes":3,"requires":"partner","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P047","category":"team","title":"倒された直後の一言","action":"次の死亡1回で、敵の位置と確認できた残り情報だけを短く伝える。","check":"味方の音を妨げる長い解説になっていないか。","tags":["cover","timing"],"sourceIds":["riotGuide","training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P048","category":"team","title":"合流できない理由を分ける","action":"録画の味方接敵1回を止め、壁・距離・守備担当のどれで参加できなかったか書く。","check":"必要な別担当まで放棄する改善案になっていないか。","tags":["participation","cover"],"sourceIds":["riotGuide","training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P049","category":"team","title":"設置者を守る担当","action":"設置を狙う前に、設置者と角を見る役を一つずつ味方と決める。","check":"二人とも設置場所だけを見ていなかったか。","tags":["cover","timing"],"sourceIds":["riotGuide","training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P050","category":"team","title":"作戦を二文で共有","action":"開始前に行き先と仕掛ける合図だけを二文で伝える。最初の3Rで試す。","check":"味方が動き始める前に伝え終えたか。","tags":["timing"],"sourceIds":["riotGuide","training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P051","category":"decision","title":"人数有利の次の一手","action":"録画で味方が先に倒した1Rを止め、待つ・合流・前進の理由を一つずつ挙げる。","check":"有利だから必ず待つという一択にしていないか。","tags":["timing","reset"],"sourceIds":["riotGuide","training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P052","category":"decision","title":"人数不利の勝ち筋","action":"人数不利になった1Rを見て、情報を取る・味方を待つ・勝負する条件を書く。","check":"無理に生存するだけでも突っ込むだけでもないか。","tags":["timing"],"sourceIds":["riotGuide","training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P053","category":"decision","title":"時計を見てから動く","action":"次の試合の中盤3Rで、行動を変える前に時計とスパイク位置を一度確認。","check":"敵を追う目的と時間内の目的を分けられたか。","tags":["timing"],"sourceIds":["riotGuide","training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P054","category":"decision","title":"設置後に勝負する理由","action":"設置後の死亡1回を見て、撃たずに守れた条件と撃つ必要があった条件を書く。","check":"キルが取れたかだけで判断していないか。","tags":["timing","reset"],"sourceIds":["riotGuide","training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P055","category":"decision","title":"セーブとリテイクの比較","action":"不利な設置後1Rを止め、人数・装備・時間を見て二つの案を並べる。","check":"勝敗を知る前の情報で判断できたか。","tags":["timing"],"sourceIds":["riotGuide","training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P056","category":"decision","title":"買い物を味方と合わせる","action":"次の購入3回で、味方の装備と次Rの資金を見て買う・節約を短く相談。","check":"自分一人だけ別の購入方針になっていないか。","tags":["foundation"],"sourceIds":["riotGuide","training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P057","category":"decision","title":"エコの目的を一つ決める","action":"安い装備の1Rで、相手の武器回収・設置・まとまった交戦のどれを狙うか相談。","check":"武器に合わない距離を自分から選んでいないか。","tags":["foundation"],"sourceIds":["riotGuide","training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P058","category":"decision","title":"購入したスキルの使い所","action":"次の購入時に、買うスキルを使いたい場所を一つ言葉にする。","check":"余らせた理由と温存する理由を区別できたか。","tags":["utility"],"sourceIds":["riotGuide","training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P059","category":"decision","title":"相手の傾向を仮説にする","action":"直前3Rで実際に見た相手の動きを一つ書き、次Rは外れた時の案も用意。","check":"一度見ただけの動きを必ず来ると決めていないか。","tags":["timing"],"sourceIds":["riotGuide","training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P060","category":"decision","title":"ローテーションの根拠","action":"移動した1Rを見返し、見た敵・スパイク・味方情報の何で移動したか残す。","check":"推測だけで守備位置を空けたか、必要な移動だったか。","tags":["map","timing"],"sourceIds":["riotGuide","training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P061","category":"utility","title":"定点を一つだけ登録","action":"{{map}}で今使う索敵か妨害の定点を一つ選び、立ち位置と狙いを自分で記録する。","check":"現行マップで5回同じ場所へ届いたか。","tags":["utility","map"],"sourceIds":["riotGuide","sova"],"minutes":4,"requires":"solo","lineups":"learn","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P062","category":"utility","title":"定点の安全な出発点","action":"覚えた定点の立ち位置へ行く道を3回歩き、敵に見える区間を確認。","check":"到達できない時の直接使用案を用意したか。","tags":["utility","map","pressure"],"sourceIds":["riotGuide","sova"],"minutes":4,"requires":"solo","lineups":"learn","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P063","category":"utility","title":"バウンド数の違い","action":"Sovaの矢をカスタムで反射なし・ありで比較し、同じ入口への届き方を確認。","check":"狙いと到達場所を混同せず記録したか。","tags":["utility"],"sourceIds":["sova"],"minutes":4,"requires":"solo","lineups":"learn","agent":"Sova","experimental":false,"evidence":"practice-design"},
   {"id":"P064","category":"utility","title":"索敵の見える範囲","action":"Sovaの索敵を一つ置き、死角と相手が壊せる位置を歩いて確認。","check":"反応がないから敵はいないと決めていないか。","tags":["utility","map"],"sourceIds":["sova"],"minutes":4,"requires":"solo","lineups":"light","agent":"Sova","experimental":false,"evidence":"practice-design"},
   {"id":"P065","category":"utility","title":"遠投しない直接使用","action":"使うスキルを近い安全な場所から直接使い、すぐ銃へ戻す動きを5回。","check":"遠投を待つより味方に間に合う状況はどこか。","tags":["utility","timing"],"sourceIds":["riotGuide","sova"],"minutes":4,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P066","category":"utility","title":"味方の侵入と効果を合わせる","action":"協力者と妨害を使う合図を決め、効果中に入口へ出る動きを3回。","check":"スキルが終わってから味方が入っていないか。","tags":["utility","timing","cover"],"sourceIds":["riotGuide","sova"],"minutes":4,"requires":"partner","lineups":"light","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P067","category":"utility","title":"投げた後の移動","action":"一つの定点から使用後に銃を持ち、味方をカバーする位置へ移る道を歩く。","check":"投げ終えた場所に居続ける必要があったか。","tags":["utility","participation"],"sourceIds":["riotGuide","sova"],"minutes":4,"requires":"solo","lineups":"learn","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P068","category":"utility","title":"定点が使えない時の代案","action":"敵に立ち位置を取られた想定で、直接使う・別地点へ移る案を一つ用意。","check":"覚えた一手が使えなくても役割を続けられたか。","tags":["utility","map"],"sourceIds":["riotGuide","sova"],"minutes":4,"requires":"solo","lineups":"learn","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P069","category":"utility","title":"マップ変更後の再確認","action":"以前使った定点をカスタムで5回再現し、外れたら古いメモへ修正日を付ける。","check":"古い動画だけを根拠に成功したと思っていないか。","tags":["utility","map"],"sourceIds":["riotGuide","sova"],"minutes":4,"requires":"solo","lineups":"learn","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P070","category":"utility","title":"覚える価値を見直す","action":"直近5試合の録画やメモから、練習した定点を実際に使えた場面を数える。","check":"使う機会の少ない暗記より優先する基礎はないか。","tags":["utility","foundation"],"sourceIds":["riotGuide","sova"],"minutes":4,"requires":"solo","lineups":"learn","agent":null,"experimental":false,"evidence":"practice-design"},
   {"id":"P071","category":"role","title":"Omenの置きスモーク","action":"カスタムでマーカーを使って入口の射線を隠し、敵側から見て隙間を確認する。","check":"高さ・位置を直し、味方が入る時に間に合うか。","tags":["utility","map"],"sourceIds":["omen"],"minutes":4,"requires":"solo","lineups":"light","agent":"Omen","experimental":false,"evidence":"practice-design"},
   {"id":"P072","category":"role","title":"Omenの妨害と追従","action":"壁を通るParanoiaの向きと、その後に味方が出る入口を一つ合わせる。","check":"妨害だけで終わらず銃へ戻す手順があるか。","tags":["utility","cover","timing"],"sourceIds":["omen"],"minutes":4,"requires":"solo","lineups":"light","agent":"Omen","experimental":false,"evidence":"practice-design"},
   {"id":"P073","category":"role","title":"Gekkoの設置担当","action":"Wingmanへ設置を指示する位置と、自分がカバーする角をカスタムで一つ決める。","check":"任せた後も敵の射線を管理できるか。","tags":["utility","cover","timing"],"sourceIds":["gekko"],"minutes":4,"requires":"solo","lineups":"light","agent":"Gekko","experimental":false,"evidence":"practice-design"},
   {"id":"P074","category":"role","title":"Gekkoの回収判断","action":"回収したい地点へ行く道を歩き、回収できない時は銃で戦う案も用意。","check":"回収のためだけに危険な射線へ入っていないか。","tags":["utility","pressure"],"sourceIds":["gekko"],"minutes":4,"requires":"solo","lineups":"light","agent":"Gekko","experimental":false,"evidence":"practice-design"},
   {"id":"P075","category":"role","title":"Sageの回復前の安全確認","action":"回復を使う想定から、角を味方へ任せて銃を戻すまでを5回練習する。","check":"回復の対象を見る間の射線は誰が見ていたか。","tags":["utility","cover"],"sourceIds":["sage"],"minutes":4,"requires":"solo","lineups":"light","agent":"Sage","experimental":false,"evidence":"practice-design"},
   {"id":"P076","category":"role","title":"Sageの蘇生カバー","action":"蘇生したい場所を一つ選び、味方が戻る間をカバーする位置を歩いて確認。","check":"蘇生を使えることと安全に戻せることを分けたか。","tags":["utility","cover","timing"],"sourceIds":["sage"],"minutes":4,"requires":"solo","lineups":"light","agent":"Sage","experimental":false,"evidence":"practice-design"},
   {"id":"P077","category":"role","title":"Breachの壁越しフラッシュ","action":"一つの壁を選び、味方に見せない向きと相手が見る角をカスタムで確認。","check":"味方の位置を確認してから使えるか。","tags":["utility","cover","timing"],"sourceIds":["breach"],"minutes":4,"requires":"solo","lineups":"light","agent":"Breach","experimental":false,"evidence":"practice-design"},
   {"id":"P078","category":"role","title":"Cypherの罠と自分の射線","action":"罠を置いた場所へ相手が来る想定で、自分が撃てる角を一つ作る。","check":"反応を得るだけでなく味方へ伝える手順があるか。","tags":["utility","cover","map"],"sourceIds":["cypher"],"minutes":4,"requires":"solo","lineups":"light","agent":"Cypher","experimental":false,"evidence":"practice-design"},
   {"id":"P079","category":"role","title":"Killjoyの装置配置の比較","action":"一つの入口で装置の位置を二通り試し、相手から見える位置を比べる。","check":"装置の情報を生かす待ち場所も決まったか。","tags":["utility","map"],"sourceIds":["killjoy"],"minutes":4,"requires":"solo","lineups":"light","agent":"Killjoy","experimental":false,"evidence":"practice-design"},
   {"id":"P080","category":"role","title":"Reynaのキル依存を確認","action":"Reynaの1試合を見て、敵を倒す前と倒した後で取れた選択肢を分ける。","check":"暗記が少ないことを撃ち合いが簡単なことと混同しない。","tags":["conversion","reset"],"sourceIds":["reyna"],"minutes":4,"requires":"solo","lineups":"light","agent":"Reyna","experimental":false,"evidence":"practice-design"},
   {"id":"P081","category":"review","title":"デス一つを因数分解","action":"最後の死亡一つを録画で見て、照準・移動・味方・相手の位置を別々に書く。","check":"全部をエイム不足という一言で片付けていないか。","tags":["pressure","conversion","foundation"],"sourceIds":["training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"research-limited"},
   {"id":"P082","category":"review","title":"キルが出た準備を保存","action":"良い1キルの直前10秒を見て、先にできていた準備を一つ残す。","check":"結果が良かっただけの無理な行動ではないか。","tags":["repeat"],"sourceIds":["training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"research-limited"},
   {"id":"P083","category":"review","title":"勝敗を隠して判断","action":"ラウンド結果を見る前で録画を止め、その時の情報だけで次の行動を選ぶ。","check":"結果を知ってから都合よく説明していないか。","tags":["timing","foundation"],"sourceIds":["training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"research-limited"},
   {"id":"P084","category":"review","title":"勝ち試合と負け試合の同条件","action":"同じマップ・キャラの勝敗を一つずつ比べ、キル数以外の違いを一つ探す。","check":"相手や担当の違いを本人のミスと決めていないか。","tags":["map","repeat"],"sourceIds":["training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"research-limited"},
   {"id":"P085","category":"review","title":"高ACSの負けを一つ見る","action":"スコアが出た敗戦からキル一つを見て、味方が利用できたタイミングか確認。","check":"敗戦だから無意味なキルだったと決めていないか。","tags":["timing","conversion"],"sourceIds":["training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"research-limited"},
   {"id":"P086","category":"review","title":"ノーキルRの役割を確認","action":"キルのなかった1Rで情報・カバー・設置等の担当を一つ記録する。","check":"キル0を貢献0として評価していないか。","tags":["participation","foundation"],"sourceIds":["training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"research-limited"},
   {"id":"P087","category":"review","title":"味方視点で取り返しを見る","action":"可能ならリプレイで味方視点も見て、同じ相手を撃てる状態だったか確認。","check":"5秒以内の取り返しの有無だけで孤立と決めない。","tags":["cover"],"sourceIds":["training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"research-limited"},
   {"id":"P088","category":"review","title":"一週間の同じ課題を並べる","action":"同じ課題を試した3場面を並べ、できた条件と崩れた条件を各一つ記録。","check":"一試合のKDだけを練習の効果と扱っていないか。","tags":["repeat","foundation"],"sourceIds":["training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"research-limited"},
   {"id":"P089","category":"review","title":"プロの一場面を止めて見る","action":"自分と同じマップ・ロールの公開VODを一場面選び、出る前で止めて次を予測。","check":"プロの設定値のコピーでなく、見ている情報を比べたか。","tags":["map","timing"],"sourceIds":["training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"research-limited"},
   {"id":"P090","category":"review","title":"次の課題を一つに絞る","action":"録画があれば改善候補を3つ書く。記録がなければ「止まって撃つ」等の基本を一つだけ、次の試合で試す課題にする。","check":"試合後に実行したかを一文で振り返れるか。","tags":["foundation"],"sourceIds":["training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"research-limited"},
   {"id":"P091","category":"habit","title":"感度とDPIを記録","action":"今のゲーム内感度とDPIを控え、Aimlabsを使う場合は同じゲーム設定へ合わせる。","check":"実際のマウス移動と画面の回転が合っているか。","tags":["foundation","habits"],"sourceIds":["sensitivity"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"research-limited"},
   {"id":"P092","category":"habit","title":"感度を一度に変えすぎない","action":"試すなら一つの値だけを変更し、同じ短い課題を変更前後で比べる。","check":"最高点だけでなく外れ方と扱いやすさも残したか。","tags":["precision","habits"],"sourceIds":["sensitivity"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"research-limited"},
   {"id":"P093","category":"habit","title":"見やすいクロスヘア","action":"同じ背景のカスタムで色や輪郭を一項目だけ変え、敵位置を見る。","check":"見失いにくさを確認し、他人の設定を正解としない。","tags":["precision","habits"],"sourceIds":["sensitivity"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"research-limited"},
   {"id":"P094","category":"habit","title":"マウスの可動域を確保","action":"普段の位置から左右へ無理なく動かし、机の端やキーボードへ当たる所を確認。","check":"大きな照準移動の途中で持ち直す必要がないか。","tags":["precision","habits"],"sourceIds":["sensitivity"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"research-limited"},
   {"id":"P095","category":"habit","title":"短い練習と実戦を分ける","action":"今日は射撃場3分と実戦の1課題だけを決め、練習後は試合で一度試す。","check":"長時間こなしたことと試せたことを区別できたか。","tags":["foundation","habits"],"sourceIds":["training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"research-limited"},
   {"id":"P096","category":"habit","title":"集中の言い方を試す","action":"同じ簡単な課題で、頭の的を見る意識と手の動きを見る意識を短く比べる。","check":"優劣を決めつけず、自分のミスとやりやすさを残す。","tags":["precision","habits"],"sourceIds":["focusStudy"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":true,"evidence":"research-limited"},
   {"id":"P097","category":"habit","title":"日を分けた再確認","action":"同じ短い練習を別の日にも行い、その場だけでできた動きが残るか確認する。","check":"疲れや武器・環境が違うこともメモしたか。","tags":["repeat","habits"],"sourceIds":["training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"research-limited"},
   {"id":"P098","category":"habit","title":"疲れている時は量を下げる","action":"操作が雑になったと感じたら一度離席し、戻って短い課題で状態を確かめる。","check":"無理に試合数を増やさず、痛みがあれば中止したか。","tags":["habits"],"sourceIds":["training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"research-limited"},
   {"id":"P099","category":"habit","title":"体に合う机周りを試す","action":"痛みのない範囲で椅子・腕の置き場の一つだけを調整し、同じ短い操作を比べる。","check":"力みや届きにくさを減らせたか。身体タイプの診断はしない。","tags":["habits"],"sourceIds":["training"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":false,"evidence":"research-limited"},
   {"id":"P100","category":"habit","title":"4スタンス理論の扱いを確認","action":"興味がある場合だけ提唱元の説明を読み、身体タイプとVALORANT成績の関係を別の話として整理する。","check":"KDからA1等を判定しない。今回の調査ではVALORANTへの有効性は確認できていない。","tags":["habits"],"sourceIds":["fourStance","fourPolicy"],"minutes":3,"requires":"solo","lineups":"light","agent":null,"experimental":true,"evidence":"experimental"}
  ]
 };
 const topicNames={precision:'初弾・照準',conversion:'削りからキル・回収へ',participation:'交戦への参加',pressure:'死亡負担と角の見方',reset:'キル後の仕切り直し',cover:'味方のカバー',timing:'味方と戦うタイミング',repeat:'良い準備の再現',map:'マップ対策',utility:'スキルの使い所',foundation:'基本と振り返り',habits:'設定・練習の組み方'};
 const roleByAgent={Omen:'コントローラー',Gekko:'イニシエーター',Sage:'センチネル',Sova:'イニシエーター',Breach:'イニシエーター',Reyna:'デュエリスト',Cypher:'センチネル',Killjoy:'センチネル'};
 const finite=x=>typeof x==='number'&&Number.isFinite(x);
 function options(input={}){
  return {goal:Object.hasOwn(topicNames,input.goal)?input.goal:'auto',lineups:['light','learn'].includes(input.lineups)?input.lineups:'unknown',partner:input.partner==='duo'?'duo':'solo',minutes:[5,10,20].includes(Number(input.minutes))?Number(input.minutes):10,exploratory:input.exploratory===true,exclude:Array.isArray(input.exclude)?input.exclude.filter(id=>typeof id==='string'&&data.entries.some(e=>e.id===id)).slice(0,100):[]};
 }
 function context(report){
  const p=report?.performance||{},o=p.overall||{};
  const agent=(p.agents||[]).slice().sort((a,b)=>b.matches-a.matches)[0];
  const role=p.timeline?.find(g=>g.agent===agent?.value)?.role||(p.roles||[]).slice().sort((a,b)=>b.matches-a.matches)[0]?.value;
  const maps=(p.maps||[]).filter(m=>m.acsMatches>=5&&finite(m.acs)).slice().sort((a,b)=>a.acs-b.acs);
  return {agent:agent?.value||null,role:role||null,map:maps[0]?.value||p.timeline?.[0]?.map||null,matches:o.matches??o.kdMatches??0};
 }
 const fill=(text,c)=>text.replaceAll('{{map}}',c.map||'次に遊ぶマップ');
 function choose(report,input={},reference='gold'){
  const pref=options(input),c=context(report),p=report?.performance;
  const personal=root.KesoCoachBenchmarks?.personal(p,reference);
  const automatic=c.matches>=5?personal?.focus?.topic:null;
  const latest=report?.matchFeedback?.sessions?.[0];
  const signals=[];
  if(pref.goal!=='auto')signals.push({topic:pref.goal,weight:8,why:'画面で選んだ課題「'+topicNames[pref.goal]+'」'});
  if(automatic&&Object.hasOwn(topicNames,automatic))signals.push({topic:automatic,weight:6,why:'保存済み'+c.matches+'試合と選択した参考群からの仮説「'+topicNames[automatic]+'」'});
  if(latest&&Object.hasOwn(topicNames,latest.topic))signals.push({topic:latest.topic,weight:4,why:'直近1試合の振り返り候補「'+topicNames[latest.topic]+'」'});
  if(!signals.length)signals.push({topic:'foundation',weight:1,why:'記録から弱点を決める前の基本練習。本人のミスの判定ではない'});
  const candidates=data.entries.filter(e=>!pref.exclude.includes(e.id)&&(pref.partner==='duo'||e.requires!=='partner')&&(e.lineups!=='learn'||pref.lineups==='learn')&&(!e.agent||e.agent===c.agent)&&(!e.experimental||pref.exploratory)&&e.minutes<=pref.minutes).map(e=>{
   const matched=signals.filter(s=>e.tags.includes(s.topic));
   const score=matched.reduce((sum,s)=>sum+s.weight,0)+(e.agent&&e.agent===c.agent?2:0);
   return {...e,score,primaryWeight:Math.max(0,...matched.filter(s=>s.topic===e.tags[0]).map(s=>s.weight)),reasons:[...matched.map(s=>s.why),...(e.agent&&e.agent===c.agent?['主な使用キャラ '+c.agent+' の運用練習']:[])],action:fill(e.action,c),check:fill(e.check,c)};
  }).filter(e=>e.score>0).sort((a,b)=>b.score-a.score||b.primaryWeight-a.primaryWeight||a.id.localeCompare(b.id));
  // Choose up to three distinct areas within the total time budget. No random
  // per-person wording, name-based assignment, mastery claims or extra reads.
  const selected=[],used=new Set();let remaining=pref.minutes;
  for(const e of candidates){if(selected.length===3)break;if(used.has(e.category)||e.minutes>remaining)continue;used.add(e.category);remaining-=e.minutes;selected.push(e);}
  return {version:1,context:c,preferences:pref,signals,selected,totalMinutes:pref.minutes-remaining,available:candidates.length,
   rule:'候補の優先度は画面の課題選択8、参考群からの仮説6、直近試合の候補4、使用キャラ一致2、材料がない時の基本1。同点なら各案の主目的に一致する信号の重みを優先し、その後はID順。同じ分野を重ねず最大3件・合計時間内。実力点ではなく練習選択用の規則。',
   quality:'100件は確認した資料の原理をもとにKESOが設計した練習・検証案です。100件の有効性が個別の研究で証明された意味ではありません。回数・時間は準備後に試す目安。実行や上達を自動認定しません。'};
 }
 const agentChoices=[
  {name:'Omen',role:'コントローラー',memory:'light',why:'位置指定のスモークを中心に、遠投定点を増やさず射線管理を試す候補。',burden:'マップ・スモークの高さ・味方が入る時間と、妨害の向きを覚える必要はある。'},
  {name:'Gekko',role:'イニシエーター',memory:'light',why:'Wingmanの設置指示と自分のカバーを中心に、直接的な連携を練習する候補。',burden:'射線の管理と回収判断が必要。ほかのスキルに定点がないという意味ではない。'},
  {name:'Sage',role:'センチネル',memory:'light',why:'味方を対象にする回復と守備担当を中心に、遠投暗記の負担を抑えて試す候補。',burden:'壁・スロウの置き方、射線と蘇生の安全確認は必要。回復だけで役割が終わるわけではない。'},
  {name:'Breach',role:'イニシエーター',memory:'light',why:'壁越しの妨害と味方の出る合図を合わせ、固定の遠投暗記以外の連携を試す候補。',burden:'壁の形と味方の位置、射程、巻き込みを覚える必要がある。'},
  {name:'Sova',role:'イニシエーター',memory:'learn',why:'定点を一つずつ検証するのが好きなら、索敵の範囲・矢の反射を学ぶ候補。',burden:'死角・破壊される位置・使えるタイミングを確認する。矢を撃つだけで担当が終わらない。'},
  {name:'Cypher',role:'センチネル',memory:'learn',why:'配置を比較して準備するのが好きなら、罠の情報と撃つ位置を組み合わせる候補。',burden:'相手の対策やマップに応じた配置変更が必要。定点を覚えれば自動で強いとはしない。'},
  {name:'Killjoy',role:'センチネル',memory:'learn',why:'配置の試行が好きなら、装置の位置と情報を受けた後の動きを練習する候補。',burden:'装置の有効条件や自分の射線を覚える。古いセットアップの再確認も必要。'},
  {name:'Reyna',role:'デュエリスト',memory:'light',why:'遠投暗記を減らし、キル後の選択へ集中する試用候補。',burden:'キルに依存するため、低KDの解決として勧めない。エントリー・味方との連携は別途必要。'}
 ];
 function agents(report,input={}){
  const pref=options(input),c=context(report),o=report?.performance?.overall;
  if(pref.lineups==='unknown')return {status:'preference-needed',context:c,items:[],note:'暗記の好みは戦績から分かりません。「定点の暗記」を選ぶと同じロールの試用候補を表示します。'};
  const items=agentChoices.filter(a=>a.memory===pref.lineups&&a.role===c.role&&(a.name!=='Reyna'||o?.kdMatches>=5&&finite(o.kd)&&o.kd>=1)).map(a=>({...a,sourceId:a.name.toLowerCase()}));
  return {status:items.length?'trial':'keep-current',context:c,items,note:items.length?'同じロールでの試用候補です。本人が所有・使用できるかは未確認。定点不要・暗記不要のキャラという判定ではありません。':'好みとロールに合う検証済み候補は今の一覧にありません。現在のキャラの基本運用を優先し、低いKDだけでキャラ変更を勧めません。'};
 }
 function browse(category='aim',query=''){
  const q=String(query).trim().toLowerCase().slice(0,80);
  return data.entries.filter(e=>(category==='all'||e.category===category)&&(!q||[e.title,e.action,e.check,...e.tags.map(t=>topicNames[t]||t)].join(' ').toLowerCase().includes(q)));
 }
 root.KesoCoachPractice=Object.freeze({...data,topicNames,choose,agents,browse,fill});
})(globalThis);
