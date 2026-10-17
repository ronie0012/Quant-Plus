# Quant Plus: evidence-based project audit

Audit date: **2026-10-14**. Implementation roadmap: [MASTER_ROADMAP.md](MASTER_ROADMAP.md).

Subsequent provider decision: the user selected InsForge after this audit and linked the
Quant-Plus project. See [INSFORGE_MIGRATION.md](INSFORGE_MIGRATION.md). The findings below
describe the audited implementation; linking does not resolve them or complete migration.

Machine-readable results, reproduction summaries and source fingerprints:
[audit evidence](audit/2026-10-14/evidence.json). This audit records **43 findings**,
including **10 isolated reproduced behaviors**.

## Assessment

Quant Plus has a useful terminal, a real checkpointed research pipeline, provider adapters,
deterministic intelligence calculations, local paper accounting, and meaningful regression tests.
It is **not yet a bug-free, data-complete, realistic paper-trading platform**. Passing the existing
suite does not establish financial correctness, research accuracy, or complete browser behavior.

The most urgent work is correctness of the trading book and observation timestamps. Improving
models before repairing those boundaries would make incorrect results more persuasive.

The requested ambition, “the best paper trading platform with AI features ever existed,” is the
product direction. A defensible achievement claim needs an explicit benchmark, comparison scope,
date, and independently reproducible results. This audit does not claim that ranking.

## Scope and evidence discipline

Reviewed the frontend/server repository at `D:\Quant-Plus`, its Python intelligence extension,
the connected backend at `D:\QP\agent-service`, existing evaluation artifacts, API boundaries,
data acquisition, agent orchestration, local persistence, and visible product implementations.
Compared all **28** extension Python source files with the installed backend package: **0 differences**.

The backend was inspected without changing its source. Backend tests were ultimately run in an
isolated copy under `.intelligence-test/audit-backend`, using test keys and an isolated database.
No real model inference was requested by the audit probes. Synthetic fixtures were used only for
reproductions and tests; they were not inserted into the user's paper account.

Evidence labels used below:

| Label         | Meaning                                                                               |
| ------------- | ------------------------------------------------------------------------------------- |
| Reproduced    | An isolated probe demonstrated the current behavior.                                  |
| Code-verified | The implementation directly contains the behavior or omits the stated capability.     |
| Artifact      | A persisted prior measurement was inspected; it was not a new performance experiment. |
| Unverified    | Requires live services, browser interaction, load testing, or new outcome data.       |

Severity denotes consequence, not a claim that a live account was affected: **P0** is an integrity
or invalid-evidence blocker; **P1** is material functionality/reliability; **P2** is product completeness
or maintainability. Financial losses here are simulated, but accurate accounting still matters.

## Verification performed

| Check                   | Current result                                                          | Limits                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| TypeScript              | Pass: `tsc --noEmit`                                                    | Does not validate untrusted JSON at runtime.                                                                 |
| Full frontend lint      | 0 errors; 7 Fast Refresh warnings                                       | Zero-warning target is not met.                                                                              |
| Frontend unit tests     | 12 pass                                                                 | Math, alerts, brackets, and regular-session boundaries.                                                      |
| Frontend script suites  | All 8 pass                                                              | Proxy, paper client/route, local store, prediction polling, chat, intelligence. Mostly controlled responses. |
| Intelligence extension  | 74 pass                                                                 | Fixtures do not establish real financial NLP accuracy.                                                       |
| Isolated backend suite  | **436 pass**                                                            | `tests/test_technical.py` excluded because it uses live Yahoo/model services.                                |
| Backend live test       | Not accepted as a passing live check                                    | An earlier isolated run reported it skipped after waiting on external services.                              |
| Production build        | Pass, Node server preset                                                | Build warning remains about duplicate/native tsconfig-path support.                                          |
| Additional audit probes | **10 behaviors reproduced**                                             | See the two reproduction scripts below.                                                                      |
| Agent baseline artifact | 11 entries; 0 beat the best constant baseline                           | Stored historical results; not a fresh evaluation or a proof about every future model.                       |
| Current backend HTTP    | Unreachable during this audit, including an unsandboxed localhost retry | No current uptime, Fyers recovery, RSS availability, or model-access claim.                                  |
| Browser automation      | Not performed                                                           | No browser tool was available; Playwright/Puppeteer are not installed.                                       |

