# KESO PLAY MUSIC — Discord VC再生

## 概要

既存のKESO PLAY Discord Botの `/music` をCloudflare Workerが受付け、Discord音声転送（UDP・DAVE）は**別のNode.js 24.17以上のサービス**で担当する。従来のVoice Gateway（通話報酬）とKP処理は変更しない。

**最初の配信対象はKESO PLAYが管理する既存8曲のみ。** 曲目は `services/music-voice/catalog.json` に固定し、`music/assets/` に配置済みの音源を再生する。一般ユーザーが任意のファイル、YouTube、Spotify、外部URLを指定する機能は提供しない。原曲の利用権とDiscordでの共有が可能かは運営者が確認すること。

## コマンド

| コマンド | 動作 |
| --- | --- |
| `/music play song` | コマンドを実行したユーザーのVCへ参加し、選んだ曲を再生またはキュー追加 |
| `/music radio` | 全8曲を一巡まで重複なくランダム再生し、その後も自動で繰り返す |
| `/music all` | 全8曲を収録順に再生し、終了したら待機する |
| `/music shuffle` | 再生中の曲は変えずにキューをシャッフルする |
| `/music panel` | 再生時間・次の曲・キュー・操作ボタンを一覧表示する |
| `/music queue` | 再生中・曲順・音量・ループを表示 |
| `/music pause` / `resume` | 一時停止・再開 |
| `/music skip` | 次曲に進む |
| `/music volume percent` | 音量変更（1〜100、初期20） |
| `/music loop mode` | オフ／1曲／全キュー |
| `/music stop` | 停止・キュー削除。無操作2分後に自動退出 |
| `/music leave` | VCから退出 |

操作ボタンも併用できる。再生操作は**Botと同じVCにいるユーザーのみ**、キューの表示はどこからでも可能。キューは最大30曲、同一人物の未再生予約は最大8曲。失敗時にKPを変更しない。

## デプロイ手順（Node音声サーバー）

### VCT QUIZを守るための配置先

このリポジトリには `render.yaml` を用意してある。**VCT QUIZと同じRenderワークスペースにはデプロイしない。** 無料の稼働時間が共通となり、VCT QUIZが停止するおそれがある。

Renderのダッシュボードで、左側のワークスペース名から **+ New Workspace** を選択し、音楽Bot専用のHobbyワークスペースを作成する。そのワークスペースを選択して **New > Blueprint** から `altepop/keso-gamble` のルートにある `render.yaml` を読み込む。サービス名は `keso-music-voice`、料金プランは `free`、リージョンは `singapore` として定義してある。課金プランへの変更は行わない。

初回デプロイで入力するSecretは `DISCORD_BOT_TOKEN`、`MUSIC_GUILD_ID`、`MUSIC_BRIDGE_TOKEN` の3件だ。**どれもチャットやGitHubに記載しない。** Bot Tokenは **KESO PLAY Discordアプリ本体のBot Token** を利用する。あかんbotは通知用Webhookであり、音声再生用のBot Tokenを持つ前提ではない。Webhook URLを `DISCORD_BOT_TOKEN` に設定してはならない。KESO PLAYのBot Tokenが手元にない場合、Discord Developer Portalで安易にリセットすると既存のコマンド登録や通話報酬等が停止する可能性があるため、先に既存の保管先を確認すること。

音声サービスが起動したら、既存Cloudflare Worker `valorant-results` に `MUSIC_VOICE_URL` と `MUSIC_BRIDGE_TOKEN` を追加する。URLは実際に発行されたRenderのHTTPS URLとし、SecretはRenderに入れたものと**完全一致**させる。

※このプロジェクトを編集できる接続済みRenderツールでは新しいワークスペースを直接作成できない。作成後にこのチャットで配備・確認を続けられる。

Cloudflare Workersだけでは、Discordの音声通信に必要なUDPを送受信できない。2026年以降の通常VCにはDAVE暗号化対応が必須であり、`@discordjs/voice` を使用する。

