# Master roadmap verification

Current follow-up: [2026-10-15 implementation and remaining work](ROADMAP_IMPLEMENTATION_20261015.md). The audit below is the preserved 2026-10-14 baseline; consult the follow-up for defects corrected since then. The full roadmap remains incomplete.

Audit date: 2026-10-14. Reference: [MASTER_ROADMAP.md](MASTER_ROADMAP.md), version 2.

**Verdict: the complete roadmap is not implemented successfully.** The local paper engine and many product workflows have substantial passing evidence, but there are unfinished deliverables, unfulfilled evaluation gates, and three reproduced implementation/verification gaps. Passing the existing test suites does not establish that all roadmap requirements are met.

This review inspected the current working tree, the separate backend at `D:/QP/agent-service`, migrations, implementation artifacts and test coverage. It reran local checks on isolated books and a disposable backend copy. Hosted RLS and live-provider behavior were not retested. Existing cloud-test reports are historical evidence, not a fresh certification. No application changes, deployment, account migration or live control mutations were performed.

## Current verification results

| Check                                              | Result                    | Evidence / limits                                                                                                                                                                                          |
| -------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck                                          | PASS                      | `npm.cmd run typecheck`, exit 0                                                                                                                                                                            |
| Lint                                               | PASS                      | [log](audit/roadmap-current-lint.log), zero-warning target, exit 0                                                                                                                                         |
| Frontend regression suite                          | PASS                      | [log](audit/roadmap-current-tests.log), 27 unit cases and 14 script suites including faults; native-shell repeat exited 0                                                                                  |
| Intelligence regressions                           | PASS                      | [log](audit/roadmap-current-intelligence.log), 103 passed                                                                                                                                                  |
| Disposable backend regressions                     | PASS                      | [log](audit/roadmap-current-backend.log), 442 passed; `test_technical.py` excluded; fake keys and external socket connections blocked                                                                      |
| Production build                                   | PASS                      | [log](audit/roadmap-current-build.log), native-shell repeat exited 0; Vite plugin and SDK browser-externalization notices remain                                                                           |
| Browser workflows                                  | PASS                      | 42 passed; native-shell repeat exited 0; [log](audit/roadmap-current-browser.log); contrast explicitly excluded, unavailable provider configuration                                                        |
| Restore/migration drill                            | PASS                      | [log](audit/roadmap-current-drill.log), temporary copies only                                                                                                                                              |
| Local HTTP benchmarks                              | PASS                      | [log](audit/roadmap-current-bench.log); 300 requests per case; order acknowledgement p95 70.570 ms, account reads p95 19.215 ms, 50-order page p95 81.810 ms; practice fills, provider stubbed, worker off |
| Accelerated soak                                   | INCOMPLETE despite exit 0 | [log](audit/roadmap-current-soak.log); 5 minutes, 904 requests, 0 server errors, 7 reconciliations, **0 completed sessions and 0 DAY expiries**; see RV-03                                                 |
| Live InsForge isolation                            | Prior evidence only       | [29-check report](audit/implementation/insforge/live-isolation-20261014.md); not rerun and no test users created by this audit                                                                             |
| Ten actual trading sessions / human AI evaluations | NOT VERIFIED              | Simulated time and fixture tests cannot satisfy these gates                                                                                                                                                |

The first test/build/browser invocations redirected native stderr through Windows PowerShell, producing failure exit codes despite successful runner output. All three were repeated through `cmd.exe` and exited 0. This is a harness-output issue, not evidence that every reported warning is harmless.

The existing drill, benchmark and soak scripts write date-keyed evidence files. Their reruns refreshed same-date artifacts under `audit/implementation`; historical claims in the earlier status document must be read against the current logs, rather than assuming those files still describe the earlier run. In particular, the current soak artifact reports zero sessions.

## Reproduced blockers

### RV-01: legacy backend routes lack internal authentication

Roadmap requirement: Phase 2.6 explicitly covers legacy control/evaluation/WebSocket paths.

`app/api/v1.py` creates its router without an authentication dependency. `POST /api/v1/sessions`, `/eval/run`, `/arena/founders` and `/killswitch` have no key check. `app/api/research.py` likewise exposes research writes without authentication. The WebSocket routes in `app/main.py` accept connections without checking a key. The authenticated stock router does not protect these sibling routes, and the application has no global authentication middleware.