The first direct backend run encountered writes to `data/raw/...` outside the workspace. Two
rotation tests also failed with only one configured test key; both pass with two test keys.
Those are test isolation/configuration defects, not evidence that key rotation is broken.
The final 436-test run uses two fake keys and excludes the unmocked live test. Do not describe
this as “all live integrations verified.”

Reproductions:

```powershell
node scripts/audit-local-findings.mjs
python -B scripts/audit-intelligence-findings.py
```

These scripts assert today's defective behavior for diagnosis. After fixes, convert the cases
into regression tests that assert the desired behavior; do not keep asserting defects in the
release test suite. The Python probe reads the connected backend if that path exists.

## Trading and accounting findings

| ID      | Priority / evidence  | Finding and consequence                                                                                                                                                                                                                                             | Primary implementation                                                             |
| ------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| EXEC-01 | P0; reproduced       | Two identical submissions settle twice. There is no idempotency contract, so a retry or two browser monitors can create another trade. This is a missing replay safeguard; intentional repeat orders must still be allowed with different intent IDs.               | `src/routes/api/paper/$.ts:280`; `src/lib/local-store.server.ts:159`               |
| EXEC-02 | P0; reproduced       | Trading pause blocks a sell that reduces an existing holding. Browser bracket exits submit the same sell path, so protection can be disabled by the pause intended to reduce risk.                                                                                  | `src/lib/local-store.server.ts:90`; `src/components/app/TradingMonitor.tsx`        |
| EXEC-03 | P0; reproduced       | A fresh buy fills after a realised loss of 50 with `daily_loss_limit=1`. That setting is stored and advertised as a guardrail but not enforced by local execution.                                                                                                  | `src/lib/local-store.server.ts:86`; `src/components/app/pages/ProductPages.tsx:57` |
| EXEC-04 | P1; reproduced       | A DAY order created October 1 remains fillable October 14. No session expiry or expiration state is implemented.                                                                                                                                                    | `src/lib/local-store.server.ts:202`                                                |
| EXEC-05 | P0; reproduced       | The server accepts an open quote one day in the future and a closed-session quote from 2020. Client validation has a future-time check, but the authority boundary does not; closed quotes have no maximum age.                                                     | `src/routes/api/paper/$.ts:168`; `src/lib/paper-trading.ts`                        |
| EXEC-06 | P1; code-verified    | The Orders page reconstructs positions from only the newest 60 orders. Older buys can disappear while later sells remain. Its average is all historical buys divided by buy quantity, rather than the remaining holding's cost basis after sales/rebuys.            | `src/hooks/use-orders.ts:55`; `src/components/app/pages/OrdersPage.tsx:15,224`     |
| EXEC-07 | P0/P1; code-verified | Alerts/brackets run in a browser interval. Peaks and completed exits live in browser storage; closing the tab stops monitoring. Multiple tabs share account state without a server claim/lease. Protection is not a durable server capability.                      | `src/components/app/TradingMonitor.tsx`                                            |
| EXEC-08 | P1; code-verified    | Charges are estimated with one constant and are not debited. Orders store the fill price but not the complete quote/provenance snapshot. Position limits use cost basis, not current marked equity. No spread, liquidity, partial-fill, or settlement model exists. | `src/lib/local-store.server.ts:86,108,153`; `src/hooks/use-orders.ts:9`            |
| EXEC-09 | P1; code-verified    | Basket legs execute sequentially and may partially succeed. Unknown prices contribute zero to the estimate. Client eligibility is different from the shared quote validator; retrying the entire basket can duplicate successful legs.                              | `src/components/app/pages/NextPages.tsx:312`                                       |

