# スマホ・チャットからの速報Bot更新

## GitHubの設定

Repository secretsに以下を登録する。値をチャット・コード・ログへ貼らない。

- `CLOUDFLARE_API_TOKEN`: 対象アカウントのWorkers Scripts編集権限。
- `CLOUDFLARE_ACCOUNT_ID`: そのアカウントID。

## 実行経路

- PRではサンプル設定で型検査・69の機能テスト・6つの配置設定テスト・build dry-runのみ実行。
- mainに速報サービスまたは当該workflowの変更が入ると、check成功後に既存Workerを配置する。
- Actionsの「VALORANT Bot check and deploy」からmainを手動実行することもできる。
- 同時配置は直列化し、進行中の配置を後のpushで強制中断しない。

## 本番設定の保持

配置時だけ非公開の一時コピーを作る。Cloudflareの既存Workerのsettings・content・schedulesを読み、
DBの同じID、cron、Discordアプリ設定、監視対象を保持する。ダウンロードしたコードは実行せず、
Acornで静的なJSONリテラルだけを読み取る。形式やbinding、スケジュールが想定と異なれば配置前に停止する。
Cloudflareの秘密値は取得・再登録せず、Wranglerの既存secret保持動作とkeep-varsを使う。
実設定・本番bundleをartifactへアップロードしない。ジョブ終了時に一時コピーを削除する。

本番では通知とInteractionsのコードだけが使用される。未接続のreward-accounts用の一時設定は空にし、
実際の4人の対応表やD1を同期・変更しない。報酬を無効・金額/開始未定のままに保ち、
監視entryが口座基盤を使う変更をした場合は、この自動復元方式を拒否する。
口座接続時には別途、非公開対応表の供給方法を実装する。

D1マイグレーション・Discordコマンド登録・OAuth変更・secretリセット・報酬有効化は行わない。
rootのActivity HTMLはこのPRで変更しない。

## 失敗時

Actionsのcheck/deployどちらが失敗したかを確認する。
Secrets不足、Cloudflareの403、設定抽出失敗では本番配置を開始しない。
配置ステップ開始後の失敗では、本番のversionを確認してから再実行する。
GitHub Secretsは外部から読めないため、登録確認は値を読むのではなくActionsの有無検査で行う。
