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
