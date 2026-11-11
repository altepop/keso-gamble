# KESO PLAY Discord権限拡張（2026-11-11）

## 目的

KESO PLAY / あかんbot の既存コマンド・通話監視・Discord Activityを維持したまま、勝敗予想、イベント、スレッド、通話演出などの準備に必要なBot権限を整理する。

ユーザー方針：**管理者・キック・BANは絶対に付与しない。ロールと絵文字・スタンプは既に満杯のため、ロール管理・絵文字/スタンプの作成・管理・外部使用権限を追加しない。** サウンドボードの既存サウンド使用は容量を増やさないため対象とする。

## 追加権限を申請する

1. Discord Developer Portalで対象アプリを確認し、ローカルの `services/valorant-results/discord-config.json` に正しい `applicationId`・`guildId` を設定する。Bot Tokenをコピーしたり、コミットしたりしない。
2. リポジトリのルートから次を実行する。

```sh
node services/valorant-results/scripts/discord-permission-upgrade.mjs
```

3. 出力されるDiscord公式のOAuth2承認URLを、対象サーバーの管理者が開いて許可する。**このスクリプト自体はAPI操作を一切しない。**
4. サーバー設定 → ロール → Bot の権限で反映を確認し、必要なテキスト・ボイスチャンネルのカテゴリ/チャンネル上書きで権限を限定する。

**高度な権限** `MANAGE_CHANNELS` （チャンネルの作成だけでなく編集・削除も可能）は初期セットから除外した。実装・安全性検証後に限り、次を使用する。

```sh
node services/valorant-results/scripts/discord-permission-upgrade.mjs --with-channel-management
```

## 基本セット（権限承認だけでは新機能は有効にならない）

| 分野 | Discordフラグ | 主な用途 |
|---|---|---|
| 投稿 | VIEW_CHANNEL / SEND_MESSAGES / EMBED_LINKS / ATTACH_FILES / READ_MESSAGE_HISTORY | 予想カード、結果、画像 |
| 交流 | ADD_REACTIONS / SEND_POLLS / PIN_MESSAGES | 投票、イベント告知、メッセージ固定 |
| スレッド | CREATE_PUBLIC_THREADS / CREATE_PRIVATE_THREADS / SEND_MESSAGES_IN_THREADS / MANAGE_THREADS | 試合別の話題整理（MANAGE_THREADS は他者のスレッドにも作用するのでコード側制限が必要） |
| イベント | CREATE_EVENTS / MANAGE_EVENTS | 大会のスケジュール登録・修正（MANAGE_EVENTS は他者作成イベントも管理可能） |
| 通話 | CONNECT / SPEAK / MOVE_MEMBERS / USE_SOUNDBOARD / USE_EXTERNAL_SOUNDS / SET_VOICE_CHANNEL_STATUS | 本人同意のあるチーム分け、音響演出、通話チャンネル表示 |
| Activity/コマンド | USE_EMBEDDED_ACTIVITIES / USE_APPLICATION_COMMANDS | 既存KESO PLAY / スラッシュコマンド |

追加セットの `MANAGE_CHANNELS` は明示的なオプションでのみ申請する。

## 絶対に要求しないもの

- `ADMINISTRATOR`, `KICK_MEMBERS`, `BAN_MEMBERS`
- `MANAGE_ROLES`
- `MANAGE_GUILD_EXPRESSIONS`, `CREATE_GUILD_EXPRESSIONS`
- `USE_EXTERNAL_EMOJIS`, `USE_EXTERNAL_STICKERS`
- `MANAGE_GUILD`, `MANAGE_WEBHOOKS`, `MANAGE_MESSAGES`, `MODERATE_MEMBERS`
- `MENTION_EVERYONE`

## 権限と実装は別

- **現状のあかんbot**：`src/discord-interactions.ts` でボタン押下、`src/skirmish.ts` で受取/続行ボタン、`src/voice-gateway.ts` で通話状態監視を実装済み。
- **未実装**：勝敗予想の募集・締切・集計、自動チーム分け、大会イベント作成、サウンドボード再生、スレッド自動作成・整理などは、それぞれコード実装と試験が別途必要。
- **Gateway Intents**：現在の通話Gatewayは `GUILDS | GUILD_VOICE_STATES`（129）のみ要求する。Presence（ゲーム起動）、Guild Members（加入・退出）、Message Content（一般投稿内容）はDeveloper PortalのPrivileged Intents設定＋**適切なGateway実装**が必要。PortalだけをONにしても情報は届かない。確認前に要求intentsを増やすとGateway切断が起こり、通話KPに影響するため、今は変更しない。
- 勝敗予想などではWebhookの一般的な投稿権限とインタラクション処理を優先し、毎分ポーリングと新しいD1負荷を増やさない。
- 音声演出は通話中の音を邪魔しないため、利用者の明示的な操作で開始する方式を採用。本人の許可なしにメンバーを移動しない。
- 予想の参加記録とプレゼンスを扱う場合は、参加者への説明・対象限定・保存期間の設定が必要。

参考：[Discord公式の権限一覧](https://discord.com/developers/docs/topics/permissions#permissions-bitwise-permission-flags)、[DiscordのPrivileged Intents](https://support-dev.discord.com/hc/en-us/articles/6207308062871-What-are-Privileged-Intents)。