**Reproduction:** an unauthenticated `POST /api/v1/killswitch` reaches its handler and returns HTTP 200. The handler's mutation was mocked, so this check did not change operator state. [Evidence](audit/roadmap-current-backend-auth.log), [reproduction script](audit/roadmap-reproduce-backend-auth.py).

Loopback startup instructions reduce exposure but do not satisfy the explicit internal authentication requirement. Protect HTTP and WebSocket routes consistently, retain documented callback exceptions, and add unauthorized-request tests before accepting Phase 2 or a release gate.

### RV-02: grounding accepts incorrect facts and warns only after streaming

Roadmap requirements: Phase 8.3 and its gate; the quality contract requires unsupported numeric claims to abstain. Phase 7.2 also requires claim-level validation before synthesis.

`src/lib/copilot/grounding.ts` checks whether a number occurs anywhere in serialized evidence, permits absolute-value and percentage transformations, and ignores integer values below ten. It does not bind a claimed field, unit, entity or sign to its citation. These incorrect answers pass:

| Evidence                  | Incorrect answer              | Checker result         |
| ------------------------- | ----------------------------- | ---------------------- |
| `return_pct: 50`          | Return was **-50 percent**    | No unsupported figures |
| `price: 100, volume: 500` | Stock price is **500 rupees** | No unsupported figures |
| `quantity: 2`             | You hold **9 shares**         | Zero figures checked   |

[Evidence](audit/roadmap-current-grounding.log), [reproduction script](audit/roadmap-reproduce-grounding.mjs).

`src/routes/api/chat.ts` streams model text before calling this validator, then appends a footer without correcting or removing unsupported claims. Backend claim auditing similarly records unsupported reports rather than proving they were prevented from synthesis. Phase 8 cannot be called implementation-complete against the roadmap's grounding requirement. Typed claim-to-evidence validation and correction/abstention are still necessary.

### RV-03: soak success does not enforce session coverage

`scripts/soak.mjs` stops when either its five-minute deadline or target session count is reached. It asserts no server errors and no duplicate settlements, but never asserts that `simulated_sessions_completed` reaches the requested count.

The fresh default run exited 0 with **0 completed sessions**, **0 expired DAY orders**, 904 requests and seven successful reconciliations. Route p95 was **570.3 ms** with a 3.7 MB / 755-order book under concurrent audit load. This is a useful accounting stress sample, but cannot establish session rollover, ten-session soak completion or the full performance gate. It is also not directly comparable to isolated small-book HTTP benchmarks.

Require the requested coverage or report the run as incomplete; preserve separate benchmark/soak run artifacts. The ten real-session gate remains open regardless of an accelerated result. [Evidence](audit/roadmap-current-soak.log).

## Deliverable-by-deliverable review

**Delivered** means identifiable implementation and relevant local evidence exist; it does not certify the entire phase gate. **Partial** means a required subpart or acceptance proof remains. **Missing** means the stated deliverable is not supplied by the inspected implementation/evidence. **Open evidence** requires real collection, evaluation or review. Numbers match the roadmap's numbered deliverables; Phase 9 uses its named areas.

### Phase 0: baseline — partial

| Item                                               | Status    | Evidence / remaining requirement                                                                                                       |
| -------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 0.1 Repository/runtime/lock/schema fingerprints    | Delivered | Baseline and release artifacts under `audit/implementation`; both trees were inspected                                                 |
| 0.2 Every field/action traced                      | Partial   | `inventory.json` still labels handlers and quantitative fields as pending review; discovery is not a completed trace                   |
| 0.3 Defect register and ten desired-behavior cases | Partial   | Regression suites exist, but `defects.json` retains blanket open statuses and lacks a completed per-ID closure mapping                 |
| 0.4 Hermetic backend tests and separate live suite | Partial   | Disposable suite passes; live technical tests excluded; complete clock/path isolation and bounded opt-in live coverage remain to prove |
| 0.5 Supported instrument/product/order scope       | Delivered | Delivery equities, practice mode and unavailable Options documented                                                                    |
| 0.6 Reproducible dependencies and reconciled docs  | Partial   | npm lock exists; backend requirements mostly use unbounded `>=`; Supabase dependency and stale completed checklists remain             |
| 0.7 Browser infrastructure and action manifest     | Partial   | 42 route/workflow tests; no exhaustive action/field coverage manifest with closure evidence                                            |

### Phase 1: integrity — substantial delivery, gate not certified

