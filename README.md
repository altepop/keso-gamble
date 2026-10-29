# KESO PLAY

仲間内でKPを稼ぎ、増減させ、他人への指名指令に使うDiscord Activity。サーバー口座と、独立した端末内デモがあります。

本番口座はDiscord Activity内で自動接続（管理側の初回OAuth設定が必要）。通常ブラウザーでは `/valo status` の接続コードでログイン。コンペ1勝900 KP（負け −100、負けて味方最下位 −300）、コンペ指名8,000 KP。詳細・保留モード・Discord内のURL Mapping設定は [試合KPの運用](docs/POINT_REWARDS_PLAN.md) を参照してください。

本番の株は全員共通の5分相場。24時間保有した株には朝9時の配当と株主優待があります。ニュース連動と移行方法は [株の仕様](docs/STOCK_MARKET.md) を参照してください。

稼ぎchでは開催レースの実況投稿を約5秒ごとに更新し、ゴール後にMP4のリプレイを自動投稿します。Activityの起動は不要です。[チャット観戦の仕様](docs/RACE_BROADCAST.md)

## ゲームの軸

1. **リスクで稼ぐ**：架空株の売買やルーレットでKPを増やす・溶かす。
2. **プレイで稼ぐ**：VALORANTのコンペ・アンレ・デスマッチ・エスカレーション、Steam実績の達成確認でKPを得る。
3. **KPを使う**：メンバーを指名し、コンペをプレイさせる・指定したSteam実績を解除させる指令を発行する。

現実の指数・ニュースは表示しない。公営競技型ゲームは[仕様](docs/RACING_PLAN.md)のうち、競馬（デモと本番口座）、稼ぎchへの投稿、冠レースと煽りレベル、馬主（ボックス・賞金・引退・売却・二つ名）、本人の名前の馬と見舞金、エージェント熟練度、超高級品（7品）を実装済み。競艇・競輪は未実装。

## デモで試せること

- ホームから「稼ぐ」「勝負」「指令」への導線
- プレイ・実績の申請 → 確認待ち → デモ確認してKP支給
- 同じVALORANT試合ID、同じSteamゲーム・実績の二重申請・二重支給防止
- 相手と課題の指定 → KP消費 → 発令中 → デモ達成確認
- 未達成の指令は相手ごとに1件。達成後も発令費用は返金しない
- 架空株の売買（1%手数料）、見積もり、保有資産、取引履歴
- ルーレット（赤黒・偶奇・数字指定）、ブラウザの暗号学的乱数による抽選
- 競馬（勝負 → 競馬）：15分おきに発走、発走1分前に締切。1着当て（単勝）・3着以内当て（複勝）、横スクロールの映像と文字実況。オッズは胴元の取り分なしで、着順を決めるのと同じレースモデルの厳密な確率から計算。1週間の購入上限50,000 KP。馬券のないレースは不成立（大きなレースは除く）
- デモチャート、移動平均線切替、疑似板表示
- 旧形式の端末保存データの読み込み。旧KC残高の数値はそのままKPとして扱う
- 同一オリジンの現行版タブ間の排他保存・変更反映

## デモの範囲

以下は「デモで試す」で開いた場合の説明。本番口座はVALORANT速報Botへ接続済みで、ブラウザーのデモ資産を使いません。Steam検証は未接続です。
「デモ確認」は支給・達成の状態遷移を試す操作であり、実際のプレイや実績を検証しない。
指名相手はデモメンバー。指令を外部に送信したり、相手のゲームを起動したりする機能はない。
競馬のデモは全員共通の計算でレースを決めるため、開発者ツールを使えば結果を事前に計算できる。本番口座の競馬は Worker が秘密のシード値で着順を決め、締切前にそのハッシュを公開し、発走後にシード値を公開して照合する（[仕様](docs/RACING_PLAN.md)）。
報酬額・指令価格は仮設定で、`js/progression.js` のカタログで変更できる。

初期残高は10,000 KP。資産画面の「開発用：テストKPの補充」は検証用で、ゲームの稼ぎ方には含めない。
KPは現実のお金・商品と交換できない。端末保存は利用者が書き換えられるため、本番の口座管理には使えない。
本番化では本人確認、信頼できる試合・実績の検証、サーバー側の口座・指令管理、参加者間のルールと達成確認が必要。