RenderなどのNode.js実行環境に、このリポジトリ全体を接続する（**Root Directoryを `services/music-voice` だけに限定しない**。音源はルートの `music/assets` にある）。

- Node.js: 24.17.0以上（Renderなら `NODE_VERSION=24.17.0` など）
- Build Command: `npm --prefix services/music-voice install --omit=dev`
- Start Command: `node services/music-voice/server.mjs`
- HTTPポート: `PORT`（Renderの設定値を利用。未指定なら10000）
- 健康状態: `GET /health` → `{"status":"ready","active":0}` が必要

Node音声サーバーには以下の環境変数を**非公開Secret**として設定する。

- `DISCORD_BOT_TOKEN`：**KESO PLAY DiscordアプリのBot Token**。Workerの `/music` を受付けるアプリと同一である必要がある。あかんbotのWebhook URLは使用不可。
- `MUSIC_GUILD_ID`：利用を許可するDiscordサーバーのID。
- `MUSIC_BRIDGE_TOKEN`：ランダムに生成した32バイト以上の共通シークレット（64文字の16進表現など）。

Cloudflare側の既存 `valorant-results` Workerにも以下を設定する。

- `MUSIC_VOICE_URL`：Nodeサービスの公開HTTPS origin（`https://xxxx.onrender.com`）。
- `MUSIC_BRIDGE_TOKEN`：Node側と**同じ**シークレット。

生成例（出力した値は公開リポジトリ、スクリーンショット、チャットに掲載しない）：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

既存のWorker設定を保持してデプロイする。新しいコードをマージするだけでは**Node実行環境とSecretは作成されない**。音声サービス未接続時の `/music` は理由を表示するだけで、ユーザーに成功したと偽らない。

## 安全性と制限

- Discord HTTP Interactionの署名検証は既存Workerで行う。Node側は共通Secretを照合し、指定Guildのみ、指定された8曲のみ扱う。
- リクエストIDで重複コマンドを防止。HTTP接続前に副作用のない `/health` で準備状態を確認する。再生要求の結果が不明な時はキューを確認する。
- 通常のDiscord音声再生ではUDPとDAVEが必要。RenderホストのUDP疎通は実機で試験する必要がある。
- Render Free Web Serviceは15分間インバウンド通信がなければスリープすることがあり、**音楽再生中の継続稼働は保証されない**。長時間の安定再生には常時起動できるNode実行環境が適する。
- プレイリストは現在メモリ上に保持する。ホスト再起動では再生とキューが失われるがKPやD1を損なわない。外部URLや無制限のファイルダウンロードを受け付けない。

## v2：ラジオ・全曲再生・新しい操作パネル

- `/music radio` と `/music all` は**現在再生中の曲とキューを置き換えて**開始する。KESO RADIOはシャッフルの全8曲を再生し終えるまで重複せず、次周の1曲目も直前の曲と同一にならない。
- 操作パネルには再生中の曲、経過時間／総再生時間、次の曲、待ち曲数、音量・モード・ボタンを表示する。Discordのメッセージは毎秒自動更新しない。**更新ボタン**か `/music panel` で現在の状態を取得する。
- Radio再生中にループ設定は変更できない。Radioの循環が自動ループに相当する。
- Nodeサービス内のメモリだけで再生リストを管理するため、D1負担はゼロ。ホストがスリープ・再起動するとキューは失われる。

## 本番実地テスト

1. Nodeサービスの `/health` が `ready` になることを確認する。
2. 「限界集落kesotown」の一般VCに入り `/music play` で「もう一周」を選ぶ。
3. Botが同じVCに参加し、他のメンバーにも音が聞こえるか確認する。
4. `/music queue`、一時停止、再開、次へ、音量、退出を確認する。
5. VC外の利用者・別VCの利用者による制御が拒否されることを確認する。
6. 切断・ホスト再起動からの復帰、Render無料枠でのスリープ挙動を確認する。

**検証完了の判定は実際のVCで音が聞こえた時点とする。** 画面やコマンド定義だけでは成功としない。

## 自動復帰と永続化（2026-11-11）

