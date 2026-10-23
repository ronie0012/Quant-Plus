# Roadmap implementation checkpoint

Current status: [2026-10-15 follow-up](ROADMAP_IMPLEMENTATION_20261015.md). The details below preserve the older checkpoint and are not full-roadmap certification.

Updated 2026-10-14 (engine-v2 checkpoint). **The complete roadmap is not implemented and no phase
gate is declared passed.** Gates that require independent review, live provider sessions, human-labelled
corpora, matured forward outcomes or multi-session soaks cannot be satisfied by code changes alone; each
phase below separates what is delivered and tested from what still blocks its gate.
Scope: [MASTER_ROADMAP.md](MASTER_ROADMAP.md); audit: [PROJECT_DEEP_AUDIT.md](PROJECT_DEEP_AUDIT.md).
Existing audit measurements and failed evaluation artifacts remain historical evidence.

## Phase status summary

| Phase | Status                                              | Blocking the gate                                                                                                                                          |
| ----- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Baseline, inventory, defect register, hermetic runs | Manual trace of every field/action; full browser/action coverage; reproducible Python constraints; live opt-in harness                                     |
| 1     | Partial; see current verification                   | Independent P0 review (not self-certifiable); 2027 calendar and Muhurat timings when NSE publishes them                                                    |
| 2     | Local book v2 + InsForge delivered, live-verified   | Mapping the local book to a hosted user and the hosted cutover (a deployment decision)                                                                     |
| 3     | Major items delivered                               | Disconnect/reconnect lineage walk-through of every route; observation envelope on every market endpoint; live Fyers session check of the budget            |
| 4     | Core engine delivered                               | Corporate actions, settled/unsettled balances, OCO across separate orders, verified broker fee profile, browser-closed live-feed run during a real session |
| 5     | Evidence pipeline delivered                         | 1,000-item human-labelled, time-separated corpus and its frozen evaluation (labels cannot be generated); NSE attachment/XBRL ingestion                     |
| 6     | Harness and labelling delivered                     | Reviewed labels, challenger models, calibrated probabilities with enough resolved outcomes                                                                 |
| 7     | Grounding audit and honest UI delivered             | Immutable evidence bundles, ablations, frozen out-of-sample and ≥500 matured forward forecasts per horizon                                                 |
| 8     | Partial; see current verification                   | ≥200-answer human-reviewed answer set with a live model; provider token/cost accounting                                                                    |
| 9     | Partial; see current verification                   | Colour-contrast review; Options needs a validated observed chain (excluded from release scope)                                                             |
| 10    | Partial; see current verification                   | Real-time 10-trading-session soak with live data; independent P0/P1 review                                                                                 |

## Phase 1 — integrity blockers (implementation complete; gate awaits independent review)

Delivered earlier and retained: intent idempotency with fingerprints, server quote eligibility,
explicit closed-session practice intents, risk-reducing exits, table schemas, completed-bar PIT fixes
in the backend, sentiment completed-bar maturity, dummy-surface suppression.

Delivered in this checkpoint:

- **Verified exchange calendar** (`src/lib/exchange-calendar.ts`, mirrored in
  `backend-extension/quantplus_intelligence/nse_calendar.json`). 2026 holidays are copied from
  NSE/CMTR/71775 and NSE/CMTR/72260 (sources and SHA-256 in
  [reference-data.json](audit/implementation/reference-data.json)). Muhurat (2026-11-08) timings are
  unannounced, so it fails closed. 2027 reports `UNVERIFIED_YEAR`. A parity test keeps both copies equal.
  Live fills are rejected on verified holidays/closed hours even if a provider reports "open".
- **DAY expiry at the correct session close.** Orders accepted after a close rest until the next
  executable session's close (weekends/holidays skipped) and carry `expires_at`. Expiry releases
  reservations and emits a notification event. The server worker applies expiry without a browser.
- **Marked day-loss window.** The loss window belongs to the current/next trading session. The worker
  anchors it from closing marks (`PRIOR_CLOSE_MARKS`); otherwise the first mutation anchors it. Loss
  = anchor + same-day cash flows − marked equity, so unrealised mark drops count and deposits do not
  conceal losses. Stale-mark policy: positions are carried at their last provider mark, listed as stale,
  never repriced from invented data. Risk page shows the server-computed window and enforcement reason.