## 起動・検証

画面は静的ファイルで配信。公式Discord SDKはローカルで事前にバンドルし、成果物を同梱しています。SDKの更新時はNode 24で `npm ci && npm run build:discord`、続けて `npm run build:activity` を実行してください。JS/CSSの変更後も `npm run build:activity` で依存ファイル全体の読み込み版を更新し、`npm run check:activity` で確認します。スマホ版Discordの起動処理とWebKit検証は [起動不具合の調査記録](docs/MOBILE_STARTUP.md) を参照してください。

```sh
npm start
# または python3 -m http.server 8000
```

http://localhost:8000 を開く。ES Modulesを使用するのでHTTP経由で起動する。
保存にはWeb Locks対応のHTTPS環境またはlocalhostが必要。保存禁止・容量不足時はメモリ内で動作し、警告を表示する。

```sh
npm test                  # Node.js 18以上。ロジック・状態復元・排他保存のテスト
npm install --no-save playwright  # 任意のブラウザ検証ツール
npm run test:browser
node scripts/discord-auth-browser-check.cjs # 公式SDK・Discord RPCとAPIを模擬した自動接続検証
node scripts/kp-browser-check.cjs # サーバー口座の接続・再送・画面検証（APIをモック）
node scripts/race-live-browser-check.cjs # 本番口座の競馬：馬券・シード値の公開と照合・精算表示（APIをモック）
```

全ブラウザ検証（`npm run test:browser:all`）はPython 3・PlaywrightのChromiumとWebKitを使用。`npx playwright install --with-deps chromium webkit` で準備します。Chromiumの個別検証は`/usr/bin/chromium`、`CHROMIUM_PATH`、またはPlaywright管理のChromiumに対応。
後者は `npx playwright install chromium` で導入できる。


表示幅が1,024 CSS px以上の場合はActivity内の横幅いっぱいを使い、競馬・カジノ・株・指名を複数列に配置します。別アプリやPC専用URLは不要です。幅を狭めると同じ画面がスマホ向けの縦並びに戻ります。検証は `npm run test:desktop-browser`（Chromium）、`node scripts/desktop-browser-check.cjs webkit`（WebKit）で実行できます。

## 構成

- `index.html` / `css/styles.css`: エントリー・画面スタイル
- `js/app.js`: 画面遷移・注文・抽選・イベント処理
- `js/progression.js`: プレイ報酬、指令、重複防止、状態復元
- `js/progression-views.js`: ホーム・報酬申請・指名指令の画面
- `js/engine.js`: 架空株・カジノ・旧データとの互換処理
- `js/racing.js` / `js/racing-view.js`: 競馬のレースモデル・オッズ・馬券（DOMなし）と、画面・Canvasの映像
- `js/store.js` / `js/storage.js`: 排他更新・永続化
- `js/charts.js` / `js/format.js`: チャート・表示
- `tests/` / `scripts/browser-check.cjs`: 回帰テスト

## ホスティング

既存公開URL: https://altepop.github.io/keso-gamble/
GitHub Pagesは `main` のルートを公開する設定。mainへの反映後にPagesの配置を確認する。
Discord ActivityのURL MappingはPrefix `/`、Target `altepop.github.io/keso-gamble`。

## 速報Botサービスの取り込み（2026-10-26）

既存のアカンbotの実ソースを `services/valorant-results/` に取り込みました。
試合速報・デスアンレ・`/valo` の開発もこのリポジトリ内で進められます。
ブラウザ画面と口座APIの接続はまだで、上記「デモの範囲」は画面側に引き続き当てはまります。

サービスはNode.js 24以上で個別に依存関係を導入します。

```sh
cd services/valorant-results
npm ci
npm run check  # 型検査・100機能テスト＋6配置設定テスト（ミーム引用42本、6口調・843種類）
npm run build  # 配置せずdry-runのみ
```

