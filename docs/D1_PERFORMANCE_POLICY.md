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

## 2026-11-23 P12: 1-hour SQL hotspot evidence and reduction runbook

**Observed GitHub Actions evidence (run 45138534373, inspect job 137570546536; read-only):**
- `scripts/d1-read-audit.mjs` sets `WARN_ROWS_PER_HOUR=80000`, computes the sum of the returned top-50 SQL rows from D1-A and D1-B over 1h, and intentionally sets exit code **2** when that lower bound exceeds the warning. **Never turn this warning into success by relaxing the threshold or blindly rerunning.**
- At the audited snapshot, 1-hour lower bounds were **D1-A 75**, **D1-B 102,584**, total **102,659 Rows read**. This was **22,659 (28.3%) above** the 80,000/h warning threshold. `D1_READ_AUDIT_DONE successes=4 errors=0` means both databases supplied the two requested 1h/1d Insights windows. The workflow `inspect` step was Failure as designed; the subsequent optional-history guard ran successfully.
- UTC-day adaptive GraphQL estimates during that run: **1,846,991 Rows read / 14,402 Rows written**. They are estimates, not an accurate account-wide quota remainder or a strict spending cap.
- The D1-B **24-hour** top SQL shape read **2,392,110 Rows** over **266 calls** (about **8,992/call**), naming `coach_member_queue`, `coach_member_sources`, `coach_member_links`, `coach_position_backfill`, `valorant_match_positions`. This is an investigation priority **for the 24-hour sample only**; the particular SQL shape responsible for the latest **1-hour** overrun has not yet been established.
- A separate 24-hour top SQL form that traversed `json_each`, `tracked_players`, `monitor_state`, and match round tables was **256,212 Rows / 44 calls** (around **5,823/call**). Future tuning must verify its actual current frequency and its planner/index behavior, not remove retention or mandatory collection blindly.

**This split adds no Cloudflare calls.** It prints the top five 1-hour SQL shapes from the *existing* `wrangler d1 insights --time-period=1h --limit=50` response into Actions logs and the job summary, including operation, table names, calls, Rows read, and percentage of the returned top-50 lower bound. Raw SQL, identifiers, predicates, literal values, access tokens and individual match data are not logged.

**Safe load-reduction workflow for the next authorized optimization PR:**
1. Compare two separately recorded 1-hour read-only snapshots (same duration) with 1-hour shape frequency and rows/call. Check whether the `coach_member_*` join remains dominant or whether a different form drove the overrun. Compare D1-A and D1-B independently.
2. If the high-volume coach join persists, inspect the original SQL, indexes and `EXPLAIN QUERY PLAN` on an isolated fixture or read-only plan query before proposing bounded candidate filters, indexes or incremental projections. Check that archived matches, all registered members, and consent/ownership boundaries remain correct.
3. If scheduled polling is the culprit, use keyed per-member progress or bounded incremental refresh rather than full-table scans. Never disable active match capture, earned KP, stock/races, reconciliations, debt, immutable ledger or retention obligations. Keep backup/restore safeguards and D1 read/write costs in scope.
4. Make performance changes in a separate PR with fixed SQL fixture regression tests, a rollback path, and read-only production post-deploy Insights comparing 1-hour rows/call and total lower-bound changes. Do not claim a numeric production reduction until that follow-up observation exists.

**What has not been done:** no SQL query or index has been changed in this PR, no verified drop in Rows read has occurred, and no strict D1 hard cap has been enabled or verified. A top-50 lower bound is not the complete account total.

## 2026-11-23 P12 D1 optimization and missed deployment-watch schedules (joint split)

### Production evidence and scope

- 2026-11-23 post-#812 run [45141431345](https://github.com/altepop/keso-gamble/actions/runs/45141431345): 1-hour top-50 **Rows read lower bound 122,736** (D1-A 135, D1-B 122,601), exceeding the existing **80,000/h warning by 42,736**. The audit's exit code 2 is deliberate. Do not raise or bypass this threshold to make CI green.
- D1-B top one-hour SQL shape: SELECT `valorant_match_rosters`, `valorant_match_round_events`, `json_each`, `monitor_state`, **39 calls / 37,284 rows**. Other related roster SQL: **27 calls / 7,884 rows**. These are grouped by table references; sanitized Insights logs do not prove every call came from one exact code function.
- Three `sqlite_master` SELECT shapes: **30 calls / 14,940 rows**, **30 / 14,940**, **27 / 13,446**, totaling **43,326 rows** across these top-three forms. They are separately counted Insights SQL forms, not guaranteed to share a call site.
- Source inspection shows schema metadata reads in `ensureBoardDuels` / `ensureTrioGameConstraint` and the dedicated coach migration/verification scripts, among others. `ensureBoardDuels` is guarded by `kp_settings.board_duel_schema_version` and per-DB-binding readiness; schema migration is conditional. **No single exact caller, schema absence, or repeat rate has been verified from production; no schema checks were removed.**
- Local **in-memory SQLite fixture** applying the checked-in `0006_competitive_match_rosters.sql` and `0007_competitive_round_events.sql` migration schemas: `EXPLAIN QUERY PLAN` on the existing two read-coach-round queries shows indexed `match_id` lookup for the round archive and per-roster `json_each` virtual-table scans. For the roster-count query the roster is scanned. This is a fixture plan, **not** the Cloudflare production D1 plan or a measured production reduction.
- Existing roster index `valorant_match_rosters_recent(ended_at DESC)` and the round-event `match_id` primary key already exist. JSON array membership is not an ordinary indexed scalar, so adding an unvalidated general index would not safely solve those full scans.

