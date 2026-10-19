# Agentic prediction responsiveness — 2026-10-19

## Scope and result

Investigate slow stock research and improve when real saved findings become visible, without changing the configured models, weakening evidence/risk checks or substituting invented progress.

The fixes remove demonstrated client scheduling delays, repeated failed/offline polling and unnecessary acceptance requests. Backend terminal HTTP failures now reach the existing outer error policy without futile transport backoff; independent macro reads run together; expired automatic refreshes get a new evidence cutoff. **A faster cold end-to-end live model prediction has not been established.**

Environment: Windows, Node/React Query frontend in `D:\Quant-Plus`, branch `main`, base `4a5db74`, and Python 3.11 backend in the separate `D:\QP\agent-service` checkout. Measurements are against uncommitted working trees containing earlier UI/intelligence work. No clean-revision whole-application A/B comparison is claimed.

No dependencies, private configuration, model/account choices, research stages, grounding checks or paper-book data were changed for this repair. No deployment, migration, commit or push was performed. Research jobs can still update their normal backend sessions/checkpoints.

## Findings and changes

### Frontend lifecycle and progressive output

- Freshness previously followed browser fetch time instead of the backend research cutoff. Reading an already-old cached result could reset a full 900-second interval. Scheduling now follows `as_of + refresh_seconds`, with bounded one-minute rechecks for already-expired served results.
- A fresh remount no longer sends an unnecessary prediction-acceptance POST. Manual refresh of fresh completed research is a read-only status GET.
- Failed sessions wait for explicit retry. A transport error pauses automatic polling instead of continuing once a second while offline. The UI offers reconnection/retry without discarding saved work.
- Normalized symbol identity and shared acceptance promises preserve one in-flight start across navigation. Shared mutation state coalesces repeated retry clicks. Progress GETs remain cancellable; abandoning an acceptance request is not mistaken for cancelling a backend job.
- The last completed decision remains visible while the new session exposes actual saved analyst reports, synthesis and counter-case. New findings are explicitly provisional. Validation indicators use the matching session's events, and timestamps retain backend provenance.
- Stock summary, detailed prediction and committee views distinguish active work, failed work, operator pause, outage and retained completed research. No fabricated streaming tokens, progress percentages or market timestamps were introduced.

Primary files: `src/hooks/prediction-query.ts`, `src/hooks/use-agent-stock.ts`, `src/components/app/stocks/{AgentPrediction,StockDetail}.tsx`, and `src/components/app/ResearchWorkspace.tsx`.

### Backend execution

- `app/gateway/codecraft.py`: terminal HTTP 4xx errors previously matched a broad transport retry predicate. Five attempts could incur **2 + 4 + 8 + 16 = 30 seconds of configured backoff per affected key** before outer handling. Only connection/timeouts, HTTP 408 and 5xx retain that retry budget. Existing outer rotation/quarantine policy, 429 handling, budgets and models remain intact. The removed 30 seconds is derived from the configured schedule, not a new live wall-clock benchmark.
- `app/agents/analysts.py`: NIFTY and India VIX macro reads use at most two workers, preserve original prompt ordering and share the same point-in-time cutoff. Both settle before model/grounding validation. One feed's failure remains explicit rather than hiding the other feed.
- `app/api/stocks.py`: automatic refresh no longer repeatedly resumes an expired failed/orphaned cutoff. Explicit retry and recent interrupted work still preserve checkpoints. Active jobs remain single-flight.

The complete research graph remains intact: five parallel analysts, dependent debate/synthesis/challenge/trader stages, three parallel risk reviews and final decision validation. The deterministic full-graph check still observes **16 model calls** and research-only authority.

`scripts/patch-prediction-latency.py` captures the three external source repairs as a guarded, idempotent installer. It validates every hunk before writing, preserves LF/CRLF and unrelated bytes, and fails closed on unexpected source. It does not install external regression test files or alter service/config/data state.

## Comparable client measurements

