# Phase 9 報酬ポリシー投入・停止 Runbook（**未承認・未実施**）

**重要**：これは将来の一括実施に備えた手順ドラフトである。文書中のSQLは**実行しない**。報酬未有効のまま。ギルドID、開始日時、Cloudflare D1監視担当、停止・ロールバック手順の4ゲートが明示承認されるまでは、適用禁止。

## 事前入力・必須ゲート
- `GUILD_ID`：Discord管理画面や認証済み実設定で裏付けた数値のギルドID（推測禁止）。
- `STARTS_AT_MS`：ユーザー承認済みJST開始時刻をUnix epoch millisecondsへ変換した整数。
- `MONITOR_OWNER`：Cloudflare D1監視責任者。現提案（**PROPOSED・未承認**）は「ユーザーがダッシュボード監視、異常はoversightチャットへ報告」。
- `STOP_PLAN`：使用量急増、報酬異常・エラー時は即時無効化する停止条件、停止権限、復旧要件の承認。現提案は**PROPOSED・未承認**。
- 対象Worker main SHAのCI・Pages・Worker成功と、適用直前に対象ギルドに既存ポリシーが存在しないかを読み取り専用で確認。

## 本番に適用する2行の予定値（**未実行**）
`kp_duel_reward_policy_v2` の mode別2行。PvE日次・ペアはNULL（無制限）。PvP日次はNULL（全体無制限）、ペアは4（JST暦日）。確率はBPS。
- PvE: `(guild, 'pve', starts_at_ms, NULL, NULL, 1000, 0, 0)`
- PvP: `(guild, 'pvp', starts_at_ms, NULL, 4, 1000, 500, 500)`

未来の承認実行は1トランザクションで2行を登録する。任意の既存行の上書きを禁止し、既存ポリシー発見時は停止する。`starts_at_ms` が未来の適用日時であることを別途確認する。文字列をそのままSQLへ連結せずパラメータ結合する。

### 承認後のSQLパターン（**参考・実行禁止**）
```sql
BEGIN IMMEDIATE;
INSERT INTO kp_duel_reward_policy_v2
 (guild,mode,starts_at,daily_cap,pair_cap,win_bps,loss_bps,draw_bps)
 VALUES (?1,'pve',?2,NULL,NULL,1000,0,0);
INSERT INTO kp_duel_reward_policy_v2
 (guild,mode,starts_at,daily_cap,pair_cap,win_bps,loss_bps,draw_bps)
 VALUES (?1,'pvp',?2,NULL,4,1000,500,500);
COMMIT;
```
このSQLはクライアントのバインディングに合わせた設計例で、Cloudflare D1のWebコンソールに直接貼って動く完成コマンドではない。実運用ではギルドID・時刻をバインドして原子的実行し、成功の確認が必要である。今回のPRでSQL実行器や本番用APIを追加しない。

## 停止と復帰（**PROPOSED・ユーザー承認待ち**）
- 監視指標が異常なら新規抽選を停止。既存の報酬コレクションや勝敗/KP精算を巻き戻さない。
- 例：対象ギルドのPvE/PvPのポリシー2行を無効化（削除するか非発行設定へ変更する運用は事前承認する）。本番操作は管理者のみ・監査ログ付きで実行し、既存台帳を削除しない。
- 復帰は原因、D1予算、異常な抽選・多重付与がないことを確認し、別途明示承認を取得してから行う。

## 記録
- #543：同一相手4試合、異なる相手の総日次上限なし、通算13回目以降の減衰。
- #642/#643：NULL上限対応と通算抽選13回目からの確率半減。
- #630：本番リリース前のオフライン検証。
- Phase 9全体完了宣言は本番運用ゲート承認まで保留。Phase 10は並行で開発するが報酬設定は変更しない。
