# 元C3推論資材の取り扱い

このフォルダの `modeb-c3-browser.mjs` と `modeb-c3-encoder.mjs` は、同じ所有者の `altepop/m-league-manager` から、ユーザーの許可を受けて移したものだ。元のライセンス/対応ソースを継承する。

- モデル重み：C3 v1.0、[Mateces/c3](https://github.com/Mateces/c3/releases/tag/v1.0)、MIT（`C3-LICENSE.txt`）
- Mortal由来の観測器：AGPL-3.0-or-later（`AGPL-3.0.txt`）
- JavaScript移植部：元実装のMIT表記（`CLIENT-LICENSE.txt`）
- ONNX Runtime 1.24.3：MIT（`ORT-LICENSE.txt`）、[第三者通知原本](https://m-league-manager.onrender.com/assets/c3/ORT-NOTICES.txt)
- 観測器の対応ソース（ビルド手順/固定依存を含む）：[source.tar.gz](https://m-league-manager.onrender.com/assets/c3/source.tar.gz)、SHA-256: `1de32856fef08211378bfaa372cea747892104f796c567a5185414b5e1b07316`
- 元モデル・配布マニフェスト：[manifest.json](https://m-league-manager.onrender.com/assets/c3/manifest.json)

KESO PLAYのGit管理には巨大なONNX/WASM資材を含めない。`mahjong-c3-download.mjs` が実行時に元の静的配信から取得し、既知の版・サイズ・SHA256を検証してGitHub Actionsの専用キャッシュへ置く。外部からの取得は本人が管理する上記ドメインだけで、ライセンス文や対応ソースを隠して配布しない。

この変更ではMortal本体の観測WASMを作り直したり修正したりしない。元実装とモデルの互換性については実行テストにより検証する。Mortal由来のソースと派生コードを再配布/ネットワーク提供する場合、対応するAGPLの要件を引き続き守る。
