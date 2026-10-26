# 速報サービスの移管

このサービスはVALORANT結果速報・デスアンレ予約・戦績スラッシュコマンドと、未接続の試合報酬基盤をまとめたものです。Activityと同じリポジトリで開発できるよう、独立したCloudflareサービスとして取り込みます。Activityの既存コードと別に配置できます。

## 設定と検証

Node 24以上でこのディレクトリ内から npm ci、npm run check、npm run build を実行します。Linuxではnpm.cmdをnpmに読み替えてください。

4つの *.example.json/jsonc だけが公開設定です。npm ciまたはcheck/buildの前処理が、実ファイルがない場合だけサンプルから players.json、reward-accounts.json、discord-config.json、wrangler.jsonc を生成します。既存の実設定を上書きしません。サンプルのまま npm run deploy / npm run db:remote を実行すると拒否します。

実ID対応表・本番設定は非公開の引き継ぎメッセージと元の作業環境にあります。このコード内の人物・ID・本番URLはすべてサンプルで、運用値ではありません。本番の検証・ビルドは公開Web配信対象外の作業場所へコピーして行い、実設定をWebサーバーから配信しないでください。.gitignoreだけではHTTP配信は防げません。

## 稼働中の機能

- 毎分Cloudflare WorkerでHenrik APIを確認しD1に保存、Discord Webhookでコンペ・エスカレーションの結果を通知。
- スコア、マップ、エージェント、KDA、ACS、HS率、JST日次/ACT戦績・連勝連敗、成績・連敗に応じた煽り。同じ試合の登録者を1投稿にまとめ、後から詳細を編集する。
- コンペ引き分けは通知・記録し連勝連敗リセット。エスカレーション引き分けは投稿しない。
- /death start/stop/statusで次のアンレ1試合だけ予約。通常アンレを巻き込まない。KDマイナス、最終R自チーム最後のデス、チームACS最下位のいずれかでコンペ行き。ACSとPerformance Scoreを区別する。
- /valo today,yesterday,week,act,recent,pair,versus,compare,ranking,streaks,players,status,help。
- Interaction署名・時刻・guild・権限・操作重複を検証。SQLはbind、Discordは意図しないメンションを防止。
- 無料APIの300秒キャッシュによる約5分遅延を確認済み。毎分実行や送信が停止していたわけではない。

## 報酬の合意と残る実装

ユーザー指定はモード別参加報酬＋勝利ボーナス、金額は未定です。rewards-config.jsonはenabled=false、金額null、startsAt=nullを維持します。テストの数字は運用金額ではありません。

reward-contract.tsが完了試合イベント・安定キー・見積もり、reward-accounts.tsが管理者の同意済みRiot/Discord対応、wallet.tsとmigration0005が口座・台帳・一度だけの支給処理です。イベントはguild+matchId+PUUIDで識別し、再取得・名前変更・設定更新でも同じ試合を再支給しません。

監視処理からの呼び出し、永続的な支給再試行、ActivityのDiscord認証・口座HTTP API・サーバーゲーム決済はまだ未接続です。本番migration0005も未適用です。D1実機確認は残っています。デモlocalStorage資産やDiscord投稿文面を支給根拠にしません。

INTEGRATION.mdに統合設計、README.mdとDISCORD_SETUP.mdに通知・コマンドの説明があります。実ユーザーの対応と詳細な経緯は非公開メッセージ側の記録を参照してください。チャット全文の物理的な結合はしていません。

## 既存サービスの維持

クイズOAuth、Activity、/interactionsは同じDiscordアプリを共有します。共用アプリを再作成したり、OAuth Redirectを消したり、Bot Tokenをリセットしたりする必要はありません。移管元のWorkerは稼働を維持し、移管検証前に停止・削除しません。有料APIの購入や報酬有効化はこの取り込みに含めません。