rootからは `npm run results:check`、`npm run results:build` でも実行できます。
公開用ソースの設定はサンプルです。個人対応表・実稼働設定はリポジトリ外で保管します。
自動報酬は無効、額と開始日時は未設定のままです。
取り込み元コミット・照合結果・本番稼働機能と未接続項目は
[統合状況](docs/VALORANT_RESULTS_INTEGRATION.md) を参照してください。

## 通話音声との併用

Activityは音声セッション・メディアセッションを読み書きせず、BGM・無音再生・録音・AudioContext・WebRTC接続も作成しません。前版で追加した `ambient` の設定は撤去しました。取引・ルーレット・報酬・指令・画面遷移・再読み込みのブラウザー検証で、音声APIへのアクセスがないことを確認します。

「Activity起動で音が消え、閉じると戻る」という報告は引き続き実機確認が必要です。[Discord SDKの未解決報告 #380](https://github.com/discord/embedded-app-sdk/issues/380)には、iPhoneで空のHTMLでも他の音声が止まる事例があります。これは今回の通話・配信音の原因が確定したという意味ではなく、PC・Androidの再現も未確認です。WebページからDiscord本体の音声処理を復元・強制解除する修正は行いません。

## タイトル画面とKP自動支給の準備

起動時はタイトル画面を表示します。「はじめる」でホームへ進み、タイトルへ戻っても残高や記録は消えません。自動支給はまだ無効です。[金額案・デスマッチの制約・通話記録の接続状況](docs/POINT_REWARDS_PLAN.md)をまとめています。

### チンチロ・ブラックジャックの演出

チンチロは木の器と立体的なサイコロで、親→出目→役→子→勝敗の順に表示します。ブラックジャックは緑のテーブルで1枚ずつ配り、ヒット・ディーラーの追加札・勝敗を順に見せます。大きな役は金色の演出、負け・バーストは赤い結果表示です。

演出は音声を使わず、スキップできます。端末の「動きを減らす」設定では待ち時間も省略します。本番は従来どおりサーバーが決めた結果を表示し、演出の途中で画面を閉じても再抽選・再決済しません。過去の勝負を開き直した時に演出は再生しません。

画面の確認: PlaywrightとChromiumがある環境で `npm run test:casino-browser`。スマホ・PC幅、演出の順番、連打、スキップ、エラー後の復帰、動きを減らす設定、音声を起動しないことを確認します。

### みんなの取引

本番口座に接続すると、ホームと各ゲーム・株画面の「みんなの取引」で同じサーバーの成立済み操作を確認できます。ホームでは展開した状態から始まり、折りたたみもできます。表示中は約5秒ごとに最新40件を取得し、バックグラウンドでは停止します。通信失敗時は直前の一覧を残して再試行します。画面全体の再描画や決済は行いません。

表示対象は株の購入・売却、競馬・Mリーグのベット、ルーレット・チンチロ・各カジノのベット成立／決着です。新しいベット情報はこの版で成立した操作から、株取引は既存記録も表示します。処理途中のブラックジャックのカードやマインズの盤面、残高、個人の入出金履歴は含めません。4人以外の表示名が未登録の場合は「メンバー＋ID末尾4桁」です。

`GET /api/kp/feed` は既存の口座セッションと参加者確認を使用します。`kp_operations`の成立済みレスポンス内の公開情報だけを読み、同じ操作の再送・失敗・ロールバックによる重複や架空の履歴は追加しません。保存済みの全状態は取得しません。初期化時にサーバー別・時刻順の部分インデックス `kp_public_activity_recent` を作成し、履歴が増えても取得は最大40件に制限します。

検証: `npm run test:community-browser`（Chromium）、`node scripts/community-browser-check.cjs webkit`（WebKit）。入力欄を交換しない更新、ネットワークの復旧、非表示中の停止、名前のエスケープ、モバイル／PC幅を確認します。

メンバーの表示名は `services/valorant-results/member-names.encrypted.json` に既存のKP公開鍵で暗号化して保持できます。仮名の末尾4桁に一致する口座が同じサーバーに1件だけある場合、初回表示時に完全なDiscord IDへ固定します。0件・複数件なら登録せず、後から末尾が重複する人が参加しても既存の名前を別口座へ移しません。残高・権限・VALORANTの対応表には影響しません。
