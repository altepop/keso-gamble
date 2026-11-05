# Discord Client Secret 3サービス共通ローテーション手順

更新日: 2026-11-05。対象: VCT QUIZ（Render）、KESO PLAY（Cloudflare Worker／GitHub Actions）、KESO LOOP（Cloudflare Worker）。

## 基本原則
- 3サービスが **同じDiscordアプリケーションのClient Secret** を使用している。Discord Developer Portalで「Reset Secret」すると、**旧値は即時に失効**する。サービスごとに順番に新旧を切り替える猶予は基本的にない。
- 値そのもの、画面写真、URLクエリ、ターミナルログ、Issue、PR、チャットに書かない。Secret管理画面にだけ貼り付ける。対象はOAuthクライアントのSecretで、Bot TokenやLOOP-KPのEd25519署名鍵とは別物。
- 紛失・漏えい時は緊急対応。定期更新なら利用者が少ない時間帯を選び、あらかじめ利用者に「Discord新規ログインが一時停止する可能性がある」と告知する。
- 現在のセッションが維持されても新規OAuthログイン・コード交換は失敗しうる。新Secretを設定しただけで既存のアクセストークンやCookieを全破棄する必要はない。

## リセット **前** に準備（ここまでの間は無停止）
1. Renderの **VCT QUIZ** サービスで Discord OAuth 用環境変数 `DISCORD_CLIENT_SECRET` の設定箇所、デプロイ状態、`/api/health` を確認する。Render の環境変数更新がサービス再起動を伴う点を確認する。
2. Cloudflareの **KESO LOOP** Workerで同名Secretの設定・反映方法、`/api/kp/session` 等の接続確認方法と手動デプロイ手順を確認する。LOOP用D1・KP署名鍵は変更しない。
3. **KESO PLAY** Worker側の同名Secretの設定元を確認する。GitHub Actions経由で秘密鍵が注入される場合は Actionsの該当Repository Secret も同時更新対象にする。新しいビルドをデプロイしても他の環境変数とKP台帳を初期化しないこと。
4. 3サービスそれぞれについて「現行バージョン」「最終成功デプロイ」「変更担当」「デプロイ操作」「ログイン検証URL」を作業チェックリストに記録する。
5. 3サービスの設定画面を開いて更新・保存できることを確認する。担当が分かれているなら全員オンラインで待機し、同じ作業窓で切り替える。新しいSecretのコピー先を安全な一時保管領域として準備する（共有チャットには貼らない）。

## 切り替え（短時間停止が発生しうる）
6. Discord Developer Portal → **Applications → 対象アプリ → OAuth2 → Client Secret → Reset** を実行。新値はこの瞬間から旧値を無効にする。**3サービスで旧値を再利用しない**。
7. 新値を、VCT QUIZ/Render・LOOP/Cloudflare・KESO PLAY/CloudflareまたはGitHub Actions Secret の **全設定元** に速やかに登録する。公開リポジトリやCloudflare Variablesの平文欄に保存しない。
8. VCT QUIZを再起動/再デプロイ、LOOP WorkerにSecretを反映、KESO PLAYのActionsで適切なデプロイを実行。デプロイ成功と実際のOAuth認証は別々に確認する。
9. **3サービスすべてで別ブラウザ/シークレットウィンドウから新規Discordログイン** を実施し、callback、セッション取得、ログアウト、再ログインまで確認する。GitHub Actions成功だけでは完了扱いにしない。KESO PLAY Activity内のログインもスマホ/デスクトップで確認する。
10. 作業ログに記録するのは「実施者、開始/終了時刻、成功・失敗、設定箇所名、デプロイSHA」であり、Secret値は残さない。

## 失敗時
- 特定の1サービスだけ失敗した場合は、リセットを連発せず、そこに旧Secretが残っていないか／Secretの注入先とデプロイ実行環境／OAuth Redirect URI の設定を確認する。正常な他2サービスには触れない。
- **旧Secretに戻しても復旧しない。** Discord側ですでに失効している。新値の配布に失敗した場合、同じ新値を再反映して復旧する。
- 新値が流出した場合に限り再Resetし、**3サービスすべて**について再度手順を実行する。
- KP、クイズの達成履歴、LOOPの進行データ、D1をローテーション作業で初期化してはならない。

## 事後検証
- KESO PLAYとLOOPのKP二重払い防止は Client Secretではなくサーバー側の達成一意キー／専用署名鍵が担うため、認証更新後にそれらを上書きしないこと。
- 各サービスの利用者による通常ログインを確認したら作業完了とする。
