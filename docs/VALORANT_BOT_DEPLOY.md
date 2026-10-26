# スマホ・チャットからの速報Bot更新

## GitHubの設定

Repository secretsに以下を登録する。値をチャット・コード・ログへ貼らない。

- `CLOUDFLARE_API_TOKEN`: 対象アカウントのWorkers Scripts編集権限。
- `CLOUDFLARE_ACCOUNT_ID`: そのアカウントID。

## 実行経路

- PRではサンプル設定で型検査・機能テスト・配置設定テスト・build dry-runのみ実行。
- mainに速報サービスまたは当該workflowの変更が入ると、check成功後に既存Workerを配置する。
- Actionsの「VALORANT Bot check and deploy」からmainを手動実行することもできる。
- 同時配置は直列化し、進行中の配置を後のpushで強制中断しない。

## 本番設定の保持

配置時だけ非公開の一時コピーを作る。Cloudflareの既存Workerのsettings・content・schedulesを読み、
DBの同じID、cron、Discordアプリ設定、監視対象を保持する。ダウンロードしたコードは実行せず、
Acornで静的なJSONリテラルだけを読み取る。形式やbinding、スケジュールが想定と異なれば配置前に停止する。
Cloudflareの秘密値は取得・再登録せず、Wranglerの既存secret保持動作とkeep-varsを使う。
実設定・本番bundleをartifactへアップロードしない。ジョブ終了時に一時コピーを削除する。

本番の通知・InteractionsにKP口座を追加。既存のD1・cron・Discord署名鍵を維持し、旧テーブルは削除しない。初回起動時に `kp_*` のテーブルとトリガーを追加し、対応済みメンバーの0 KP口座を作る。Discordコマンドの再登録・OAuth変更は不要。

私有の対応表は `kp-bootstrap.encrypted.json` で供給する。先に `scripts/provision-kp-key.mjs` が専用RSA秘密鍵をWorker secretへ保存し、公開鍵だけをartifactへ残す。後続配置はその鍵を再利用。復元時に暗号封筒の指紋と公開鍵を照合し、不一致では配置しない。平文の個人設定は公開しない。

サービスはルートの純粋なゲーム計算 `js/engine.js` と `js/progression.js` を参照するため、私有runnerコピーも同じ相対構造に保つ。既存のHenrik/Webhook秘密値のリセットはしない。

報酬の運用設定とActivityのURL Mappingは [試合KPの運用](POINT_REWARDS_PLAN.md) を参照。

## 失敗時

Actionsのcheck/deployどちらが失敗したかを確認する。
Secrets不足、Cloudflareの403、設定抽出失敗では本番配置を開始しない。
配置ステップ開始後の失敗では、本番のversionを確認してから再実行する。
GitHub Secretsは外部から読めないため、登録確認は値を読むのではなくActionsの有無検査で行う。