- **Validation and quarantine of existing records.** The v1→v2 migration validates every trading row
  (aborting on anything that cannot be represented exactly) and quarantines invalid editable rows
  (e.g. `risks:null` journal entries) with a visible repair report. Invalid stored risk policies are
  quarantined and new exposure is paused.
- **Legacy sentiment labels.** Outcome labels are versioned (`completed-bars-v3`); reliability
  statistics count only current-version labels, older labels are quarantined in metadata on
  re-evaluation, and per-signal denominators stay null without samples.

Evidence: `src/lib/market-session.test.ts` (calendar, expiry), `scripts/test-paper-engine.mjs`
(holiday expiry, marked loss, deposits, next-session window, migration quarantine),
`scripts/test-integrity.mjs`, `scripts/test-calendar-parity.mjs`, `backend-extension/tests/test_maturation.py`.

The previously reported time-of-day flake (`test-local-workspace` failing after 15:30 IST) was a
test depending on the wall clock; tests now pin an in-session clock.

## Phase 2 — durable storage (local book v2 and InsForge schema/adapter delivered; cutover not done)

Delivered:

- **Book v2** (`src/lib/paper-book/*`): integer paise for all money; explicit account, holdings
  (cost basis + mark + mark time/source), orders with versions, fills, reservations, protections,
  append-only ledger and event log with one monotonic sequence, intents, risk window, quarantine,
  worker lease. `reconcile()` checks cash = ledger sum, last balance, charges, deposits, positions = fills,
  order fills, reservation coverage and sequence uniqueness.
- **Validated one-way migration** of the v1 JSON book with a hashed `.v1-<sha>.bak` copy and a
  `migration-v2-*.json` report; no automatic reset. The real `.local-data/workspace.json` was migrated
  on 2026-10-14 after a dry run on a copy: cash ₹992,910.50, 10 HDFCBANK, order/holding IDs preserved,
  reconciliation empty. Pre-migration backup: `.local-data/backups/pre-engine-v2-20261014.json`.
  The legacy fill keeps `charges_debited:false`; history is not rewritten.
- **Writer lock with bounded wait and stale-lock recovery**: waits up to 3 s for a live writer; a lock
  left by an exited process on the same host (older than 30 s) is renamed aside and logged; unreadable
  or live locks are never removed. Atomic fsync'd replacement as before; interrupted temp files are
  ignored. Readers never lock.
- **Typed repositories on the client** (`src/lib/workspace-api.ts`, `workspace-session.ts`). The
  unsafe Supabase client cast (`local-client.ts`) is deleted; no app code calls Supabase. The Supabase
  integration file is a stub that throws. Hosted tokens get a 503 until the InsForge gates pass.
- **Durable worker** with a lease in the book (see Phase 4); the sentiment extension gained a durable
  SQLite history repository (`INTELLIGENCE_HISTORY_PATH`) and a scheduled maturation job.
- Recovery tool supports v2 (`verify`, `backup`, `restore`, `migrate`) and checks reconciliation.

**Live two-user isolation run (2026-10-14): 29/29 checks passed** — see
`audit/implementation/insforge/live-isolation-20261014.md` and `scripts/live-insforge-isolation.mjs`. It
found and fixed a real bug: the live session endpoint returns no `role`, so every real user had been rejected.

**Fresh live two-user isolation rerun (2026-10-19): 29/29 checks passed** — the throwaway users were
deleted and email verification was restored. This confirms hosted settlement/replay, owner-scoped
reads, browser-write rejection, compare-and-swap conflict handling and reconciliation refusal against
the current linked project. A worker-closed-browser run and final hosted readback are still required.

**InsForge (hosted) book — applied to the linked project, not enabled in the app by default:**

- Migrations `migrations/20261014130103_create-paper-book.sql` and
  `20261014130652_single-book-authority.sql` were applied to project Quant-Plus (it had no tables and
  no users). Tables: `paper_books` (state document, version, sha256, cash), `paper_orders`,
  `paper_fills`, `paper_ledger`, `paper_events`, `paper_intents`, all keyed to `auth.users(id)`, integer
  paise with CHECK constraints, unique `(user_id, seq)` / `(user_id, intent_id)`, append-only triggers on
  ledger/fills/events. Watchlists, alerts, journal and preferences live inside the book document so there
  is one writable copy (the separate tables from the first migration were empty and were dropped).