Existing strengths to retain: execution price is fetched by the server, browser prices are ignored,
simple buys/sells settle cash and holdings together, invalid basic inputs are rejected, and ordinary
store rejection leaves the file unchanged. These do not cover the defects above.

## Local persistence and contract findings

| ID       | Priority / evidence    | Finding and consequence                                                                                                                                                                                                                                                                                                 | Primary implementation                                                            |
| -------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| STORE-01 | P1; reproduced         | `trade_journal` accepts `risks:null`. The review UI reads `risks.length` and `risks.join`, producing a runtime type error. Generic local mutations lack table-specific schemas.                                                                                                                                         | `src/lib/local-store.server.ts:306`; `src/components/app/TradeReviewPanel.tsx:23` |
| STORE-02 | P1; reproduced         | Negative daily-loss and confirmation thresholds are accepted and persisted. Validating two positive fields does not validate the whole risk policy.                                                                                                                                                                     | `src/lib/local-store.server.ts:308`                                               |
| STORE-03 | P1; code-verified risk | Every operation reads/parses the whole JSON file; mutations synchronously replace the whole file. There is no interprocess writer lock, backup/restore workflow, fsync durability policy, full state validation, or schema migration beyond `version=1`. Multi-process races and crash durability have not been tested. | `src/lib/local-store.server.ts:59`                                                |
| STORE-04 | P2; code-verified      | The local client is cast to a full Supabase client while implementing only a subset. `select` ignores projection, `single` and `maybeSingle` have identical semantics, and future SDK method calls can typecheck but fail at runtime.                                                                                   | `src/lib/local-client.ts:20,62,122`; `src/integrations/supabase/client.ts`        |

The local profile is intentional, not a real authentication service. The public constant local token
is a loopback/same-origin boundary marker; do not market it as a private multi-user account.
All future storage work remains local, with a provider-neutral repository interface. No Supabase,
Inforge, or other hosted provider is selected by this audit.

## Dummy data and incomplete surfaces

“No dummy data” must apply to the public site as well as the terminal. Virtual cash and real paper
fills are legitimate simulated records. Mathematical what-if output is legitimate when its inputs
are explicit. Test fixtures are allowed in tests. Invented observed prices, candles, market facts,
confidence, option contracts, or provider health are not allowed in product surfaces.

| ID      | Priority / evidence    | Confirmed surface                                                                                                                                                                                                                                         | Required treatment                                                                                                                                                                |
| ------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DATA-01 | P1; code-verified      | `ProfessionalChart` generates synthetic OHLCV when `marketCandles` is undefined. `SparkChart` generates seeded series for watchlist/research pages.                                                                                                       | Remove product fallbacks; use real history or unavailable states.                                                                                                                 |
| DATA-02 | P1; code-verified      | Markets has fixed momentum 68/42 and volatility 31/46, with missing breadth replaced by 50. Watchlist focus has fixed momentum. Quant AI context shows fixed 100/70 completeness values. Data Sources assigns fixed health percentages.                   | Replace with measured fields/coverage, or remove the metric.                                                                                                                      |
| DATA-03 | P1; code-verified      | Options Lab uses reference spot, seeded IV, guessed strike spacing and lot size. Replay uses generated bars.                                                                                                                                              | Disable until real data/contracts are available; replace replay with recorded point-in-time sessions. A “simulation” label alone does not meet the user's zero-dummy requirement. |
| DATA-04 | P1; code-verified      | Public `MarketTicker`, `MarketExplorer`, `MarketIntelligence`, `DashboardPreview`, portfolio/research illustrations use static data, drifting pseudo-quotes, or seeded charts.                                                                            | Use real read-only snapshots/history or nonquantitative product illustrations.                                                                                                    |
| DATA-05 | P1; code-verified      | `nifty50.ts` mixes metadata with seed prices/weights and generated metrics, analysts, news, sentiment and depth. Runtime universe fallbacks preserve a static list and static weights. Some generators are legacy/dead code; some data remains reachable. | Split verified instrument metadata from observations, validate membership effective dates, remove unused generators, and prohibit runtime fixture imports.                        |
| DATA-06 | P1; code-verified      | Screener volatility is always null, and missing momentum/volatility/conviction passes its filters. A user selecting low volatility or high conviction can therefore get unqualified rows. “Momentum” is also a one-day change transformation.             | Define factor formulas and coverage; exclude unknown values under an active constraint unless the user explicitly asks to include unknowns.                                       |
| DATA-07 | P1; code-verified risk | `useStockQuotes` creates a stream per hook and does not normalize/deduplicate/sort/cap names. The backend permits 50 names per stream; larger watchlists fail instead of partitioning.                                                                    | Shared subscription manager and plan-aware batching, with measured subscription/resource limits.                                                                                  |

