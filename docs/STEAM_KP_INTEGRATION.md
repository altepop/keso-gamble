# Steam実績とKP

2026-10-29。本人がSteam公式OpenIDで接続し、本人が所持しているゲームの実績をサーバーが取得してKPへ入金する。実装済み・本番設定待ち。Steamパスワード・CookieをKESOへ入力する方式ではない。

## 決定した報酬

| Bot確認時の全世界解除率 | KP |
| --- | ---: |
| 0.1%以下 | 5,000 |
| 0.1%超〜1%以下 | 1,000 |
| 1%超〜10%以下 | 300 |
| 10%超〜100% | 100 |

ユーザー承認済み。50%・100%ちょうども100 KP。Steam報酬は本人の全ゲームを合計して、1日最大5,000 KP。毎朝9時（JST、UTC00:00）に更新し、実際に入金処理をした日へ計上する。残り枠が100 KPのときに5,000 KPの実績を確認した場合は100 KPだけ支給する。上限到達後の判定は0 KPとして精算し、上限で減った分を翌日へ繰り越さない。0 KPも判定を保存して再支給を防ぎ、0 KPの台帳行は作らない。実績の本来の額・実際の支給額・解除率・設定版を初回判定時に固定する。

初期設定 `services/valorant-results/steam-rewards.json` は enabled=false、startsAt=null。管理者のタイトル指定は廃止し、所持ゲームから本人が選ぶ。ブラウザーから報酬額・解除率・達成申告を受け付けない。Steam指名やゲームの初クリア判定はこの変更に含めない。

## 本人が行うこと

1. いつものKP口座へ接続し、「稼ぐ」→「Steam連携を開く」。VALORANT登録は不要。未作成のKP口座は既存の通話報酬・QUIZなどで作成できる。
2. 「Steamで接続する」→「Steam公式ログインを開く」。Discord内はEmbedded App SDKのopenExternalLinkを使い、ActivityのiframeをSteamへ移動させない。スマホも外部ブラウザーから戻れる。
3. Steamで本人確認後、Activityの「接続を確認」でプロフィールのSteam IDを確認し、明示的に接続する。OpenID確認だけでは紐付けない。既存KPセッションに結び付いた10分・1回のチャレンジで、他人がログインしたリンクの押し付けを防ぐ。口座のBearer tokenを外部ブラウザーのURLへ付けない。
4. Steamのプロフィール・ゲーム詳細を公開し、「所持ゲームから選ぶ」でライブラリーを検索し、監視するゲームを選ぶ（同時に5本まで）。所有ゲームと実績取得の成功を確認して、現在の解除済み実績を基準として記録する。
5. 以降の新しい解除はActivityを閉じていても監視する。結果は既存の入出金履歴へ反映される。初回の基準記録より前、接続以前、支給開始日時以前の実績へ遡って支給しない。選択を止めて再開した場合も新しい基準を取得し、停止中の解除を遡らない。

Steamプロフィールを非公開にした場合・APIの失敗・解除率が欠ける場合は、支給済みとせず再試行。取得間隔は最短15分、cronごとに1ゲームなので人数・選択数が多いとさらに遅れる。即時反映や毎日の再接続は不要。Steam接続を解除すると監視が止まるが、口座残高・支給記録・日上限の消費額・所有者の対応は保持する。

## 管理者の本番設定

- 既存の `valorant-results` Workerへ `STEAM_WEB_API_KEY` をSecretとして設定する。キーは [Steam Web APIキー登録](https://steamcommunity.com/dev/apikey) で取得する。必要なSteam側の条件を確認する。キーをチャット・GitHub・HTMLへ貼らない。
- `KP_STEAM_CONFIG` は同JSONの形式でWorkerの設定へ保存する。TextとしてJSON文字列を保存し、実際に支給を開始するUnixミリ秒のstartsAtとenabled=trueを設定する。dailyCapは5,000、tiersは本書の承認額を使う。対象タイトルのapps設定は不要。公開リポジトリへ個人のSteam ID対応表を追加しない。
- まず enabled=false のままテストアカウントで公式ログイン、対象ゲームの所有確認、公開実績の基準取得を確認する。設定を有効化した後に新しい実績を解除し、台帳と残高の一致・再取得時の二重支給なしを実機で確認する。
- 既存のDiscordアプリ、/interactions、QUIZのOAuth Redirect、Activity URL Mapping、D1、cronを保持する。Steam OpenIDの戻り先は既存Workerの `/api/kp/steam/callback`。Discord Developer PortalにSteam用OAuth Redirectを追加する必要はない。
- 新テーブルは `ensureSteam` が初回利用で追加する。既存のDBや支給履歴を削除・移行しない。既存Cloudflare配置処理はsecret_textを読み書きせず保持する。本PRでは本番設定・本番DB変更・マージ・配置を行っていない。

## 保存・再試行

kp_steam_accountsで同じguildのSteam IDとDiscord IDを一対一に固定し、再接続で別の所有者へ移さない。付け替えは管理者による個別確認が必要。kp_steam_gamesに対象・基準・最終取得・再試行状態と2分のleaseを保存する。新規ゲームの基準はSteam応答の成功時だけ作る。

安定キーはguild + Steam ID + App ID + 実績API名のSHA-256。表示名・再取得日時・解除率・報酬設定版でキーを変えない。kp_steam_eventsへのINSERTから既存kp_ledgerへのINSERT、残高更新まで同じSQLite文・トリガーで原子的に処理し、失敗時は実績・日上限の消費・残高のすべてをロールバックする。支給額はkp_steam_dailyの残り枠からINSERT文内で計算し、DBトリガーでも上限を強制する。別のゲームの同時処理でも同じ枠を二重に使えない。通信失敗・DB失敗・重複cronは再試行できる。API取得中に解除/停止した場合は、activeとleaseをINSERT時に確認して支給を止める。

1 cronにつき1ゲーム、Steam APIは最大3リクエスト、入金判定は最大20実績。残りは後続cronで処理する。429は1時間待機。ログイン開始は本人ごとに10分5回、ゲーム選択によるAPI取得は10分10回まで、ライブラリー取得は10分5回まで。秘密のAPIキー・OpenIDアサーション・認証用nonceをログへ出さない。公開ステータスへ個人対応を出さず、Steam連携の閲覧・変更は本人KPセッションを要求する。

## 確認できること・限界

Steam Web APIのGetPlayerAchievements / GetSchemaForGame / GetGlobalAchievementPercentagesForAppと、GetOwnedGamesを使用する。Steamが記録した実績の解除と所有ゲームは確認できるが、実際のプレイ手順や不正解除ツールを使っていないことまでは証明できない。管理者のタイトル指定は不要だが、Steamが本人の所持ゲームとして返し、実績を取得できるタイトルに限る。Steam側の実績・公開設定・取得制限によって利用できないタイトルがある。

ローカルでは公式OpenID応答とSteam Web APIを模擬し、実際の支給コード＋SQLiteの口座・台帳で検証する。実Steamログイン・実APIキーによる取得・D1実機・Discordスマホからの外部ブラウザー往復は本番設定後の確認事項。模擬試験の成功を本番の稼働済みとは扱わない。

参考: [Steam OpenID](https://steamcommunity.com/dev)、[User Authentication and Ownership](https://partner.steamgames.com/doc/features/auth)、[ISteamUserStats](https://partner.steamgames.com/doc/webapi/ISteamUserStats)、[IPlayerService](https://partner.steamgames.com/doc/webapi/IPlayerService)。