- `public.paper_commit_book` (SECURITY DEFINER, `search_path` pinned) is the only write path: a
  compare-and-swap on the book version that upserts order projections, appends fills/ledger/events/intents
  and fails unless the relational ledger sums exactly to the committed cash. EXECUTE is revoked from
  `PUBLIC`, `anon` and `authenticated`.
- RLS is enabled on every table; `authenticated` may only SELECT its own book rows; `anon` has no access.
  **Live check (2026-10-14):** anonymous REST reads of every table, an anonymous insert and an anonymous
  RPC call were all refused with `permission denied` (HTTP 401). Catalog queries confirmed the grant
  matrix. Ad-hoc SQL cannot switch roles, so authenticated-role behaviour was not exercised live.
- Node adapter `src/lib/insforge-book.server.ts`: verifies the bearer token with
  `GET /api/auth/sessions/current` (role must be `authenticated`), loads the book with the server-only
  admin key, runs the **same** shared commands (`src/lib/paper-book/commands.ts`) and commits through the
  RPC, re-running the change on a version conflict (max 4 attempts). The worker evaluates hosted books
  too. `book-service.server.ts` / `request-auth.server.ts` route every API (paper, workspace data, agent
  proxy) to the local profile or a verified hosted user; Supabase verification was removed from those routes.
- Browser sign-in/up uses `@insforge/sdk` 1.5.2 only when `VITE_QUANT_PLUS_AUTH=insforge`; tokens are kept
  per tab (no silent refresh yet). Practice books remain local-only.
- `scripts/test-insforge-book.mjs` exercises the adapter against an in-process fake that enforces the
  same CAS/append-only/reconciliation rules: verified identity, rejection of forged and non-user roles,
  two-user isolation, replay, a concurrent-commit retry that settles once, and the hosted route.

Remaining for the gate: a worker-closed-browser run against the real project, the final cutover
decision, silent token refresh, the chat route's hosted portfolio reads (Phase 8), and disk-full/
permission fault tests for the local store. The selected verified InsForge user now owns the imported
local book; the frontend flags remain unset until final readback approval. Backout SQL:
`audit/implementation/insforge/rollback-20261014130103.sql`.

## Phase 4 — paper execution (core engine delivered)

- **Order state machine**: OPEN, PARTIALLY_FILLED, FILLED, CANCELLED (with reason, e.g. IOC remainder),
  EXPIRED, REJECTED (fill-time risk failure). Orders carry versions and parent/protection links.
- **Fills from observable evidence**: bid/ask when the spread is valid (≤5%), sized by displayed
  quantity, else last trade with configurable slippage (default 0 bps, recorded). Market intents are
  immediate-or-cancel against observed liquidity; resting orders partially fill. Marketable limits fill
  immediately. Every fill stores method, reference price, liquidity limitation and quote observation.
- **Reservations**: cash for resting buys (stop buys with a 5% buffer) and shares for resting sells;
  withdrawals, market buys and new orders respect them; cancel/expire/reject releases them.
- **Itemised, debited charges** from a versioned schedule (`src/lib/paper-fees.ts`): STT, exchange
  charge (NSE/FA/73061), SEBI fee, stamp duty, GST, and labelled broker assumptions (zero brokerage/DP).
  Realised P&L is shown net of charges.
- **Durable server worker** (`src/lib/paper-worker.server.ts`, started by `src/server.ts`; disable with
  `QUANT_PLUS_WORKER=off`): every 5 s, under a 20 s lease, it expires orders, marks holdings, anchors
  the loss window, fills resting orders whose condition is met, evaluates protections and alerts, each
  inside a savepoint. Verified in the built server: the worker starts without a browser and holds the lease.
- **Server-side protections**: stop/target/trailing exits with persisted peaks, deterministic exit
  intents, exits bounded by available shares, retry with recorded errors. The browser monitor now only
  displays server notifications; closing tabs does not stop protection.
- **Durable alerts** with delivery history (`alert_events`) and one-shot triggering.
- **Baskets**: server preflight against a copy of the book (later legs see earlier legs' cash; missing
  quotes make the total unknown) and per-leg execution under an explicit independent-leg policy; retries
  replay settled legs.
- **Audit trail** per order (intent, quote, reservation, fills, charges, ledger, events) with JSON export.
- **Confirmation threshold** now has a consumer: tickets above `confirmation_above` need a second press.
  Tickets reuse one intent per identical retry.

