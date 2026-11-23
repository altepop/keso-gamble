# KESO PLAY: D1 performance and financial-consistency policy (2026-11-01)

## Accepted user requirements

- **Concurrent usage**: design for 3–5 regular Activity users and 10 simultaneous Activity users. Measure browser/network requests under 1, 3, 5, 10 live sessions in a staging fixture. This is a target, **not a claim of measured capacity**.
- **Always-on game world**: 5-minute stock movement, 15-minute racing, horse prizes, KP earnings, voice rewards, debt settlement, Discord delivery queues, and official match settlement continue **without active Activity users**. Prefer indexed no-work checks rather than disabling them.
- **Live financial correctness**: purchases, wagers, settlements and KP balance are validated by the server; the UI fetches the actual state immediately after a successful action. A 15-second lightweight change pulse covers external changes. No client-only fictitious balance. 
- **Discord `/kp ranking`**: never throttle/cache the read: each invocation issues fresh `kp_wallets` + `kp_debts` queries, displays the top ten and owes, and posts publicly. `/kp balance` also remains available. Optional Activity performance optimizations must not alter their behavior.
- **Historical retention**: keep all ledger, payouts, bought tickets, racing history, trades and games. Favor indexes, incremental aggregates, short caches and on-demand ranges; no routine deletions of financial history. Automatically expiring ephemeral sessions/logs are a separate category.
- **M.LEAGUE**: regular match 19:00 JST, user betting begins at **00:00 JST on match day**, not the preceding evening. Cron checks on every day at 18:00 and only during scheduled match evening / next-day 00:00–03:59, per #218.

## Activity loading policy

| Content | On action | Automatic changes |
|---|---|---|
| KP balance, stock buys/sells, wagers | Fresh server-committed result and state | 15s short pulse |
| Stock quotes | Server five-minute tick, then next pulse | 15s pulse; full financial screen fallback 60s |
| Race results and horses | Server result/settlement + race clock | 15s pulse + race-specific refresh; full fallback 60s |
| M.LEAGUE results | Official-only DB monitor in match window | 15s pulse/full fallback 60s on match screen |
| Activity ancillary pages | On demand, except the financial pulse | Full fallback 120s |
| Community transaction feed | Only when expanded, by default on Home | 10s revision check while expanded, none when collapsed/hidden |
| KP trend graph | On demand | No background polling |
| Discord /kp ranking | On every command | Never cached by optional-history mode |

## Cloudflare D1 budget

Cloudflare's Free-tier 5 million Rows read/day resets at **00:00 UTC (09:00 JST)** and is **account-wide**, not per DB.

The read-only GitHub Actions monitor runs each hour using Cloudflare GraphQL `d1AnalyticsAdaptiveGroups` across **all account D1 databases** for the *current UTC day*. Analytics totals are **adaptive sampling estimates and may lag** actual enforcement; never represent them as exact remaining quota.

- Estimated 3.5 million Rows read in the current UTC day: warning/inspection.
- Estimated 4.0 million: set one key `kp_settings.d1_optional_conserve_utc_day` to the current **UTC date** in D1-B, if the existing Cloudflare API token has D1 Write permission.
- While the key matches UTC today, the Worker returns a lightweight unchanged response for optional `/api/kp/feed` and responds with 429 for optional `/api/kp/trend`. It continues serving wallet balances, operations, `/kp ranking`, stock market, automated races and all settlement/notification queues.
- Flag lookup is cached per Worker isolate for up to 60 seconds. It expires automatically at the next 09:00 JST even if an Actions job never runs again. No expensive cleanup scan or persistent data deletion.
- If Cloudflare analytics or D1 writing fails, report the failure and **fail open**; do not risk permanently blocking the game. This is *best-effort load reduction*, not protection guaranteed to activate before D1 quota exhaustion.

## Quality gates and rollback

- Typecheck + all unit tests + Chromium/WebKit browser tests must succeed before production rollout.
- Confirm Cloudflare Worker deploy, not only the GitHub merge or Pages deploy.
- Test ten concurrent Activity clients with **fixtures** first; production load tests should be explicitly controlled to avoid consuming the free quota.
- Monitor account-wide *UTC-day* GraphQL estimates and official Cloudflare Dashboard billing totals. The top-50 `wrangler d1 insights` is only a **lower bound**, not a reliable quota counter.
- If a non-essential feature behaves incorrectly in conserve mode, clear the single UTC-day key or revert the soft-mode code. Do not change existing wallet history or debt balances during rollback.

