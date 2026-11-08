# KESOTOWNのDiscord履歴を楽曲制作の参考にする（管理者用）

このツールは**管理者のPC上で一度だけ**Discordの許可されたテキストチャンネルの過去メッセージを取得する。
KESO PLAY / アカンbot本番のCloudflare Workers・D1・KP・定期処理には一切接続しない。チャットを常時監視する機能ではない。
**ログを公開GitHubへコミットしてはならない。**

## 取得できる範囲と制限

- 管理者がIDを明示した**通常のテキストチャンネルとアナウンスチャンネル**（Discordのtype 0 / type 5）のテキスト本文のみ。
- Botにそのチャンネルの View Channel / Read Message History 権限が必要。
- 既存の /valo・/death はDiscordのHTTP Interactionsであり、これだけではチャット閲覧権限は得られない。
- DiscordアプリのBotがサーバーに参加していない場合は、Developer Portalから同じアプリの**botスコープ**でサーバーに追加する。管理者権限は不要。閲覧するチャンネルだけ権限を付与する。
- 通常メッセージの本文を読むには、Discord Developer Portal → Bot → **Message Content Intent** の設定が必要な場合がある。アプリ規模によっては審査も必要。
- DM、閲覧不可チャンネル、音声会話、添付ファイル、埋め込み、削除済み投稿、アーカイブ済みスレッド、フォーラムの過去スレッドは対象外。
- 使用するのはBot Tokenのみ。ユーザーTokenによるself-botやブラウザーのスクレイピングは禁止。パスワード・Bot Token・Client SecretをChatGPTやGitHubに貼らない。

## 実行前の運用ルール

1. サーバーメンバーへ目的（楽曲制作と内輪ネタの研究）、対象チャンネル、期間、共有範囲を事前告知し、同意・除外の要望に応じる。
2. 個人相談、機密チャンネル、DM、プライベートな話題を含むチャンネルは選ばない。
3. 歌詞に個人名・発言原文を採用する場合は本人の確認を取る。
4. JSONLは自動的にすべての個人情報を取り除けるわけではない。住所や秘密が文中に書かれている場合は残りうるため、ChatGPTに共有する前に内容を確認する。
5. 不要になったログはローカルから削除する。

## 実行手順（Windows PowerShell）

    git switch main
    git pull
    cd services/valorant-results
    node --version

Node 24以上で実行（追加のnpmパッケージ不要）。

まず、取得候補のテキストチャンネル名とIDのみ列挙する。メッセージ本文は取得しない。

    node scripts/export-kesotown-history.mjs list --guild "あなたのサーバーID"

対象チャンネルを明示して過去180日分を最大2万件取得する例。

    node scripts/export-kesotown-history.mjs export --guild "サーバーID" --channels "チャンネルID1,チャンネルID2" --days 180 --per-channel 3000 --total 20000

Bot Tokenの入力を求められたら**ローカルのターミナルにのみ**貼り付ける。入力内容は非表示になり、ファイルには保存しない。既に環境変数 DISCORD_BOT_TOKEN が設定されている場合はそれを利用する。既存BotのTokenを再発行・リセットする必要はない（再発行するとほかのサービスが停止する恐れがある）。

サーバーIDはDiscordの開発者モードでサーバーを右クリックしてコピーする。チャンネルIDも同様にコピーする。

**Botを追加していない場合、または権限不足の場合は403で失敗する。** 本文が取得できない場合はMessage Content Intentを確認する。

## 保存結果

取得後、以下の日時付きファイルをPCのローカルフォルダへ保存する。

- services/valorant-results/.private/kesotown-music-日時.jsonl — 匿名話者、時刻、チャンネル名、投稿本文
- services/valorant-results/.private/kesotown-music-日時-summary.json — 期間・取得件数・チャンネル別件数

.private/ は既存 .gitignore でコミット除外。GitHub Actions / Workers / D1 / Discordのチャンネルにアップロードしない。HTTPリクエストはGETのみで、投稿や削除を行わない。

最大50チャンネル、最大1095日、各チャンネル1万件、合計5万件のハード上限。標準は180日・1チャンネル3000件・合計2万件。Discordの1ページ最大100件に合わせて取得し、429ではRetry-Afterを尊重する。

URL、メールアドレス、メンション、長い数値ID、一部電話番号をマスクする。ユーザーIDをファイルに保存せず、member_001などの仮名に置き換える。投稿本文は最大2000文字、リンク先や画像・動画を取得しない。**個人名や秘密が文中に直接書かれている場合は取り除けないため、共有前の手動確認が必須だ。**

## ChatGPTで分析する場合

内容を確認したJSONLを**公開GitHubではなく、このチャットに添付**する。大きければチャンネルや日付ごとに分割する。

「内輪ミーム・盛り上がった出来事・言い回しを抽出し、実名や個人情報を避けながら第6〜8曲に反映する」と依頼できる。

この方法で得られるのは提供された範囲の投稿に限られ、KESOTOWNの全履歴を取得できたという意味ではない。
