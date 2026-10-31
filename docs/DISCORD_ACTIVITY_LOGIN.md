# Discord Activityの自動接続

Activity内で開いたときは公式Embedded App SDKを使って本人確認し、そのDiscordユーザーのKP口座に接続する。接続コードのコピー・貼り付けは不要。最初のidentify許可画面はDiscordが表示する場合があり、アプリ側で許可を勝手に与えない。コードによる接続は通常ブラウザーと、自動接続できない場合の予備手段として保持する。

## 管理側で一度だけ行う設定

既存のVCT QUIZアプリのOAuth2 Client Secretを、Cloudflareの既存 `valorant-results` Workerへ登録する。

1. Render Dashboard → 既存のvalo-quiz → Environmentを開く。
2. 既存の `DISCORD_CLIENT_SECRET` の値を表示・コピーする。クイズで現在使っている値を流用する。Discord Developer PortalでSecretをリセットしない。
3. Cloudflare → Workers & Pages → valorant-results → 設定 → 変数とシークレット → 追加。種類をSecret、名前を `DISCORD_CLIENT_SECRET` にし、値へコピーしたClient Secretを入力して保存・配置する。

値をチャット・Git・PR・ログに貼らない。クイズのOAuth RedirectsとActivityの既存URL Mappingを保持する。Bot Tokenの再発行や、アプリの作成し直しは不要。

GitHubの同名Repository Secretが既にある場合、通常の配置が未設定のWorker Secretへ一度だけ供給する。既存のWorker Secretは自動で上書きしない。通常のSecret未設定でも速報Botと接続コード方式は継続する。

この管理設定は一度だけ。利用者ごとにSecretを登録する必要はない。

既存の `/kp-api` → `valorant-results.tealeaforest.workers.dev` を使用するため、追加のURL Mappingは不要。

## 本人確認の流れ

1. Workerの公開設定APIからアプリIDと設定の有無を取得する。Client Secretは返さない。
2. ブラウザー内で毎回新しいPKCE verifierを作る。Workerが5分・1回限りのnonceとchallengeを保持する。
3. SDKのauthorizeへnonce・S256 challenge・identifyのみを渡す。
4. Workerがverifierとnonceを照合して一度だけ消費し、Discordへコードを交換する。Client SecretはWorker内だけで使う。
5. Discordの `/oauth2/@me` でアプリID・scope、`/users/@me` で本人IDを確認する。画面からのuserIdで口座を選ばない。
6. 登録済みの本人にだけ無期限・解除可能なKPセッションを作る。同一ユーザーの保存済み有効セッションは再利用する。
7. SDKのauthenticate結果とサーバーで確認した本人IDを照合してから口座を表示する。

DiscordアクセストークンはSDKへの認証に一時使用し、localStorage・D1・ログへ保存しない。コード・verifierも保存しない。未確認の決済が別の口座に属する場合は、セッションを切り替えて再送しない。

初回認証・再取得に失敗したときは、以前の利用者の残高を自動表示しない。接続コードか、Discordでの再接続を選べる。既存の無期限セッション・台帳・試合報酬・Interactions・cronは維持する。

## 検証と実機確認

- Nodeテスト: PKCEの照合、nonceの期限・同時再送、別アプリ・scope不足・未登録者・Discordエラーの拒否、IP単位の照会制限、既存セッションの再利用を確認。
- ブラウザー: 実際に同梱する公式SDKにDiscord RPCとAPIの応答を模擬し、コード入力なしの初回接続・再起動・キャンセル・設定前の予備手段・口座違いの決済拒否・音声API不使用を確認。
- 公開の `/api/kp/status` の `activityAuthAvailable`、`/api/kp/activity/config` の `available` は設定の有無。trueだけではClient Secretが正しいことや、実機ログイン成功までを証明しない。
- 最終確認は実際のDiscord内でActivityを開き、本人の口座へ自動接続されること。Secretは取得・再表示して検証しない。

## サーバー通話から起動したときの操作

認証済みのSDKへ `setConfig({use_interactive_pip:true})` を送り、DiscordのPiP表示でも操作を受け付けるようにする。未対応の古いクライアントでは設定の失敗でログインを止めない。残高の定期確認で表示が変わらないときは、ボタンを含むDOMを作り直さない。

ブラウザー検証ではDM・guild付きモバイル起動と、Discord側のPiP入力制御を模擬する。サーバー起動で「つづける」からホームへ進み、残高の更新とタッチが重なっても次の画面を開けることを確認する。実際のiPhone版Discordでの操作は利用者の端末で確認する。

## 招待を自動投稿しないActivity起動（Issue #193）