## Race settlement query optimization (2026-11-01)

- `settleKpRaces` keeps its every-minute scheduling, but uses the partial index `kp_state_pending_race` instead of scanning all `kp_state` JSON rows on idle ticks.
- Index predicate: both exact JSON tokens `"raceBets"` and `"pending"` occur in the stored state. The settlement code still checks the actual ticket status and due time after reading the indexed candidates. Existing KP version guards, double-payment protections and race frequency are unchanged.
- The index is maintained on `kp_state` writes, so compare live D1 total Rows read **and written** during real play with pre-change baseline. Confirm via official Cloudflare Metrics; SQLite `EXPLAIN QUERY PLAN` alone does not prove Cloudflare-billed Rows savings.

## KP trend daily totals (2026-11-03)

- On 2026-11-03 the KP trend graph was the top D1 reader of the hour: each 30-day open read every ledger row of the window (about 9,800 rows; 9 opens ≈ 88,000 rows).
- `kp_trend_days(guild, day, user, net)` now keeps each member's daily change of KP − 借KP (JST day). Triggers on `kp_ledger` inserts and on `kp_debt_events` insert / update / delete keep it current; the debt triggers add up correctly whatever order they run in with the cap trigger.
- The graph reads only `members × shown days` rows from the primary key `(guild, day, user)`, plus `kp_wallets` and `kp_debts`. The old `kp_ledger_trend_window` index is dropped (no longer used; saves its write cost).
- The table is built once from the full history the first time the graph is opened (one full read of the ledger and debt events), guarded by `kp_settings.kp_trend_days_v1`. A rebuild deletes and recomputes in one batch, so running it twice never double counts.
- Ledger history itself is unchanged; the table can always be rebuilt from it by removing the settings key.
## Heavy reads found on 2026-11-03 (24h top list)

| Was | Change |
|---|---|
| Crown schedule scanned every wallet twice a minute (roast levels + big race losses) | Roast levels are read only when a crown is actually named. Big losses (≥ 10,000 KP on one race) are written to `kp_crown_melts` when the race settles, and crowns read that small table. |
| Race results: every minute, up to 3 finished races with nothing to post re-expanded every wallet's bets | A finished race whose result is not worth a post is remembered in `kp_race_post_skips` and not checked again. Races with pending bets are still checked each minute. |
| VALORANT monitor read the latest 200 results every run to know what is already saved | Reads only the rows of the (up to five) matches the API returned for the player, via the `match_id` index. |
| Horse prizes looked back 48 hours on every check (~235 rows) | Looks back 6 hours (covers the hourly retry); the full sweep every 6 hours is unchanged. |
| M.LEAGUE cards re-read in full every 5 seconds of use | After 5 seconds, a one-row version (`ml_state.cards_version`, changed whenever a card changes) decides whether to read them again. |
| Stock screen re-read the last 48 ticks on every wallet read | Kept per isolate for the market version (changes every 5 minutes). |
| Voice history read 100 events (+100 bonus lookups) on each wallet read | Reads 50: today's total needs at most 48 slots. |

## Casino reveal hardening (2026-11-04)

- Casino notifications and win-stage sequencing are presentation-only; no new D1 queries, tables, writes, recurring jobs, payout changes or odds changes.
- Hourly account-wide GraphQL estimates, the 3.5M warning and 4M optional-history conserve mode remain active. Validate real UTC-day read totals on Cloudflare after rollout; this change makes no claim about current usage.
- The README weekly racing/M.LEAGUE purchase limit has been corrected to the existing 400,000 KP; documentation only.

## 2026-11-09 additional audit

The [whole-system audit](D1_AUDIT_20261109.md) records the observed baseline, SQL changes and limits. Relic presentation totals use a transactionally maintained per-member projection after a one-time ledger backfill; financial authorization still uses the original wallet/ledger. Health success timestamps also enforce their five-minute limit in SQL across isolate restarts. The existing UTC-day analytics now reports Rows written and warns at an estimated 70,000; this warning never stops settlements. Compare both reads and writes after rollout before declaring Free-tier readiness.

## 2026-11-23 P12: telemetry completeness versus hard spend cap

The existing account-wide D1 GraphQL dataset is adaptively sampled, delayed, and fetched with a bounded 100-group response. A response with **zero groups**, **no group for the current UTC day**, or **100 groups** is treated as **unknown/incomplete** rather than a verified zero or complete account total. The guard logs the limited reason, reports an unavailable estimate and performs **no new** `kp_settings` write in that case. This does not erase an already-active UTC-day optional-history conservation marker; the existing automatic UTC-day expiry still governs it.

