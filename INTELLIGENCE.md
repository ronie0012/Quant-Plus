# QuantPlus intelligence implementation

The engines are installed in the existing FastAPI backend at `D:\QP\agent-service\quantplus_intelligence`. Their versioned source is kept in this repository under `backend-extension/quantplus_intelligence`; `scripts/install-intelligence-backend.py` installs updates without replacing the existing FYERS client, stream, agent graph or credentials.

The frontend commonly runs on port **8080**; use the URL printed by Vite. Its API routes validate the loopback local identity or verified InsForge session and forward requests using the server-only website API key. The browser never calls Google, NSE or FYERS directly. See [ROADMAP_IMPLEMENTATION_20261015.md](ROADMAP_IMPLEMENTATION_20261015.md) for the current verified scope and remaining gates.

## LLM provider cutover: Experiential Labs (gpt-6-luna) — 2026-10-28

The daily-quota-limited OpenRouter free tier was replaced as the active
prediction/chat provider. Facts verified live against the hosted gateway
(`https://api.experientiallabs.ai/v1`, `xpl_` keys, free `GET /v1/models`
catalog read):

- The user's first pick `gpt-6-luna-decisions` is NOT chat-callable: the API
  answers 400 directing callers to the native Decisions surface
  (`POST /v1/decisions`, typed predicate/choice/score questions). Using it
  would require a protocol adapter plus a decider-prompt redesign; deferred.
  `gpt-6-luna` (chat, 1.05M context, tools + JSON mode) was wired instead.
- Provider priority in the backend config: **experiential > openrouter >
  codecraft**; `provider_keys/base_url/analyst_model/decider_model/
  provider_name` all honor it. New `EXPLABS_*` settings fields; the key lives
  in the backend `.env` and is mirrored in the frontend `.env.local`.
- Body policy (`app/gateway/codecraft.py`): models that reject optional
  request fields (`unsupported_parameter`) are handled two ways — a boot-time
  capability seed from the free catalog read (for gpt-6-luna `temperature` is
  omitted because `sampling_requires_reasoning_none`, JSON mode is kept), plus
  an adaptive 400 handler that drops/renames the named field (`max_tokens` →
  `max_completion_tokens`) and remembers it per model for the process lifetime.
- Quota semantics for the credits lane: a 429 whose body reports
  `insufficient_credits`/`model_requires_payment` raises `OutOfFunds`
  immediately (account-wide; top-up required); `free_limit`/`key_daily_cap`
  429s record a daily reset (UTC-midnight fallback) and persist it. The
  persisted `usage_daily.quota_reset` row is now **provider-scoped** (new
  `provider` column): a provider cutover no longer inherits the previous
  provider's 429 wall (observed live as a bogus "experiential … resets
  05:30 IST" pre-flight block on the first post-cutover call).
- Local wallet guard raised `DAILY_REQUEST_CAP` 50 → 300 (paid credits have no
  provider-side request cap; ~$1.50/day worst case at luna list prices). Token
  caps unchanged. The legacy OpenRouter lane remains wired as a fallback that
  activates by removing the `EXPLABS_API_KEY` line.
- Frontend chat lane (`src/routes/api/chat.ts`) follows the same priority: the
  Experiential body strips OpenRouter-only fields (`reasoning: {effort}` →
  `reasoning_effort: "low"`, no `provider.allow_fallbacks`, no
  `HTTP-Referer`/`X-OpenRouter-Title` headers), omits temperature, and surfaces
  `insufficient_credits` as its own actionable 429 message.

Verification (2026-10-28 ~01:00–01:20 IST): catalog policy seeded on boot;
tiny probe returned pure JSON (~1.6–2.5 s round trip); a full TCS prediction
ran the whole 12-role graph — **18/18 LLM calls succeeded, 20,520 tokens,
67 s wall (01:17:38→01:18:45 IST), zero 400s/retries/quarantines** — decision
produced with governance flags intact (`RESEARCH_ONLY`, no capital authority).
Backend suite 504 passed / 1 skipped (new `test_gateway_experiential.py`);
frontend typecheck, lint, `test-chat.mjs` and the full `npm test` chain
passed. Still open: a live browser chat check on a running dev server; the
`-decisions` model as a future hybrid decider via the Decisions API.

