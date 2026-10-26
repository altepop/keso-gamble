# ミームの引用と出典

確認日: 2026-10-26。ユーザー指定は、ミームを使う場合はそのミームで実際に使われた言葉だけを表示すること。
前版の引用に付け足した創作文45本を削除し、引用カタログと創作カタログを分離した。

## 表示ルール

- `meme-quotes.json` の `text` をそのまま一つ表示する。引用同士をつなげない。
- 独自のオチ、ゲーム用への言い換え、連勝・連敗数、別のミームを接ぎ足さない。
- 試合のスコア・連勝数は既存の成績欄で表示する。引用の中へ埋め込まない。
- 出典と確認範囲のある短い文句だけを登録する。創作したネットノリは `net` で管理する。
- 異なる場面で使う同じ引用を、別のセリフとして数えない。

## 採用した資料

| 出典キー | 確認したもの | 確認範囲 |
| --- | --- | --- |
| yokatta | [元ネタラボの場面説明・文字起こし](https://motonetajp.com/yokatta-konokyoride/) | 同じ場面の返し・呼びかけ・制止の短い5文句。長い発言は連続した短い箇所をそのまま抜粋し、補完しない。松本等しいの返しとして紹介されている。本人の松本人志と混同しない。 |
| uow | [ざわっとミーム辞典の用例・返答](https://zawatto.com/meme/uow/) | 配信コメントとそれへの返答の定型。最初の発言者は断定しない。 |
| gyoza | [元ネタラボの場面説明・文字起こし](https://motonetajp.com/saigono-gyoza/) | タイトルコールを譲り合う場面の短いツッコミ。距離のミームとは別場面。 |
| kuiya | [元ネタラボの場面説明・文字起こし](https://motonetajp.com/kuiya/) | ガキの使いのなぞなぞへの短い回答。距離のミームとは別場面。 |

## 2026-10-26の追加調査

短い引用を33本追加し、引用は合計42本。出典ごとに `recentContext` を保存する。
最近の使用例と元ネタが生まれた年代は区別し、人気順・全SNSの流行度を測ったとは扱わない。

| 追加した系統 | 参照した資料 | 採用・確認範囲 |
| --- | --- | --- |
| 距離ミームの続き | [Steamコミュニティ投稿](https://steamcommunity.com/profiles/76561198133561297/)、[note質問箱](https://note.com/qa/etudiant/q/cf16480b4b6e4298909b605f2b13139c) | VTRへの進行の一文と掛け声を、それぞれの投稿表記から採用。異なる投稿を合成しない。派生楽曲の歌詞は採用元にしていない。 |
| 同じ番組の野球・お祭りネタ | [9月9日のファン記事](https://note.com/ponwe_stars/n/n7cf11615ff8a) | 短いセリフと半角カナの返答をそのまま採用。距離の返しの直後とは扱わない。 |
| ショートスリーパー周りの対談 | [Smart FLASH記事のライブドア掲載](https://news.livedoor.com/article/detail/32021763/) | 報じられた発言・投稿の短い抜粋。医学的事実やプレイヤーの睡眠状態を述べるものではない。 |
| マイクロスリープ | [Smart FLASHの配信記事](https://smart-flash.jp/entertainment/entertainment-news/427872/) | 報道中で引用されている短い説明。人物の主張を正しい睡眠情報として扱わない。 |
| クイヤへの返答 | [元ネタラボ](https://motonetajp.com/kuiya/) | 堀大輔の配信の短い返答。動物が実在すると主張する意味ではない。 |
| RUSTの反応 | [用語解説](https://drks-archive-fan.com/neta/term_mendokuse_aakoreda) | ファン記事・クリップ名などで記録された短い文句。厳密な音声表記は未確定。 |
| エリート | [用語解説](https://drks-archive-fan.com/neta/term_elite) | 記録されたセリフの短い連続部分。元のゲームの具体的なランクをプレイヤーへ当てはめない。 |
| いいわぁ | [用語解説](https://drks-archive-fan.com/neta/term_iiwa) | 配信・チャットの用例。ヤフミ本人の元発言とは断定しない。 |
| 王道家 | [用語解説と公式動画への参照](https://drks-archive-fan.com/neta/term_aji_koi_usui) | 動画題名の文句と配信チャットの略形。略形を社長の元発言とは扱わない。 |
| 親子の寸劇 | [用語解説](https://drks-archive-fan.com/neta/term_jun_no_kachida) | 原文の名前を置換せず、勝利場面だけに割り当てる。声真似の元作品は未確定。 |
| 了解お兄さん | [用語解説](https://drks-archive-fan.com/neta/term_ryoukai_oniisan) | ゲームの妹の返事と配信者の返答を別々に採用。発祥配信者は断定しない。 |
| 配信の定型コメント | [5億マジかw](https://drks-archive-fan.com/neta/term_gooku_majika)、[効いてて草](https://drks-archive-fan.com/neta/term_kiitete_kusa)、[一旦な](https://drks-archive-fan.com/neta/term_ittanna)、[3がある](https://drks-archive-fan.com/neta/term_san_ga_aru) | 過去からの定番を含む。本人の元発言・由来の確定とは扱わない。 |
| 気が利くねぇ | [10月23日の解説](https://zawatto.com/meme/kiga-kikune/) | 9月の拡散と10月の使用を記録した資料。高須幹弥とステハゲの元祖を断定しない。 |
| これ毒かも | [10月20日の解説](https://fomo-fomo.com/sns/trend/yabai-doku-maybe-meme-2026/) | 2022年のコントと2026年10月の派生投稿の短い文句。資料の連続した短い部分だけを採用。 |

[ドロクサーアーカイブの整理](https://drks-archive-fan.com/neta/term_yokatta_kono_kyori)も由来の照合に使った。
一次動画を開く試行は取得制限で成功していない。動画を視聴・音声確認したとは扱わない。
今回採用した表記は二次資料で確認できた範囲。長い会話全文や、資料によって表記の揺れる続きを再構成しない。

`test/comments.test.ts` では、出典の存在、対象場面、引用だけの表示、連勝数の非挿入、
全引用の到達性、削除した独自の続きが残っていないことを確認する。
