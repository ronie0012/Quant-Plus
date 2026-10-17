# Quant Plus live-platform implementation plan

## Confirmed product decisions

- Quant Plus remains paper-trading only. No broker order placement will be added.
- The existing CodeCraft-backed agentic stock-research graph remains the stock-prediction engine.
- NVIDIA Nemotron is used only by the Quant AI chat assistant through OpenRouter.
- AI explanations may interpret validated data, but they cannot change deterministic scores or place orders.

## Current architecture

### Already live or provider-backed

1. FYERS WebSocket and REST quotes are the primary market-data source.
2. Yahoo Finance is an explicitly delayed fallback for quotes and history.
3. Stock history prefers FYERS candles and falls back to Yahoo.
4. Stock depth, bid/ask, circuit data and other market fields come from FYERS when available.
5. The CodeCraft-backed agent graph persists checkpoints, analyst reports, debate, risk review and research-only decisions.
6. Quantitative market sentiment calculates NIFTY momentum, breadth, sectors, VIX, news, volume and Bank Nifty with explicit missingness.
7. Google News RSS is normalized, deduplicated, relevance-scored and sentiment-scored.
8. Paper orders validate fresh FYERS prices and settle through Supabase functions.

### Hardcoded or incomplete surfaces to convert

- Dashboard ticker: fixed NIFTY, SENSEX, Bank Nifty and VIX values.
- Dashboard market overview: seeded simulated instruments and synthetic trend paths.
- NIFTY reference data: static prices, weights, metrics, sentiment, news and depth fallbacks.
- Watchlist: persisted seed prices and synthetic sparklines instead of shared live quotes.
- Portfolio and wallet: holdings use seeded `last_price` values rather than live marks.
- Screener: generated momentum, volatility, verdict and conviction values.
- Portfolio X-ray: static percentage moves and stored seed prices.
- Basket orders: synthetic execution estimates instead of fresh quote snapshots.
- Stock fundamentals: generated P/E, beta, market cap, liquidity and 52-week values.
- Research/decision pages: static research desks and seeded decision records in places where actual sessions should be shown.
- Data Sources page: hardcoded source health and connection state.
- Alerts/bracket monitoring: browser-tab-only monitoring; requires a reliable server-capable path for production.
- Options Lab: Black-Scholes over generated spot/IV; must be clearly simulation-only until a real option-chain source exists.
- Market Replay: intentionally synthetic training data and must remain explicitly labelled.

## Phase 0: preserve work and secure configuration

1. Preserve the existing uncommitted work in both repositories; do not reset, clean, rebase or overwrite it.
2. Keep all provider and AI credentials server-side.
3. Rotate any OpenRouter key exposed outside the private server environment before production use.
4. Add environment placeholders only; never commit real values.
5. Use the canonical OpenRouter model ID `nvidia/nemotron-3-ultra-550b-a55b` and verify that the supplied account can access it through the intended free route. Do not silently fall back to a paid model.

## Phase 1: unified live-data contracts

1. Add a backend live market overview endpoint for NIFTY, Bank Nifty, India VIX and supported indices.
2. Add an official NIFTY 50 universe/catalog endpoint with symbol, company, sector and weight metadata.
3. Add a shared portfolio valuation endpoint that combines authenticated holdings with live provider quotes.
4. Standardize source, timestamp, session, delayed and stale fields across all market responses.
5. Keep FYERS primary and Yahoo fallback explicitly labelled.
6. Return unavailable fields as null or unavailable; never manufacture neutral values.
7. Add endpoint, fallback, closed-session and authentication tests.

## Phase 2: live dashboard and watchlist

1. Replace the dashboard ticker with the shared live market overview.
2. Replace seeded market-instrument reads with provider-backed data.
3. Replace synthetic price charts with provider history or clear unavailable states.
4. Load watchlist quotes from the shared quote stream.
5. Display source, freshness and closed/delayed state in dashboard and watchlist rows.
6. Replace hardcoded source health with live FYERS, Yahoo, news, intelligence, Supabase and AI health checks.