Remaining: corporate actions, settled vs unsettled (T+1) balances, linked OCO between separate user
orders, a verified broker fee profile, restart/duplicate/gap/halt tests under a live feed, and a
browser-closed run during a real market session.

## Phase 3 — real data throughout (major items delivered)

- **Instrument master from official NSE files.** `scripts/build-instrument-master.mjs` generates
  `src/data/instrument-master.ts` from `ind_nifty50list.csv` and `EQUITY_L.csv` (retrieved 2026-10-14,
  copies and SHA-256 in `audit/implementation/reference/nse/`): symbol, official name, NSE industry,
  series, ISIN, listing date, market lot, face value. The previous hand-written list had **8 stale
  constituents** (TATAMOTORS, WIPRO, INDUSINDBK, DIVISLAB, BPCL, BRITANNIA, HEROMOTOCO, LTIM) and was
  missing BSE, BEL, ETERNAL, INDIGO, JIOFIN, MAXHEALTH, TMPV, TRENT. A test re-hashes the source files.
  Membership is as published on the retrieval date, not a point-in-time history.
- **No placeholder observations.** The instrument type no longer carries price/change/weight/seed
  fields; unobserved prices and changes are `null` and render as unknown (stock board sorts them last,
  the order ticket shows no P&L without a quote, watchlist/X-ray report quote coverage). The always-zero
  "index weight" column was removed.
- **Real history everywhere a chart appears.** `SparkChart` draws validated provider closes for a
  symbol (or states that no series exists); `src/lib/market-history.ts` validates OHLCV (non-finite,
  non-positive, OHLC order, negative volume, duplicate and out-of-order bars are dropped and counted, never
  repaired).
- **Fyers request budget (backend).** A reviewed, hash-guarded patch (`audit/implementation/backend-patch-fyers`)
  adds a sliding-window budget to every FYERS data call with defaults just under the **Standard** plan
  (4/s, 45/min, 4,800/day vs the documented 5/50/5,000; Prime must be configured explicitly), bounded
  waiting, and a circuit breaker with exponential backoff on 429/5xx. Three new backend tests.
- Data Sources page shows the paper worker heartbeat and book reconciliation; public disclosure text
  no longer claims "demonstrative sample data".

Remaining: a full disconnect/reconnect walk through every route with lineage review, a canonical
observation envelope on every backend market endpoint, the data-socket 100-symbol Standard limit in the
backend subscription manager, and corporate-action adjustment checks.

## Phase 5 — news and filing evidence (pipeline delivered; corpus gate open)

- **NEWS-01 fixed:** offset-less NSE announcement times are parsed as IST (they were treated as UTC,
  a 5.5 h error); unparseable or future timestamps are **quarantined and reported**, not guessed or
  clamped; the official path now applies the same age bound as RSS. Broadcast time, attachment URL,
  source time and zone, `first_seen_at` and `available_at` are preserved.
- **Durable raw archive** (`news/archive.py`, `INTELLIGENCE_NEWS_ARCHIVE_PATH`): append-only SQLite
  (update/delete triggers abort) keyed by content hash; a changed story becomes a new version that names
  the version it supersedes; first observation time is kept across re-observations.
- **Event clustering** replaces deletion: the earliest report represents a development, with member
  IDs, sources and latest update; different numbers or directions stay separate clusters.
- **Connector registry** with per-source entitlement labels, per-minute budgets, consecutive-failure
  circuit breakers, and a separation between empty results and provider failures; status is returned
  with every news response.
- **Entity linking:** namesake guards for 13 issuers (e.g. HDFC Bank vs HDFC Life, Reliance vs
  Reliance Power, Bajaj group, Adani group), TMPV replaces the demerged TATAMOTORS mapping, and
  Hindi/mixed-script headlines are labelled and excluded from English rule scoring.
- **Typed event extraction** (`news/events.py`): issuer, type, period, amounts with currency/unit,
  percentages, direction, comparison basis and certainty, each with a supporting character span;
  conflicting or absent evidence abstains.

Remaining for the gate: the ≥1,000-item human-labelled, time-separated corpus and its frozen
evaluation, NSE attachment/XBRL ingestion with download isolation, measured source latency/coverage.

## Phase 6 — sentiment with measured uncertainty (harness delivered; evidence gate open)

- **NEWS-04 / "do not validate with the same-day move":** the news impact score no longer uses the
  stock's same-session price change; the change is returned only as labelled, non-attributable context.