## Closed-session repair, request-budget amortization and LLM quota gateway — 2026-10-27/28

Five features degraded during live market hours and one degraded after hours. All
repairs below were reproduced hermetically and verified against the running local
backend; the closed-session (after-market) checks ran at 2026-10-27 19:00–20:15 IST
and the structure-board re-verification at 2026-10-28 00:23–00:35 IST.

### FYERS daily request quota gateway (prediction/chat)

The OpenRouter free-tier daily quota exhausted mid-research. The gateway now
tracks real per-day request/token usage (`usage_daily`), refuses new LLM work
with an explicit `quota exhausted; resets <IST reset time>` message, persists the
reset epoch, and exposes `GET /api/v1/stocks/quota`. A prediction POST is still
accepted (202 queued) and the session fails fast in ~11 s with the quota label
instead of hanging. `DAILY_REQUEST_CAP=50`, reset 05:30 IST. The frontend chat
route preflights the backend quota and answers 429 with the reset time; the
X-Ray explanation path degrades to non-AI output with `ai_explanation: null`
rather than fabricating text.

### FYERS shared-socket recovery

The FYERS SDK kept its socket object alive through an SSL-certificate and DNS
outage (14:38–19:15 IST, `fyersDataSocket.log`) while its reconnect loop silently
failed — breadth, sector and volume inputs starved for the whole afternoon. A
bounded recovery now forces one full `LiveMarket` socket reset during an OPEN
session after `stream_silence_reset_seconds` (default 180 s) of global tick
silence, at most once per `stream_reset_cooldown_seconds` (300 s), only with
equity listeners registered and a present token. The socket demonstrably
recovered (19:15 IST "Successfully loaded index_hsm_mapping").

### Closed-session breadth direction and volume

