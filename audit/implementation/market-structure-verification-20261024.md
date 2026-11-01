# Discover market structure — local verification, 2026-10-24

## Scope and state

Repository: `D:\Quant-Plus`, branch `main`, base `aef51bf`. Implementation remains
uncommitted. Nothing was pushed or deployed in this continuation. Existing
unrelated audit artifacts and the frozen pre-cutover workspace were preserved.

Discover keeps Stocks as its default and adds Liquidity Board and Market X-Ray.
Stock chart structure is opt-in. The default board is provider-backed NIFTY 50
cash equities. Order blocks are rule-based candidates, liquidity levels are
proxies, and attention scores are not probabilities or institutional positions.
Paper-order validation is unchanged.

## Continuation changes

- `backend-extension/quantplus_intelligence/terminal.py`: validates completion
  from bar-start timestamps and interval duration using an independent evaluation
  clock, even without an available quote or known market session. Forming/future
  candles cannot confirm structure. Preserves source/delay/cutoff metadata and
  expires cached live quote/depth context without promoting cached forming bars.
- `backend-extension/quantplus_intelligence/terminal_api.py`: keeps symbol/range
  validation errors useful and provider errors generic.
- `backend-extension/tests/test_terminal_structure_api.py`: 77 offline endpoint
  cases with real adapter signatures, cache/concurrency checks, and missing,
  malformed, stale, future and incomplete-input coverage.
- `src/lib/market-structure-schema.ts`, `market-structure.ts`, and
  `market-structure.test.ts`: validates nested responses before rendering. The 35
  Node cases include real Python-generated payloads crossing the frontend schema.
  Missing observation times, delay flags and sessions remain unknown, not fresh.
  These tests are included in `npm test` through `package.json`.
- `src/components/app/pages/MarketPulsePage.tsx`: distinguishes loading/missing
  observations from observed zeroes, discloses cached failed refreshes, enables
  retry, and fixes the Unavailable category filter. Rows show history source,
  delayed/unknown-delay status and completed-candle time.
- `src/components/app/pages/TerminalPages.tsx`: keeps Discover view controls
  reachable while index context is loading or unavailable.
- `src/components/app/stocks/StockDetail.tsx` and `ProfessionalChart.tsx`: hides
  unavailable/failed-refresh overlays and labels structure interval, source and
  cutoff separately from the displayed chart's bars.
- `tests/browser/market-structure-states.spec.ts`: nine new browser cases for
  these boundaries, alongside the existing three chart/Discover cases.
- Local-only test scripts explicitly isolate their book provider from the hosted
  runtime environment. `scripts/test-backend-hermetic.py` can print UTF-8 results
  on Windows without masking the underlying test failures with an encoding crash.

## Checks

Commands ran from the repository root unless noted. Results apply to local code,
not a deployed or live-provider-certified service.

| Command | Actual result |
| --- | --- |
| `npm.cmd test` | Passed: 119 Node cases and every subsequent script in the command, including fault injection, hosted-book mocks, authentication, settlement and decision plans. |
| `npm.cmd run test:intelligence` | Passed: 433 Python cases. |
| `node --experimental-strip-types --test src/lib/market-structure.test.ts` | Passed: 35 cases, also included in the final full Node run. |
| `npm.cmd run test:browser -- tests/browser/chart-tools.spec.ts tests/browser/market-structure-states.spec.ts` | Final run passed: 12 cases. |
| `npm.cmd run typecheck` | Passed. |
| `npm.cmd run lint -- --quiet` | Passed. |
| `npm.cmd run build` | Passed: local client, SSR and Nitro output. |
| `git diff --check` | Passed; Git reports existing LF/CRLF conversion warnings. |
| `npm.cmd run test:backend` | Failed: 476 passed, 3 failed in the separate agent-service checkout copied by the hermetic runner. |

### Broad browser results and remaining failures

The long unsharded runs did not finish reliably. A bounded sweep then ran:

- `npm.cmd run test:browser -- --shard=1/3`: **69 passed**.
- `npm.cmd run test:browser -- --shard=2/3`: **115 passed, 4 failed**.
- `npm.cmd run test:browser -- --list --shard=3/3`: **0 discovered**. With this
  file-level grouping, the first two shards already contained all 188 cases that
  existed at that point. The empty shard is not counted as a passing check.

The structure-refresh failure was a test-clock mismatch: `marketFixture` freezes
Date on an NSE holiday, so sentiment refreshes every five minutes rather than
every minute. The corrected test passes. The public mobile-menu focus check also
passed on targeted rerun, but remains a flakiness observation, not a proven fix.

Two non-feature failures reproduced on targeted rerun and remain unresolved:

1. `tests/browser/visual.spec.ts`: `visual: screener-desktop` differs from the
   committed screenshot by about 3% of pixels. No baseline was overwritten.
2. `tests/browser/workspace-ux.spec.ts`: mobile `/app/replay` reports serious
   color-contrast violations on `.items-start > p` elements.

A ninth new structure-state case was then added for unavailable index context;
the final targeted 12-case run includes it. An intermediate run alongside the
production build encountered chart/page render timeouts; the subsequent isolated
run passed all 12. Keep build and browser execution separate when reproducing.
There is **no claim of a green full browser suite**. `test-results/browser.json`
is overwritten per run and currently describes only the final targeted run.

### External backend failures

The hermetic runner, without overlay arguments, copies the external
`D:\QP\agent-service` code. This continuation did not modify that repository.
Its failures were:

- `test_openapi_snapshot_matches_live_app`: five forecast paths absent from the
  saved OpenAPI contract.
- `test_402_everywhere_raises_out_of_funds`: raw 402 exception propagated.
- `test_all_auth_failures_are_actionable_and_manual_reset_revalidates`: raw 401
  exception propagated.

The 433-case extension suite and the autospecced endpoint tests are separate
evidence; they do not make those failures pass. New structure routes have not been
verified against a running provider-backed service or hosted browser session.

## Still incomplete / next action

- Direct save-structure-to-journal/decision-plan integration is not implemented.
  Existing chart links and decision-plan workflows remain available.
- Chart zones currently use boundary lines, not shaded regions; the structure
  query remains the intraday 1D analysis, with its own interval now disclosed.
- Resolve the reproducible broad-browser failures before claiming release-wide
  verification. Start with:

  ```powershell
  npm.cmd run test:browser -- tests/browser/visual.spec.ts tests/browser/workspace-ux.spec.ts -g "visual: screener-desktop|375px /app/replay:"
  ```

- Fix the external backend contract/gateway failures in an authorized follow-up,
  then rerun `npm.cmd run test:backend`. Do not deploy to validate local code.
- To inspect the feature locally, open Discover and select Liquidity Board or
  Market X-Ray; on a stock chart enable Structure. Unavailable services should
  remain explicit. No preview server was deliberately left running by this pass.
- Commit/push require an explicit request. Review untracked files individually;
  do not stage generated data or unrelated audit artifacts wholesale.