- Outputs state what they are: article scores are `headline_textual_tone_rules_v1`; the market index is
  a `descriptive_market_condition_index` with `score_is_probability: false` and a coverage-heuristic
  confidence.
- **Evaluation harness** (`quantplus_intelligence/evaluation.py`): cluster- and issuer-grouped,
  time-ordered splits; macro-F1 with abstentions counted as misses and bootstrap 95% intervals;
  per-slice metrics that abstain below a minimum size; Brier, log loss and reliability bins that refuse
  non-probability inputs; a hash-locked pre-registration check that refuses holdout scoring if thresholds
  change. Labelling guidelines and an unlabelled batch exporter are in `audit/implementation/labelling/`.
- Maturation worker, versioned labels and durable history are listed under Phase 1/2.

Remaining for the gate: reviewed labels, challenger models (FinBERT-class and entity-aware), calibrated
probabilities with enough resolved outcomes, and drift monitoring. No predictive claim is made.

## Phase 7 — agentic research and predictions (grounding audit delivered; evaluation gate open)

- **Claim-level grounding audit (backend, hash-guarded patch `audit/implementation/backend-patch-claims`).**
  Fundamentals, news and macro analysts now pass the exact data they were given to `call_json`; every
  number in the report summary and signals must appear in that data (allowing % ↔ fraction and 0.5%
  rounding), and cited evidence must not be dated after the decision cutoff. Results are recorded as
  `claim_validation` session events; reports are never rewritten and no extra model calls are made.
  Three new backend tests; the isolated suite passes (442).
- **Honest research UI.** "Conviction" and analyst "confidence" are shown as uncalibrated opinion /
  self-rated scores out of 100, never as percentages of being right; a hard-coded "Risk alignment"
  bar (fixed 38/72) and an "Evidence quality" label that actually showed conviction were removed;
  missing scores are null rather than 0. The stock research card shows the data cutoff, per-analyst
  claim-validation status and the recorded result that none of 11 evaluated configurations beat the
  best constant baseline. Committee triage labels now persist (browser-local, labelled as such).
- Existing backend governance (frozen manifests, forward-freeze registry, checkpoint/resume, operator
  pause, key budgets) is retained unchanged.

Remaining for the gate: immutable decision-time evidence bundles shared across stages, ablations per
agent, horizon/experiment registry for new targets, simple baselines evaluated first, and ≥500 matured
forward forecasts per claimed horizon. No directional-skill claim is made.

## Phase 8 — grounded copilot (partial; reviewed-answer gate open)

- **CHAT-01 fixed:** instruments resolve only from upper-case symbols that exist in the official master,
  known company names/aliases, or the attached page; group names (Tata, Bajaj, HDFC, Adani) are reported
  as ambiguous and the model is told to ask.
- **Typed read-only tools** (`src/lib/copilot/context.server.ts`): paper account, holdings, risk window,
  recent orders and an attached order's audit, journal entries, market overview/condition index, and per
  instrument a quote, history facts computed in code (returns, RSI14, MA20 distance, realised volatility),
  news tone and saved research. Each item has a citable ID and source/as-of time.
- **Grounding check:** after streaming, figures not found in the evidence and unknown citation IDs are
  reported in an appended "Evidence check" line (the answer is not rewritten). Evidence and tool trace are
  returned in an `X-QuantAI-Evidence` header and listed under each answer.
- **All three surfaces use one hook** (`use-copilot.ts`): the dock (attaches the current stock page), the
  full Quant AI page (workflow modes: explain a move, compare, portfolio risk, pre-trade, post-trade;
  history panel with search, load, export and delete) and the journal review (sends the exact journal
  entry and linked order as attached context instead of pasted text). Stop cancels the provider stream;
  retry; per-day request ceiling (`QUANT_AI_DAILY_REQUEST_LIMIT`, default 300).
- **Conversations persist** in the book (max 200; save/list/search/get/delete).
- Adversarial checks in `scripts/test-chat.mjs`: invented tickers do not resolve, injected instructions
  stay inside the EVIDENCE block, chat never changes the paper book, cancellation and budgets.

Remaining for the gate: the frozen ≥200-answer review by human reviewers (citation precision ≥95%) with a
live model, and token/cost accounting from provider usage data.

## Phase 9 — product completion (partial; see current verification)

