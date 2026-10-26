> 公開移管版: 文中の人物・ID・稼働先はサンプルです。実設定と原文の決定記録は非公開で引き継いでいます。npm ciでサンプルのローカル設定を生成します。実設定を上書きしません。

# Discordからデスアンレを予約する

通常のアンレは判定しません。予約した人の次の1試合だけが対象です。

```text
/death start player:プレイヤーA
/death start player:プレイヤーA player2:プレイヤーC
/death start player:登録者全員
/death stop player:プレイヤーA
/death stop
/death status
```

開始より後に始まり、予約から2時間以内に終了する次のアンレだけを判定します。対象試合が決まると予約は自動でOFFになります。情報不足でも次の試合を勝手に対象にしません。すでにある待機予約は維持します。

stopは省略で全員、指定すればその人の予約・未送信・後日の追記を取り消します。送信済み・送信処理中の投稿の削除は行いません。コマンドへの返答は操作した本人だけに表示し、結果速報は今のWebhookへ投稿します。

/death の実行者には「管理者」または「サーバー管理」権限が必要です。

## 戦績コマンド（/valo）

サーバーのメンバーが利用できます。返答は操作した本人だけに表示します。/death の開始・取消・状態確認は引き続き管理者またはサーバー管理権限が必要です。

| コマンド | 内容 |
| --- | --- |
| `/valo today` | 今日の勝敗・勝率・期間内の連勝連敗 |
| `/valo yesterday` | 昨日の戦績 |
| `/valo week` | 今週の戦績（月曜0時から） |
| `/valo act` | 最新の記録ACTの戦績・現在の連勝連敗 |
| `/valo recent player:プレイヤーA` | 直近3試合とマップ・エージェント・個人成績（取得済みの項目） |
| `/valo pair player:プレイヤーA partner:プレイヤーC` | 同じチームだった試合の成績・相性コメント |
| `/valo versus player:プレイヤーA partner:プレイヤーC` | 敵同士だった直接対決の勝敗（player側の成績） |
| `/valo compare player:プレイヤーA partner:プレイヤーC` | 2人のACT戦績を比較 |
| `/valo ranking` | 登録者のACT勝率ランキング |
| `/valo streaks` | ACT内の最長連勝・最長連敗・現在の連勝連敗 |
| `/valo players` | 登録者とRiot IDの一覧 |
| `/valo status` | 監視の最終実行・各人の最終取得・送信待ち・API制限待ち・直近の新規通知の検知/送信所要時間 |
| `/valo help` | コマンド一覧・使い方 |

- today/yesterday/week/act/streaks の player は省略で全員、指定で1人です。mode は省略でコンペ、エスカレーションも選べます。
- 日付は日本時間。昨日は昨日0時〜今日0時、今週は月曜0時〜現在です。今日・昨日・今週の連勝連敗はその期間内の記録だけで数えます。
- ACTは対象モードで登録者の誰かに最後に保存されたACTを共通で使います。現行ACTを別APIから照会するものではありません。新ACTの記録をまだ取得していない場合、最後に記録したACTが表示されます。
- 勝率から引き分けを除外します。最長連勝・連敗も引き分けで区切ります。ランキングは同率を同順位にし、勝敗のついた試合がない人を順位対象外にします。5試合未満は注記します。
- ペア・直接対決は双方のチーム情報・ACT・モード・結果が一致する記録だけを使用します。同じ試合が片方にしか保存されていない場合は含めません。
- 戦績は監視開始後に保存された記録分です。通知の送信待ち・失敗中も、保存済みの成績は照会できます。通常のアンレは含めません。
- 追加API問い合わせや新しいDB変更はありません。監視処理が時刻を保存するため、更新直後は status の時刻が未記録の場合があります。実行終了時刻だけで正常動作とは断定せず、各人の最終取得時刻やAPI待機も確認してください。

### すでに /death を使っている場合の更新

```powershell
npm.cmd run discord:setup
npm.cmd run db:remote
npm.cmd run deploy
```

公開設定はEnterで再利用できます。VCTクイズで使っている既存のBot Tokenを非表示入力欄に入力します。Tokenをリセットする必要はありません。スクリプトは /death と /valo を個別に登録し、別名の既存コマンドは削除しません。同じ名前の /death・/valo はこの定義に更新します。[Discord公式のコマンド登録](https://docs.discord.com/developers/interactions/application-commands#create-guild-application-command)

DB更新は未適用の過去の変更（デスアンレ予約テーブルなど）を反映するためです。今回の /valo 専用の追加マイグレーションはありません。Interactions Endpoint URLを設定済みなら、同じURLを使います。配置後に `/valo help` と `/valo status` を確認してください。

## 初回設定

1. [Discord Developer Portal](https://discord.com/developers/applications)で、既存のVCTクイズのアプリを選びます。同じアプリに /death を追加できます。アプリがない場合だけNew Applicationを作成します。
2. General InformationのApplication IDとPublic Keyを控えます。通知先サーバーのIDも用意します。Discordのユーザー設定→詳細設定→開発者モードをONにして、サーバーアイコンを右クリック→サーバーIDをコピーで取得できます。[公式案内](https://support.discord.com/hc/en-us/articles/206346498-Where-can-I-find-my-User-Server-Message-ID)
3. VCTクイズの通知で使っている既存のBot Tokenを用意し、次を実行します。HenrikDev APIキー・Webhook URL・OAuthのClient Secretとは別の値です。共有アプリのTokenをReset Tokenで再発行するとVCTクイズ側の通知も旧Tokenで認証できなくなるため、既存の値を使います。

```powershell
npm.cmd run discord:setup
```

スクリプトは3つの公開設定を聞き、アプリをサーバーに追加するURLを表示します。URLを開いて追加し、ターミナルに戻ってEnterを押します。その後の非表示入力欄にBot Tokenを入力すると/death と /valo を登録します。Tokenはファイル・Cloudflare・ログに保存しません。公開設定だけをdiscord-config.jsonに保存します。Tokenをチャットへ貼る必要はありません。

4. 予約用DBを更新してから配置します。DB更新を先に実行してください。

```powershell
npm.cmd run db:remote
npm.cmd run deploy
```

5. General InformationのInteractions Endpoint URLが空欄なら、次を設定して保存します。すでに別のURLが入っている場合は既存のInteractions処理との振り分けが必要なので、上書き前に確認します。OAuth2のRedirectsはそのまま保持します。

```text
https://valorant-results-example.example.workers.dev/interactions
```

6. Discordで/death statusに状態が返ることを確認します。試合に入る前に/death startで対象者を予約します。

登録者を変更した場合はdiscord:setupで選択肢を再登録し、再配置します。常時接続するプロセスやMessage Content Intentは不要です。[Discord HTTP Interactions](https://docs.discord.com/developers/interactions/receiving-and-responding)の署名・送信時刻・アプリID・サーバーID・権限を検証して受け付けます。同じ操作の再送で予約を増やしたり、昔の取消で新しい予約を消したりすることを防ぎます。

まず普通のアンレを巻き込まない修正版だけ反映したい場合は、アプリ設定前でもdb:remote→deployを実行できます。コマンド設定が済むまでアンレ判定はOFFです。通常のコンペ・エスカレーション通知は継続します。