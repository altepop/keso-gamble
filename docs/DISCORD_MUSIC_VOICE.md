# KESO PLAY MUSIC — Discord VC再生

## 概要

既存のKESO PLAY Discord Botの `/music` をCloudflare Workerが受付け、Discord音声転送（UDP・DAVE）は**別のNode.js 24.17以上のサービス**で担当する。従来のVoice Gateway（通話報酬）とKP処理は変更しない。

**最初の配信対象はKESO PLAYが管理する既存8曲のみ。** 曲目は `services/music-voice/catalog.json` に固定し、`music/assets/` に配置済みの音源を再生する。一般ユーザーが任意のファイル、YouTube、Spotify、外部URLを指定する機能は提供しない。原曲の利用権とDiscordでの共有が可能かは運営者が確認すること。

## コマンド

| コマンド | 動作 |
| --- | --- |
| `/music play song` | コマンドを実行したユーザーのVCへ参加し、選んだ曲を再生またはキュー追加 |
| `/music queue` | 再生中・曲順・音量・ループを表示 |
| `/music pause` / `resume` | 一時停止・再開 |
| `/music skip` | 次曲に進む |
| `/music volume percent` | 音量変更（1〜100、初期20） |
| `/music loop mode` | オフ／1曲／全キュー |
| `/music stop` | 停止・キュー削除。無操作2分後に自動退出 |
| `/music leave` | VCから退出 |

操作ボタンも併用できる。再生操作は**Botと同じVCにいるユーザーのみ**、キューの表示はどこからでも可能。キューは最大30曲、同一人物の未再生予約は最大8曲。失敗時にKPを変更しない。

## デプロイ手順（Node音声サーバー）

Cloudflare Workersだけでは、Discordの音声通信に必要なUDPを送受信できない。2026年以降の通常VCにはDAVE暗号化対応が必須であり、`@discordjs/voice` を使用する。

RenderなどのNode.js実行環境に、このリポジトリ全体を接続する（**Root Directoryを `services/music-voice` だけに限定しない**。音源はルートの `music/assets` にある）。

- Node.js: 24.17.0以上（Renderなら `NODE_VERSION=24.17.0` など）
- Build Command: `npm --prefix services/music-voice install --omit=dev`
- Start Command: `node services/music-voice/server.mjs`
- HTTPポート: `PORT`（Renderの設定値を利用。未指定なら10000）
- 健康状態: `GET /health` → `{"status":"ready","active":0}` が必要

Node音声サーバーには以下の環境変数を**非公開Secret**として設定する。

- `DISCORD_BOT_TOKEN`：既存あかんbotのトークン。同じBotを利用し、別のアプリを招待しない。
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

## 本番実地テスト

1. Nodeサービスの `/health` が `ready` になることを確認する。
2. 「限界集落kesotown」の一般VCに入り `/music play` で「もう一周」を選ぶ。
3. Botが同じVCに参加し、他のメンバーにも音が聞こえるか確認する。
4. `/music queue`、一時停止、再開、次へ、音量、退出を確認する。
5. VC外の利用者・別VCの利用者による制御が拒否されることを確認する。
6. 切断・ホスト再起動からの復帰、Render無料枠でのスリープ挙動を確認する。

**検証完了の判定は実際のVCで音が聞こえた時点とする。** 画面やコマンド定義だけでは成功としない。
