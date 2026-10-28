# 稼ぎchでの競馬観戦

## 表示とタイミング

開催が決まったレース（目玉・冠・出走馬主・購入馬券があるレース）を対象に、発走3分前から既存の稼ぎch Webhookで観戦用の投稿を作ります。馬券は従来どおり `/bet` またはActivityで購入し、発走1分前に締め切ります。

発走中は同じ投稿を約5秒ごとに編集し、馬の位置・先頭・実況を更新します。端末が独立にレースを再生する方式ではなく、サーバーの発走時刻から現在位置を計算します。遅延や再起動があれば現在の進行地点に追いつき、古い場面を最初から流しません。誰もActivityを開いていなくても実行します。

レースは50秒。終了時に投稿を確定順位へ更新します。KP配当・馬主賞金・馬券の精算は既存処理が担当し、実況や動画の処理から残高を増減させません。従来の大当たり・大負け・冠レースの結果投稿も残します。勝手なメンションはしません。

実況は `RaceBroadcaster` Durable Objectのアラームで実行し、既存の通話報酬用 `VoiceGateway` と別のインスタンス・クラスに分けています。毎分の既存cronが対象を登録し、アラームを復旧します。Worker名・D1・cron・秘密値・Interactionsを保持したまま、既知の `RACE_BROADCAST` bindingと追加migrationだけを加えます。

## 自動リプレイ動画

GitHub Actionsの `Race replay video` が毎時02・17・32・47分に終了済みレースを取得し、52秒・768×432・H.264 MP4を作り、稼ぎchへ添付します。レンダリングはActivityと同じ着順・走行タイムラインを使います。サーバーの着順を動画側で抽選し直しません。音声はありません。

Workerの配置完了後にもキューの接続確認を兼ねて実行します。Actionsのスケジュールは正確な時刻に開始する保証がないため、動画投稿はゴール直後ではなく生成・配送完了後です。チャットの実況とは独立しています。添付動画の再生開始時刻は利用者ごとで、同時自動再生を保証しません。Discordの画面共有・Go Live・ステージ映像配信は使いません。PCの常時起動や、新しい有料配信サービス・契約は不要です。

1回の処理は最新の最大2レース、直近6時間までです。古い大量の動画を一度に送信しません。動画は8MB以下で送ります。通常実行でレースデータや動画を公開Actions artifactへ保存せず、runnerの一時ファイルを終了時に削除します。

## 認証と再試行

動画処理にはGitHub OIDCを使います。専用のAPIキーを配る必要はありません。署名・issuer・audience・有効期限・repository/owner ID・mainブランチ・専用workflowのパス・実行種別をWorkerで確認します。フォークやPull Requestからの動画投稿は拒否します。

取得できるのは終了済みレースだけで、再生に必要な表示名・位置・着順・実況を返します。未発走レースの結果、秘密シード、Discord IDの対応表、残高、Webhook URLは返しません。アップロードにはそのレースの期限付きleaseも必要です。公開 `/api/racing/status` は件数・稼働状態だけです。

動画のキュー取得は期限付きで確保し、再取得・同時処理で重複しません。既に配送済みのアップロード再送は成功扱いで二度送りません。確実に拒否された配送は後で再試行します。POST中のタイムアウトなど「送れたか不明」の場合はunknownに残し、勝手に再投稿しません。実況の初回作成も同様です。人が投稿を削除した場合は再作成しません。Discordのレート制限時はretry_afterを待ちます。

## 検証・運用

Node 24のSQLiteと模擬Discord応答で、無観客での予約、同じ投稿の編集、時刻への追従、終了前の結果非公開、レート制限、重複防止、OIDC署名と権限、動画のlease・形式・再送を確認します。

`RACE_VIDEO_FONT=/path/to/Japanese-font node scripts/race-video/run.mjs --check` は架空レースの動画だけを生成します。PythonのPillowとffmpegが必要です。Discordには送りません。Actionsの手動実行も `check=true` なら同様で、検査用の架空レース動画だけをartifactに保存します。

ライブ投稿を開始した既存レースを消したり、秘密値やBot Tokenをリセットしたりする作業は不要です。実運用の配送状態はD1の `race_broadcasts` に保持します。

## Activityへのボタン

稼ぎchの通知・観戦投稿・リプレイ動画と、`/kp`・`/keiba`・`/bet`等の返信に「Activityを開く」のリンクボタンを付けます。公式の `https://discord.com/activities/<application_id>` を使い、GitHub Pagesを通常ブラウザーで開くボタンとは分けています。URLにDiscordユーザーID・セッション・秘密値を含めません。

初回の認証や、起動先チャンネルの選択がDiscord側で表示される場合があります。許可画面を飛ばすものではなく、スマホでの最終的な起動動作はDiscordクライアントにも依存します。既存の起動設定・OAuth・URL Mappingは変更しません。以前の通知には追加せず、反映後に送る投稿と実況の編集から表示します。

Webhookは `with_components=true` を指定し、アプリ所有でないWebhookでも許可されるリンクボタンだけを送ります。通常の本文と動画添付を保持するため、Components V2には切り替えません。

公式仕様: [Activity共有リンク](https://docs.discord.com/developers/activities/development-guides/growth-and-referrals)、[Webhookのcomponents](https://docs.discord.com/developers/resources/webhook#execute-webhook)。
