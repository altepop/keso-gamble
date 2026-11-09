# 通話滞在によるKP

2026-10-27。ユーザー確認済み: 5分で5 KP、1日最大240 KP、朝9時（JST、UTC00:00）更新。

## 対象

既存の速報と同じDiscordサーバー。通常VC（channel type 2）にいる本人を対象にし、ミュート・スピーカーミュート・1人での滞在でも数える。Bot、AFK用チャンネル、ステージ、本人情報を確認できていないメンバーは除外。Activityを起動する必要はない。過去の滞在時間は推定しない。Botが見る権限を持つVCのみ確認できる。

5分未満の時間は退出・再入室をまたいで当日中に合算。9時に日付を分け、未達の端数は次の日へ持ち越さない。通常30秒ごとの保存なので、5分到達後の反映には若干の遅れがある。接続が切れて確認できない区間や、2分以上止まったタイマーの区間を勝手に加算しない。

## 常時監視

既存Cloudflare WorkerにSQLite-backed Durable Object `VOICE_GATEWAY / VoiceGateway` を一つ追加。GUILDS + GUILD_VOICE_STATES（129）のみをIdentifyし、心拍・ACK・sequence・Resume・再接続・セッション制限・429の待機を扱う。最初のGUILD_CREATEで現在の通話状態を確認し、入退室・移動・AFK変更を追う。未知の本人情報はBot RESTで確認するまで支給しない。

音声用Gateway、UDP、録音、音声受信、通話へのBot参加（op4）は使わない。ActivityのブラウザーでもメディアやaudioSessionを呼ばない。

Durable Objectの保存済み設定とalarmで再起動し、既存の毎分cronからも再接続を促す。QUIZ/Renderの稼働時間を通話時間と扱わない。Render無料サービスが休止しても、それだけでは監視は止まらない。

## 認証情報

QUIZのサーバー環境に既存のDISCORD_BOT_TOKENとKP_QUIZ_SIGNING_KEYがある場合、起動後に設定を行う。通知先チャンネルのguildを確認し、Workerの対象guildと一致した場合のみ受け付ける。必要に応じてKP_VOICE_GUILD_IDで既知の対象を明示できる。KP_VOICE_ENABLED=falseでQUIZからの設定送信を止められる（既に設定した監視の停止APIとは異なる）。

Bot tokenは既存WorkerのRSA公開鍵でOAEP/SHA-256暗号化し、KP連携用Ed25519署名と送信時刻を付ける。Workerは署名・時刻・guildを検証後、内部DOだけへ渡す。Bot自身とguildへのアクセスをDiscord RESTで確認してから保存する。DOの保存データも暗号文で、平文トークンはメモリとDiscordへのAuthorizationヘッダーにのみ存在する。トークン、署名秘密鍵、対応表を公開コード・ログ・PRへ記載しない。既存秘密値のリセットや人間への再入力は不要。

## 支給と復旧

観測済みミリ秒と支給済み枠をDOに保存。各日48枠まで。D1にはguild + Discord ID + 日付 + 枠番号の一意キーで記録。参加者口座の作成、支給イベント、台帳、残高はD1 batch/triggerで原子的に更新する。応答喪失・再起動後の同じ枠の再送は重複支給しない。D1が失敗しても保存済み時間は残し、後から再試行。過去の日の支給済み観測記録はDOから掃除し、D1台帳の一意性は保持する。

新規参加者も5分到達時に口座が作られ、Discord Activity本人確認後に同じ残高を利用できる。既存のVALORANT/QUIZ支給と残高は維持する。

## 稼働確認

`GET /api/kp/voice/status`: enabled/connected/対象人数/最終ACKと固定エラー分類。個人名、ID一覧、tokenは返さない。`GET /api/kp/state`の通話情報と受取履歴は本人セッションでのみ返す。Activityは今日の通話報酬・計測中/待機中/再接続中を表示。

## 配置と費用

Workerの既存名・D1・毎分cron・Interactionsを維持。migration tag voice-v1でSQLite DOクラスだけを追加。配置時の設定復元はこの同一WorkerのVOICE_GATEWAYだけを許可し、別の未知バインディングを黙って削除しない。QUIZ側は初期設定のみ担当するため、専用の有料Render常駐サービスは作らない。有料プラン購入・契約変更は行わない。

DOの外向きWebSocketはhibernateできず、接続中のdurationを消費する。128 MiBで1個が24時間動く概算は10,800 GB-s/日。CloudflareのFree枠は13,000 GB-s/日・100,000 requests/日（アカウント内で共有）。これを無制限・費用ゼロ保証とは扱わず、既存使用量とクォータに従う。Freeで作れるSQLiteクラスを使用する。上限時はエラーを記録して復旧を待ち、勝手な課金プラン変更や停止中の時間推定をしない。

公式資料確認:
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/
- https://docs.discord.com/developers/events/gateway

検証: 時間の合算・退出再入室・9時境界・上限・停止区間・時計巻き戻り・再試行、D1の重複/失敗ロールバック/新規口座、模擬GatewayのIdentify/ACK/GUILD_CREATE/退出/Resume/認証停止、暗号化・署名の設定受け渡し、配置バインディング保持、Activityの既存音声非干渉フロー。