## Phase 3: portfolio and paper-trading reliability

1. Mark holdings to live FYERS quotes without overwriting cost basis.
2. Calculate current value, unrealised P&L, wallet equity, risk and X-ray contribution from live marks.
3. Make basket estimates and submissions use fresh provider quotes per leg.
4. Keep Yahoo and stale quotes ineligible for paper execution.
5. Improve alert/bracket monitoring with reliable persistence and clear limitations when the browser is closed.
6. Keep every order paper-only and research decisions non-executable.

## Phase 4: Quant AI chatbot

1. Replace the Lovable gateway used by `/api/chat` with a server-only OpenRouter adapter.
2. Configure the API key, base URL and Nemotron model through server environment variables.
3. Assemble authenticated live context from market sentiment, news, requested stock data and the user's portfolio.
4. Include source, timestamp, freshness and data-quality metadata in context.
5. Treat headlines as untrusted data and disable all broker/tool execution.
6. Preserve conversation history limits and robust SSE handling for comments, split chunks, `[DONE]`, provider failures, timeouts and cancellation.
7. Never expose the key in browser code or the production bundle.

## Phase 5: improve agentic research, sentiment and news

### Agentic research

- Keep CodeCraft and the existing point-in-time research graph.
- Add evidence IDs, provider timestamps, freshness, uncertainty and disagreement to the UI.
- Keep current live context separate from historical PIT inputs.
- Retain `RESEARCH_ONLY` authority and add calibration/quality visibility.
- Evaluate any future model change against the existing research suite before adoption.

### Sentiment

- Keep deterministic score ownership in code.
- Improve source credibility, exchange announcements, entity resolution, event categories, contradiction handling, price confirmation and historical calibration.
- Allow Nemotron to explain validated results only; it cannot change scores.

### News

- Add provider failover around Google News RSS and existing available feeds.
- Add NSE/BSE announcements and corporate-action/filing coverage where available.
- Preserve PIT filtering, deduplication, relevance thresholds, source attribution and degraded states.
- Expose article age, relevance, impact, sentiment and affected sectors in the UI.

## Phase 6: advanced modules

1. Convert the screener to provider-backed technical factors and cached real research.
2. Persist saved screens per user.
3. Connect Options Lab to a real option-chain adapter only if the configured provider supplies reliable data.
4. Otherwise keep Options Lab explicitly simulated.
5. Keep Market Replay explicitly synthetic.

## Phase 7: verification and release

Frontend checks:

```powershell
cd D:\Quant-Plus
npm.cmd run typecheck
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

Backend checks:

```powershell
cd D:\QP\agent-service
python -B -m pytest tests D:\Quant-Plus\backend-extension\tests -q -p no:cacheprovider
```

Live smoke checks must cover:

- FYERS quotes and WebSocket recovery
- Yahoo fallback and delayed labels
- closed-market snapshots
- historical candles
- market overview and official universe
- live portfolio valuation
- news and sentiment
- CodeCraft research sessions
- paper-order quote safeguards
- OpenRouter Nemotron streaming
- authentication and rate limiting
- public-build secret isolation

## Definition of done

- No provider-backed surface displays generated market values as live.
- Every quote displays source and freshness.
- FYERS remains primary and Yahoo remains a labelled fallback.
- Yahoo and stale quotes cannot execute paper orders.
- Dashboard, watchlist, portfolio, screener, basket and X-ray use provider-backed data.
- Sentiment remains deterministic and evidence-grounded.
- Agentic research remains auditable and `RESEARCH_ONLY`.
- Quant AI uses OpenRouter Nemotron server-side with live authenticated context.
- No credentials appear in frontend code or the public build.
- Frontend, backend, proxy, deterministic and live smoke checks pass.
- Degraded provider states are visible instead of silently replaced with fake data.