**No strict D1 spending or Rows read/written hard cap has been configured.** The 3.5M/4M read estimates, 70k write warning, and optional feed/trend conservation remain soft signals only. A hard account-level limit cannot be asserted from lagged/adaptively sampled analytics or by stopping only optional reads; automated races, financial ledgers, rankings and other D1 usage remain active. Actual provider-enforced limits, availability, and billing controls must be inspected directly in Cloudflare and cannot be proven by this PR. Do not interpret `unavailable` as healthy or as a quantified remaining quota.

## 2026-11-23 P12 next slice: D1 threshold proposal, NOT an installed hard cap

**Status: proposed; strict account-wide D1 hard cap is NOT configured, NOT verified, and NOT enforced by KESO PLAY.** This slice only makes that status explicit in every return path of `runGuard`. No paid subscription change, billing setting change, D1 schema migration, balance freeze, settlement freeze, or new data deletion is authorized.

### Proposed numeric thresholds and enforcement boundaries

| Measure | Proposed threshold / reference | What enforces it today | Scope and limitation |
|---|---:|---|---|
| Free-tier account rows read | 5,000,000 / UTC day | Cloudflare's Free-tier quota, **only if the account is on Workers Free** | Provider errors after exhaustion; account plan is not verified here. This is not a proactive KESO PLAY hard cap. |
| Free-tier account rows written | 100,000 / UTC day | Cloudflare's Free-tier quota, **only if the account is on Workers Free** | Same; account-wide and D1 reads/writes may fail, including important financial operations. |
| KESO PLAY read warning | Sampled 3,500,000 | Scheduled GitHub Actions observation | Warning only; sampling or delays may miss the threshold. |
| Optional-history read conservation | Sampled 4,000,000 | UTC-day `kp_settings.d1_optional_conserve_utc_day` marker | **Only** optional feed/trend read reductions; core KP/ranking/races/trades/settlements continue. |
| Proposed urgent read warning | Sampled 4,500,000 | **Not implemented** | Future additional warning only, cannot guarantee cap. |
| Existing write warning | Sampled 70,000 | Log warning | No write blocking. |
| Proposed urgent write warning | Sampled 90,000 | **Not implemented** | Future notification and read-only review; never halt ledger/settlement automatically. |
| Strict D1 account hard budget / billing ceiling | No verified setting / amount | **Not configured** | Cannot claim a D1-specific hard bill limit from sampled GraphQL or a `kp_settings` marker. |

### Proposed escalation / actual enforcement path (future work; not enabled by this PR)

1. Confirm Cloudflare account's actual Workers plan, account-wide D1 rows usage, and Billing settings with read-only evidence. Free daily quotas are **provider-enforced** starting September 1, 2026; when exhausted, D1 queries fail until UTC midnight. Verify this account is on Free before treating them as active enforcement.
2. Keep the existing 3.5M read / 70k write warning, and existing 4.0M read **optional-history-only** soft conservation. The proposed 4.5M read / 90k write urgent alerts require a separate approved implementation and CI before activation.
3. If a true spending ceiling is required on a Paid plan, verify whether a provider-side D1-specific control exists and can enforce the desired scope; do **not** equate Workers/Durable Objects spending limits with a D1 cap. Cloudflare states that even supported spending limits may lag and may not bound the final invoice.
4. A possible application-side future gate may fail closed **only for enumerated non-financial optional endpoints**; it must be server-authoritative, measured under concurrency and explicitly allow all wallet, debt, stock, race, KP settlement, purchased ticket, audit, and regulatory retention paths. It **cannot** be presented as an exact account-wide cap, because other clients/Workers/automations can access D1, and sampled GraphQL metrics may lag.
5. Do not activate any automatic billing-plan change, D1 query shutdown, financial lock, or account-wide kill switch without a separate reviewed proposal, acceptance criteria, and rollback plan. Unknown telemetry remains **unknown**, not 0, healthy, or hard-cap success.

Official references:
- D1 pricing and quota: https://developers.cloudflare.com/d1/platform/pricing/
- Free quota enforcement, 2026-09-01: https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/
- Spending limits apply to Workers/Durable Objects, and may not guarantee maximum final charge: https://developers.cloudflare.com/billing/manage/spend-management/
