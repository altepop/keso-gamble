# HoYoverse 公開プロフィール連携（2026-11-02 初期版）

KESO PLAY の「稼ぐ」→「HoYoverse プロフィール連携」から、原神、崩壊：スターレイル、ゼンレスゾーンゼロのゲーム内 UID を照会・保存できる。

## 対応範囲
- 本人の KP セッションに紐づく、ゲームごとの UID を最大1件・3作品まで保存する。
- サーバーから Enka.Network の公開キャラクター展示を取得し、表示名、プレイヤーレベル、公開キャラクター（ID・レベル・凸数）を正規化して表示する。
- 原神では、プロフィールの公開実績総数が取得可能である場合に表示する。
- 手動で再取得したとき、同じ UID の前回の表示に対する変化を表示する。キャラの初登場は「公開欄に登場」と記す（新規獲得と断定しない）。
- 登録解除で UID と保存済みスナップショットを消去できる。
- KP 支給・減額・自動監視・ランキング・指令・Discord 通知は実装しない。Steamの有料ゲーム条件とは独立する。

## 安全性・本人確認
UID は誰でも見られる公開情報であり、照会・登録しただけでは当人の所有証明にならない。登録した UID を信用して KP 支給をしないこと。KP報酬を導入するにはゲーム内プロフィール署名のワンタイムチャレンジ等を別途設計・検証する。

HoYoLAB / HoYoverse のパスワード、Cookie、トークンを利用者に入力させない。保存するのは正規化した公開データのみ。入力した UID での問い合わせ先を固定し SSRF を防止する。公開する API は既存の KP セッション認証を通った利用者の私有データだけを返す。

## 取得・D1負荷
- 外部APIはボタン操作時のみ。cronには組み込まない。
- UIDごとに Enka が返す ttl を見て最低5分・最大1時間キャッシュする。再取得期間中の連打は DB の既存結果を返し外部通信しない。
- ユーザーあたり最大8照会/時。古い制限データは初回照会時に整理する。
- 送信する User-Agent を独自に設定し、HTTP リダイレクト拒否、10秒タイムアウト、最大1MBまでのJSON取得を行う。
- DBテーブルは初回操作時のみ遅延作成。3プロフィール/人と、照会回数の記録だけが増える。新しい全件スキャンや毎分監視は行わない。
- 取得失敗時は最新の保存済みスナップショットを維持する。

## 注意と公開前検証
実装済みの API パスは `GET /api/kp/hoyo/status`, `POST /api/kp/hoyo/link`, `POST /api/kp/hoyo/refresh`, `POST /api/kp/hoyo/unlink`。すべてログイン必須。

原神: `https://enka.network/api/uid/{uid}/` 、スターレイル: `https://enka.network/api/hsr/uid/{uid}/`、ゼンゼロ: `https://enka.network/api/zzz/uid/{uid}/` への GET。外部APIの仕様変更や公開設定によって取得できない場合がある。実機での3作品の正規化、失敗状態、クライアントの戻り動作を確認すること。

```sh
npm --prefix services/valorant-results run check
npm run build:activity
npm run check:activity
npm run test:browser
```

現ブランチは本番未配置・KP支給なし。チェック前のマージを行わない。EnkaのAPI規約・最新のHTTPステータスを尊重する。

外部仕様: https://github.com/EnkaNetwork/API-docs/blob/master/api.md