Commands use real QueryObservers, mocked HTTP and a virtual clock. Baseline mode loads only the hook from `git show HEAD:src/hooks/use-agent-stock.ts`; current mode loads working-tree hooks. Inputs, clock and query-library installation are otherwise the same. These are deterministic lifecycle measurements, **not real model-generation timings**.

| Workload | HEAD hook | Current hook |
| --- | ---: | ---: |
| Acceptance POSTs on fresh 20-second remount | 1 | 0 |
| Automatic requests for a failed session over 60 seconds | 4 | 0 |
| Status requests during 10 seconds of transport failure | 10 | 1 |
| Refresh detection with an 800-second-old cutoff and 900-second TTL | 900 seconds after mount | 100 seconds after mount |
| Extra delay beyond that cutoff's actual expiry | 800 seconds | 0 seconds |

The reproduced cutoff case removes **13 minutes 20 seconds of artificial delay**, not 13 minutes 20 seconds from every model run. Backend deduplication already limited some redundant starts; a redundant POST is not evidence of another full model invocation.

## Backend and live-read measurements

The offline benchmark uses five cold temporary databases, synthetic completed bars, 80ms provider delay, 25ms fake-model delay, no external sockets and a 10-second full-graph deadline per sample. Terminal retry sleeps are compressed to 20ms while the production predicate, attempt count and rotation remain real.

| Current workload | Five samples (ms) | Median (ms) |
| --- | --- | ---: |
| Complete cold **mocked** graph | 418.947, 414.434, 399.913, 404.672, 412.519 | 412.519 |
| Terminal 401 followed by successful fallback | 2.450, 2.274, 1.380, 4.608, 1.405 | 2.274 |

Each terminal sample made two HTTP attempts total: one rejected key and one successful fallback. The warmer's newly scheduled cutoff lag samples were 0.001, 0.002, 0.001, 0.001 and 0.001 seconds. Tests also verify unchanged transient retries, five validated analyst reports, all required graph roles, the evidence cutoff and checkpoint preservation. No healthy full-graph before/after speedup percentage is claimed from these after-only samples.

Latest local read-only probe: first request plus five warm GETs per path, each with a five-second cutoff. All responses were HTTP 200.

- Three-symbol completed-snapshot view: first 109.01ms; warm 38.16, 31.80, 23.06, 34.22, 26.91ms; median **31.80ms**.
- RELIANCE prediction view: first 17.86ms; warm 16.32, 22.96, 15.02, 13.98, 14.93ms; median **15.02ms**. The result was `done`, with five analyst reports and 29 saved events.

These local cache/proxy reads were already fast before this repair and vary with host load. They do not establish a fresh-generation improvement. Saved session timestamps can span pauses/restarts; the probe labels their difference `savedSessionWallSpanMs`, not inference time. Resumed runs must not be labeled cold fresh generations. No additional paid generation was launched during the final verification pass.

## Verification completed

| Check | Actual result |
| --- | --- |
| `npm.cmd run typecheck` | Passed. |
| `npm.cmd run lint` | Passed with zero errors/warnings; final diagnostic script edits also passed scoped ESLint. |
| `npm.cmd run build -- --logLevel warn` | Passed, explicit exit 0; client/SSR/Nitro output generated locally. |
| `npm.cmd test` | Passed: 73 Node tests and every subsequent package-script integration/integrity/auth/session/settlement check. Includes the new prediction lifecycle checks. |
| Client baseline/current lifecycle commands | Passed; before/after values above reproduced. Current checks also passed inside `npm test`. |
| `scripts/test-prediction-backend.py` | 71 passed, 2 deselected in 25.52s. Benchmark and checkout-writing contract generator deliberately excluded. |
| Same backend runner with `-k benchmark -s` | 1 passed, 72 deselected in 8.67s; five samples above. |
| Focused browser command below | 15 passed, no unexpected/skipped/flaky results, 81.97s. Aggregate confirmed in generated `test-results/browser.json`. |
| Backend patch `--check` and `--self-test` | Passed; all three runtime source repairs already applied. Tests cover LF/CRLF, repeat application, unrelated bytes and all-file conflict preflight. |
| Diagnostic script smoke checks | Read-only live probe passed; progress script passed syntax checking; both passed scoped ESLint. A fresh live generation was not rerun for this smoke check. |
| `GET http://127.0.0.1:8000/api/v1/health` | HTTP 200, database true and LLM gateway configured. This verifies configuration/connectivity to the local service, not a new provider inference. |