Primary evidence: `src/components/app/stocks/ProfessionalChart.tsx:18,51`,
`src/components/app/pages/workspace.tsx:100`, `TerminalPages.tsx:206,658,713,873`,
`NextPages.tsx:25`, `ProductPages.tsx:468`, `IntelligencePages.tsx:455`,
`ScreenerPage.tsx:112`, `src/data/{market,nifty50}.ts`, `src/hooks/use-live.ts`,
and `src/hooks/use-agent-stock.ts`.

## News and sentiment findings

| ID      | Priority / evidence                                         | Finding                                                                                                                                                                                                                                                                             | Primary implementation                                       |
| ------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| NEWS-01 | P1; code-verified, feed semantics require live confirmation | Official announcement parsing treats timezone-less dates as UTC. For IST wall times that shifts availability by 5.5 hours. The official path also lacks the RSS path's future-time/max-age filter and does not preserve first observation time.                                     | `backend-extension/quantplus_intelligence/news/official.py`  |
| NEWS-02 | P1; code-verified                                           | Discovery is mainly Google RSS plus best-effort NSE metadata. Publisher articles/attachments are not read by this news adapter, and the news cache is not a durable raw archive. This caps context and historical reproducibility.                                                  | `news/google_news.py`; `news/official.py`; `news/service.py` |
| NEWS-03 | P1; code-verified risk                                      | Entity relevance and sentiment are keyword/alias rules. Dedup normalizes punctuation before comparing numbers, and discards duplicates instead of preserving event lineage. Semantic rewrites/amendments and mixed Hindi/English are not evaluated on a labelled real corpus.       | `news/{resolver,relevance,sentiment,deduplicator}.py`        |
| NEWS-04 | P1; code-verified                                           | Article impact can include the stock's whole-day price change; price confirmation is a daily-direction proxy. That is not an event-specific causal effect and can mix news with pre-publication price movement.                                                                     | `news/impact.py`; `news/service.py:91`                       |
| SENT-01 | P0 for evaluation; reproduced                               | A snapshot at 10:00 IST gets an EOD label from a 10:15 IST candle. The function does not require the session to have ended. Its EOD target is formed as 15:30 in the snapshot timestamp's timezone, and 1d is a calendar-day offset. It lacks exchange-session maturity rules.      | `calibration.py:36`                                          |
| SENT-02 | P1; reproduced                                              | Thirty bullish observations and zero bearish observations return bearish reliability 0 rather than unavailable. Minimum count is checked for the combined regime, not each signal's denominator.                                                                                    | `calibration.py:51`                                          |
| SENT-03 | P1; code-verified                                           | Default history is process memory; the persistence option is cloud-specific. The extension has no runtime caller for `evaluate_snapshot`, so forward-outcome maturation is not wired into its scheduler.                                                                            | `history.py`; `scheduler.py`; call-site scan                 |
| SENT-04 | P1; code-verified / quality unverified                      | Market/news scores and coverage confidence are deterministic heuristics, not calibrated outcome probabilities. Source credibility and component weights are priors. No inspected evidence establishes labelled Indian-news performance or predictive value of this sentiment index. | `config.py`; `market.py`; `news/aggregation.py`              |

Retain the engine's useful properties: explicit unavailable values, relevance filtering, bounded
caching/single-flight loading, component coverage, conflict detection, independent narrative
explanation, and no AI override of deterministic scores. Extend these rather than replacing them
with a single opaque “bullish/bearish” model response.

