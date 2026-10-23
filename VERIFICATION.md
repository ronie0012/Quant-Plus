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
- The historical SQL regression file under `supabase/tests/` is retained as
  archival evidence only. The active paper-book authority is the InsForge
  migration and the server-owned local/hosted book adapters.
- Agent full suite: 430 tests passed. After adding the fail-closed authentication
  regression, 36 stock, Fyers and prediction tests passed.
- TypeScript and production build checked. ESLint has no errors; seven existing
  development-only Fast Refresh export warnings remain.
- Local HTTP smoke checks: home, sign-in, markets and app routes serve; chat and
  agent endpoints reject unauthenticated requests with HTTP 401.

## Current release checks — 2026-10-19

- `npm.cmd test`: 74 tests passed plus the full local paper, auth, settlement,
  fault, migration, worker and decision-plan checks.
- `npm.cmd run test:intelligence`: 316 passed.
- `npm.cmd run test:backend`: 473 passed.
- `npx.cmd playwright test tests/browser/coverage.spec.ts`: 49 passed,
  including all canonical routes, accessibility checks and local UI flows.
- Fresh live InsForge two-user isolation: 29/29 checks passed. Test users were
  deleted and email verification was restored. The worker-closed-browser run
  and hosted cutover remain separate gates.

## Remaining verification and release requirements

- Authenticated browser interactions and visual layouts have not been verified
  with a browser in this run. No browser automation tool was available.
- Hosted deployment and the final InsForge runtime cutover were not performed
  in this local verification run. Follow `INSFORGE_MIGRATION.md`; do not enable
  hosted writes until fresh two-user, worker-closed-browser and final readback
  checks pass.
- Live provider/model calls depend on configured services and daily Fyers login.
  Regression tests do not establish live-session uptime or prediction quality.
- Several dashboard and product widgets retain labelled demonstrative data.
  Orders remain paper trading; research sessions do not execute broker orders.
- Remaining release gates are documented in `IMPLEMENTATION_STATUS.md`,
  including live provider uptime, the real-session soak and independent review.
