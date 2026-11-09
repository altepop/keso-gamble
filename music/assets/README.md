# KESO PLAY MUSIC — 公式楽曲のみ

KESO PLAY内の音楽プレイヤーは運営が配信した楽曲のみ再生する。利用者によるファイル読み込み・アップロード機能は提供しない。

収録中の音源：
- `music/assets/mou-isshu.mp3` — 『もう一周』
- `music/assets/genkai-rhapsody.mp3` — 『限界集落狂詩曲』
- `music/assets/午前二時の共犯者 (1).mp3` — 『午前二時の共犯者』
- `music/assets/応援歌 (Remastered).mp3` — 『応援歌』
- `music/assets/誤差の女王B.mp3` — 『誤差の女王』（採用版B）

楽曲を追加する場合、管理者がリポジトリにMP3を配置し、`music/player.js` の `tracks` 一覧に追加してコードレビューとCIを通す。利用者から任意のファイルパスやURLを渡す機能を追加しない。

- 自動再生は初期ON。ただしブラウザ/Discordで許可されなければ再生ボタンで開始する。
- 別タブ・裏画面に移っても意図的には停止しない。曲の終了時も次曲に進む。ただしiOS・Android・DiscordやOSの省電力制御でバックグラウンド再生が制限される場合がある。手動停止時は自動で再開しない。
- 初期音量5%、曲と音量と自動再生ON/OFFは端末のlocalStorageに保存。
- 曲のデータをIndexedDBに保存しない。D1/KPのデータにも影響しない。
- 音源利用権や公開範囲は楽曲追加前に確認する。