| Item                                              | Status    | Evidence / remaining requirement                                                                 |
| ------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------ |
| 1.1 Stable intents/fingerprints/funding retries   | Delivered | `paper-book` commands; integrity, hosted adapter and duplicate-storm tests                       |
| 1.2 Central server quote eligibility              | Delivered | `quote-eligibility.ts`, provider quote boundary and quote fault cases                            |
| 1.3 Explicit separate closed-session practice     | Delivered | Separate book; route and browser evidence                                                        |
| 1.4 Daily loss and risk-reducing exits            | Delivered | Marked loss window and cash-flow tests; stale marks explicitly retained                          |
| 1.5 DAY expiry and authoritative holdings         | Delivered | Exchange close/calendar tests, worker expiry, holdings-based UI                                  |
| 1.6 Runtime schemas for editable records/policies | Delivered | `local-schemas.ts`, migration quarantine and malformed-record regressions                        |
| 1.7 Candle/filing PIT and 52-week corrections     | Partial   | Backend regressions and guarded patches exist; universal endpoint/filing lineage remains open    |
| 1.8 Correct maturity/calendar/denominators        | Delivered | 103 intelligence cases, versioned outcome labels and calendar parity                             |
| 1.9 Remove synthetic observations                 | Partial   | Import audit and unavailable-state checks pass; every displayed field still needs lineage review |
| 1.10 Honest protection scope and deduplication    | Delivered | Server worker replaces browser execution; deterministic protection intents tested                |

Gate remains unverified; newly reproduced blockers must enter the defect review rather than relying on historical completion wording.

### Phase 2: durability / InsForge — partial and blocked by RV-01

| Item                                                       | Status                         | Evidence / remaining requirement                                                                                                    |
| ---------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 Typed repositories across domains                      | Partial                        | Book/workspace services exist; universal evidence/forecast/job contracts not completed                                              |
| 2.2 Single authority, PostgreSQL migrations, integer money | Delivered for implemented book | Local engine plus InsForge CAS migrations; hosted deployment state not freshly inspected                                            |
| 2.3 Preserve and reconcile JSON migration                  | Partial                        | Local v1→v2 drill passes; local profile→verified InsForge user migration has not occurred                                           |
| 2.4 Ledger/outbox/durable job leases and retries           | Partial                        | Append-only events, intents and worker lease; general claimed jobs/outbox not fully implemented                                     |
| 2.5 Persist histories, dialogue and research progress      | Partial                        | SQLite intelligence history, conversation book and backend checkpoints; common immutable forecast evidence remains open             |
| 2.6 Internal auth on all legacy endpoints                  | Missing                        | RV-01 reproduced; stock API auth alone is insufficient                                                                              |
| 2.7 Restore/crash/disk/controlled-shutdown recovery        | Partial                        | Restore, corrupt file, locks, writer crash and permission faults pass; actual disk-full and all commit crash points not established |

Hosted cutover, identity mapping, silent token refresh and removal of legacy Supabase dependencies remain unfinished. App deployment is a separate decision; hosted-provider selection does not require deploying the frontend.

### Phase 3: market truth — partial

| Item                                                | Status                                     | Evidence / remaining requirement                                                                               |
| --------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| 3.1 One complete observation envelope               | Partial                                    | Metadata exists across endpoints, but fields/contracts differ; not all have receipt/availability/lineage       |
| 3.2 Instrument master and effective history/actions | Partial                                    | Verified dated NSE/ISIN metadata; effective membership, aliases, tick rules and corporate actions not complete |
| 3.3 Canonical verified exchange calendar            | Partial                                    | 2026 calendar/parity tests; future years and unannounced special timings fail closed                           |
| 3.4 Plan budgets/priority/batching/reconnect/health | Partial                                    | Backend REST request budget delivered; socket plan limit/priority allocation and live capacity proof remain    |
| 3.5 Shared normalized subscriptions                 | Delivered                                  | `market-subscriptions.ts` and normalization/batching/order/release suite                                       |
| 3.6 Real validated history/indicators               | Partial                                    | OHLCV and warmup tests pass; corporate-action adjustment and gap completeness not established                  |
| 3.7 Real factor/health/portfolio metrics            | Partial                                    | Implemented observed factors reject unknowns; universal field lineage review still open                        |
| 3.8 Public snapshots/metadata split                 | Delivered for inspected paths              | Synthetic seed fields removed; public unavailable-state/browser checks                                         |
| 3.9 Disable unsupported Options/Replay              | Delivered with later Replay implementation | Options unavailable; Replay consumes real history and disables start when absent                               |
| 3.10 Fixture/synthetic import audit                 | Delivered                                  | `check-market-truth.mjs` passes; explicitly narrower than full lineage                                         |