### Narrow safe optimization implemented

The `readCoachRoundReport` endpoint already cached completed answers for five minutes per D1 binding, but *parallel cold-cache reads could each run two full roster/round queries before either call populated the cache*. An in-flight Promise now coalesces simultaneous reads per binding. Cache duration and actual SQL filters, user ownership, output, completed/partial-match rules, and round data are unchanged. An explicit invalidation disowns the previous in-flight task so it cannot repopulate the cache after new data arrive; a failed task can be retried.

- Regression fixture: two parallel cold-cache requests cause **two D1-mock queries total**, rather than **four without coalescing**, and cached follow-up adds zero. Invalidation triggers fresh reads even if the previous task remains in progress.
- This is **a proven reduction in duplicate query calls for that fixture case**, not proof that the production top-50 122,736/h lower bound declined. Queries on other isolates or independent binding objects still occur. Post-deploy Insights on equivalent 1-hour windows must be compared before a numeric production-savings claim.
- A persistent cross-isolate cache, materialized indexed member-to-match mapping, migrations, and `sqlite_master` call suppression need separate validated work. Do not bypass coach roster consent/ownership checks or weaken audit history/settlements.

### Scheduled deployment monitor misses and independent path

- Public GitHub Actions API for workflow ID **427110600** reports the deployment monitor as `active` (not disabled). Default-branch `.github/workflows/duel-deployment-watch.yml` sets `cron: '43 * * * *'`, but its **only** `event=schedule` run in the examined history was run **45109206752** at **2026-11-23 04:00:13 UTC (13:00:13 JST)**, i.e. not precisely :43. No subsequent 14:43, 15:43, 16:43, 17:43 scheduled runs were present when checked. `push` successes do **not** substitute for evidence of a scheduled trigger.
- GitHub documents that scheduled events may be **delayed or dropped** during load, and gives no guarantee of delivery at the cron minute. Since the workflow is active and no logs for nonexistent runs exist, the **exact GitHub scheduler-side cause remains unverified**. A cron change would not guarantee execution, nor would merely rerunning an existing push job repair missing hourly scheduling.
- Existing separate D1 read-only insights workflow `cron: '17 * * * *'` has verified scheduled history. This PR adds an independent **`deployment-watch-fallback` job** in that scheduled run. It executes existing read-only GitHub Actions deployment status checks and existing deduplicated GitHub Issue alert logic. It has **no Cloudflare credentials, no D1 or KP reads/writes**, and is independent from the D1-insights `inspect` job's intentional failure when the 80,000 Rows/h warning fires.
- This provides a second scheduled *path* that will check for deployment failures when the :43 monitor cron goes missing; it does **not** create missing native schedule history for the original workflow, guarantee hourly timing, or prove a genuine scheduled run until a real `schedule` execution of the new fallback is observed. The existing 3-hour heartbeat retains its separate missing-schedule incident logic.
- The fallback permissions are scoped to `contents:read`, `actions:read`, `issues:write` for a deduplicated incident. No additional D1 Insights queries or paid API calls are added. A failed D1 read budget auditor is **still a failure**.

**Remaining:** production D1 1-hour Rows-read reduction unverified; production fallback actual schedule execution unverified; strict D1 spending/Rows read/written **hard cap not configured**, not verified and not enforced by this app. P8 device, P10 real audio, authenticated wallets and 2-person Discord remain human-only unverified gates. P11/P12 not completed.

## 2026-11-23 P12 daily operations audit execution: conditional independent fallback

**Problem and evidence.** The primary read-only operations audit lives in `.github/workflows/duel-operations-audit.yml` at `31 21 * * *` (06:31 JST). GitHub Actions public API `event=schedule` inventory showed **zero scheduled runs** as of the observation. A configured cron is not proof of successful execution; missing runs have no job logs. GitHub does not guarantee that a scheduled event will execute on time. No claim of a GitHub-internal root cause is made.

**Independent fallback**, in `.github/workflows/duel-operations-audit-fallback.yml` at `17 22 * * *` (07:17 JST), first reads the **GitHub Actions metadata** for the original schedule (no D1 reads). Only when there was *no primary scheduled run* created after 21:31 UTC that is successful or still active does the fallback call the existing two aggregate D1 SELECTs. A failed/cancelled original may be reaudited. If GitHub authorization, response integrity, schedule timing or inventory completeness is unknown, it **fails closed**: no D1 query, an existing deduplicated GitHub Issue reports unknown.

The fallback's own report handling reuses `duel-scheduled-operations-audit.mjs` and `duel-scheduled-operations-alert.mjs`. It never executes any SQL beyond the existing two allowlisted aggregate SELECTs, changes KP, authorizes deletion, restarts Workers, changes billing or writes D1. Its active schedule only creates a redundant safety path and **cannot guarantee GitHub schedule delivery**. The normal primary audit remains unchanged and there is no double-audit when its run is already successful or in progress. On PR and push events, only nonproduction tests run; D1 execution is limited to schedule or authorized manual dispatch.

**Verification required:** PR CI and same-SHA Pages/Worker deploy must pass. The first *real* fallback schedule run at 07:17 JST on a following day must be observed separately; PR and push success cannot prove schedule execution. The existing 18:43 JST deployment monitor and 19:17 JST `deployment-watch-fallback` schedule checks are independent of this daily audit fallback and must each be recorded as observed or missing.

**Boundaries:** Strict account-wide D1 hard cap **not configured**. Existing D1 80,000 Rows read/h alert is unchanged. P11/P12 global completion, P8 device, P10 audio, authenticated wallet and 2-person Discord are unverified.