## Agentic research and chatbot findings

| ID      | Priority / evidence                    | Finding                                                                                                                                                                                                                                                                                                           | Primary implementation                                                                                         |
| ------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| AI-01   | P0 for historical evidence; reproduced | The Yahoo provider accepts a full daily candle for an intraday historical cutoff because it filters using the candle index timestamp, not actual bar completion/availability. PIT assertions consequently do not prove that all values in the candle were knowable.                                               | `D:\QP\agent-service\app\data\yfinance_provider.py`                                                            |
| AI-02   | P1; code-verified                      | Fundamentals analyst requests 65 bars, then labels extrema of those bars `hi52`/`lo52`. Recent historical cutoffs within 30 days may receive today's `.info`, explicitly labelled non-PIT but still later information.                                                                                            | `app/agents/analysts.py:23,33,42`                                                                              |
| AI-03   | P1; artifact                           | `data/baseline_analysis.json` has 11 entries with `beats_best_constant=false` in all 11. A prior report identifies an oracle-contaminated positive run. Calibration documentation reports insufficient resolved outcomes at its date.                                                                             | `data/baseline_analysis.json`; `data/baseline_and_m4_report_20261006.md`; `data/next_phase_report_20261010.md` |
| AI-04   | P1; code-verified gap                  | Generic reports validate shapes, but signal names/numbers/evidence references are mostly free-form model output. Prompt instructions and a signal tally do not establish claim-level grounding or calibrated conviction. Research latency warming is delivery optimization, not demonstrated quality improvement. | `app/schemas.py`; `app/agents/_util.py`; `PREDICTION_PERFORMANCE.md`                                           |
| CHAT-01 | P1; code-verified                      | Symbol extraction uppercases ordinary words, then takes the first three nonignored matches. Words such as TELL, ABOUT, PLEASE can occupy the three slots before the actual stock; company names are not reliably resolved.                                                                                        | `src/routes/api/chat.ts:89`                                                                                    |
| CHAT-02 | P1; code-verified                      | Chat reads market overview/sentiment/news and portfolio, plus stock quote/news sentiment. It does not retrieve saved agent reports, filings, technical history, orders, or a structured evidence library even though the UI advertises committee reasoning.                                                       | `src/routes/api/chat.ts:125`; `src/components/app/pages/IntelligencePages.tsx`                                 |
| CHAT-03 | P1; code-verified gap                  | Free-text streaming relies on prompt instructions for factual grounding. There is no response-level evidence/citation validator, numerical tool provenance, persistent conversation store, model budget ledger equivalent to research, or explicit tool trace.                                                    | `src/routes/api/chat.ts`; `src/lib/chat-api.ts`                                                                |
| CHAT-04 | P1/P2; code-verified gap               | UI consumers duplicate stream handling. Chat has a timeout but no user-provided AbortSignal/Stop contract. Conversations live in component state; navigation can lose history. The server stream lacks an explicit consumer-cancel handler.                                                                       | `chat-api.ts`; `QuantAIDock.tsx`; `TradeReviewPanel.tsx`; `IntelligencePages.tsx`                              |

Keep the connected backend's checkpoints, frozen experiment manifests, source/evidence registries,
falsification, cost controls, and research-only authority. More agents and longer debates are not
automatically improvements. The separate deterministic backend strategy ledger is not the same
book as the frontend user's manually placed paper orders; reconcile this distinction in the UI.

## UX, operations, and documentation findings