### Phase 4: execution — core delivered, incomplete

| Item                                               | Status    | Evidence / remaining requirement                                                                               |
| -------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------- |
| 4.1 Full states, amendments and recovery           | Partial   | Open/partial/filled/cancelled/expired/rejected and versions exist; complete amendment/recovery workflow absent |
| 4.2 Worker/brackets/OCO/trailing                   | Partial   | Worker leases, persisted protection peaks and exits; separate-order OCO remains missing                        |
| 4.3 Observable liquidity/slippage/latency/partials | Partial   | Bid/ask, last-trade assumptions, slippage and partials exist; simulated latency model not supplied             |
| 4.4 Cash/share reservations and rechecks           | Delivered | Randomized reconciliation, cancellation and duplicate-delivery checks                                          |
| 4.5 Dated itemized fees/taxes                      | Partial   | Debited versioned fees exist; brokerage/DP are labelled assumptions, verified broker profile unfinished        |
| 4.6 Equity/exposure/settlement/actions             | Partial   | Marked concentration/day loss; T+1 settled/unsettled balances and corporate actions missing                    |
| 4.7 Durable independent-leg baskets                | Delivered | Preflight, per-leg IDs, replay and explicit partial outcomes                                                   |
| 4.8 Execution audit/export                         | Delivered | Intent/quote/fill/fees/ledger/events and JSON export                                                           |

Live feed halt/gap/restart and browser-closed market-session evidence remain open.

### Phase 5: news/filings — partial; corpus gate open

| Item                                               | Status                   | Evidence / remaining requirement                                                                                                         |
| -------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 Durable source registry and connectors         | Partial                  | `news/registry.py` counters/circuit state are in memory; durable registry, conditional retrieval and expanded source coverage unfinished |
| 5.2 Raw hash/time/version lineage                  | Partial                  | SQLite append-only parsed article archive; complete original connector payload/updated/language semantics not established                |
| 5.3 Failure vs empty, timestamp bounds/corrections | Delivered for connectors | Official/RSS quarantine and news evidence tests                                                                                          |
| 5.4 Effective entity/multilingual linking          | Partial                  | Namesake guards/aliases; Hindi is labelled/excluded rather than measured multilingual interpretation                                     |
| 5.5 Event clusters/retractions/versions            | Partial                  | Cluster members and archive versions exist; comprehensive retraction/correction propagation unverified                                   |
| 5.6 Attachments/XBRL and isolated parsing          | Missing                  | Announcement attachment URLs are not a completed ingestion/parser pipeline                                                               |
| 5.7 Typed evidence-backed events                   | Partial                  | Rules extract amounts/period/direction/spans; full event schema and reviewed accuracy not proven                                         |
| 5.8 Incremental/backfill and source measurements   | Partial                  | Collection paths exist; persistent backfill coverage and measured latency/relevance remain open                                          |

No completed ≥1,000-item reviewed time-separated evaluation with ≥95% relevance precision was found.

### Phase 6: sentiment — harness delivered; quality not proven

| Item                                                       | Status                          | Evidence / remaining requirement                                                          |
| ---------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------- |
| 6.1 Separate tone/impact/conditions/reaction/forecast      | Delivered                       | Explicit descriptive labels and no same-day self-validation                               |
| 6.2 Rules baseline and model challengers                   | Partial                         | Rules retained; evaluated NLP/entity-aware/LLM challengers absent                         |
| 6.3 Adjudicated human labels/slices/splits                 | Open evidence                   | Guidelines/exporter exist; completed reviewed labels and adjudication absent              |
| 6.4 F1/calibration/slices/coverage/drift                   | Partial                         | Harness exists; frozen real holdout results and drift monitoring missing                  |
| 6.5 Completed-bar maturity and adjusted PIT outcomes       | Partial                         | Maturity invariants pass; universal split-adjusted membership/price evidence remains open |
| 6.6 Calibrated probabilities with reliability evidence     | Open evidence                   | Scoring harness is not a trained/calibrated probability model                             |
| 6.7 Visible weights/coverage and preregistered comparisons | Partial                         | Descriptive index/coverage exists; adaptive weighting promotion not proven                |
| 6.8 Publication-window reactions and controls              | Missing as evaluated capability | Same-session context is separated; controlled event-study evidence not delivered          |

No real-corpus baseline win, macro-F1 ≥0.80 or sufficient calibrated resolved outcomes established.

