/* Complete in-Activity beginner guide; no wallet or game mutations. */
export const CATEGORIES=[
  {
    "id": "first",
    "label": "まず最初に"
  },
  {
    "id": "earn",
    "label": "KPを稼ぐ"
  },
  {
    "id": "play",
    "label": "勝負して増やす"
  },
  {
    "id": "casino",
    "label": "カジノ7種"
  },
  {
    "id": "spend",
    "label": "KPを使う"
  },
  {
    "id": "manage",
    "label": "口座・確認"
  }
];
export const TOPICS=[
  {
    "id": "intro",
    "title": "まずはここから",
    "group": "first",
    "lead": "KESO PLAYはDiscordの仲間と共通のKPを稼ぎ、勝負や指名、コレクションに使うゲームだ。最初は「稼ぐ」から始めると分かりやすい。",
    "steps": [
      "タイトルから「はじめる／つづける」を押す。Discord Activityなら基本的に本人のKP口座へ接続される。",
      "画面下部の「稼ぐ・遊ぶ・使う・資産」を確認する。ホームの大きなメニューからも移動できる。",
      "まず「稼ぐ」で報酬の条件を確認し、受け取ったKPで好きなモードを試す。",
      "迷ったら画面右下の「？ 遊び方」を押す。今開いているモードの説明が表示される。"
    ],
    "tip": "ガイドを読むだけではKPを使わない。別のゲームへ行くボタンも決済操作ではない。",
    "cautions": [
      "KPはゲーム内ポイントで、現金や現実の商品とは交換できない。",
      "初めての人は大きな金額を賭ける前に、そのゲームの損失条件を確認する。"
    ],
    "screen": "home"
  },
  {
    "id": "kp",
    "title": "KP・本番口座・デモ",
    "group": "first",
    "lead": "KPはゲーム内の共通ポイント。本番口座と「デモで試す」のポイントは別物だ。",
    "steps": [
      "Discord Activityから起動し、本人の口座に自動接続できたか確認する。",
      "本番口座なら試合報酬、株、馬、カジノなどの取引・記録がサーバーに保存される。",
      "デモは操作を試すための端末内データ。本番のKPは増えない。",
      "残高や株式評価額、入出金の状況は「資産」で確認する。"
    ],
    "tip": "残高がマイナス相当になったときの「借KP」は自動返済や利用制限がある。資産画面の表示を確認しよう。",
    "cautions": [
      "接続中・通信結果確認待ちでは操作を連打せず、残高と履歴の確定を待つ。",
      "ページを閉じても本番のサーバー口座は基本的に保持されるが、デモの保存状況は端末による。"
    ],
    "screen": "assets"
  },
  {
    "id": "home",
    "title": "ホーム",
    "group": "first",
    "lead": "最初に戻る場所。残高、指令、各ゲームへの入口がまとまっている。",
    "steps": [
      "上段の保有KPと発令中の指令件数を見る。",
      "「稼ぐ」「競馬」「カジノ」「株」「指名」「馬主」「高級品」「遺物」から行きたい場所を選ぶ。",
      "試合やコミュニティの状況は表示されている欄を開いて確認する。"
    ],
    "tip": "迷ったらホームに戻り、何がしたいかで入口を選ぶ。",
    "cautions": [
      "ホームに表示されるKPは、デモと本番口座で異なる。"
    ],
    "screen": "home"
  },
  {
    "id": "earn",
    "title": "稼ぐ：試合・通話・QUIZ・Steam",
    "group": "earn",
    "lead": "KPを獲得する中心メニュー。VALORANTの戦績、通話、外部ゲームの達成状況などで報酬を得る。",
    "steps": [
      "画面下の「稼ぐ」を開き、今の報酬表や参加条件を確認する。",
      "VALORANTでは対象試合の結果に応じてKPが増減し、速報や口座への反映に少し時間がかかる場合がある。",
      "通話・VCT QUIZ・KESO LOOP・Steam連携などは、各欄に表示された条件を満たす。",
      "支給されたKPは「資産」で確認。未反映なら重複申請せず、入出金履歴を見直す。"
    ],
    "tip": "VCT QUIZやKESO LOOPは専用画面へ移動できる。Steamは対象実績や連携状況、日次上限に注意。",
    "cautions": [
      "勝敗や成績によって減額されるモードがある。",
      "デモの「確認して支給」は実際の戦績の検証ではない。",
      "毎日の上限・例外条件・報酬額は変わる場合があるので、実際の稼ぐ画面の最新表示を優先する。"
    ],
    "screen": "play"
  },
  {
    "id": "voice",
    "title": "Discord通話で稼ぐ",
    "group": "earn",
    "screen": "play",
    "lead": "対象サーバーの通常ボイスチャンネルに参加した時間に応じて、KPを受け取る。Activityを開いていなくても対象になる。",
    "steps": [
      "Discordの対象サーバーで通常のボイスチャンネルに参加する。",
      "「稼ぐ」画面の「通話で稼ぐ」で、計測中かどうか・今日の受取額を確認する。",
      "5分単位でKPが加算される。上限に達したら、翌日の更新を待つ。"
    ],
    "tip": "ミュート中や1人での滞在も対象だ。今日の上限と単位報酬は稼ぐ画面で分かる。",
    "cautions": [
      "Bot、AFK、ステージチャンネルは対象外。",
      "接続準備中・監視再接続中と表示されている場合は加算状況を確認する。",
      "1日の上限は日本時間の朝9時更新。"
    ]
  },
  {
    "id": "valorant",
    "title": "VALORANTの試合で稼ぐ",
    "group": "earn",
    "screen": "play",
    "lead": "コンペ・アンレ・スパイクラッシュなどの対象試合結果を、アカンbotが確認してKPへ反映する。",
    "steps": [
      "Discordの自分のゲームアカウントが連携対象か確認する。",
      "対象のVALORANTモードでプレイする。勝敗や成績が確定したら速報を確認する。",
      "「稼ぐ」でモード別報酬・特殊ルールを読み、入出金履歴で増減を確認する。"
    ],
    "tip": "勝つと増えるモードだけではなく、成績ボーナスやランダム補正のあるモードもある。",
    "cautions": [
      "負け・味方最下位・一部抽選でKPが減る場合がある。",
      "同一試合の報酬は重複しない。反映には数分かかる場合がある。",
      "指名達成条件は通常の試合報酬とは別に判定される。"
    ]
  },
  {
    "id": "spike",
    "title": "スパイクラッシュ・ロール覚醒",
    "group": "earn",
    "screen": "play",
    "lead": "スパイクラッシュでは試合履歴やロールの覚醒状態によって、KPの受取が変わる。",
    "steps": [
      "スパイクラッシュをプレイし、まず自分のロール別進捗を確認する。",
      "Discordで「/spike status」を使い、条件の達成状況や現在の状態を見る。",
      "ヒントが必要なら「/spike hint」の説明を読む。秘密の条件があり、すべては公開されていない。",
      "覚醒後の効果・付与された遺物の補正は、試合報酬や入出金の内訳で確認する。"
    ],
    "tip": "ロールごとの条件や強化段階があり、いつでも同じKPがもらえるわけではない。",
    "cautions": [
      "非公開の覚醒条件を外部ガイドで勝手に明かさない。",
      "ヒントの購入にはKPが必要な場合がある。必ずコマンドの案内を確認してから実行する。",
      "報酬や補正は調整されるため、数値は最新のステータスと入出金を優先する。"
    ]
  },
  {
    "id": "death",
    "title": "デスマ・スイフト・チーデスなど",
    "group": "earn",
    "screen": "play",
    "lead": "通常のコンペ以外にもKP対象のモードがある。ただし全モードが無条件支給ではない。",
    "steps": [
      "「稼ぐ」画面の報酬表と「細かいルール」を開く。",
      "デスマッチは順位や40キル到達、K/Dなど、対象条件を確認してから挑戦する。",
      "スイフトは特定の勝ち方、チーデスはキル数・K/Dなど条件付きで報酬になる。",
      "結果確定後、速報と入出金履歴で支給または減額を確認する。"
    ],
    "tip": "一部モードには毎日の挑戦回数や成績条件がある。何の条件で報酬が出たかを意識しよう。",
    "cautions": [
      "条件を満たさない試合は報酬0の場合がある。",
      "負けやK/Dによって減額となるモードもある。",
      "カスタムマッチは現状の対象外として画面に案内されている。"
    ]
  },
  {
    "id": "escalation",
    "title": "エスカレーション・特別抽選",
    "group": "earn",
    "screen": "play",
    "lead": "エスカレーションの戦績には条件付き成績報酬があり、特別な大勝負抽選が発生する場合がある。",
    "steps": [
      "対象のエスカレーションをプレイし、勝敗と成績を確定させる。",
      "「稼ぐ」の「エスカレーション・大勝負抽選」で履歴を確認する。",
      "対象の結果があれば「ルーレットを見る」で演出を再生する。",
      "試合報酬と特別抽選のKP増減は入出金履歴で確認する。"
    ],
    "tip": "抽選はサーバーで一度だけ確定している。画面のルーレットは結果の表示演出だ。",
    "cautions": [
      "大勝負では敗北時にKPが減ることがある。",
      "超アンラッキーでは保有KPが大きく減るケースがある。",
      "演出の再生やスキップで再抽選・重複支給は起こらない。"
    ]
  },
  {
    "id": "quiz",
    "title": "VCT QUIZで稼ぐ",
    "group": "earn",
    "screen": "play",
    "lead": "VALORANTの知識クイズを最後までプレイして、対象回数までKPを獲得する。",
    "steps": [
      "「稼ぐ」→「VCT QUIZへ」を開く。",
      "Discordログインで対象アカウントを接続し、好きなクイズモードを選ぶ。",
      "途中退出せず最後までプレイし、終了後に支給状況を確認する。",
      "Activityの「稼ぐ」でモード別の受取済み表示や回数を確認する。"
    ],
    "tip": "ランクマッチは原則1日10回、他の対象モードは1日1回。更新は朝9時だ。",
    "cautions": [
      "途中退出・対象外の再挑戦は報酬にならない。",
      "支給回数や額は各モードの画面を確認する。"
    ]
  },
  {
    "id": "steam",
    "title": "Steam実績で稼ぐ",
    "group": "earn",
    "screen": "play",
    "lead": "対象の有料Steamゲームの新しい実績解除を確認してKPを得る。登録や監視設定が必要だ。",
    "steps": [
      "「稼ぐ」→「Steam実績で稼ぐ」から公式Steamログインへ進む。",
      "帰ってきたら接続先のSteamアカウントを確認し、自分のものなら接続を確定する。",
      "プロフィール・ゲーム詳細を公開し、「所持ゲームから選ぶ」で監視するゲームを選択する。",
      "ゲームで新しい実績を解除し、監視状況・日次残額・入出金履歴を確認する。"
    ],
    "tip": "対象は有料販売中・累計プレイ120分以上のゲーム。最大5本を同時監視でき、解除率が低い実績ほど報酬が高い。",
    "cautions": [
      "監視開始前に解除済みだった実績は対象外。",
      "無料・基本無料・無料配布中・体験版・DLCなどは対象外。",
      "1日あたりの受取上限（現在の表示では全ゲーム合計5,000 KP）は翌日に繰り越さない。",
      "監視・支給の有効化が準備中と表示される場合はKPが入金されない。"
    ]
  },
  {
    "id": "loop",
    "title": "KESO LOOPで稼ぐ",
    "group": "earn",
    "screen": "play",
    "lead": "別ゲームのKESO LOOPで初めて到達したステージや章の進行が、条件付きのKP報酬になる。",
    "steps": [
      "「稼ぐ」→「KESO LOOPを開く」を押す。",
      "KESO LOOP内の「セーブデータ → KP報酬」でDiscordアカウントを接続する。",
      "「KP対象の進行で遊ぶ」を選び、初回突破・初回クリアを目指す。",
      "KESO LOOP側の「KP報酬」で達成記録と入金状況を確認する。"
    ],
    "tip": "初回達成の報酬は大きいが、各章につきDiscordアカウントごとに1回の条件だ。",
    "cautions": [
      "端末内の通常セーブでの進行は対象外。",
      "連携できていても自動入金が準備中の場合がある。",
      "何度もクリアしても初回報酬が繰り返し支給されるわけではない。"
    ]
  },
  {
    "id": "unite",
    "title": "ポケモンユナイト連携",
    "group": "earn",
    "screen": "play",
    "lead": "連携されたユナイトの勝敗をもとに、連勝・連敗に応じたKPが増減する。",
    "steps": [
      "対応するDiscordアカウント・ゲームアカウントの連携状況を確認する。",
      "対象のポケモンユナイトの試合をプレイし、勝敗を確定させる。",
      "「稼ぐ」の詳細ルールと、資産または入出金履歴の「ユナイト」項目を見る。"
    ],
    "tip": "連勝で報酬が増え、連敗が続くと減額が大きくなる仕様がある。上限や倍率は最新の報酬ルールを確認しよう。",
    "cautions": [
      "すべてのモード・すべての試合が対象とは限らない。",
      "負けた際はKPが減ることがある。"
    ]
  },
  {
    "id": "skirmish",
    "title": "スカーミッシュ（2対2）",
    "group": "earn",
    "screen": "play",
    "lead": "連勝報酬を受け取るか、さらに勝ち進んで増やすかを選ぶモード。",
    "steps": [
      "2対2の対象試合で連勝し、報酬を保留する。",
      "Discordの「/kp balance」で保留中の額を確認する。",
      "ここで受け取るか、次の試合へ続行するかを選ぶ。",
      "続行を選んだ場合は、次の試合結果に応じて保留額が更新される。"
    ],
    "tip": "負ける前に確定すればその時点の保留報酬を守れる。",
    "cautions": [
      "続行して敗北すると保留報酬が0になる。",
      "保留額が失われても口座にあるKPが直接引かれるわけではない。",
      "次の試合前に受取・続行を選ぶ必要がある。"
    ]
  },
  {
    "id": "others",
    "title": "雀魂など外部ゲーム連携",
    "group": "earn",
    "screen": "play",
    "lead": "雀魂などの外部ゲームの支給・減額も、サーバーが確認した場合はKPの入出金履歴に記録される。",
    "steps": [
      "Discordで案内されている対象ゲームとアカウント連携・報酬条件を確認する。",
      "対象の対局や試合を終了し、結果を確定させる。",
      "Activityの「稼ぐ」や入出金履歴で反映状況を見る。",
      "結果が見つからない場合は、Discord側の連携・対象条件を確認する。"
    ],
    "tip": "VALORANT以外の報酬も共通KPに入るため、獲得KPは競馬や遺物などでも使える。",
    "cautions": [
      "ゲームごとに集計・反映条件が異なる。",
      "対象外の結果や二重報告では追加支給されない。"
    ]
  },
  {
    "id": "race",
    "title": "競馬：馬券を買って観戦",
    "group": "play",
    "lead": "出走馬の着順を予想して馬券を購入する。レースと結果をみんなで共有できる。",
    "steps": [
      "画面下「遊ぶ」→「競馬」を選ぶ。次の発走時刻と締切までの残り時間を見る。",
      "「単勝（1着を当てる）」や「複勝（3着以内を当てる）」など、画面にある馬券の種類を選ぶ。",
      "馬と掛け金を選び、倍率と払戻見込みを確認してから購入する。",
      "発走後はレースを観戦。終了後の着順・的中・精算を確認する。"
    ],
    "tip": "出走馬やオッズ、馬場・距離などの情報を見比べるのが醍醐味だ。馬券を買わなくてもレースを見られる場面がある。",
    "cautions": [
      "締切後の購入はできない。画面に出ている締切時刻を優先する。",
      "外れれば掛け金を失う。払戻額と利益は違い、利益は払戻額から掛け金を引いた額だ。",
      "購入上限は他の予想モードと合算の場合がある。最新の残額表示を確認する。",
      "レースの開催・不成立・結果確定の扱いは現在のゲーム画面を優先する。"
    ],
    "screen": "race"
  },
  {
    "id": "mleague",
    "title": "Mリーグ：ラスの選手を予想",
    "group": "play",
    "lead": "Mリーグ公式戦の各半荘で、4着（ラス）になる選手を予想する。",
    "steps": [
      "「遊ぶ」→「Mリーグ」を選び、対象の対局と選手を確認する。",
      "「ラスになりそうな選手」を1人選ぶ。",
      "掛け金を入力し、表示された確定倍率・予想内容を見直す。",
      "確認画面で購入を確定。対局結果の反映後に的中・払戻を確認する。"
    ],
    "tip": "100 KP以上、100 KP単位の入力。倍率は購入時に確定する。",
    "cautions": [
      "1位を当てるゲームではなく、最下位（4着）を予想するゲームだ。",
      "競馬との合算購入上限、販売締切、対象となる対局は画面を確認する。",
      "不的中では掛け金を失う。"
    ],
    "screen": "mleague"
  },
  {
    "id": "casino",
    "title": "カジノ：7つのゲーム",
    "group": "play",
    "lead": "ルーレット、チンチロ、ブラックジャック、マインズ、スロット、ポーカー、バカラから選ぶ。",
    "steps": [
      "「遊ぶ」→「カジノ」を開く。",
      "画面上のゲーム切替ボタンから遊びたいものを選ぶ。",
      "各ゲームの賭け金と操作方法を確認する。",
      "結果と差し引きKPを確認してから次の勝負へ進む。"
    ],
    "tip": "初心者はルーレットの赤・黒、またはバカラから始めると操作を覚えやすい。",
    "cautions": [
      "見た目の倍率は、多くの場合「掛け金込みの払戻倍率」だ。",
      "チンチロのように掛け金より大きく損をする場合がある。",
      "連打で再購入しないよう、処理中は画面の結果を確認する。"
    ],
    "screen": "casino",
    "game": "roulette"
  },
  {
    "id": "roulette",
    "title": "ルーレット",
    "group": "casino",
    "lead": "0〜36のうちどの数字が出るかを予想する。赤黒や偶奇でも賭けられる。",
    "steps": [
      "「カジノ」→「ルーレット」を選ぶ。",
      "赤／黒、奇数／偶数、1〜18／19〜36、ダズン、列、数字指定などの予想方法を選ぶ。",
      "掛け金を入力する。数字指定では盤面の数字をタップし、数字ごとに設定する。",
      "「ルーレットを回す」を押して結果と払戻を確認する。"
    ],
    "tip": "赤黒・偶奇などは2倍、ダズン・列は3倍、数字指定は36倍（いずれも掛け金込み）。",
    "cautions": [
      "0は緑色で、赤黒・偶奇などには入らない。",
      "数字指定は複数選択できるが、合計掛け金に上限がある。",
      "外れた賭け金は戻らない。"
    ],
    "screen": "casino",
    "game": "roulette"
  },
  {
    "id": "chinchiro",
    "title": "チンチロ",
    "group": "casino",
    "lead": "親（KESO）とあなたがサイコロ3個で役を作って勝負する。",
    "steps": [
      "「カジノ」→「チンチロ」を選ぶ。",
      "賭け金と手持ちKPを確認する。",
      "「サイコロを振る」を押す。親が先に振り、条件に応じてあなたの番になる。",
      "ピンゾロ・ゾロ目・シゴロなどの役と、勝敗によるKP増減を見る。"
    ],
    "tip": "ピンゾロは5倍、ゾロ目は3倍、シゴロは2倍の強い役だ。役の詳細はゲーム内「役と倍率」で確認できる。",
    "cautions": [
      "最大で賭け金の5倍を失う可能性があるため、賭け金の5倍以上の所持KPが必要だ。",
      "結果の演出はスキップできるが、抽選や決済はやり直されない。"
    ],
    "screen": "casino",
    "game": "chinchiro"
  },
  {
    "id": "blackjack",
    "title": "ブラックジャック",
    "group": "casino",
    "lead": "手札の合計を21に近づけ、21を超えずにディーラーに勝つカードゲーム。",
    "steps": [
      "「カジノ」→「ブラックジャック」を選んで賭け金を入力する。",
      "カードが配られたら合計点を確認する。",
      "「ヒット」で1枚引く／「スタンド」でそのまま勝負する。条件を満たす初手では「ダブル」も選べる。",
      "ディーラーの手札と比べ、勝ち・負け・引き分けを確認する。"
    ],
    "tip": "最初の2枚で21になるブラックジャックは通常の勝ちより高い2.5倍の払戻だ。",
    "cautions": [
      "21を超えたらバーストで負ける。",
      "ダブルは追加で賭け金を出す操作。残高と効果を確かめてから押す。"
    ],
    "screen": "casino",
    "game": "blackjack"
  },
  {
    "id": "mines",
    "title": "マインズ",
    "group": "casino",
    "lead": "5×5の盤面で地雷を避けながら、安全なマスを開くほど払戻倍率が上がる。",
    "steps": [
      "「カジノ」→「マインズ」を選ぶ。",
      "掛け金と地雷の個数を決めて「はじめる」。",
      "まだ開いていないマスを1個ずつタップする。安全なら倍率が上がる。",
      "好きなタイミングで「降りる」を押すと、その倍率で払戻が確定する。"
    ],
    "tip": "地雷が多いほど当たりにくいが、倍率が大きくなる。まずは安全に1マス開けるところから。",
    "cautions": [
      "地雷を1個でも踏むとその勝負の賭け金を失う。",
      "次のマスを開ける前に、今の払戻額を確認すると判断しやすい。"
    ],
    "screen": "casino",
    "game": "mines"
  },
  {
    "id": "slot",
    "title": "スロット",
    "group": "casino",
    "lead": "リールを回して絵柄を揃えるシンプルな勝負。共有ジャックポットもある。",
    "steps": [
      "「カジノ」→「スロット」を選ぶ。",
      "賭け金を入力して「回す」を押す。",
      "止まった絵柄と配当表を確認する。",
      "本番口座では共有ジャックポットの金額・獲得条件も確認する。"
    ],
    "tip": "同じ絵柄3個、または特定の組み合わせに配当がある。配当表はゲーム画面に表示される。",
    "cautions": [
      "回すたびに賭け金を消費する。",
      "ジャックポット全額獲得には掛け金の条件がある。表示された条件を確認する。",
      "共有ジャックポットはデモ口座では対象外だ。"
    ],
    "screen": "casino",
    "game": "slot"
  },
  {
    "id": "poker",
    "title": "ビデオポーカー",
    "group": "casino",
    "lead": "5枚のカードから残すカードを選び、1回交換してポーカーの役を作る。",
    "steps": [
      "「カジノ」→「ポーカー」を選ぶ。",
      "賭け金を入力し「配る」を押す。",
      "残したいカードをタップして「HOLD」にする。選ばなかったカードが交換される。",
      "「交換する」で役と払戻が確定する。"
    ],
    "tip": "ジャック以上のワンペアから払戻があり、強い役ほど倍率が上がる。",
    "cautions": [
      "交換は1回だけ。",
      "役の倍率は画面の配当表を確認する。"
    ],
    "screen": "casino",
    "game": "poker"
  },
  {
    "id": "baccarat",
    "title": "バカラ",
    "group": "casino",
    "lead": "プレイヤー側とバンカー側のどちらが9に近くなるか、または引き分けを予想する。",
    "steps": [
      "「カジノ」→「バカラ」を選ぶ。",
      "賭け金を入力し、プレイヤー／バンカー／引き分けのどれかを押す。",
      "自動でカードが配られる。",
      "どちらが勝ったかと払戻を確認する。"
    ],
    "tip": "プレイヤー2倍、バンカー1.95倍、引き分け9倍の払戻（掛け金込み）。",
    "cautions": [
      "プレイヤー／バンカーに賭けて引き分けになった場合は返金となる。",
      "選んだ側が負ければ掛け金を失う。"
    ],
    "screen": "casino",
    "game": "baccarat"
  },
  {
    "id": "market",
    "title": "株：架空銘柄の売買",
    "group": "play",
    "lead": "KESO TOWN内の架空株を売り買いする。全員共通の相場が動く。",
    "steps": [
      "「遊ぶ」→「株」を開き、銘柄一覧と値動きを確認する。",
      "気になる銘柄をタップしてチャートを読む。",
      "「買う」または「売る」を選び、銘柄と株数を入力する。",
      "手数料・支払／受取見込みを確認してから注文する。保有株と損益は「資産」で確認する。"
    ],
    "tip": "本番口座では株価は共通の5分相場。条件を満たした保有株に配当や株主優待が付く場合がある。",
    "cautions": [
      "株価が下落すると評価額が下がる。売買には手数料がかかる。",
      "取引の数量が価格に影響する場合がある。見込み金額が変わった際は注文が止まることがある。",
      "現実の株式・市場とは連動していない。"
    ],
    "screen": "market"
  },
  {
    "id": "directives",
    "title": "指名：仲間に指令を出す",
    "group": "spend",
    "lead": "KPを使って特定のメンバーにゲームの課題を出す機能。",
    "steps": [
      "「使う」→「指名」を開く。",
      "対象のメンバーを選び、指令の内容を選ぶ。",
      "必要KP・達成条件を読み、発令ボタンを押す。",
      "発令中の指令と達成状況を同じ画面で確認する。"
    ],
    "tip": "ゲームモードやソロ判定など、指令ごとに細かい達成条件がある。発令前に必ず確認する。",
    "cautions": [
      "指令の発令時点でKPを消費し、達成されても発令費用は返ってこない。",
      "同じ相手への未達成指令は原則1件まで。",
      "本番口座では対象者に通知されるが、デモ指令は外部に送信されない。"
    ],
    "screen": "directives"
  },
  {
    "id": "stable",
    "title": "馬主：自分の馬を育てる",
    "group": "spend",
    "lead": "馬を迎え入れ、出走・賞金・二つ名などを楽しむモード。",
    "steps": [
      "「使う」→「馬主」を開く。",
      "ボックスや購入条件を確認し、迎え入れる馬を選ぶ。",
      "保有馬の出走・成績・賞金などを確認する。",
      "必要に応じて馬の売却・引退などの管理を行う。"
    ],
    "tip": "競馬の「馬券を買う」と、馬主として「馬を持つ」は別の機能だ。",
    "cautions": [
      "馬の購入・売却にはKPの増減が伴う。確定前に対象馬と金額を見直す。",
      "馬主機能は本番口座が必要だ。"
    ],
    "screen": "stable"
  },
  {
    "id": "shop",
    "title": "高級品：特別な使い道",
    "group": "spend",
    "lead": "貯めたKPで称号・冠レースなど、特別な効果を持つ高級品を購入する。",
    "steps": [
      "「使う」→「高級品」を開く。",
      "商品一覧で価格・条件・効果を読む。",
      "購入する商品を選び、対象メンバーや入力項目があれば指定する。",
      "最終確認で支払KPと内容を見直してから確定する。"
    ],
    "tip": "高級品は見た目の演出やサーバー内の遊びを盛り上げる長期目標になる。",
    "cautions": [
      "デモでは商品一覧のプレビューのみで、本番KPを使う購入はできない。",
      "購入確認は取り消しではなく支払い直前の最終確認。意図しない購入を避けよう。"
    ],
    "screen": "shop"
  },
  {
    "id": "relics",
    "title": "遺物：図鑑で装備・効果を試算",
    "group": "spend",
    "lead": "召喚や限定報酬で遺物を集め、図鑑から4枠に装備する。装備後の追加KPはビルドで試算できる。",
    "steps": [
      "「使う」→「遺物」を開く。上部には「図鑑・装備」「ビルド・試算」「召喚」「欠片・交換所」「記録・限定」がある。",
      "「召喚」で遺物を集める。1回200KPで、レアごとの排出率も確認できる。Steam・ユナイト限定遺物は「記録・限定」から獲得する。",
      "「図鑑・装備」で効果を比べ、先に装備する枠（1〜4）を選ぶ。遺物カードの「効果の詳細・装備」を開き、「指定枠に装備」を押す。",
      "「ビルド・試算」で現在の4枠と追加KPを確認する。おまかせ装備、プリセットの保存・切替もここで行える。",
      "被った通常遺物は「欠片・交換所」で欠片に変え、伝説以下の遺物やMy馬引換券と交換できる。召喚履歴や限定遺物は「記録・限定」で確認する。"
    ],
    "tip": "基本は図鑑で比較して手動装備。迷ったら「ビルド・試算」のおまかせ装備を使い、モード別の実効倍率を比べよう。",
    "cautions": [
      "召喚は1回200 KP。10連・100連・1000連は合計額を確かめてから押す。",
      "レアリティごとの排出率は異なり、高レア確定の天井がないものもある。",
      "赤い「代償」を持つ遺物は、ほかの効果を弱める場合がある。図鑑での所持だけでは発動せず、装備したうえで各効果の条件を満たす必要がある。"
    ],
    "screen": "relics"
  },
  {
    "id": "assets",
    "title": "資産：残高・株・履歴を見る",
    "group": "manage",
    "lead": "持っているKPと株、入出金・口座状態を確認する画面。",
    "steps": [
      "画面下の「資産」を開く。",
      "保有KP・株式評価額・純資産を確認する。",
      "保有株と取引履歴、利用可能な履歴・口座情報を確認する。",
      "借KPや通信確認待ちなどの表示があれば、状況を確かめる。"
    ],
    "tip": "カジノや株で増減した額が分からなくなったら、まず資産と各モードの履歴を確認する。",
    "cautions": [
      "借KPが残っていると、一部の購入や勝負が制限される。",
      "デモの「テストKP補充」は実際にKPを稼ぐ方法ではない。"
    ],
    "screen": "assets"
  }
];
export const TOUR=[
  {
    "badge": "STEP 1 / 5",
    "title": "ようこそ、KESO PLAYへ",
    "body": "仲間と一緒にKPを稼ぎ、競馬・カジノ・株で増やし、指名・馬主・遺物などに使うゲームだ。"
  },
  {
    "badge": "STEP 2 / 5",
    "title": "KPはゲーム内のお金",
    "body": "KPはゲーム内のポイント。増えることも減ることもある。現実のお金とは交換できず、デモと本番の口座も別だ。"
  },
  {
    "badge": "STEP 3 / 5",
    "title": "まずは「稼ぐ」を見る",
    "body": "試合、通話、VCT QUIZ、Steamなどの条件を満たすと報酬を得られる。どの方法が自分に合うか確認しよう。"
  },
  {
    "badge": "STEP 4 / 5",
    "title": "勝負と使い道がある",
    "body": "遊ぶ：競馬・Mリーグ・カジノ・株。使う：指名・馬主・高級品・遺物。まずは少額から仕組みを把握しよう。"
  },
  {
    "badge": "STEP 5 / 5",
    "title": "どこでも「？ 遊び方」",
    "body": "ガイドは何度でも開ける。各ページの手順と注意点を読んで、そのゲームの画面へ移動できる。"
  }
];

