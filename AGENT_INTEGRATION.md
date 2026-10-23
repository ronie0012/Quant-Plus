# Stock page integration

The stock page's **Quant AI view** calls the existing agent graph in
`D:\QP\agent-service`. The page displays the final decision, thesis conviction,
evidence, risks, devil's advocate challenge, and individual analyst summaries.
Opening the page reuses completed research or starts an analysis; the UI checks progress every second.
Market browsing and stock search preload available predictions through read-only
snapshot endpoints. The latest decision appears above the chart immediately when
it is already in the browser cache. See [PREDICTION_PERFORMANCE.md](PREDICTION_PERFORMANCE.md)
for measured serving latency, background warming and the limits of cold analysis.
All visitors to the same instrument reuse a recent run for fifteen minutes.
The connection uses the selected NSE symbol, rather than a fixed Reliance
instrument. Stock pages accept any provider-supported NSE equity, including
stocks outside NIFTY 50. The Markets desk includes company search over the
backend's NIFTY 500 catalog and direct symbol entry for stocks outside that
catalog. Unknown symbols are verified with the market provider before an
agent session is started.
The research graph uses its existing daily timeframe and PIT data providers.
Analysis can take several minutes and does not run on every quote tick.
Failed runs offer **Retry analysis**, which resumes saved stages in the same
session. The final decision's research authority and restriction flags are set
by code; models cannot replace those governance labels.

Prediction latency: individual analysts publish saved findings as they finish,
and retries reuse those findings even if another analyst failed. The three
independent risk reviewers run concurrently. During a refresh, a completed
prediction from the same stock and configuration within the last 24 hours stays
visible with its original timestamp; it is explicitly labelled as previous
research. Running sessions are polled through the read-only session endpoint.
Reopening an interrupted run after a backend restart resumes its checkpoints.
Cold full analyses still depend on provider/model latency and can take minutes.

The page's header, open/high/low/volume and OHLCV chart now use real provider
data. Fyers SymbolUpdate and DepthUpdate ticks stream through the backend and
website to the browser. The NIFTY 50 board uses one shared stream for all its
quotes, without simulated prices or synthetic trend lines. Fyers also supplies
historical candles, best bid/ask, five-level depth, quantities, average traded
price, circuit limits and open interest when available for the instrument.
Unavailable fields remain blank; Yahoo does not replace missing order-book data.
Yahoo snapshots are the fallback, refreshed every fifteen seconds for a stock
page and every sixty seconds for board-only subscriptions. Historical candles
prefer Fyers and fall back to Yahoo, refreshing each minute;
incoming fresh ticks update the current candle when its interval matches.
There is no animated or simulated movement in the stock page's quote.

Yahoo is labelled as potentially delayed, and the trade timestamp is displayed.
Refreshing Yahoo cannot remove source delays. Stale quotes and closed market
sessions are labelled. Fyers market status determines the session when available;
otherwise the regular NSE hours are used. Closed markets retain the Fyers
snapshot instead of incorrectly switching to Yahoo because no new ticks arrive.

## Local setup

The matching server keys and service URL have been configured locally:

- Frontend: `.env.local` (ignored by Git), `AGENT_SERVICE_URL` and
  `AGENT_SERVICE_API_KEY`.
- Backend: `.env` (ignored by Git), `WEBSITE_API_KEY` and existing model keys.
- Fyers app credentials are stored in the backend `.env`, as `FYERS_CLIENT_ID`
  and `FYERS_SECRET_KEY`. They must never be put in a `VITE_*` variable.
- The registered `FYERS_REDIRECT_URI` is
  `http://127.0.0.1:8000/fyers/callback`. Both that URL and the versioned API
  callback are supported. Callback codes are redacted from backend access logs.

## Connect Fyers

With the backend running, run this from `D:\QP\agent-service`:

```powershell
python scripts/connect_fyers.py --open
```

Sign in to Fyers and approve the app in the browser. The callback exchanges
the authorization code, stores the access token in
`data/fyers_private/tokens.json` (ignored by Git), and reconnects watched symbols
without restarting the backend. Login links use single-use state and expire
after thirty minutes. Neither the secret nor access token is sent to the UI.

If the access token expires or is rejected, quotes fall back to Yahoo and show
that Fyers login is required. Run the helper again to reconnect. Changing an
app's registered redirect URL requires the exact same `FYERS_REDIRECT_URI` in
the backend configuration. For an external redirect page, the helper also
accepts `--complete-url` with the full URL returned by Fyers.

Project restarts reuse the saved, unexpired token automatically. Restarting Vite
or the agent service does not require another login. Fyers tokens expire daily;
sign in again after expiry or rejection. Current Fyers guidance requires daily
2FA and does not support continuous refresh-token sessions:
https://support.fyers.in/portal/en/kb/articles/what-are-the-new-sebi-rules-for-retail-algo-trading-from-april-01-2026

`GET /api/v1/fyers/status` reports safe connection/expiry status and requires
the website key. An existing manually supplied `FYERS_ACCESS_TOKEN` remains
supported. Historical research providers in the agent graph retain their
existing daily PIT behavior; this integration supplies display market data.