Browser cases cover navigation with partial findings and retained decisions, operator pause, stopped offline polling, explicit/coalesced retry, failed-refresh preservation and adjacent Ripple/intelligence flows. They use the isolated port-4179 server, a random test book, unreachable real backend and intercepted APIs. They do not use the real workspace book or pay for models. This is a completed focused run, not a new full-suite certification of all prior UI routes; see `ui-ux-20261019.md` for the earlier broader checks.

The reusable backend runner strips credential environment variables, supplies synthetic keys, denies external sockets, disables schedulers and uses temporary CWD/SQLite/data paths. Explicit `--rootdir` avoids overlapping autouse fixtures when Windows temp and checkout are on different drives. It requires the matching external backend checkout, including `tests/test_prediction_execution_regressions.py`.

## Reproduction

Run from `D:\Quant-Plus`; use the project's configured Python 3.11 environment with the backend dependencies installed. The final focused run used `C:\Program Files\Python311\python.exe`. Set `QUANTPLUS_BACKEND_PATH` for the test runner when the checkout is elsewhere; pass `--backend` to the patch installer separately.

```powershell
node scripts/test-prediction-polling.mjs --baseline
node scripts/test-prediction-polling.mjs
python -B scripts/test-prediction-backend.py
python -B scripts/test-prediction-backend.py -k benchmark -s
python -B scripts/patch-prediction-latency.py --check
python -B scripts/patch-prediction-latency.py --self-test
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build -- --logLevel warn
npm.cmd exec playwright -- test tests/browser/prediction-latency.spec.ts tests/browser/ripple-ux.spec.ts tests/browser/intelligence.spec.ts --workers=1
node scripts/bench-prediction-status.mjs
```

Only if the known backend source needs these repairs, run `python -B scripts/patch-prediction-latency.py --backend D:\QP\agent-service --apply`. Restart the local backend after an actual source update. It was already restarted during this task and the final health/probes hit the running patched service. Do not reinstall unrelated extensions or change private settings to repeat a timing test.

**Optional, budget-consuming live check:** `node scripts/check-prediction-progress.mjs RELIANCE` issues one start/join POST, then polls every two seconds with a 240-second observation cutoff. It does not force cache bypass, cancel the shared job or place an order. Its output labels cached completion, joined/resumed work and a new cutoff separately. An incomplete sample is not a completed prediction timing; even a completed new-cutoff sample is not a matched before/after benchmark.

## Runtime and remaining limits

- Local preview: `http://127.0.0.1:8080`; backend: `http://127.0.0.1:8000`.
- Final health reported analyst model `deepseek-v4-pro-0813` and decider model `claude-sonnet-5`; existing selections were preserved.
- Live dependent model stages, rate limits, provider retries, grounding repairs and market downloads can still take minutes. No model downgrade, reduced reasoning/review graph or weakened deadline was used to manufacture a faster answer.
- Existing market download retry limits and transient model retry budgets remain. Their configured worst cases are not proof that they caused any particular observed slow run.
- Daily completed-bar research is distinct from live quote updates. Exposing genuine saved findings early does not turn it into tick-by-tick prediction or certify forecast accuracy.
- No matched cold live before/after experiment, open-session performance certification, hosted-auth end-to-end run, deployment or cross-OS production validation is claimed.
- The build still reports the pre-existing `vite-tsconfig-paths`/native-resolution overlap warning. No toolchain changes were made to suppress it.
- If a cold-generation target is requested next, measure one bounded run's provider preparation and individual model stages first, under the same models, workload and budget; do not infer inference speed from cached GETs or resumed session wall spans.
