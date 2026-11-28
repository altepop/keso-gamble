# パチンコ Phase 01 — 現行カジノの境界と測定計画

対象は PK-R01、PK-R08、PK-R09、PK-R12。コード調査の基準は main の `42e02ab6a33539ebd1c498f839eb0808e2cf4b99`。マスター計画のドラフト #912 を前提とする。隔離実測は未確認。

| 項目 | 現行コードと確認したこと |
| --- | --- |
| 入口 | [casino-view.js](../js/casino-view.js) の `CASINO_GAMES` と `gamePicker` が7種のタブを定義する。[app.js](../js/app.js) の `screenCasino` が画面を組み立て、`doCasino` と `doMoreCasino` が操作を処理する。 |
| 共有ロジック | [casino.js](../js/casino.js)、[casino-more.js](../js/casino-more.js)、[engine.js](../js/engine.js) に既存ルールがある。Workerは抽選に使う乱数をサーバー側で用意する。演出表示は確定結果を受け取る側に置く。 |
| デモ | `CASINO_DEMO` と `MORE_DEMO` は `commit` で端末状態を更新する。[store.js](../js/store.js) はIndexedDBとlocalStorageを扱う。パチンコデモの受入試験ではデモ用状態を分け、カジノ操作の本番API要求とKP台帳変更がゼロであることを検査する。 |
| KP操作 | [app.js](../js/app.js) の `liveOperation` は `wallet.operate` の後に `wallet.state` を読む。玉ごとにこの経路を呼ぶ設計は避け、バッチで確定する場合の通信回数を比較する。 |
| 精算と再送 | [kp-api.ts](../services/valorant-results/src/kp-api.ts) の `kpApi` がセッションを解決し、`operateKp` が操作IDとリクエストハッシュを照合する。同じ要求は保存済みの応答を返す。確定挿入はwallet/stateのversionを条件とする。既存の借KP制限、精算・再送・並行操作は [casino-kp.test.ts](../services/valorant-results/test/casino-kp.test.ts) を参照する。新しいセッションとKP台帳の原子性の検証はPhase 14で行う。 |
| 既存回帰 | [package.json](../package.json) のブラウザー群と [VALORANT Bot check and deploy](../.github/workflows/valorant-results.yml) を確認した。主要なカジノの回帰は `casino-browser-check.cjs` と `casino-more-browser-check.cjs`、Workerの既存精算は `casino-kp.test.ts` が扱う。 |
| 負荷の基準 | [10人ブラウザー試験](../scripts/d1-ten-user-browser-check.cjs) はAPIをモックし、通信の回数とセッション分離を検査する。D1読取行数の実測には使えない。[日次ガード](../scripts/d1-daily-guard.mjs) の値はアカウント全体のサンプル推定であり、操作単位の隔離測定と区別する。マスター計画の5万rows_read/日、全体100万行/日、CI 2分は比較対象となる暫定目標。 |

## 次に取る基準値

1. 合成ユーザーだけを持つローカルD1に既存マイグレーションを適用する。現行のチンチロ1操作、マインズの開始と終了、同じ操作IDの再送、状態取得を測る。初回初期化とウォーム状態は別に記録する。
2. 1人と10人で同じ操作列を使い、HTTP数、D1文数、応答の `meta.rows_read`・`meta.rows_written`、p50/p95を採取する。ローカルで得られない値は、その旨を記録して隔離D1で補う。公開APIや実ユーザー残高は使わない。
3. 同じ基準SHAの必須CIの実行時間と内訳を記録する。スケジュール監視の結果と、機能の必須CIは別に扱う。

## Phase 05で比較する方式

同じ盤面版・シード・量子化入力から、クロス環境で入賞順と結果が一致するかを確認する。Chromium、WebKit、Workerで、通常入力と境界入力、再生時間、CPU、最大同時玉数を測る。固定入力を使う再演算方式を最初に試し、一致性または処理予算を満たせない場合は、サーバーが入賞を確定する公開モデルを比較する。PoCのライブラリー・方式・正式スペックは実測後に決める。

## 現時点で決定が必要か

Phase 01のコード調査と隔離計測には追加の仕様決定は不要。初号機の正式名・世界観はアート制作前、貸出・交換・賞球・上限と当選率はPhase 04の分布・KP供給影響の検証後、再演算方式と依存ライブラリーはPhase 05の比較後に判断する。
