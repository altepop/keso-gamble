# KESO EXCHANGE

Discord Activityで起動する、仲間内向けの架空株式・カジノ・KC交換ゲームの試作版。

- 公開ページ: https://altepop.github.io/keso-gamble/
- GitHub Pages: `main` ブランチの `/(root)` を公開
- 現在のバージョン: v0.2.1（スマートフォン向け取引UI）
- 実装方式: HTML / CSS / JavaScript の1ファイル。追加のビルドやパッケージ導入は不要

## 実装済み

- 主要指数（サンプル値）、仮想株式銘柄、ニュース（サンプル）、ランキング、市場概況
- 株価詳細のローソク足、移動平均線（短期・中期・長期）、疑似板表示
- 株式の買付・売却（1%の仮想手数料）、保有株式と評価額、取引履歴
- ルーレット（0〜36）、赤黒・偶奇・数字指定、暗号学的乱数による抽選
- KCで購入できる装飾・特典のデモ交換所
- デモ給与（30秒間隔で600 KC）
- 端末内保存（localStorage）。v0.1の `keso-exchange-prototype-v1` から移行可能
- iOS / Android / デスクトップの幅を考慮したレスポンシブ画面

## 制約・注意

**現在は完全にローカルのデモである。** ゲーム内通貨KCは現実の金銭や商品と交換できない。

- 日経平均・TOPIX等の画面上の値は、SBI証券の参考画像に近い情報量を表現するための**固定サンプル**。現実の価格・ニュース・為替を反映しない。
- 株式の価格変化も端末ごとに計算するシミュレーション。別の端末やユーザーと共有されない。
- ローソク足、板情報、移動平均線はデモ用の疑似データ。実際の取引所の注文を示すものではない。
- VC参加時間の集計、BotによるKC付与、Discordロール・チャンネルへの反映は**未実装**。
- 本番利用にはDiscordの認証確認、サーバー側の状態管理、取引の原子性、二重決済防止、監査ログ、Botの安全な権限管理が必要。
- 本コードにBotトークンやDiscord OAuthシークレットを直接書き込まないこと。

## Discord Activity設定

Discord Developer Portal → Activitiesで、URL Mappingを設定する。

- Prefix: `/`
- Target: `altepop.github.io/keso-gamble`
- 対応: Web / iOS / Android

※Activityとして動作する環境はDiscord側の仕様やアプリ・テスターの設定に依存する。

## 次の開発候補

1. Discord Embedded App SDKによるユーザーIDの安全な連携
2. サーバー管理の共通KC口座・取引履歴（PostgreSQL）
3. Bot GatewayによるVC滞在時間の計測と給与付与
4. 全プレイヤー共通株式市場と取引処理
5. マルチプレイのカジノ、Discordロール・SEの付与

既存の `valo-quiz` リポジトリは変更していない。
