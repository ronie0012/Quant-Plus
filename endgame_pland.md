# Quant Plus Endgame Plan

## Purpose

Make Quant Plus the most trustworthy, evidence-grounded paper-trading platform
with agentic research, calibrated sentiment, high-quality news intelligence,
and realistic simulation.

The product must not claim predictive accuracy until it is demonstrated on fresh,
time-separated, point-in-time evaluations against simple baselines. LLMs may
research, challenge, explain, veto, or resize within a measured experiment, but
they must not invent capital authority.

## Current audit conclusion

The project already contains:

- Fyers-backed market data and market-session semantics.
- A checkpointed multi-agent research graph.
- Point-in-time safeguards, governance rules, and deterministic guardrails.
- Deterministic market sentiment, breadth, sector, VIX, volume, divergence, and
  news aggregation logic.
- Google News RSS, NSE announcement adapters, event handling, and deduplication.
- Paper wallet, orders, holdings, alerts, brackets, journals, and risk controls.
- Extensive backend and frontend regression coverage.

The connected agent-service evidence does **not** yet establish directional edge:

- Clean evaluations did not beat trivial constant baselines.
- Official directional evaluations failed their frozen gates.
- Research calibration has no resolved production observations.
- Historical event/news coverage is incomplete and sometimes not as-filed.
- Several paper-execution safeguards are enforced in the browser instead of at
  the server/database authority boundary.

## Non-negotiable principles

1. Never fabricate a price, timestamp, news item, score, or confidence value.
2. Every observation carries source, observed time, available time, freshness,
   delay, PIT status, quality, and methodology version.
3. Missing data remains unavailable; it is never silently converted to zero,
   neutral, or a bullish/bearish assumption.
4. Every forecast has a horizon, target definition, baseline, sample size, and
   calibration status.
5. Historical evaluation uses only information that was available at the
   historical decision time.
6. Paper execution is server-authoritative and fully auditable.
7. LLM output is research-only unless a separately pre-registered, measured,
   shrink-only experiment proves otherwise.
8. A system may abstain when evidence is weak or conflicting.

## P0 — Safety and truth boundary

### P0.1 Preserve the workspace

- Keep all existing uncommitted work intact.
- Record the baseline git status, diff scope, runtime versions, and migration
  state before each implementation slice.
- Do not reset, clean, rebase, amend, or overwrite published Lovable history.

### P0.2 Fix paper-trading authority

- Move order intent validation and fill pricing to a server-authoritative path.
- Obtain a fresh provider quote on the backend for every fill.
- Store the provider snapshot ID, source, timestamp, session, and execution
  reason with each simulated fill.
- Do not trust browser-supplied execution prices.
- Enforce market hours, stale/delayed restrictions, symbol validity, tick size,
  circuit limits, order-side protection rules, and idempotency server-side.

### P0.3 Enforce risk limits at the authority boundary

Enforce, not merely display:

- Maximum order value.
- Maximum position percentage.
- Daily loss limit.
- Trading pause.
- Confirmation threshold policy.
- Protection-price relationships.
- Available wallet and position quantity.
- Fees and charges.

### P0.4 Correct current data-integrity bugs

- Never mark a missing holding quote as price zero.
- Preserve the last valid mark while showing stale/unavailable state.
- Implement every supported alert type or remove unsupported types from the
  database/UI contract.
- Move brackets and alerts from browser-tab-only monitoring to a durable worker.
- Scope local state by authenticated user if any local state remains.
- Validate wallet transaction kinds instead of treating unknown values as deposits.

## P1 — Unified data and evidence layer

Create one canonical backend contract consumed by the frontend, chat, sentiment,
agent graph, screener, portfolio, and paper simulator.

### Canonical objects

- `Instrument`
- `Quote`
- `Candle`
- `OrderBookSnapshot`
- `NewsItem`
- `CorporateEvent`
- `FundamentalSnapshot`
- `SentimentObservation`
- `Forecast`
- `EvidenceRecord`
- `PaperOrder`
- `PaperFill`
- `LedgerEntry`

### Required provenance fields

```text
source
source_record_id
observed_at
available_at
received_at
data_cutoff
stale
delayed
data_quality
pit_status
methodology_version
provider_request_id
```

### Evidence graph

Every agent claim should resolve through:

```text
forecast
  -> model/prompt version
  -> feature snapshot
  -> source records
  -> analyst observation
  -> contradiction/risk review
  -> final research output
  -> settled outcome
```

The UI should let a user inspect the complete chain rather than seeing only
unverifiable prose.

## P1 — Point-in-time data foundation

- Store immutable raw provider payloads before parsing.
- Add as-filed financial results and fundamentals.
- Add historical news with publication and availability timestamps.
- Add historical NSE/BSE announcements and filings.
- Add corporate-action history and knowability timestamps.
- Add historical index membership and entity/ISIN mapping.
- Quarantine schema drift, stale feeds, unknown timestamps, and source failures.
- Never use current revised tables as historical truth.
- Separate exploratory, validation, burned, and forward-only datasets.

## P1 — Agentic AI upgrade

### Change the role of the LLM

Use agents for:

- Evidence retrieval and summarization.
- Contradiction discovery.
- Scenario generation.
- Falsification.
- Research prioritization.
- Explanation.
- Optional shrink-only veto/resize experiments.

Use deterministic code for:

- Forecast targets and horizons.
- Probabilities and intervals.
- Position sizing.
- Risk limits.
- Portfolio construction.
- Paper fills.
- Promotion gates.

### Add measurable forecasts

Separate outputs into:

- Market state.
- Expected return distribution.
- Volatility forecast.
- Drawdown/tail-risk forecast.
- Event-impact forecast.
- No-edge/abstention state.
- Narrative explanation.

Every forecast must include:

- Target definition.
- Horizon.
- Point estimate and interval.
- Probability, only when calibrated.
- Sample size.
- Historical reliability.
- Regime applicability.
- Data quality.
- Baseline comparison.

### Evaluation gates

Use rolling, embargoed, walk-forward evaluation across instruments and regimes.
Compare against:

- Cash.
- Buy-and-hold.
- Persistence.
- Always-long/always-short.
- Simple trend/factor rules.
- Existing deterministic core.
- Beta/exposure-matched controls.

Require bootstrap confidence intervals, calibration metrics, costs, slippage,
turnover, drawdown, concentration, PBO/DSR, and a sufficiently large unseen
sample before changing production behavior.

## P1 — Sentiment upgrade

- Make scores horizon-specific: intraday, end-of-day, swing, risk regime, and
  event impact.
- Calibrate score-to-outcome behavior using settled observations.
- Report Brier score, reliability, confidence intervals, sample size, and regime
  breakdowns.
- Keep score ownership deterministic.
- Use financial NLP only to extract structured event claims; never let prose
  overwrite deterministic scores.
- Add uncertainty, negation, conditional language, rumor, and contradiction
  handling.
- Learn source reliability from historical outcomes instead of relying only on
  static credibility constants.
- Replace simple price confirmation with sector/index-relative abnormal-return
  event studies.

## P1 — News system upgrade

- Add provider adapters with retry, circuit breaker, health, and failover.
- Prioritize NSE/BSE announcements, official filings, and licensed financial
  news before broad RSS context.
- Resolve entities by symbol, ISIN, company master, subsidiaries, and aliases.
- Cluster syndicated copies and preserve source lineage.
- Use a versioned multi-label event taxonomy.
- Link claims, confirmations, contradictions, and affected sectors.
- Track publication, first-seen, available, and ingestion timestamps separately.
- Add event duration and novelty scoring.
- Add server-side breaking-news alerts and user subscriptions.

## P1 — Realistic paper-trading engine

Implement a deterministic exchange simulator with:

- Bid/ask spread.
- Slippage and liquidity impact.
- Latency.
- Partial fills.
- Order queue behavior.
- Tick size and circuit limits.
- Market-session and auction rules.
- Day-order expiry.
- Charges, taxes, and brokerage.
- Corporate actions.
- Long-only/short/intraday product constraints.
- Durable bracket and alert workers.
- Immutable double-entry ledger.
- Replayable order/fill event log.

## P2 — Product surfaces

### Screener

Replace change-derived placeholders with provider-backed factors:

- RSI, ATR, trend strength.
- 20/50/200-day averages.
- VWAP distance.
- Relative volume.
- Volatility.
- Liquidity.
- Earnings/event proximity.
- Sentiment freshness.
- Forecast horizon and uncertainty.

### Portfolio

Add factor exposure, beta, correlation clusters, event concentration, liquidity
risk, drawdown contribution, VaR/CVaR, stress scenarios, and post-cost
attribution.

### Research UI

Replace derived placeholder bars and synthetic report previews with actual:

- Analyst agreement.
- Evidence coverage.
- Source quality.
- Missing-data percentage.
- Risk-review outcomes.
- Historical calibration.
- Forecast errors by regime.
- Data cutoff and freshness.

### Replay

Keep synthetic replay clearly labelled, then add a real PIT replay mode with
historical news, sentiment, costs, slippage, decision capture, and comparison
against the deterministic core and Quant AI.

### Options

Keep the current simulator visibly simulation-only until a real, timestamped
option-chain adapter exists.

## P2 — Operations and observability

- Shared job queue and distributed locks before multi-worker deployment.
- Trace IDs across browser, proxy, backend, provider, model, and database.
- Data freshness and provider SLOs.
- Model latency, error, token-cost, and quota dashboards.
- Feature/data drift detection.
- Prompt/model/config version pinning.
- Champion/challenger canaries.
- Durable audit exports.
- Recovery and restore rehearsal.
- Per-user and per-workspace AI budgets.
- Rate limits for chat, research starts, provider lookups, and alerts.

## Definition of done

- No provider-backed surface displays generated values as live.
- Missing values remain unavailable, not zero or neutral.
- Every quote, news item, forecast, sentiment score, and fill has provenance.
- Paper execution cannot be manipulated by a browser request.
- Risk rules are enforced server-side.
- Sentiment has settled calibration evidence.
- Agent conviction is not shown as probability without calibration.
- Agentic research remains auditable and `RESEARCH_ONLY`.
- Historical evaluation is PIT-safe and baseline-relative.
- News and corporate event accuracy is measured on labelled data.
- Frontend, backend, database, security, and live smoke checks pass.
- Degraded provider states are visible and actionable.

## Implementation sequence

1. Preserve baseline and record workspace state.
2. Fix P0 data-integrity and paper-trading safety issues.
3. Add focused regression tests for every P0 fix.
4. Unify provenance contracts and evidence IDs.
5. Build PIT data and settled forecast storage.
6. Calibrate sentiment and agent forecasts on fresh blind data.
7. Upgrade news/entity/event processing.
8. Upgrade paper execution realism and durable workers.
9. Replace remaining generated product surfaces.
10. Add operations, drift, cost, and audit dashboards.

No phase may claim improved accuracy until its new evaluation is run and the
result is stored with its dataset, code, model, prompt, and configuration hashes.