export const CASINO_GAME_IDS = ['roulette','chinchiro','blackjack','mines','slot','poker','baccarat'];
export function topicById(id){return TOPICS.find(t=>t.id===id)||TOPICS[0];}
export function guideTopicForScreen(screen,casinoGame='roulette'){
 if(screen==='casino')return CASINO_GAME_IDS.includes(casinoGame)?casinoGame:'casino';
 return ({title:'intro',play:'earn',race:'race',mleague:'mleague',market:'market',directives:'directives',stable:'stable',shop:'shop',relics:'relics',assets:'assets',home:'intro'})[screen]||'intro';
}
const STORAGE_KEY='keso-guide-first-tour-20261103-v1';
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeStore={get(){try{return localStorage.getItem(STORAGE_KEY)==='1';}catch{return false;}},set(){try{localStorage.setItem(STORAGE_KEY,'1');}catch{}}};
function setupGuide(){
 const app=document.getElementById('app');if(!app)return;
 const trigger=document.createElement('button');
 trigger.id='keso-guide-trigger';trigger.className='keso-guide-trigger';
 trigger.type='button';trigger.innerHTML='<b aria-hidden="true">?</b><span>遊び方</span>';
 trigger.setAttribute('aria-haspopup','dialog');
 const mount=document.createElement('div');mount.id='keso-guide-root';
 document.body.append(trigger,mount);
 let open=false,topicId='intro',isTour=false,tourIndex=0,query='',autoPrompted=false,firstTour=false,previousFocus=null,previousOverflow='';
 let seen=safeStore.get();
 const heading=id=>topicById(id).title;
 const escape=escapeHtml;
 function groupsOptions(){
  return CATEGORIES.map(g=>'<optgroup label="'+escape(g.label)+'">'+TOPICS.filter(t=>t.group===g.id).map(t=>'<option value="'+escape(t.id)+'"'+(topicId===t.id?' selected':'')+'>'+escape(t.title)+'</option>').join('')+'</optgroup>').join('');
 }
 function results(){
  const q=query.trim().toLowerCase();
  const all=q?TOPICS.filter(t=>[t.title,t.lead,...t.steps,...t.cautions].join(' ').toLowerCase().includes(q)):['intro','earn','race','casino','market','relics'].map(topicById);
  return all.length?all.map(t=>'<button class="keso-guide-result" type="button" data-guide-topic="'+t.id+'" aria-current="'+(topicId===t.id?'page':'false')+'">'+escape(t.title)+'</button>').join(''):'<p class="keso-guide-hint">該当する項目がない。別の言葉で探してみよう。</p>';
 }
 function article(){
  if(isTour){
   const step=TOUR[tourIndex];
   return '<p class="keso-guide-eyebrow">初回チュートリアル</p><h2 class="keso-guide-title" id="keso-guide-heading">まずは5つだけ覚えよう</h2>'+
    '<div class="keso-guide-progress" aria-label="'+(tourIndex+1)+' / '+TOUR.length+'">'+TOUR.map((_,i)=>'<span class="'+(i<=tourIndex?'active':'')+'"></span>').join('')+'</div>'+
    '<div class="keso-guide-tourbox"><em>'+escape(step.badge)+'</em><strong>'+escape(step.title)+'</strong><p>'+escape(step.body)+'</p></div>'+
    '<div class="keso-guide-actions"><button class="keso-guide-btn" type="button" data-guide-back'+(tourIndex===0?' disabled':'')+'>前へ</button>'+
    (tourIndex===TOUR.length-1?'<button class="keso-guide-btn primary" type="button" data-guide-finish>モード一覧を見る</button>':'<button class="keso-guide-btn primary" type="button" data-guide-next>次へ →</button>')+
    '<button class="keso-guide-btn" type="button" data-guide-close>スキップ</button></div>'+
    '<p class="keso-guide-footnote">画面内の説明を読むだけでは、KPは消費されない。</p>';
  }
  const t=topicById(topicId);
  return '<p class="keso-guide-eyebrow">'+escape(CATEGORIES.find(g=>g.id===t.group)?.label||'遊び方')+'</p>'+
   '<h2 class="keso-guide-title" id="keso-guide-heading">'+escape(t.title)+'</h2><p class="keso-guide-lead">'+escape(t.lead)+'</p>'+
   '<h3 class="keso-guide-title2">操作はこの順番</h3><ol class="keso-guide-steps">'+t.steps.map(s=>'<li>'+escape(s)+'</li>').join('')+'</ol>'+
   (t.tip?'<div class="keso-guide-callout"><strong>💡 覚えておこう</strong><br>'+escape(t.tip)+'</div>':'')+
   (t.cautions.length?'<div class="keso-guide-warning"><strong>⚠ 注意点</strong><ul>'+t.cautions.map(s=>'<li>'+escape(s)+'</li>').join('')+'</ul></div>':'')+
   '<div class="keso-guide-actions"><button class="keso-guide-btn primary" type="button" data-guide-go="'+t.id+'">この画面を開く →</button>'+
   '<button class="keso-guide-btn" type="button" data-guide-tour>最初の説明を見直す</button></div>'+
   '<p class="keso-guide-footnote">報酬額・締切・購入上限・仕様は更新されることがある。実際に取引する前に、現在のゲーム画面に表示された条件を優先して確認しよう。</p>';
 }
 function modalHtml(){
  return '<div class="keso-guide-overlay" data-guide-overlay><section class="keso-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="keso-guide-heading">'+
   '<header class="keso-guide-head"><div class="keso-guide-brand"><small>KESO PLAY / GUIDE</small><strong>遊び方・チュートリアル</strong></div>'+
   '<button type="button" class="keso-guide-close" aria-label="ガイドを閉じる" data-guide-close>×</button></header>'+
   '<div class="keso-guide-layout"><aside class="keso-guide-side"><label for="keso-guide-select">モードの説明を選ぶ</label>'+
   '<select class="keso-guide-select" id="keso-guide-select" aria-label="説明するモード">'+groupsOptions()+'</select>'+
   '<input class="keso-guide-search" id="keso-guide-search" type="search" placeholder="モードやルールを検索" aria-label="ガイド内を検索" value="'+escape(query)+'">'+
   '<p class="keso-guide-hint">よく見る項目・検索結果</p><div class="keso-guide-results" id="keso-guide-results">'+results()+'</div></aside>'+
   '<main class="keso-guide-article" id="keso-guide-article" tabindex="-1">'+article()+'</main></div></section></div>';
 }
 function draw(){
  if(!open)return;
  const oldScroller=mount.querySelector('#keso-guide-article');
  const top=oldScroller?.scrollTop||0;
  mount.innerHTML=modalHtml();
  if(!isTour&&oldScroller)mount.querySelector('#keso-guide-article').scrollTop=top;
 }
 function markSeen(){if(firstTour||!seen){seen=true;safeStore.set();}firstTour=false;}
 function closeGuide(){
  if(!open)return;
  markSeen();open=false;mount.replaceChildren();app.inert=false;
  document.body.style.overflow=previousOverflow;
  trigger.setAttribute('aria-expanded','false');
  if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});else trigger.focus({preventScroll:true});
 }
 function show(id,walkthrough=false,auto=false){
  if(!open){previousFocus=document.activeElement;previousOverflow=document.body.style.overflow;}
  open=true;firstTour=auto;topicId=topicById(id).id;isTour=walkthrough;tourIndex=0;query='';
  app.inert=true;document.body.style.overflow='hidden';trigger.setAttribute('aria-expanded','true');
  draw();mount.querySelector('[data-guide-close]')?.focus({preventScroll:true});
 }
 function changeTopic(id){
  topicId=topicById(id).id;isTour=false;
  draw();mount.querySelector('#keso-guide-article')?.scrollTo(0,0);
  mount.querySelector('#keso-guide-article')?.focus({preventScroll:true});
 }
 const currentTopic=()=>{
  const view=app.querySelector('.screen')?.dataset.view||(app.querySelector('.title-screen')?'title':'home');
  const current=app.querySelector('.casino-games [data-casino-game].active')?.dataset.casinoGame;
  return guideTopicForScreen(view,current);
 };
 trigger.addEventListener('click',()=>show(currentTopic(),false,false));
 mount.addEventListener('click',async e=>{
  const t=e.target.closest('button');if(!t){
   if(e.target.hasAttribute('data-guide-overlay'))closeGuide();
   return;
  }
  if(t.hasAttribute('data-guide-close')){closeGuide();return;}
  if(t.hasAttribute('data-guide-next')){tourIndex=Math.min(TOUR.length-1,tourIndex+1);draw();return;}
  if(t.hasAttribute('data-guide-back')){tourIndex=Math.max(0,tourIndex-1);draw();return;}
  if(t.hasAttribute('data-guide-finish')){markSeen();changeTopic('intro');return;}
  if(t.hasAttribute('data-guide-tour')){isTour=true;tourIndex=0;draw();return;}
  if(t.hasAttribute('data-guide-topic')){changeTopic(t.dataset.guideTopic);return;}
  if(t.hasAttribute('data-guide-go')){
   const to=topicById(t.dataset.guideGo);closeGuide();
   await goToTopic(to);
  }
 });
 mount.addEventListener('change',e=>{if(e.target.id==='keso-guide-select')changeTopic(e.target.value);});
 mount.addEventListener('input',e=>{
  if(e.target.id!=='keso-guide-search')return;
  query=e.target.value;
  const place=mount.querySelector('#keso-guide-results');if(place)place.innerHTML=results();
 });
 const delay=()=>new Promise(resolve=>setTimeout(resolve,65));
 const press=id=>{const el=app.querySelector('[data-screen="'+id+'"]');if(!el)return false;el.click();return true;};
 async function goToTopic(t){
  if(app.querySelector('.title-screen')){if(!press('home'))return;await delay();}
  const destination=t.screen||'home';
  if(['race','mleague','casino','market'].includes(destination)){
   if(!press(destination)){press('race');await delay();press(destination);}
  }else if(['directives','stable','shop','relics'].includes(destination)){
   if(!press(destination)){press('directives');await delay();press(destination);}
  }else press(destination);
  if(t.game){await delay();const tab=app.querySelector('[data-casino-game="'+t.game+'"]');tab?.click();}
 }
 document.addEventListener('keydown',e=>{
  if(!open)return;
  if(e.key==='Escape'){e.preventDefault();closeGuide();return;}
  if(e.key!=='Tab')return;
  const tabbables=[...mount.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length);
  if(!tabbables.length)return;
  const first=tabbables[0],last=tabbables[tabbables.length-1];
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 });
 const autoOpen=()=>{
  // Playwright's ordinary game tests navigate without onboarding; the dedicated
  // beginner-guide test opts in explicitly. Real players remain unaffected.
  if(navigator.webdriver&&!globalThis.__kesoGuideTestTour)return;
  if(seen||autoPrompted||open)return;
  if(!app.querySelector('.screen[data-view="home"]'))return;
  autoPrompted=true;show('intro',true,true);
 };
 new MutationObserver(autoOpen).observe(app,{childList:true});
 autoOpen();
}
if(typeof document!=='undefined'){
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setupGuide,{once:true});else setupGuide();
}