Discord公式のPrimary Entry Pointは、デフォルトの `DISCORD_LAUNCH_ACTIVITY`（handler=2）では**Discord自身がチャンネルへゲーム招待を投稿する**。この投稿はWebhook本文や通知音の変更では止められない。アプリ側で制御できる `APP_HANDLER`（handler=1）に切り替え、署名済みInteractionの `type=2` ＋ `data.type=4` を受け取ったら、本文・follow-upなしの `{ "type": 12 }`（LAUNCH_ACTIVITY）を直ちに返す。

- 切り替えは**必ずWorkerの更新と署名検証テストが成功した後**に行う。既存スラッシュコマンドの登録・権限・口座認証は変更しない。
- 本番のGitHub Actionsは、既存のPrivate Worker設定からApplication IDを復元し、Repository Secret `DISCORD_BOT_TOKEN` が設定済みの場合に限り、Discord Global Commandsを**GET** → 既存のPrimary Entry Point 1件を確定 → その**IDにhandlerのみPATCH** → GET検証を行う。別のコマンドやSlash Commandsを上書き・再登録しない。
- GitHub Secretがない場合には**変更をスキップ**し、Actionsにその旨を表示する。元からhandler=2の場合はDiscord側の自動招待が続く。値そのものをチャット、Issue、ログ、PRに送らないこと。
- 設定の確認：本番Workerに配置済みの私有設定がある環境で `node scripts/activity-entry-handler.mjs --status`。切り替え：`--apply`、元のDiscord動作への復旧：`--rollback`。いずれも当該実行環境に既存の `DISCORD_BOT_TOKEN` がある場合だけAPIを変更・照会する。
- 次回の自動デプロイでも旧ハンドラへ戻したい場合、GitHubリポジトリ変数 `DISCORD_ACTIVITY_ENTRYPOINT_MODE` を `rollback` に設定する（通常は `apply`）。不審な応答や起動不良があれば、まず `rollback` にしてワークフローを再実行する。
- 通話に入らない通常テキストチャンネルからの起動を対象とし、SDK認証・KP・競馬・株式・Mリーグは維持する。リンク `https://discord.com/activities/<application_id>` と既存の「Activityを開く」ボタンは削除しない。

**実機での未検証事項：** Primary Entry Pointのhandler変更は公式仕様で自動招待投稿を抑止できるが、共有リンク経由・古いDiscordクライアント・iOS/Android/Webの動作が同じとは限らない。バックエンドの模擬Interactionとブラウザ試験ではDiscordクライアント自体が生成する表示を再現できない。実機では (1)通話非参加 (2)起動できる (3)テキストチャンネルに招待カードが残らない (4)口座へ接続できる (5)リンク起動も維持、をiOS/Android/Webごとに確認すること。

公式仕様：[Primary Entry Point handler](https://docs.discord.com/developers/interactions/application-commands#entry-point-handlers)、[Interaction LAUNCH_ACTIVITY](https://docs.discord.com/developers/interactions/receiving-and-responding#interaction-response)。

### 既存WorkerのOAuth Secretによる自動切り替え（追加のBot Token不要）

Repository Secret `DISCORD_BOT_TOKEN` がなくても、既存のWorker `DISCORD_CLIENT_SECRET` が有効なら、Discord公式OAuth2 client credentials grantの `applications.commands.update` スコープで自動切り替えできる。既存のゲーム用cronから**独立して**非同期実行し、既存のグローバルPrimary Entry PointのみをGETして `handler=1` にPATCH、GETで確認する。シークレットとアクセストークンはWorker外・D1・ログへ保存・送信しない。

初回にD1 `monitor_state` へ10分の期限付きロックを1件作り、成功後は `done` を永続化する。失敗時は1時間の再試行待ちを保存し、通常のゲーム処理は止めない。同一Workerインスタンスでは状態確認を1回に抑えるので、毎分のcronでD1に新しい負荷を発生させない。

状況確認用の公開読み取り専用URLは `GET /api/discord/activity-entry/status`。値は `handlerConfirmed` と `clientCredentialsConfigured` の真偽のみであり、資格情報やDiscord管理者情報は含まない。 `handlerConfirmed: true` はDiscord APIでhandler1への更新を確認し、その結果をD1へ記録したことを示す（現在のDiscord実機UIや共有リンクで投稿が起こらないことまでは保証しない）。

既存Bot TokenがGitHub Secretにある場合のデプロイ後PATCHは引き続き使用する。OAuthによるバックエンド自動切り替えは、Secret未設定で同処理がスキップされた場合の安全な代替経路だ。