Start the backend in one terminal:

```powershell
cd D:\QP\agent-service
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Start the frontend in another terminal:

```powershell
cd D:\Quant-Plus
npm run dev
```

Sign in normally and open `/app/stocks/RELIANCE`.
Keep the backend to **one worker**: the quote feed and concurrent analysis slots
are shared within a process. Multi-worker deployment needs a shared job/quote
service before scaling.

## Hosting

For a hosted frontend, set the server secret `AGENT_SERVICE_URL` to an HTTPS
backend reachable from the frontend host. A deployed website cannot reach this
computer's `127.0.0.1`. Set matching `AGENT_SERVICE_API_KEY` / `WEBSITE_API_KEY`
as host secrets. For current local use, the website proxy accepts the local profile
only through a loopback URL. The historical hosted path authenticates a Supabase session
and permits only the stock prediction and market-data endpoints. Keep the
backend behind a private network or reverse proxy: older admin endpoints in the
agent service predate this integration and should not be publicly exposed.
The hosting proxy must support unbuffered SSE connections. InsForge is the
selected hosted identity and paper-book provider; the historical Supabase path
is not an active runtime dependency.

Paper-order mutations run on the local frontend server, not in the browser.
The `/api/paper/orders` boundary accepts the local profile through localhost,
reads a fresh Fyers quote itself, ignores browser-provided execution prices,
and atomically updates `.local-data/workspace.json` in local mode. Wallet,
holdings, orders, watchlists, alerts, journal and preferences use this same
local store. Hosted mode uses the InsForge book adapter and server-owned
compare-and-swap settlement. No Supabase credentials or migrations are part of
the active runtime. Run one frontend server instance. The linked InsForge
project is not yet the app's default data store. Follow
[INSFORGE_MIGRATION.md](INSFORGE_MIGRATION.md) for the migration.

## Scope

The stock page's prediction, quote, price metrics, chart and depth are connected.
The NIFTY 50 market board also uses provider prices. Other dashboard widgets and
product simulations retain their existing demonstrative data. Stock-page
sentiment and fundamentals remain explicitly labelled as demonstrative. The existing order book remains
simulated, and agent decisions retain `RESEARCH_ONLY` authority.

## Paper trading

Fyers supplies market data and charts only. Paper orders settle virtual cash
and holdings in the local workspace file; no order is submitted to Fyers. Every submission,
including quick tickets and baskets, reads a Fyers quote again before recording
the order. During market hours the quote must be no more than 60 seconds old.
Price alerts and automatic bracket exits also use fresh Fyers quotes rather
than synthetic prices. Automatic monitoring runs while the app is open and
the market session is open; it pauses on delayed or unavailable data.
Delayed Yahoo fallback quotes are displayed for research but cannot execute
paper orders. After the close, paper practice uses the labelled last traded
Fyers price. The stock ticket stays visible while the feed reconnects.

Resting limit and stop orders use the current quote when a paper fill is
requested from the Orders page. The local server checks the limit/trigger condition
and settles at that quote, rather than blindly filling at the stored limit.
The local server also rechecks trading pause, order notional and cost-basis position
limits at fill time.
These fills remain manually requested; there is no background matching worker.
Run `node scripts/test-paper-trading.mjs`, `node scripts/test-paper-route.mjs`
and `node scripts/test-local-workspace.mjs` to check browser handling, server
execution, persistence and settlement. Files in `supabase/migrations` and
`supabase/tests` are historical cloud schema artifacts and are not applied for
local use.

## Verification

```powershell
cd D:\QP\agent-service
python -m pytest tests/test_fyers_integration.py tests/test_stock_integration.py tests/test_contract_snapshot.py tests/test_frontend_ready.py tests/test_api_ws.py tests/test_money_path_boundary.py tests/test_governance.py tests/test_llm_direction_fix.py tests/test_direction_policy.py -q
cd D:\Quant-Plus
node scripts/test-agent-proxy.mjs
node scripts/test-paper-route.mjs
npx tsc --noEmit
npm run build
```

Local verification completed: 82 backend tests passed; the frontend build,
TypeScript, changed-file lint and proxy checks passed. A real Reliance run
completed with five analyst reports and `RESEARCH_ONLY` authority. Yahoo quote
and history requests succeeded. Its saved verification record is
`D:\QP\agent-service\data\website_integration_smoke.json`. Fyers login has
completed successfully. Actual Fyers quotes and historical candles were verified
for RELIANCE, TCS, SUZLON and M&M, and the shared WebSocket connected successfully.
Reliance depth, average traded price and circuit limits were returned by Fyers.
Because the market was closed during verification, prices are labelled as last
trading-session snapshots. The Fyers verification record is
`D:\QP\agent-service\data\fyers_integration_smoke.json`.
Additional live lookups succeeded for SUZLON, TCS and M&M, and SUZLON historical
candles loaded successfully. Prediction routing tests cover RELIANCE, TCS,
INFY, M&M, BAJAJ-AUTO, 360ONE and SUZLON.
