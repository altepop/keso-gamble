# 稼ぎchでの競馬観戦

## 表示とタイミング

開催が決まったレース（目玉・冠・出走馬主・購入馬券があるレース）を対象に、発走3分前から既存の稼ぎch Webhookで観戦用の投稿を作ります。馬券は従来どおり `/bet` またはActivityで購入し、発走1分前に締め切ります。

発走中は同じ投稿を約5秒ごとに編集し、馬の位置・先頭・実況を更新します。端末が独立にレースを再生する方式ではなく、サーバーの発走時刻から現在位置を計算します。遅延や再起動があれば現在の進行地点に追いつき、古い場面を最初から流しません。誰もActivityを開いていなくても実行します。

レースは50秒。終了時に投稿を確定順位へ更新します。KP配当・馬主賞金・馬券の精算は既存処理が担当し、実況や動画の処理から残高を増減させません。従来の大当たり・大負け・冠レースの結果投稿も残します。勝手なメンションはしません。

実況は `RaceBroadcaster` Durable Objectのアラームで実行し、既存の通話報酬用 `VoiceGateway` と別のインスタンス・クラスに分けています。毎分の既存cronが対象を登録し、アラームを復旧します。Worker名・D1・cron・秘密値・Interactionsを保持したまま、既知の `RACE_BROADCAST` bindingと追加migrationだけを加えます。

## 自動リプレイ動画（Issue #194 により停止）

Discordへの競馬リプレイMP4の**自動投稿は廃止**した。毎時のGitHub Actions起動・デプロイ完了時の起動を削除し、手動Actionsでも本番レースの取得やアップロードを行わない。旧バージョンが持つジョブ・lease・再試行が再開されても、Workerの動画ジョブ取得とMP4アップロードAPIは `410 Gone` を返し、データベースやDiscordを操作しない。既存の動画投稿・レース結果・履歴は削除しない。待機キューは無効化したまま保持する。

唯一残す手動Actionsは、架空の固定レースだけをローカルでレンダリングして動画ファイルの正常性を確認するオフライン検査である。本番のDiscord、OIDC、D1動画ジョブにはアクセスしない。通常運用ではこのActionsを実行しない。

**変更しない機能：** 発走3分前からの告知、約5秒間隔のテキスト実況編集、50秒後の確定結果、馬券購入、配当・KP精算、馬主・冠レース、Activity表示、既存の結果通知、株式速報、一般向け「Activityを開く」リンク。今後の実況終了メッセージは、動画を投稿するとの案内を表示しない。

## 検証・運用

Node 24のSQLiteと模擬Discord応答で、テキスト実況の作成・編集・終了表示、投稿削除時の再投稿防止を検証する。動画ジョブ取得は空、旧ジョブ・期限切れlease・投稿待ち/送信中/投稿済みのいずれも配送不可であり、動画用のD1読み書き・Webhook送信が起きないことをテストする。過去のMP4はDiscord側でそのまま残る。

`RACE_VIDEO_FONT=/path/to/Japanese-font node scripts/race-video/run.mjs --check` は**架空の固定レースのローカル検証のみ**を行う。その他の実行引数と引数なし実行は、ネットワーク処理に進まず拒否する。

## Activityへのボタン

稼ぎchの通知・観戦投稿と、`/kp`・`/keiba`・`/bet`等の返信に「Activityを開く」のリンクボタンを付けます。公式の `https://discord.com/activities/<application_id>` を使い、GitHub Pagesを通常ブラウザーで開くボタンとは分けています。URLにDiscordユーザーID・セッション・秘密値を含めません。

初回の認証や、起動先チャンネルの選択がDiscord側で表示される場合があります。許可画面を飛ばすものではなく、スマホでの最終的な起動動作はDiscordクライアントにも依存します。既存の起動設定・OAuth・URL Mappingは変更しません。以前の通知には追加せず、反映後に送る投稿と実況の編集から表示します。

Webhookは `with_components=true` を指定し、アプリ所有でないWebhookでも許可されるリンクボタンだけを送ります。通常の本文を保持するため、Components V2には切り替えません。

公式仕様: [Activity共有リンク](https://docs.discord.com/developers/activities/development-guides/growth-and-referrals)、[Webhookのcomponents](https://docs.discord.com/developers/resources/webhook#execute-webhook)。
