# KESO PLAY

仲間内でKPを稼ぎ、増減させ、他人への指名指令に使うゲームのローカル試作版。

## ゲームの軸

1. **リスクで稼ぐ**：架空株の売買やルーレットでKPを増やす・溶かす。
2. **プレイで稼ぐ**：VALORANTのコンペ・アンレ・デスマッチ・エスカレーション、Steam実績の達成確認でKPを得る。
3. **KPを使う**：メンバーを指名し、コンペをプレイさせる・指定したSteam実績を解除させる指令を発行する。

現実の指数・ニュースは表示しない。公営競技型ゲームは今後の拡張候補。

## 試せること

- ホームから「稼ぐ」「勝負」「指令」への導線
- プレイ・実績の申請 → 確認待ち → デモ確認してKP支給
- 同じVALORANT試合ID、同じSteamゲーム・実績の二重申請・二重支給防止
- 相手と課題の指定 → KP消費 → 発令中 → デモ達成確認
- 未達成の指令は相手ごとに1件。達成後も発令費用は返金しない
- 架空株の売買（1%手数料）、見積もり、保有資産、取引履歴
- ルーレット（赤黒・偶奇・数字指定）、ブラウザの暗号学的乱数による抽選
- デモチャート、移動平均線切替、疑似板表示
- 旧形式の端末保存データの読み込み。旧KC残高の数値はそのままKPとして扱う
- 同一オリジンの現行版タブ間の排他保存・変更反映

## デモの範囲

**ゲームAPI、Steam認証、Discord認証・Botには接続していない。**
「デモ確認」は支給・達成の状態遷移を試す操作であり、実際のプレイや実績を検証しない。
指名相手はデモメンバー。指令を外部に送信したり、相手のゲームを起動したりする機能はない。
報酬額・指令価格は仮設定で、`js/progression.js` のカタログで変更できる。

初期残高は10,000 KP。資産画面の「開発用：テストKPの補充」は検証用で、ゲームの稼ぎ方には含めない。
KPは現実のお金・商品と交換できない。端末保存は利用者が書き換えられるため、本番の口座管理には使えない。
本番化では本人確認、信頼できる試合・実績の検証、サーバー側の口座・指令管理、参加者間のルールと達成確認が必要。

## 起動・検証

ビルドと実行時パッケージ導入は不要。

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
```

ブラウザ検証はPython 3とChromiumを使用。`/usr/bin/chromium`、`CHROMIUM_PATH`、またはPlaywright管理のChromiumに対応。
後者は `npx playwright install chromium` で導入できる。

## 構成

- `index.html` / `css/styles.css`: エントリー・画面スタイル
- `js/app.js`: 画面遷移・注文・抽選・イベント処理
- `js/progression.js`: プレイ報酬、指令、重複防止、状態復元
- `js/progression-views.js`: ホーム・報酬申請・指名指令の画面
- `js/engine.js`: 架空株・カジノ・旧データとの互換処理
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
npm run check  # 型検査・96機能テスト＋6配置設定テスト（ミーム引用42本、6口調・843種類）
npm run build  # 配置せずdry-runのみ
```

rootからは `npm run results:check`、`npm run results:build` でも実行できます。
公開用ソースの設定はサンプルです。個人対応表・実稼働設定はリポジトリ外で保管します。
自動報酬は無効、額と開始日時は未設定のままです。
取り込み元コミット・照合結果・本番稼働機能と未接続項目は
[統合状況](docs/VALORANT_RESULTS_INTEGRATION.md) を参照してください。

## 通話音声との併用

ActivityはBGM・無音再生・録音・AudioContextを作成しません。Audio Session APIが使える端末ではambientを指定し、他の音声と併用します。非対応環境ではそのまま起動します。Discordの通話・配信音が消える問題は端末とDiscord側の音声処理も関係するため、実機での確認が必要です。