音楽の独立性を維持しつつ、以下の障害対策を追加した。

- **5分間隔の生存確認**：既存 `valorant-results` Worker の毎分 Cron から5分ごとに認証付き `GET /health` を送る。新規 Cron は作らず、D1の読み書きやGitHub Actionsの定期実行も増やさない。Renderのスリープ軽減用であり、無料ホストの再起動や月次無料枠を保証するものではない。HTTP失敗は `music_voice_keepalive_unready` をWorkerログに記録する。
- **1操作からの復帰**：`/music` が起動中なら、既存のDiscord遅延返信を使い「起動中」を表示し、音楽専用 `MusicSession` Durable Object のAlarmが6秒前後の間隔で再試行する。起動後は*元の同じDiscordメッセージ*を更新して結果を知らせる。最大約3分で打ち切る。POSTの結果が不明な場合は二重追加を避けて自動再送しない。
- **キューのチェックポイント**：Node側が音楽専用Workerエンドポイント `/api/discord/music/state?guild=<guild>` に認証付きで曲ID、依頼者ID、順番、音量、停止状態、ループ、ラジオ周回を保存する。**音源ファイルの内容、Discord Bot Token、KP残高や取引データは保存しない**。D1にも保存せず、新規のSQLite Durable Object `MUSIC_SESSION` のストレージだけを使う。
- **再起動後の復元**：Nodeが認証付きヘルスチェックからWorkerのURLを受け取り、保存状態を取得する。15分以内のチェックポイントで、対象のVCに人が残っていれば接続とキューを復元する。**再生中の曲は先頭から再開**する。無人VCに勝手に再入室しない。ホストの再起動をまたぐ中断ゼロの再生は保証しない。
- **VC瞬断の復帰**：Discord.js自体の接続復帰を8秒試し、その後は保存した状態を使って最大3段階の再接続を試す。失敗した場合はログを残し、ユーザーが状況を確認できるようにする。

### 配備・認証

Worker側の `MUSIC_SESSION` は `music-session-v1` migration を使用する。初回デプロイでは `live-settings.mjs` が既存 `VOICE_GATEWAY`・`RACE_BROADCAST`・D1のID・毎分Cron・Secretを保持し、新しい音楽用Durable Objectだけ追加する。

新しい秘密値は不要。音声サービスとWorkerが既に共有している `MUSIC_BRIDGE_TOKEN` を使う。音声サービスは認証されたWorkerのヘルスチェックから専用URLを学習するため、外部の任意URLは許可しない。手動で指定する場合はRenderの `MUSIC_STATE_WORKER_URL` に**実際のWorkerのHTTPSオリジン（`*.workers.dev`）**を設定してよいが、通常は不要である。

Renderの `keso-music-voice` がmainを自動配備し、WorkerがGitHub Actionsで検査後に配備されることを確認する。まず `/api/discord/music/status` の `bridgeConfigured` と `recoveryConfigured` がtrue、次に `https://keso-music-voice.onrender.com/health` の `status` が `ready` になることを確認する。設定値や認証トークンはチャットやログに表示しない。

### 試験と既知の制約

- ユニット試験：`npm --prefix services/music-voice test` と `npm --prefix services/valorant-results test`。
- 3時間の**模擬**ラジオ試験：`services/music-voice/test/recovery.test.mjs` が180分相当の60曲再生・複数回の復元を短時間で検証する。これは実際のDiscord VCでの3時間稼働を意味しない。
- 本番実機試験：通常VCで `/music radio` → 5分超の再生 → 20分放置後の `/music play` → Node再起動 → 連続再生・保存キューの挙動と音声を検証する。
- 無料プランの停止、Discord側の通信障害、WorkerのAlarm遅延、制限超過時の中断はゼロにはできない。**連続3時間の再生を確実にしたい場合は常時起動可能な有料または自前のNodeホストが必要**だ。
- 復元状態は、再生中にメンバーが全員抜けた場合の自動退出、`/music stop`、`/music leave` によって破棄する。永続化は前回の曲順を「永久に残す」ことを目的としない。