### Phase 7: research/forecasts — partial; promotion gate open

| Item                                                   | Status                     | Evidence / remaining requirement                                                                               |
| ------------------------------------------------------ | -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 7.1 Shared immutable cutoff bundle                     | Missing as common contract | Local snapshots/PIT checks exist; shared cross-stage immutable bundle explicitly remains unfinished            |
| 7.2 Validate claims before synthesis                   | Partial                    | Recorded claim audit is weaker than prevention; field/sign binding remains unproven                            |
| 7.3 Agent specialization supported by ablations        | Open evidence              | Existing graph retained; per-role ablation justification absent                                                |
| 7.4 Hypotheses/falsifiers/failures/abstention          | Partial                    | Research memory/governance preserved; full shared uncertainty/evidence sufficiency schema unfinished           |
| 7.5 Separate forecast models/horizon contracts         | Partial                    | Existing horizon retained; new-target registry/models not supplied                                             |
| 7.6 Baselines and uncontaminated temporal tests        | Partial                    | Historical comparisons/failures preserved; new-target frozen evaluation not delivered                          |
| 7.7 Experiment/cost/coverage/multiple-testing controls | Partial                    | Existing experiment governance; complete new model/prompt/data cost and promotion records absent               |
| 7.8 Resume/coalescing/pause/fair scheduling/cancel     | Partial                    | Bounded stock jobs and progress exist; complete fair scheduling and cancellation across legacy jobs unverified |
| 7.9 Registry and ≥500 matured forecasts/horizon        | Open evidence              | No qualifying forward-promotion evidence supplied                                                              |
| 7.10 Honest horizon/cutoff/version/calibration UI      | Partial                    | Opinion/cutoff/failure disclosures exist; complete baseline/sample/model contract for every target not proven  |

The implementation does not prove directional superiority; preserving failed artifacts is appropriate.

### Phase 8: copilot — partial and blocked by RV-02

| Item                                                        | Status                    | Evidence / remaining requirement                                                                                       |
| ----------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 8.1 Instrument resolution and attached context              | Delivered                 | Official-symbol/name matching, ambiguity and context regressions                                                       |
| 8.2 Bounded typed read tools and computed numbers           | Partial                   | Portfolio/risk/quotes/history/news/research tools; complete filing spans and forecast-result tools unfinished          |
| 8.3 Validate citations/numbers before authoritative display | Missing required behavior | RV-02; footer after streaming does not correct or abstain                                                              |
| 8.4 Isolate untrusted text / adversarial resistance         | Partial                   | Evidence prompt boundary and mock adversarial checks; live reviewed injection resistance unproven                      |
| 8.5 Persistent dialogue/search/export/delete/stop/resume    | Partial                   | Persistence, search/export/delete/stop/retry exist; explicit retention/user memory and true stream resume not complete |
| 8.6 Workflow modes/coaching                                 | Delivered structurally    | Modes and linked journal context exist; live usefulness review remains open                                            |
| 8.7 Retrieval/provider health/token/cost ceilings           | Partial                   | Trace and daily request ceiling; actual token/cost accounting and monetary ceiling absent                              |
| 8.8 Read-only tools / explicit paper boundary               | Delivered                 | Tools do not mutate account; no-action chat regressions                                                                |

No ≥200-answer human-reviewed evaluation with ≥95% factual citation precision exists. The numeric checker additionally fails reproduced correctness cases.

### Phase 9: product — partial, beyond the acknowledged Options exclusion

| Area                 | Status                           | Evidence / remaining requirement                                                                                                               |
| -------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard/Markets    | Partial                          | Real observations/unavailable states; configurable panels and complete metric lineage not established                                          |
| Charting             | Partial                          | RSI/EMA/MA, volume, axes, crosshair and keyboard inspection; zoom/range, annotations and event overlays absent in `ProfessionalChart.tsx`      |
| Screener             | Partial                          | Momentum/volatility/opinion filters and versioned browser-local screens; fundamental/event/calibrated-forecast screening unfinished            |
| Portfolio/X-ray      | Partial                          | Holdings-based P&L/contribution and deterministic stress; correlation and complete net attribution not supplied                                |
| Wallet/Orders/Basket | Substantially delivered          | Pagination, holdings, reservations, audit and per-leg retry evidence; review full search/lot requirements before closure                       |
| Risk                 | Delivered for supported controls | Persistent policy, marked loss/concentration and documented reductions                                                                         |
| Alerts               | Partial relative to full roadmap | Price-above/below and absolute move only; volume/event/news conditions and reusable cooldown/debounce policy absent                            |
| Journal/review       | Substantially delivered          | Immutable snapshot and linked order; outcome/coaching quality still needs reviewed evidence                                                    |
| Replay               | Partial                          | Real daily bars/isolated next-open book and no-lookahead tests; archived news/event replay and recorded reproducible run manifest not supplied |
| Options              | Missing; explicitly excluded     | Honest unavailable page; no validated observed chain/contracts/IV/Greeks workflow                                                              |
| Research/committee   | Partial                          | Actual reports/jobs/events; shared evidence graphs and evaluated forecast metadata unfinished                                                  |
| Settings/help        | Delivered for retained settings  | Unsupported controls removed, saved settings consumed and browser persistence tested                                                           |

