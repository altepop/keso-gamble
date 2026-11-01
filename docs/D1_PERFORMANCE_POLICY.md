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
