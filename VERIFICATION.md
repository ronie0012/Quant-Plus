# Trading terminal repair verification

Changes preserve existing local work and published Git history.

## Functional repairs

- Committee and Agent Activity now inspect real research sessions, analyst
  reports and saved events rather than fixed scores and timer animations.
- The terminal displays market-service readiness separately from per-stock
  quote freshness. Closed snapshots are labelled without being called live.
- NSE regular hours use Asia/Kolkata and exclude the exact closing time.
- Stock tickets read positions from holdings rather than a truncated order list.
- Orders reject invalid quantities, missing limit/trigger prices, non-finite
  protection prices and stop/target levels on the wrong side of the entry.
- Paper order mutations now cross an authenticated server boundary that obtains
  the provider quote itself; browser-supplied prices are ignored. The database
  grants execution only to the service role and rechecks risk and protection
  limits at resting-order fill time.
- Chat retains up to 12 recent messages, validates input, bounds network waits,
  handles split streaming responses and reports empty or failed responses.
- Agent proxy rejects malformed paths and missing authentication configuration.
  Backend website endpoints fail closed when WEBSITE_API_KEY is unset.
- Session changes clear cached account data; lost sessions return to sign-in.
- Keyboard focus, skip navigation, reduced motion and hidden-chat focus are handled.
- The market board includes quote coverage, breadth and strongest/weakest changes.

## Checks

- Frontend regression suite: options, alerts, bracket exits, NSE boundaries,
  freshness, proxy authentication, paper prices, paper API routing, polling and
  chat streaming.
- Paper-order SQL regression file added at
  `supabase/tests/20261013120000_server_authoritative_paper_orders.sql`; it is
  rollback-scoped and requires a local Supabase/Postgres instance.
- Agent full suite: 430 tests passed. After adding the fail-closed authentication
  regression, 36 stock, Fyers and prediction tests passed.
- TypeScript and production build checked. ESLint has no errors; seven existing
  development-only Fast Refresh export warnings remain.
- Local HTTP smoke checks: home, sign-in, markets and app routes serve; chat and
  agent endpoints reject unauthenticated requests with HTTP 401.

## Remaining verification and release requirements

- Authenticated browser interactions and visual layouts have not been verified
  with a browser in this run. No browser automation tool was available.
- Hosted deployment and the paper-fill/server-authority Supabase migrations were
  not applied in this run. Apply the migrations documented in
  `AGENT_INTEGRATION.md` and configure the server-only Supabase service key
  before releasing paper-order behavior.
- The local SQL regression file was not executed because the local Supabase
  database was unavailable on this machine (`127.0.0.1:54322` refused the
  connection; Docker's Linux daemon was not running).
- Live provider/model calls depend on configured services and daily Fyers login.
  Regression tests do not establish live-session uptime or prediction quality.
- Several dashboard and product widgets retain labelled demonstrative data.
  Orders remain paper trading; research sessions do not execute broker orders.
- Daily-loss enforcement, durable background alert/bracket workers, idempotency,
  actual fee debits, and mark-to-market position limits remain future work.
