# スマホ版Discordでの起動停止（Issue #138）

基準は `0bbf0af`。報告端末はiOS 26.4.2。実機のSafari Web Inspectorへ接続できる環境はないため、端末固有のコンソールは取得していない。

## 切り分けの結果

[調査用CI](https://github.com/altepop/keso-gamble/actions/runs/40851320682) でWebKit 26.6を使い、以下のフロントを新しい順に比較した。Discordのホスト応答・口座APIだけを模擬し、公式SDKと各版の実JS/CSSを実行した。

| 版 | WebKitでの起動・ログイン・タップ |
| --- | --- |
| 0bbf0af（#137後の基準） | 成功 |
| e84a82b（#135） | 成功 |
| 5932334（#134） | 成功 |
| 955227f（#132） | 成功 |
| 6f64df8（#130） | 成功 |
| 3030900（#129） | 成功 |
| fc548dc（#128） | 成功 |
| f099165（#127） | 成功 |

新しい構文やカジノのコード単独では再現しなかった。

再現できた欠陥は、新しいフロントと古い未バージョン付き依存モジュールの混在。#135から `casino-more.js` が `./casino.js` の `validCard` をimportするが、旧ファイルはそれをexportしていない。`engine.js` からも未バージョン付きでこの依存に到達していた。

基準版を実行し、未バージョン付き `/js/casino.js` だけに #134のファイルを返すと、Chromiumで以下を確認した。CIのWebKitにも同じ負の対照を残す。

- `The requested module './casino.js' does not provide an export named 'validCard'`
- タイトルの描画なし
- Discord SDKのHANDSHAKEなし（ホストへ1件も送られない）

これはDiscordの起動カバーが残る条件を説明する。ただし、実機の失敗時レスポンスを取得していないため、ユーザー端末での原因をこの1件に断定はしていない。アプリのキャッシュ削除だけでは、配信元や中継にある古いレスポンスまで消えたとは確認できない。

## 修正

1. `index.html` は小さい `bootstrap.js` から起動する。画面モジュールや口座APIを待つ前に、公開のActivity originからアプリIDを読み、公式SDKのreadyを済ませる。
2. 口座の本人確認・PKCE・認証後のPiP設定は従来の接続処理で行う。先行するreadyは認証や入金ではない。
3. JS/CSS全体の内容から生成する同じ版を、HTMLと全ての相対JS import（共有エンジンの内部、動的SDK importを含む）へ付ける。依存だけ未バージョンで残さない。
4. モジュール読み込みに失敗したら、起動段階・公開リリースID・再試行ボタンを表示する。SDKがreadyになった後の失敗を、ネイティブのロゴの裏に隠さない。SDK自体から応答がないケースは、この修正でホストのカバーを強制解除するものではない。
5. `check:activity` で読み込み版の更新漏れをCIで拒否する。

## 変更時の手順

```sh
npm ci
npm run build:activity
npm run check:activity
npm test
npm run results:check
npm run results:build
```

SDKそのものを更新した場合は、先に `npm run build:discord`、続けて `npm run build:activity` を実行する。生成されたURLとHTMLもコミットする。

## ブラウザー検証

```sh
npm install --no-save playwright@1.63.0
npx playwright install --with-deps chromium webkit
npm run test:browser:all
```

WebKitでDM・サーバー内のタップ、取消、未設定・失敗・遅延する口座設定、読み込めない画面モジュールと再試行、古い依存ファイルを含む配信を検証する。音声APIの不使用・本人確認・ログイン中の課金なしも既存検証に含む。CDPでタッチ中に更新する検証はChromiumで継続する。

基準版の負の対照だけを手元のChromiumで再現する場合（履歴を含むcheckoutが必要）：

```sh
KESO_TEST_REV=0bbf0af KESO_MIXED_CASINO=1 KESO_EXPECT_LEGACY_FAILURE=1 node scripts/discord-auth-browser-check.cjs guild-touch
```

このコマンドは失敗条件が再現することを確認するテスト。通常の修正版の検証は `KESO_MIXED_CASINO=1 node scripts/discord-auth-browser-check.cjs guild-touch`。

本番での同一端末・同一サーバーからの再確認は、ユーザーによるマージ後に必要。調査・テストから本番の口座操作、通知送信、Discord設定の変更は行っていない。
