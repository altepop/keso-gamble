# KESO PLAY Discord権限拡張（2026-11-11）

## 方針

管理者・BAN・キック、ロール・絵文字・スタンプの管理権限は付与しない。KESO PLAYはゲームBotとして、利用者のコンテンツやサーバー全体を変更できる管理権限を持たせない。現行の権限申請スクリプトは **19項目の基本権限** に限定した。音声チャンネルへの他人の移動とプライベートスレッド作成は明示的な追加オプションにした。

**Discord権限を許可するだけでは機能は実装されない**。本番Botの稼働コード・既存の通話Gateway・D1・KP精算は、このPRでは変更しない。

## PCがない場合：iPhoneからの権限変更

Discord iOSアプリで対象サーバーを開き、「サーバー名 → 設定 → ロール → 対象Botロール → 権限」に進み、必要な権限をオンにして保存する。表示名・場所はアプリの版によって変わる場合がある。サーバー管理者または必要な管理権限を持つユーザーが操作する。Botが持つ実際の権限は各チャンネルの上書き設定にも左右される。

Discord Developer Portal の OAuth2 URL Generator から Bot と applications.commands を選ぶ方法でも申請できる。iPhoneのブラウザーで表示が狭い場合は「デスクトップ用Webサイトを表示」を使う。

## 権限申請リンクを生成する（PCを使えるときの代替手段）

`services/valorant-results/discord-config.json` に既存の `applicationId`・`guildId` がある環境で、以下を実行する。

```sh
node services/valorant-results/scripts/discord-permission-upgrade.mjs
```

出力されたURLをDiscord上で管理者が開いて許可する。このスクリプトはDiscord APIを呼び出さない。

任意の機能を追加する場合：

```sh
node services/valorant-results/scripts/discord-permission-upgrade.mjs --with-voice-move
node services/valorant-results/scripts/discord-permission-upgrade.mjs --with-private-threads
```

移動は本人の同意を得た試合募集・自動チーム分けでしか使用しない。非公開スレッドは本当に必要な場合に限る。サーバー全体へのチャンネル管理・イベント管理・スレッド管理はオプションでも要求しない。

## 基本権限 19項目

| 分野 | 権限 |
|---|---|
| 投稿・結果通知 | VIEW_CHANNEL / SEND_MESSAGES / EMBED_LINKS / ATTACH_FILES / READ_MESSAGE_HISTORY |
| 投票・告知 | ADD_REACTIONS / SEND_POLLS / PIN_MESSAGES / MENTION_EVERYONE |
| 公開スレッド | CREATE_PUBLIC_THREADS / SEND_MESSAGES_IN_THREADS |
| イベント | CREATE_EVENTS （Bot自身のイベントの編集・削除も可能） |
| 通話・既存のサウンド | CONNECT / SPEAK / USE_SOUNDBOARD / USE_EXTERNAL_SOUNDS / SET_VOICE_CHANNEL_STATUS |
| Activityとコマンド | USE_EMBEDDED_ACTIVITIES / USE_APPLICATION_COMMANDS |

※ MENTION_EVERYONE は重大イベントでのみ、運営が事前に許可した投稿種別・チャンネルに限り使用する。通常の勝敗速報・KP精算・繰り返し通知では使わない。通常のBot投稿は `allowed_mentions: {parse: []}` を維持し、承認済みの特別イベントだけ明示的に `everyone` を許可する。

※ PIN_MESSAGES はほかの投稿にも作用するため、実装する際はBotが投稿したメッセージだけを固定・解除する。音声演出はデフォルトOFF、明示的な操作で起動する。

## オフを維持する権限

- 絶対禁止：`ADMINISTRATOR` / `KICK_MEMBERS` / `BAN_MEMBERS`
- 容量・管理方針：`MANAGE_ROLES` / `CREATE_GUILD_EXPRESSIONS` / `MANAGE_GUILD_EXPRESSIONS` / `USE_EXTERNAL_EMOJIS` / `USE_EXTERNAL_STICKERS`
- 他者に影響する管理：`MANAGE_CHANNELS` / `MANAGE_MESSAGES` / `MANAGE_WEBHOOKS` / `MANAGE_GUILD` / `MODERATE_MEMBERS` / `MUTE_MEMBERS` / `DEAFEN_MEMBERS` / `MANAGE_NICKNAMES`
- 管理範囲：`MANAGE_EVENTS` / `MANAGE_THREADS`

非公開スレッド作成とメンバー移動は、上記2つのオプションを使うときに限り承認する。Discordの音声チャンネル移動機能は悪用すれば通話を妨害できるため、対象チャンネルの上書き制限、実装上の参加同意を前提とする。

## Privileged Intentsは別管理

既存Gatewayは `GUILDS | GUILD_VOICE_STATES`（129）を要求する。Presence、Guild Members、Message ContentなどはDeveloper Portalでの設定と追加開発が必要。実装前にONにしても検知できない。Gateway切断や通話KPへの影響を避け、今回の権限申請とは分離する。

## 今後の実装対象

既存の `src/discord-interactions.ts` にボタン、`src/skirmish.ts` にスカーミッシュの受取/続行、`src/voice-gateway.ts` に通話状態監視がある。勝敗予想、イベント、スレッド、チーム移動、サウンドボードは未実装で、テスト・利用者同意・権限チェックとD1負荷管理を経て有効化する。

参考：[Discord公式Permissions](https://discord.com/developers/docs/topics/permissions)、[Discord Roles and Permissions](https://support.discord.com/hc/en-us/articles/214836687-Discord-Roles-and-Permissions)。