| ID     | Priority / evidence                       | Finding                                                                                                                                                                                                                                                                               | Primary implementation                                                                                                 |
| ------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| UX-01  | P1; code-verified                         | RSI is selectable in the chart but neither calculated nor rendered; selecting it removes the moving-average line.                                                                                                                                                                     | `ProfessionalChart.tsx:48,103,204`                                                                                     |
| UX-02  | P1/P2; code-verified                      | Generate brief has no action. Some settings persist values without visible consumers, while Save signals success before the asynchronous preference mutation completes and does not catch rejection.                                                                                  | `TerminalPages.tsx:797`; `SystemPages.tsx:90`                                                                          |
| UX-03  | P2; code-verified                         | Missing change values can be styled positive; realised losses are labelled “Profit made” with a positive tone and a prefixed plus. Wallet value still says “At demonstrative prices” after provider marking.                                                                          | `FundsRow.tsx:43`; `WatchlistPanel.tsx`; `WalletPage.tsx:95`                                                           |
| OPS-01 | P1; reproduced configuration behavior     | Tests can write raw artifacts/generated clients into the working backend and depend on .env key count. One default test performs live external I/O. The suite is not fully hermetic.                                                                                                  | `tests/test_acquisition_filings.py`; `tests/test_api_ws.py`; `tests/test_gateway_limits.py`; `tests/test_technical.py` |
| OPS-02 | P1; code-verified boundary gap            | Website adapters enforce the backend key, but legacy session/eval/control/research/WS routes do not have the same boundary. These can mutate state or consume compute if the backend is exposed. Local scope reduces exposure; it does not convert them into authenticated endpoints. | `app/api/v1.py`; `app/api/research.py`; `app/main.py`                                                                  |
| OPS-03 | P2; code-verified / unverified robustness | Seven lint warnings, overlapping lockfiles, beta Nitro, Python lower-bound-only dependencies, no inspected browser-test setup, and no demonstrated crash/load/failure soak for the complete local app.                                                                                | `package.json`; `requirements.txt`; `eslint.config.js`; repository inventory                                           |
| DOC-01 | P2; code-verified                         | Earlier roadmaps mark features complete despite synthetic inputs or missing workers. INTELLIGENCE/VERIFICATION and prior plans still describe Supabase prerequisites/session behavior that no longer match the local runtime.                                                         | `roadmap.md`; `Plan.md`; `INTELLIGENCE.md`; `VERIFICATION.md`                                                          |

## Verified facts versus open questions

The ten probe cases establish concrete current defects/capability gaps. The code findings establish
additional omissions and misleading surfaces. They do **not** prove every suspected race, provider
failure, or statistical weakness occurred in a live session.

Still to verify: actual Fyers per-symbol recovery and subscription limits; current model availability
and cost; live NSE payload/timezone fields; licensed news coverage; corporate-action adjustment;
browser forms, navigation, focus, touch layouts, and multi-tab behavior; filesystem power-loss
recovery; all UI action paths; forward prediction outcomes. The backend was unreachable in this
audit, so these remain release gates rather than fabricated successful checks.

## External primary-source checks

Provider limits are plan-specific; design request/subscription budgets around configured
entitlements rather than an old universal limit. The current official FYERS page distinguishes
Standard and Prime data/API/socket limits. [FYERS API limits](https://support.fyers.in/portal/en/kb/articles/what-are-the-fyers-api-rate-limits-for-standard-and-prime-plans).

Exchange session logic needs the official holiday/special-session calendar, not a weekday-only
clock. [NSE market timings and holidays](https://www.nseindia.com/resources/exchange-communication-holidays).
NSE announcement discovery exposes broadcast time and attachment/XBRL fields, which should be
preserved as distinct provenance fields. [NSE corporate announcements](https://www.nseindia.com/companies-listing/corporate-filings-announcements).

For stronger local persistence, SQLite transactions/WAL are a candidate with concurrent readers
and one writer. WAL is not a network-filesystem or unlimited-writer solution; durability and busy
handling still need configuration/testing. [SQLite WAL](https://www.sqlite.org/wal.html).

Financial NLP and calibration papers support evaluating domain-specific baselines and measuring
probabilities separately from confidence. They do not prove performance on this product's Indian
market corpus. [FinBERT](https://arxiv.org/abs/1908.10063),
[calibration research](https://arxiv.org/abs/1706.04599).

No application fixes are claimed in this audit. The added diagnostic scripts and roadmap are the
reviewable outputs; implementation proceeds through the gates in MASTER_ROADMAP.md.