- **No dead controls:** a scan for buttons without actions found five; each now does something real
  ("Run analysis"/"Generate brief" open the research workspace, which starts real research jobs; "Open risk
  centre"; help cards filter the FAQ; "Open full research" opens the stock research). The decorative
  "Newest first" button and boilerplate placeholder paragraphs were removed. The FAQ was rewritten to match
  actual behaviour, and shortcut 8 now opens Risk instead of the unavailable Options page.
- **Settings:** every control is saved to the book and consumed: notifications (orders/protections and
  alerts), compact rows, calm mode, order-ticket defaults (type and quantity, used by both tickets), chart
  defaults (type and volume bars). Controls that did nothing (theme, "risk language", reduced data, news
  alerts) and the false "Verified session" badge for the local profile were removed.
- **Practice mode:** when the market is closed, the stock ticket offers last-session practice (market
  orders only) that settles in the separate practice book; the Wallet shows the practice account and can
  add practice funds. A route test proves the main book is untouched.
- **Alerts:** server-evaluated, one-shot with re-arm, units shown, and a delivery-history table with the
  observed price and quote time.
- **Journal:** evidence, risks, planned exit, reflection and outcome fields; link to a real order; a
  decision-time quote snapshot recorded on creation and **immutable afterwards** (server-enforced).
- **Replay (was disabled):** steps through real provider daily history from a random hidden start; only
  bars up to the cursor are visible; orders fill at the next bar's open in an isolated replay account with
  dated charges (unknown and not deducted before the schedule's effective date); the result is compared
  with buy and hold. Unit-tested for no look-ahead.
- **Screener:** saved screens carry a factor version and are flagged when loaded under newer formulas.
- Missing changes no longer render as gains; empty metric bars were removed from the stock page.
- **Accessibility:** two invalid definition lists and unfocusable scroll regions fixed; reduced motion is
  honoured in CSS; charts are keyboard-navigable.
- **Browser coverage:** `tests/browser/coverage.spec.ts` loads every route (22 sections, dashboard, a stock
  page, public pages) and fails on any page error or serious/critical axe WCAG 2 A/AA violation (colour
  contrast excluded and reviewed separately), plus workflows for funding, practice funds, alerts, journal,
  settings persistence, honest unavailable states and API reconciliation.

**Options remains explicitly excluded from the release scope:** an observed option chain with verified lot
and expiry rules has not been connected or validated, and the roadmap forbids substituting seeded data.

## Phase 10 — release hardening (partial; real-time soak and human reviews open)

- **Fault injection** (`scripts/test-faults.mjs`, part of `npm test`): four OS processes writing one book
  (160/160 committed, no lost or duplicated update); a writer killed mid-run (book reconciles); an orphaned
  lock from an exited process is recovered while a live writer's lock is never stolen; an unwritable book
  fails with `EPERM` and is left unchanged with the lock released; 11 provider faults (429, 500, malformed
  JSON, missing/negative/NaN price, +2 min clock skew, stale, wrong symbol, delayed source, network failure)
  create no order and leak no internals; an out-of-order older tick does not replace a newer mark; 50
  concurrent deliveries of one intent settle once; worker crash → lease expiry → takeover, with a revived
  old worker unable to steal the lease back; revoked market-data key; six model faults (revoked key, 500,
  429, timeout, malformed stream, error mid-stream) end in errors, never a finished answer.
- **Two real defects found and fixed by this work:** (1) on Windows, a lock file being deleted by another
  writer reports `EPERM`, which crashed concurrent writers instead of waiting — now treated as contention
  until the deadline; (2) a revoked model-provider key was returned to the browser as `401` "try a shorter
  question", i.e. as if the user's session had failed — now `502` with an accurate message.
- **Latency** (`audit/implementation/benchmarks/`, `npm run bench`; reference machine i5-11300H, 8 GB,
  Windows 11, Node 22.14, provider stubbed so its latency is excluded). End-to-end HTTP against the
  production build, 300 requests each: order acknowledgement p50/p95/p99 28.6/46.7/52.7 ms; account and
  holdings reads p95 ≈ 11.7 ms; 50-order page p95 29.6 ms. Proposed targets (read p95 < 250 ms, ack p95 <
  500 ms) are met. An in-process run is kept separately and labelled as such.
- **Accelerated soak** (`npm run soak`, `audit/implementation/soak/`): the real route and worker on a
  simulated clock across 10 verified NSE sessions (2026-10-01 → 10-16, including the 2 Oct holiday and
  weekends): 1,267 requests, 0 server errors, 19/19 reconciliations, 102 DAY orders expired at the real
  closes, 0 duplicate settlements, heap after GC 36 → 56 MB. **Measured limit:** every write rewrites the
  whole JSON book, so route latency grows with book size (p95 ≈ 220 ms at ~1,000 orders / 5 MB); fine for
  personal use, a reason to move heavy users to the hosted book.
- **Restore and migration drill** (`npm run drill`, `audit/implementation/drills/`), on copies only: the
  v1→v2 migration replayed from the preserved backup is deterministic and its money digest (cash, ledger,
  positions) is identical to the live book; loss-and-restore is byte-identical and later writes reconcile;
  a truncated book is refused for reads and writes and retained for recovery, never reset; the operator
  pause (`trading_paused`) refuses new orders while reads continue.
- **Release manifest** (`npm run release:manifest`, `audit/implementation/release/`): commit and
  working-tree state, dependency versions, SHA-256 of reference data, migrations, backend patches, the
  built `.output` tree and evidence files, plus the recorded test summary.
- **Competitive comparison** (`audit/implementation/competitive-comparison-20261014.md`): TradingView,
  Neostox and Sensibull from their public pages on 2026-10-14 (StockGro excluded — its FAQ says it is not a
  paper-trading platform). Competitor latency, accessibility and accuracy are marked _not measured_ and are
  not counted as wins; Quant Plus is behind on options, instrument coverage, multi-user and mobile.

**Incident recovery and health:** `GET /api/paper/worker` reports the worker lease, last tick (quotes,
fills, expiries, quote errors) and the book reconciliation report; `trading_paused` in risk limits is the
operator stop; restore steps are under _Recovery and backout_ below.

**Open for the Phase 10 gate:** the 10 consecutive **real** trading-session soak with live Fyers data
(needs ten market days of wall-clock time; run `npm run soak` only covers simulated time), independent
review of P0/P1 defects, and the human reviews listed for Phases 5–8.

## Verification at this checkpoint (2026-10-14)

| Check                        | Result     | Limits                                                                   |
| ---------------------------- | ---------- | ------------------------------------------------------------------------ |
| Typecheck                    | Pass       | Static types do not prove runtime contracts                              |
| ESLint (`--max-warnings 0`)  | Pass       | No rule suppressions added                                               |
| Node production build        | Pass       | Existing vite-tsconfig-paths notice remains                              |
| Frontend unit cases          | 27 pass    | Calendar, expiry, options maths, engine, money, history, replay, copilot |
| Frontend script suites       | 14 pass    | Includes fault-injection matrix, paper engine, route, chat, hosted book  |
| Intelligence/PIT regressions | 103 pass   | Mocked provider data; no model-quality claim                             |
| Isolated backend             | 442 pass   | Live technical test excluded; external network blocked                   |
| Playwright                   | 42 pass    | Every route + axe WCAG 2 A/AA (contrast excluded) and core workflows     |
| Live InsForge isolation      | 29/29 pass | Run once on 2026-10-14 with two throwaway users (deleted afterwards)     |
| Restore drill / soak / bench | Pass       | Soak is simulated-clock, not the real-time 10-session soak               |

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:intelligence
npm.cmd run test:backend
npm.cmd run test:browser
npm.cmd run lint
npm.cmd run build
npm.cmd run drill; npm.cmd run soak; npm.cmd run bench; npm.cmd run release:manifest
```

Use npm with `package-lock.json` (`npm ci`). On this host use `npm.cmd` (the PowerShell shim is blocked).

## Recovery and backout

Stop the app (and its worker) before a restore. A lock records PID, host and creation time; the
store recovers locks only from exited same-host processes older than 30 s.

```powershell
node scripts/local-book-recovery.mjs verify .local-data/workspace.json
node scripts/local-book-recovery.mjs backup .local-data/workspace.json .local-data/backups/manual.json
node scripts/local-book-recovery.mjs restore .local-data/backups/manual.json .local-data/workspace.json
node scripts/local-book-recovery.mjs migrate <v1-book.json>
```

Backing out engine v2: stop the app and restore `.local-data/backups/pre-engine-v2-20261014.json`
(or the `workspace.json.v1-*.bak` copy) **only together with** the previous code; v1 code cannot read
v2 books. The intelligence extension installed in `D:\QP\agent-service\quantplus_intelligence` was
backed up to `.local-data/backups/backend-extension-20261014T125741Z` before reinstalling.
