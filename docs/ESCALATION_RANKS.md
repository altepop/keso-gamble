# エスカランクの確認

Discordでは次のコマンドで確認できる。ランク照会で残高・台帳は変化しない。

| コマンド | 内容 | 表示範囲 |
| --- | --- | --- |
| `/kp rank` | 自分のランク・RR・認定進捗・今ACTの最高・前ACTの記録 | 本人のみ |
| `/kp rank user:@メンバー` | 同じサーバーのメンバーのランク情報 | 呼び出した本人のみ |
| `/kp ranks` | 今ACTの認定済み上位10人。同RRは同順位 | チャットへ公開。メンション通知なし |

いずれもDiscordの署名検証済みInteractionsからのみ利用する。内部レート・口座残高はランクカードに含めない。認定していないメンバーも口座を作らず未認定として表示する。

Activityは「稼ぐ」の先頭に、ランク専用カードを表示する。各ランクの紋章・RRゲージ・認定のステップ・戦績・最高ランク・前回変動幅と、詳細内の順位・過去ACT・全ランク一覧を確認できる。認定中は前ACTのランクを表示し、初回KDプラスの100RRは通常補正と分けて表示する。

## 画像

`assets/escalation-ranks/` はKESO独自のオリジナル紋章10種（9ランク＋未認定）。VALORANT公式画像を複製したものではない。Activityは軽量SVG、DiscordのEmbedは公開Pages上のPNGを利用する。画像は静的で、ユーザーID・認証情報・内部レートを含まない。画像取得用の外部サービスは追加しない。

SVGの作成元は `scripts/build-escalation-rank-art.mjs`。PNGは同じSVGをChromiumで256pxにラスタライズしたもの。Activityのキャッシュ版数は画像の内容も含めて計算する。表示に音声・canvas・WebGLは不要。

## Discordへの登録

`KP_COMMAND_VERSION`（v26：ランクと音楽コマンド共存版）を更新し、既存のVoice Gatewayの差分登録に反映する。さらに既存Client Secretによる `applications.commands.update` の短命トークンで、10分ごとの既存cron内から `/kp` 一つだけを更新する。`/death`・`/valo`・クイズOAuth・ActivityのEntry Pointは変更しない。新しい秘密値の入力は不要。

`GET /api/discord/rank/status` で、期待するコマンド版数と登録済みマーカーを確認できる。トークンや秘密値は返さない。Discordが登録内容を確認できた場合だけマーカーを保存する。登録直後はDiscordクライアントの候補更新に時間が掛かることがある。

初回3試合／ACT更新1試合／エピソード更新3試合、報酬との関係や内部計算は `VALORANT_REWARDS_REVIEW_20261111.md` を参照。