Route rendering does not exercise every advertised action. Colour contrast is disabled in the axe suite, and full responsive/touch/manual review remains open. Narrower honest UI scope can be accepted only after documenting explicit exclusions; it is not implementation of the full roadmap.

### Phase 10: reliability/quality — partial; release gate fails

| Item                                                 | Status                  | Evidence / remaining requirement                                                                                                            |
| ---------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 10.1 Clean checks/property/fuzz/browser completeness | Partial                 | Automated suites pass; exhaustive browser/action and runtime fuzz coverage missing                                                          |
| 10.2 Comprehensive fault matrix                      | Partial                 | Strong writer/provider/model/lease tests; actual disk-full, all transaction crash points and every failure class not established            |
| 10.3 Ten consecutive real market sessions            | Open evidence           | Accelerated run completed zero sessions despite exit 0 (RV-03); simulated time also cannot replace wall-clock/live-provider evidence        |
| 10.4 Broad end-user performance benchmarks           | Partial                 | Warm local HTTP/practice ack meets targets; cold startup/new vs cached research/full-capacity live watchlist/chat responsiveness unfinished |
| 10.5 Restore/manifest/health/pause                   | Substantially delivered | Fresh copy-only restore drill; historical release manifest exists, not regenerated to certify this audit tree                               |
| 10.6 Competitive repeatable measured comparison      | Partial                 | Dated public-feature comparison exists; competitor performance and evaluated AI usefulness not measured                                     |
| 10.7 Claims match evidence/exclusions                | Partial                 | Honest opinion/unavailable disclosures; conflicting completion docs and RV-02's reassuring footer require correction                        |

No release gate can pass while RV-01/RV-02 remain unresolved, RV-03 permits incomplete coverage to exit successfully, and required evidence is missing.

## Documentation conflicts

1. `IMPLEMENTATION_STATUS.md` correctly opens with “no phase gate is declared passed,” but calls Phases 8/9/10 implementation-complete despite missing behavior listed above.
2. Its Phase 2 section both cites 29/29 live isolation and later says live two-user testing is not done. The isolated report supports historical completion, not the later stale sentence.
3. `INSFORGE_MIGRATION.md` still says the live two-user test is not done and earlier describes an empty project, despite later migration/isolation evidence.
4. `VERIFICATION.md` retains old Supabase release requirements, old lint/browser results and earlier financial-engine gaps. `roadmap.md` declares Options and many features complete under an earlier scope.
5. `package.json` still contains `@supabase/supabase-js`; the planned dependency removal is unfinished even though application routes use app-owned repositories.
6. `inventory.json` and `defects.json` are static discovery/baseline registers, not completed review records.

## Next work in dependency order

1. Protect legacy backend HTTP/WebSocket boundaries and add unauthorized-route regressions (RV-01).
2. Replace permissive number matching with typed cited facts, validate before authoritative display, and correct or abstain (RV-02).
3. Require soak coverage before success (RV-03), complete the action/field inventory and defect evidence register, and reconcile stale status/migration/release documents.
4. Finish InsForge identity mapping, auth refresh and reviewed cutover rehearsal while preserving the local book; remove obsolete Supabase runtime dependencies.
5. Complete observation/instrument history, settlement/corporate actions/OCO, persistent ingestion and declared product gaps or explicitly exclude them from a narrowed release.
6. Collect and review the required corpora/answers/forward outcomes, freeze comparisons, and run ten real trading-session soaks before claiming the corresponding gates pass.

No completion percentage is assigned: the roadmap mixes engineering deliverables, optional exclusions and time-dependent empirical gates, so a count of UI features would be misleading.