Closed quotes without FYERS daily history were nulled to "no direction", leaving
breadth at 5/50. Direction is now kept only when verifiably tied to the last
completed session (candle rebuild, REST row stamped at the session's UTC-midnight
daily-candle epoch, or a tick inside that session's window); unverified
directions stay null. Closed-market volume pairs the last-session quotes with
daily baselines at elapsed=1 (session close) instead of the 05:30-IST stamp, so
relative volume and volume momentum report honestly after hours.

### Closed-session baseline budget

The snapshot collector's baseline warmer now accepts a per-plan call budget
override (`INTELLIGENCE_CLOSED_SNAPSHOT_HISTORY_CALLS`, default 12, ≤50) used
only at closed, where no live stream shares the FYERS budget. Verified live:
12 history loads warmed 12 usable daily baselines; open budget stays 6.

### Structure board: request-budget amortization (the 19/50 GOOD defect)

The 50-symbol board refetched a 1-minute FYERS history per symbol per refresh
(50 calls at a 4/s pace). The shared `RequestBudget` (45/min) or FYERS itself
(rejection observed at ≈50 requests/min) cut the burst, the circuit breaker then
rejected the remaining callers **instantly**, and `market.history` swallowed the
reason and served labelled-but-degraded Yahoo bars — silently capping the board
at 19–35/50 FYERS rows on every refresh, live and closed.

Four coordinated repairs:

1. `FyersUnavailable` (typed, subclass of `RuntimeError`) now marks the transient
   family: HTTP 429/5xx, in-body rate-limit errors, circuit backoff and budget
   exhaustion. Credential/parse failures stay plain `RuntimeError` and go
   straight to Yahoo.
2. `LiveMarket.history` waits out the circuit (bounded, `retry_after()`, ≤5 s per
   wait, ≤2 retries) before falling back, and every FYERS→Yahoo fallback is
   logged (`fyers_history_fallback`).
3. `ExistingMarketData.stock_history` caches FYERS-sourced histories
   session-aware: closed sessions reuse the immutable completed candles for
   `INTELLIGENCE_CLOSED_STOCK_HISTORY_TTL_SECONDS` (default 3600 s), open
   sessions for `INTELLIGENCE_OPEN_STOCK_HISTORY_TTL_SECONDS` (default 120 s —
   the old per-refresh refetch was unsatisfiable within any FYERS plan: 50
   symbols/45 s ≈ 66 req/min). Yahoo payloads are never long-cached, so rows
   heal on the next load.
4. The board logs one `structure_board_load` line (rows/FYERS/Yahoo split) plus
   a FYERS budget snapshot per load.

### Verified result (structure board, closed session)

| Load | Sources | Notes |
| ---- | ------- | ----- |
| 1 (cold burst, 50 fetches) | 42 FYERS / 8 Yahoo | budget clipped exactly 45 requests; retries exhausted inside the minute window |
| 2 (after TTL, 8 fetches + healing) | **50 FYERS / 0 Yahoo** | one real FYERS 429 absorbed by the typed retry |
| 3 (cache hit) | **50 FYERS / 0 Yahoo** | zero FYERS calls; budget counters unchanged |

All 50 rows `GOOD`, none delayed, all ranked. Hermetic suites: **450 extension
tests** (including 5 new stock-history-cache and closed-session tests) and
**488 agent-service tests** passed. `verify-intelligence-live.py --http` passed:
news (RELIANCE 22/TCS 16/INFY 19 articles), sentiment cached-repeat, sectors 8/8,
history endpoint, 401 auth check, no secret leakage. `/health` also gained a root
alias (an external monitor polled `/health`, which 404'd every cycle).

### Remaining gates

- The open-session cadence (120 s outer TTL ≈ 25 req/min for the board plus the
  collector's ≈13 req/min) must be re-verified after 09:15 IST on 2026-10-28,
  including whether FYERS' last 1 m history bar is a completed or forming candle.
- Full LLM paths (chat live probe, X-Ray AI explanation) wait for the quota
  reset at 05:30 IST on 2026-10-28.
- Live-market socket-recovery behavior after a real outage can only be observed
  in an actual OPEN session; hermetic recovery tests cover the logic.

## Full live-feed coverage follow-up — 2026-10-19

This follow-up resolves the coverage gaps recorded in the earlier repair below.
Sentiment previously depended on whichever stocks happened to be subscribed by a
stock page. It now owns one bounded interest queue on the **existing shared FYERS
socket**: the official 50 NIFTY equities and all 10 configured index inputs.
It starts no second socket, per-stock Yahoo pollers, or depth snapshot fan-out.

- `live_feed.py` manages idempotent interests, owner-safe release on closed/unknown
  sessions, and the shared token/reconnect lifecycle. The guarded, idempotent
  installer patch enables correct index wire symbols and authentic index exchange
  timestamps. Timestamp-free price frames cannot inherit an old tick's timestamp;
  the legacy backend test now asserts that rejection.
- `market_data.py` prefers fresh shared stream observations over cached REST or
  candle fallback. A bounded initial wait allows the first tick batch to arrive.
- `baselines.py` warms official constituents before their first ticks, at a maximum
  of six history calls per refresh window. It validates 15 completed daily volume
  sessions or five complete five-minute sessions, tracks warmup/cooldown progress,
  expires payloads, and invalidates prior-date intraday curves. Volume still
  requires at least ten usable quote/baseline pairs. The existing labelled,
  lower-confidence daily-average fallback remains available.
- Volume is recalculated from each shared snapshot, rather than hidden behind a
  second five-minute calculation cache. Baseline warmup can therefore become
  usable on the next market refresh. Missing-data warnings name actual coverage
  counts, and incomplete required components cannot receive a `GOOD` grade.

### Verified result

Live frontend HTTP check at **2026-10-19 08:25:31 UTC / 13:55:31 IST**, during `OPEN`:

| Input                | Observed coverage                                     |
| -------------------- | ----------------------------------------------------- |
| NIFTY market breadth | **50/50** equities                                    |
| Sector breadth       | **8/8** sectors                                       |
| India VIX            | Fresh FYERS input available                           |
| Volume momentum      | **12** usable samples; minimum **10**                 |
| Composite components | **7/7 available**, configured weight coverage **1.0** |
| Data quality         | **GOOD / 99**                                         |

The preceding live checks showed volume warming from 6 to 9 to 12 usable names;
quality remained `PARTIAL` until the minimum was met. All 60 shared interests were
connected. There was no candle-fallback or missing-component warning in the final
check. A price/volume divergence warning remained as a calculated market condition.
Some histories were still cooling down or warming; this is not a claim of all-50
volume-baseline coverage, calibrated predictive accuracy, or sustained uptime.

Checks: **329 hermetic Python tests passed** (316 extension tests plus 13 existing
backend FYERS integration/budget tests); **3 targeted browser tests passed**;
intelligence proxy/UI regression script, TypeScript and lint passed. The updated
extension and shared-stream patch are installed in the existing local backend,
and its single worker was restarted. No credentials, model choices, accounts,
cloud deployments, or paper-book data were changed.

After a restart, allow several refresh cycles for volume-baseline warmup. A broker
outage or stale ticks must still lower quality; do not hide the warnings or relax
freshness/coverage thresholds to force a healthy label.

## Earlier sentiment, news and ripple repair — 2026-10-19

The open-session failure was reproduced through the local frontend: market
sentiment returned HTTP 200 but a null score. FYERS REST equity/index rows carried
midnight `tt` timestamps, so they did not establish intraday freshness. Broker
authentication alone does not establish fresh quote coverage.

- Index recovery now uses only recent **completed FYERS one-minute candles** for
  NIFTY, Bank Nifty and VIX when REST observations are unusable. This adds at most
  three bounded history calls per shared snapshot, reusing existing transport,
  rate limits and single-flight caches. Observation time is the provider candle's
  end, never request time. A same-trading-date REST previous close is required.
  Components expose candle provenance, reduced confidence (maximum 0.55), and a
  visible warning; no daily or current in-progress bar is relabelled as live.
- Quote, market and volume caches separate open/closed sessions. The frontend
  switches price-dependent query scope at session boundaries, refreshes stock
  price confirmation every 45 seconds during regular hours, and polls unavailable
  intelligence again after 30 seconds. RSS keeps its ten-minute success cache.
- Sentiment baselines now use the dedicated FYERS history adapter, rather than
  display history truncated to the latest day. Excluded/unsupported-language
  articles do not affect scores or drivers. Unsupported sentiment is explicitly
  unavailable, not invented neutral. News/price comparisons use parsed instants
  and require a verified open session and fresh quote.
- News & Drivers displays relevant unscored headlines with a **Not scored** badge,
  shows top scored drivers and provider state, and refreshes both stock panels.
  Missing composite scores retain warnings and available news-tone diagnostics.
  NSE filing relevance preserves explicit issuer metadata and quarantines mismatches.
- Ripple detection isolates factor-specific clauses, rejects ambiguous or
  prospective moves, and does not assume an output cut is an observed oil-price
  rise. Origins require dated recent news and a usable provider snapshot. History
  echoes require aligned sessions and non-overlapping observation windows; link
  weights are labelled curated, not probabilities.

### Verification for this repair

- `npm test`: passed (71 Node unit cases plus all chained regression scripts).
- Backend-extension suite: **210 passed**, with external HTTP and private
  configuration disabled for hermetic execution.
- `npx playwright test tests/browser/intelligence.spec.ts`: **3 passed**, covering
  stock headlines/drivers and refresh, null-score diagnostics, and ripple recovery.
- `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check`: passed.
  The build retains the existing Vite tsconfig-paths deprecation/plugin-timing notices.
- Updated the existing local backend using `scripts/install-intelligence-backend.py`
  and restarted its single local worker. No cloud deployment or data migration.
- Live HTTP verification during `OPEN` at **07:48 UTC / 13:18 IST**: market
  sentiment returned **35 / BEARISH**, confidence **0.198**, quality **DEGRADED**,
  using completed one-minute NIFTY/BANK/VIX observations. Market news returned 95
  articles (72 relevant); RELIANCE returned 20 articles (10 relevant), with stock
  news sentiment **58 / NEUTRAL**. These are point-in-time checks, not forecasts
  or evidence of sustained provider uptime.

**Remaining provider gap:** breadth, sector breadth and RVOL were unavailable in
the live probe, so the restored composite is explicitly degraded. RELIANCE price
confirmation was also unavailable without a fresh broker timestamp; its news
score remains usable independently. A complete live feed still requires genuine
timestamped observations for those missing components. Earlier closed-session
verification below is historical and does not supersede this repair's results.

## Endpoints

All frontend intelligence endpoints require a bearer session. Frontend hooks attach it automatically. Directly navigating to an API in a new tab without a bearer header returns 401. Backend equivalents are under `/api/v1` and `/api` and require `X-Quantplus-Key`. Global middleware also protects legacy HTTP/WebSocket routes; only exact health GETs and state-validated Fyers callback GETs are public.

| Frontend API                                                              | Response                                                                                             |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `GET /api/stocks/{symbol}/news`                                           | Normalized articles, relevance flags, provider status and quality                                    |
| `GET /api/stocks/{symbol}/news-sentiment`                                 | Weighted score, confidence, drivers and price confirmation                                           |
| `GET /api/stocks/{symbol}/intelligence`                                   | FYERS snapshot, existing technical features, news, market/sector context and optional AI explanation |
| `GET /api/market/sentiment`                                               | Quantitative index, all components, trend, alignment, divergences, data quality, warnings and regime |
| `GET /api/market/sentiment/history?range=1h\|1d\|5d&interval=5m\|15m\|1h` | Chronological persisted/in-memory sentiment snapshots                                                |
| `GET /api/market/intelligence`                                            | Quantitative output plus a separate, validated AI explanation                                        |
| `GET /api/market/sectors`                                                 | Eight sector scores and availability                                                                 |
| `GET /api/market/news`                                                    | Shared-provider market headlines                                                                     |

Intelligence endpoints accept `?explain=false` to skip AI. Missing scores are `null` with label `UNAVAILABLE`, rather than invented neutral observations. Every engine response includes `data_quality`, `confidence` and UTC `updated_at`. Provider timestamps and component coverage distinguish a calculation timestamp from data freshness.

## Calculation and resilience

Stock/company metadata comes from the existing NIFTY 500 catalog, with explicit aliases for the six requested companies and automatic fallback queries for other NSE symbols. Google News RSS uses the Indian locale and `when:1d`; headlines, RSS snippets, source, publication time and links are retained. Configured official connectors may retrieve bounded allowlisted PDF/XML/XBRL attachments into the immutable local archive. Arbitrary article pages are not fetched; attachment text is untrusted and does not automatically become a scored financial fact.

Deduplication combines deterministic IDs, normalized headlines and fuzzy comparison above 0.88, while preserving different numbers and directional developments. Articles below configurable relevance 55 do not affect scores. Event classification covers all requested categories. Conservative stock-context rules distinguish oil producers from consumers, shrink ambiguous sentiment toward neutral, and expose their confidence and method. Impact accounts for event category, source, age, relevance, magnitude and optional daily price reaction. Aggregation weights relevance, impact, confidence and exponential recency decay (12-hour half-life). Market headlines also have capped individual influence and require three relevant stories.

Market component weights are centrally configured and validated to total 1.0: NIFTY 20%, breadth 20%, sectors 15%, VIX 15%, news 15%, relative volume momentum 10%, Bank Nifty 5%. Optional regime-aware weighting is bounded, disabled by default, deterministic and exposed as base/effective weights. All observations use the existing FYERS instance; index and historical adapters reuse its authenticated transport. Current NIFTY 50 membership is fetched from NSE's official constituent CSV, cached daily, and never replaced silently with the research graph's frozen subset. Market breadth requires 80% constituent coverage; optional VWAP, 20-EMA, 50-DMA and session-level metrics remain null until observed coverage is sufficient. VIX considers daily direction, rate of change and its recent completed-session average. Missing components receive zero effective weight; available weights are normalized and confidence falls with missing coverage. A news-only result cannot masquerade as a quantitative market index.

The existing FYERS session parser received a two-line compatibility fix to accept both textual exchange/segment names and numeric NSE/cash-market identifiers. This preserves the integration and correctly recognizes closed sessions.

The AI uses the existing agent model gateway after calculation. It cannot update the score. Driver and risk numbers are rendered in code from validated evidence IDs; numeric claims in AI prose or unknown evidence IDs are rejected. Provider/model errors are sanitized. A model call can return `pending`; requests share the existing job. Narratives are cached and model calls are limited per scope. The structured `quant_ai_context` is available to Quant AI consumers without modifying the audited historical research graph or injecting current data into historical recommendations.

The bounded cache exposes a replaceable protocol and single-flight loading. News caches for 600 seconds, market calculations for 45 seconds while open / 300 seconds while closed, history/volume for 300 seconds, and explicit failures for 30 seconds. A single `MarketSnapshotCollector` shares normalized quotes, indices and bounded FYERS history across breadth, sectors, VIX, volume and sentiment. It does not issue upstream requests on every React render. Structured logs report durations, FYERS request attempts, snapshot cache hits, coverage, missing components, weight renormalization, divergences, confidence and persistence errors; exception messages and credentials are not logged.

Sentiment snapshots are recorded every five minutes only during `OPEN`. Snapshot storage, forward-return calibration fields, historical signal reliability and scheduling are separate from calculation. `INTELLIGENCE_HISTORY_PATH` enables durable SQLite history; an empty path keeps history in memory. `INTELLIGENCE_NEWS_ARCHIVE_PATH` enables append-only news/attachment storage and durable connector budgets/circuit state. During `CLOSED`, `PRE_OPEN` or `HOLIDAY`, price-based output is explicitly marked as last completed session data and is never refreshed as if live.

## Files created

Backend package source (also installed in the backend):

```text
backend-extension/quantplus_intelligence/
  __init__.py
  api.py
  cache.py
  common.py
  config.py
  explanation.py
  intelligence.py
  market.py
  market_data.py
  analytics.py
  calibration.py
  history.py
  scheduler.py
  volume.py
  news/
    __init__.py
    aggregation.py
    deduplicator.py
    google_news.py
    impact.py
    provider.py
    relevance.py
    resolver.py
    sentiment.py
    service.py
    market_taxonomy.py
```

Frontend, verification and documentation:

```text
src/routes/api/stocks/$.ts
src/routes/api/market/$.ts
src/lib/intelligence-api.ts
src/hooks/use-intelligence.ts
src/components/app/stocks/StockNewsIntelligence.tsx
src/components/app/dashboard/SectorSentimentPanel.tsx
backend-extension/tests/conftest.py
backend-extension/tests/test_intelligence.py
backend-extension/tests/test_sentiment_upgrade.py
supabase/migrations/20261011143000_market_sentiment_snapshots.sql
scripts/install-intelligence-backend.py
scripts/verify-intelligence-live.py
scripts/test-intelligence.mjs
INTELLIGENCE.md
```

## Files modified

```text
.gitignore
package.json
src/routeTree.gen.ts                     (route generator)
src/routes/api/agent/$.ts                 (allowlist and cold-load timeout)
src/hooks/use-dashboard-data.ts          (live news/sentiment adapters)
src/components/app/stocks/StockDetail.tsx (replace simulated news/sentiment)
src/components/app/dashboard/NewsPanel.tsx
src/components/app/dashboard/SentimentPanel.tsx
src/components/app/dashboard/SectorSentimentPanel.tsx
supabase/migrations/20261011143000_market_sentiment_snapshots.sql
D:\QP\agent-service\app\main.py          (additive route registration)
D:\QP\agent-service\app\data\fyers_provider.py (numeric session identifiers)
D:\QP\agent-service\contract\openapi.json      (new API contract)
D:\QP\agent-service\contract\schemas.json      (regenerated with existing exporter)
```

Existing unrelated uncommitted changes were preserved. No commits, pushes or history rewrites were performed. `.env` and `.env.*` are ignored, with `.env.example` retained as a template.

## Verification

The repository extension suite now has **72 deterministic Python checks** covering normalization, resolver fallback, deduplication, relevance/age, stock-perspective commodity sentiment, classification, uncertainty, impact, weighted aggregation, recency decay, article influence caps, market classification boundaries, trend deltas/velocity, breadth coverage, RVOL confirmation, divergence detection, alignment, regime, quality scoring, bounded weights, snapshot storage/downsampling, forward returns and validation scenarios. The frontend proxy checks cover all intelligence paths including history, authentication, rejection of unrelated paths and secret isolation.

Real-provider verification runs RELIANCE, TCS, INFY, market sentiment, sectors and stock/market intelligence. It verifies cache timestamps and checks responses against actual configured private credentials without printing those credentials. The redacted runtime report is `.intelligence-test/live-report.json` (ignored by Git). A public-build scan checked eight configured private values across 44 built public files and found no leaked values.

Final deterministic backend run: **509 combined backend tests passed** (including the 72 repository extension checks). Frontend tests, TypeScript, lint and production build passed; lint reports seven existing React refresh warnings. The OpenAPI snapshot was regenerated and its checks passed.

The real HTTP probe returned recent RSS items for RELIANCE, TCS and INFY, successful FYERS snapshots, verified caches/authentication/secret isolation, and a market score of **70 / BULLISH**, confidence **0.360**, quality **PARTIAL**, regime **SIDEWAYS_BULLISH**, with the market closed. Breadth coverage was **20%** and volume coverage **0%**, so both components were explicitly unavailable and their weights were redistributed; six of eight sector histories were available. The probe also verified the history endpoint, sectors endpoint, AI score immutability and stock context. With `--ai`, the existing gateway returned a grounded explanation while leaving the deterministic score unchanged.

## Limitations

- Headline sentiment is conservative rule-based analysis, not a licensed financial NLP model. Ambiguous or sparse news produces neutral scores with low confidence; it is explicitly marked `PARTIAL`.
- The market was closed during real verification. Intraday price/news confirmation and open-session refresh cannot be demonstrated from closed-session inputs.
- Volume requires ten usable FYERS histories. Missing/short histories make this component unavailable. It uses equivalent-time-of-day baselines when complete intraday candles exist and a clearly labeled daily-average fallback otherwise; it does not use Yahoo volume for sentiment.
- Market cache state remains process-local. Durable local history/archive paths are configured on this machine; restart the backend to load them. Their presence does not establish distributed market-cache behavior.
- NSE membership or completed-session history failures make affected breadth unavailable rather than substituting stale constituents or treating after-hours reset fields as unchanged.
- AI availability/latency depends on the existing gateway; scores and non-AI endpoints continue independently. Invalid explanations are rejected, and changed inputs can be rate-limited to prevent model polling costs.
- The unused Supabase history adapter and settings were removed. Historical Supabase SQL is retained as history; active local persistence uses SQLite. Hosted application accounts and paper books use InsForge when explicitly activated.
- The audited recommendation graph retains its current behavior. New live context is exposed through `quant_ai_context` and the intelligence APIs for its consumers.

## Exact run commands

Install the backend's pinned `requirements.lock.txt` in a clean Python 3.11 environment; it includes PDF parsing and Parquet support. The validated interpreter on this machine is `D:\Quant-Plus\.local-data\backend-runtime\Scripts\python.exe`. See [STARTUP.md](STARTUP.md). Do not rely on the old global Python environment.

Install/update the backend extension, then start the backend (restart it if already running):

```powershell
cd D:\Quant-Plus
python -B scripts/install-intelligence-backend.py --backend D:\QP\agent-service

cd D:\QP\agent-service
python -B -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In a second terminal:

```powershell
cd D:\Quant-Plus
npm.cmd run dev -- --host 127.0.0.1 --port 8080 --strictPort
```

Use the existing `.env.local` server variables `AGENT_SERVICE_URL` and `AGENT_SERVICE_API_KEY`, and the backend `.env` credentials already configured. Never put private values in `VITE_*`. Production must point `AGENT_SERVICE_URL` to the deployed backend; a frontend worker cannot reach the developer machine's localhost.

Run checks:

```powershell
cd D:\Quant-Plus
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:intelligence
npm.cmd run lint
npm.cmd run build
python -B scripts/verify-intelligence-live.py --ai
python -B scripts/verify-intelligence-live.py --ai --http

cd D:\QP\agent-service
python -B -m pytest tests D:\Quant-Plus\backend-extension\tests -q -p no:cacheprovider
```

If changing routes later, refresh the backend contract using `python -B scripts/export_contract.py`.

Optional backend `.env` overrides:

```dotenv
INTELLIGENCE_NEWS_TTL_SECONDS=600
INTELLIGENCE_MARKET_TTL_SECONDS=45
INTELLIGENCE_CLOSED_MARKET_TTL_SECONDS=300
INTELLIGENCE_RELEVANCE_THRESHOLD=55
INTELLIGENCE_DUPLICATE_THRESHOLD=0.88
INTELLIGENCE_NEWS_HALF_LIFE_HOURS=12
INTELLIGENCE_AI_ENABLED=true
INTELLIGENCE_AI_TIMEOUT_SECONDS=18
INTELLIGENCE_AI_TTL_SECONDS=600
```

Weights may be overridden using `INTELLIGENCE_MARKET_WEIGHTS` as a JSON object containing all seven keys totaling 1.0. Other-machine tests can set `QUANTPLUS_BACKEND_PATH`; installer and live probe accept `--backend`.

## Agentic prediction responsiveness — 2026-10-19

The stock prediction lifecycle now follows the research cutoff instead of browser fetch time, pauses after transport errors, requires explicit failed-session retry and shares in-flight starts across navigation. Real partial findings appear alongside retained completed research; failed, paused and offline states are distinguished.

The separate backend received three guarded source repairs: terminal HTTP errors no longer incur futile transport backoff; independent macro index reads run together; expired automatic refreshes get a new cutoff while explicit retries retain checkpoints. Models, full graph, grounding and risk checks remain unchanged. The patched local service was restarted and its health verified.

Controlled client tests removed an 800-second excess refresh delay in the reproduced cutoff scenario. Final checks passed: full `npm test`, typecheck, lint, production build, 71 focused offline backend tests, the five-sample mocked benchmark and all 15 focused prediction/Ripple/intelligence browser cases. Cached status reads are fast, but **a cold end-to-end live generation speedup has not been established**; dependent model/data stages can still take minutes.

See [the performance checkpoint](audit/implementation/prediction-performance-20261019.md) for exact samples, scope/limits, commands and the guarded `scripts/patch-prediction-latency.py` installer. No deployment or data migration was performed.
