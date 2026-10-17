# QuantPlus intelligence implementation

The engines are installed in the existing FastAPI backend at `D:\QP\agent-service\quantplus_intelligence`. Their versioned source is kept in this repository under `backend-extension/quantplus_intelligence`; `scripts/install-intelligence-backend.py` installs updates without replacing the existing FYERS client, stream, agent graph or credentials.

The frontend commonly runs on port **8080**; use the URL printed by Vite. Its API routes validate the loopback local identity or verified InsForge session and forward requests using the server-only website API key. The browser never calls Google, NSE or FYERS directly. See [ROADMAP_IMPLEMENTATION_20261015.md](ROADMAP_IMPLEMENTATION_20261015.md) for the current verified scope and remaining gates.

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
