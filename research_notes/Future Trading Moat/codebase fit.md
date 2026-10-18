# Codebase fit: Decision Flight Recorder

## 1. Flagship concept and smallest magical journey

### Takeaway

The highest-leverage flagship is **Decision Flight Recorder**: a sealed, replayable “decision twin” for one paper decision. It joins the evidence and risk state that existed when the user decided, the authoritative paper-book result, and a no-lookahead historical rehearsal using the same thesis, levels, size, and execution assumptions. The product promise is concrete: **“What did I know, what did I risk, what actually happened, and would this decision survive another real market path?”**

This is a workflow feature rather than a new prediction product. It should not ask a generic chatbot to decide, convert agent conviction into a probability, or place an order. It makes the existing research, risk, paper-account, replay, review, and trust machinery visible as one artifact. That is consistent with the documented product direction: a local-first NSE research and paper-practice terminal whose value is continuity from observation to review, while prediction skill and hosted cutover remain unproven or gated. ([`README.md`](../../README.md); [`PROJECT_PRESENTATION.md`](../../PROJECT_PRESENTATION.md); [`IMPLEMENTATION_STATUS.md`](../../IMPLEMENTATION_STATUS.md))

### Why this repository is unusually ready

- **The decision is already a structured object.** `DecisionPlanBody` captures the market snapshot, evidence items with publication/availability times, thesis, expected outcome, counter-thesis, invalidation, holding period, entry/stop/target/time exit, sizing, expected costs, maximum loss, trade/no-trade decision, and revisions. The server freezes the market snapshot and risk preview and rejects later evidence-time rewrites. That is almost the complete input contract for a decision recorder. ([`src/lib/quant/decision-plan.ts`](../../src/lib/quant/decision-plan.ts); [`src/lib/paper-book/commands.ts`](../../src/lib/paper-book/commands.ts); [`src/lib/local-schemas.ts`](../../src/lib/local-schemas.ts))
- **The paper book already supplies an audit-grade outcome spine.** `BookState` contains orders, fills, reservations, protections, integer-paise ledger entries, append-only events, idempotent intents, risk-day state, worker lease, journal, conversations, and versioned research items. Fills retain quote observations, provider times, fill method, reference price, liquidity limitation, slippage, charges, and sequence numbers; `reconcile()` checks cash, ledger, positions, reservations, order fills, and sequence uniqueness. ([`src/lib/paper-book/types.ts`](../../src/lib/paper-book/types.ts); [`src/lib/paper-book/engine.ts`](../../src/lib/paper-book/engine.ts); [`src/lib/paper-book/views.ts`](../../src/lib/paper-book/views.ts))
- **The replay engine already models the important “what if” mechanics.** `flight-sim.ts` hides future bars and news, supports decision/execution/risk/news/blind modes, applies latency and participation caps, produces partial fills, models spread and charges, detects gaps/halts/suspected corporate-action discontinuities, and records thesis changes and blind decisions. `FlightSimulatorPage` already saves replay results as `REPLAY_RESULT` research items. ([`src/lib/quant/flight-sim.ts`](../../src/lib/quant/flight-sim.ts); [`src/components/app/pages/FlightSimulatorPage.tsx`](../../src/components/app/pages/FlightSimulatorPage.tsx); [`src/lib/quant/quant.test.ts`](../../src/lib/quant/quant.test.ts))
- **Outcome grading already separates the useful dimensions.** `attributeOutcome()` distinguishes thesis quality, execution quality, process quality, and P&L; it can identify “good thesis, bad execution” and “good trade, bad process.” `executionFacts()` links fills into entry/exit facts, while `judgeThesis()` refuses to over-resolve a daily bar when stop and target are both touched. ([`src/lib/quant/decision-plan.ts`](../../src/lib/quant/decision-plan.ts); [`src/lib/quant/quant.test.ts`](../../src/lib/quant/quant.test.ts))
- **Evidence and trust are already product surfaces, not only backend concepts.** `EvidenceClaim` supports source, publication time, availability time, observation, calculation, model version, decision, outcome, contradictions, and historical help; `WhyButton` renders the evidence graph and explicitly reports unknown timing. The Trust Control Room measures quote freshness/coverage, reconciliation, news, research freshness, copilot configuration, worker heartbeat, backup status, and unavailable capabilities. ([`src/lib/quant/evidence.ts`](../../src/lib/quant/evidence.ts); [`src/components/app/evidence/WhyButton.tsx`](../../src/components/app/evidence/WhyButton.tsx); [`src/components/app/pages/TrustControlRoom.tsx`](../../src/components/app/pages/TrustControlRoom.tsx); [`src/lib/quant/trust.ts`](../../src/lib/quant/trust.ts))
- **The learning and research layers can feed the recorder without becoming account authority.** `StrategyLabPage` stores typed hypotheses, assumptions, falsifiers, baselines, walk-forward checks, costs, placebo tests, sensitivity, and shadow verdicts. `TrackRecordPage` matures forecasts only after the observed horizon and reports baseline, calibration, abstentions, and cost-adjusted outcomes. The research graph separately preserves stage events, analyst reports, challenge status, cutoffs, and research-only authority. ([`src/lib/quant/strategy.ts`](../../src/lib/quant/strategy.ts); [`src/components/app/pages/StrategyLabPage.tsx`](../../src/components/app/pages/StrategyLabPage.tsx); [`src/lib/quant/track-record.ts`](../../src/lib/quant/track-record.ts); [`src/components/app/ResearchWorkspace.tsx`](../../src/components/app/ResearchWorkspace.tsx))
- **The current gap is integration, not invention.** Replay results are currently generic research items, while decision plans and their attribution live in the journal lifecycle. The roadmap explicitly leaves a “shared immutable cross-stage decision bundle” and “archived-evidence replay/manifests” open. Decision Flight Recorder should close that seam rather than add another isolated page. ([`src/hooks/use-workspace-prefs.ts`](../../src/hooks/use-workspace-prefs.ts); [`src/components/app/pages/ResearchNetworkPage.tsx`](../../src/components/app/pages/ResearchNetworkPage.tsx); [`ROADMAP_IMPLEMENTATION_20261015.md`](../../ROADMAP_IMPLEMENTATION_20261015.md))

### Smallest end-to-end demo journey

1. **Open one supported NSE equity.** The stock workspace shows the provider quote, as-of time, session/freshness status, chart/history, events/news, research-only committee output, and explicit unavailable fields. The user clicks **Create decision flight** from the existing Decision Canvas. No market value is invented if the provider is unavailable. ([`src/components/app/stocks/DecisionCanvas.tsx`](../../src/components/app/stocks/DecisionCanvas.tsx); [`src/components/app/stocks/StockDetail.tsx`](../../src/components/app/stocks/StockDetail.tsx); [`src/lib/quote-eligibility.ts`](../../src/lib/quote-eligibility.ts))
2. **Write and lock the decision.** The existing plan form collects the thesis, expected outcome, counter-thesis, invalidation, evidence, horizon, entry/stop/target, sizing, maximum loss, and trade/no-trade choice. “Lock & rehearse” creates an immutable packet with the current plan, evidence IDs, risk preview, trust snapshot, source/cutoff metadata, and a content hash. It does not submit an order.
3. **Choose one explicit branch.** The user either links the plan to the existing paper order ticket or records **NO_TRADE**. If they trade, the existing server paper path remains the only account mutation path: it fetches an eligible server quote, replays an identical intent safely, and commits through the paper-book authority. ([`src/routes/api/paper/$.ts`](../../src/routes/api/paper/$.ts); [`src/lib/paper-book/commands.ts`](../../src/lib/paper-book/commands.ts))
4. **Rehearse the same decision blind.** The flight opens a randomly selected, sufficiently warmed historical segment for the same symbol. The user sees only bars and news available by the cursor, then uses the same action/quantity/stop/target/latency/participation settings. Future bars and future news remain hidden by the existing simulator contract. If the required history/news/coverage is unavailable, the flight is visibly unavailable rather than filled with a fixture. ([`src/lib/quant/flight-sim.ts`](../../src/lib/quant/flight-sim.ts); [`src/components/app/pages/FlightSimulatorPage.tsx`](../../src/components/app/pages/FlightSimulatorPage.tsx); [`README.md`](../../README.md))
5. **Reveal the “three timelines” result.** One screen shows: (a) **Knowable then** — the locked evidence graph and cutoff; (b) **What happened** — the paper order, quote/fill/charge/ledger/protection audit and current outcome; and (c) **What-if** — replay return, buy-and-hold comparison, drawdown, partial fills, spread/charges, gap/stop markers, and the user’s blind decision score. The screen labels deterministic simulation assumptions and leaves unresolved cases unresolved.
6. **Close with a review action.** The recorder links back to Review Hub and asks for a reflection. It displays thesis/execution/process attribution, plan revisions, behavior warnings, and a follow-up such as “rehearse a smaller size” or “record why this no-trade was correct.” Review Hub already prioritizes invalidated, overdue, open, and unreflected decisions, so the feature has a natural return surface. ([`src/components/app/pages/ReviewHub.tsx`](../../src/components/app/pages/ReviewHub.tsx); [`src/components/app/pages/DecisionLifecyclePage.tsx`](../../src/components/app/pages/DecisionLifecyclePage.tsx); [`src/lib/quant/behavior.ts`](../../src/lib/quant/behavior.ts))

The demo feels magical because the user can move from a live-looking but bounded decision to a hidden historical path and back to an auditable review without leaving the same decision identity. It remains honest because the replay is a rule-based what-if, the paper order is virtual, AI remains research-only/read-only, and the feature never claims that one rehearsal predicts the next stock move.

## 2. Technical recommendation: model, surfaces, APIs, workers, and evaluation

### Data model and authority boundaries

Define a typed `DecisionFlight` application model. Do not create a second cash/position ledger and do not copy balances into the replay record.

```text
DecisionFlight
  id, version, status, created_at, updated_at
  plan_id, journal_id, order_id | null, symbol, side, decision
  decision_packet_hash
  evidence_bundle: [{ id, kind, source, published_at, available_at, statement }]
  market_snapshot, risk_preview, trust_snapshot
  replay_manifest: {
    provider, interval, bars_as_of, news_archive_as_of,
    source_fingerprints, start_cursor, hidden_until_cursor
  }
  scenario: { quantity, entry, stop, target, time_exit,
              latency_bars, participation, starting_cash_paise }
  replay_events: [{ seq, cursor, at, action, thesis, visible_evidence_ids }]
  replay_fills, markers, summary
  live_outcome: { status, execution_facts, attribution, matured_at } | null
  counterfactuals: [{ name, assumptions, result }] | null
  evaluation: { coverage, knowability, unresolved_reasons, evaluator_version }
```

The minimum implementation can use the existing `research_items` row with `kind: "BUNDLE"` for the immutable packet and `kind: "REPLAY_RESULT"` for the replay projection, because those kinds, versioning, history, and user-scoped repository methods already exist. Add append-only `DECISION_FLIGHT_*` events to the paper book’s existing event stream for creation, action, advance, finalization, and maturity; the event stream is the audit trail, while the research item is the read model. ([`src/hooks/use-workspace-prefs.ts`](../../src/hooks/use-workspace-prefs.ts); [`src/lib/local-schemas.ts`](../../src/lib/local-schemas.ts); [`src/lib/paper-book/types.ts`](../../src/lib/paper-book/types.ts); [`src/lib/paper-book/engine.ts`](../../src/lib/paper-book/engine.ts))

After hosted cutover is approved, introduce explicit InsForge tables only if query volume or row-level access requires them: `decision_flights`, `decision_flight_events`, and `decision_flight_outcomes`, all owned by `auth.users(id)` and written through the same server-side/CAS authority. Until then, keep the default local profile and `.local-data/workspace.json` authoritative; do not enable InsForge merely to ship this feature. The migration notes explicitly say hosted activation remains pending and that local data must be preserved during the transition. ([`README.md`](../../README.md); [`INSFORGE_MIGRATION.md`](../../INSFORGE_MIGRATION.md); [`src/lib/insforge-book.server.ts`](../../src/lib/insforge-book.server.ts))

The packet must include canonical JSON hashing for the plan, evidence, risk preview, trust snapshot, replay configuration, and source fingerprints. The news archive already provides content hashes, story versions, supersession, raw payload, and first-observation time; the flight should reference those hashes rather than copy unverified headline text into a new authority. ([`backend-extension/quantplus_intelligence/news/archive.py`](../../backend-extension/quantplus_intelligence/news/archive.py))

### UI surfaces

- **Stock workspace:** add `Lock & rehearse` beside the existing Decision Canvas flow. Show eligibility first: provider/history/news coverage, required evidence times, and whether this is a paper or no-trade path. Reuse `DecisionCanvas.tsx`, `OrderPanel.tsx`, and the existing risk preview rather than designing a second ticket. ([`src/components/app/stocks/DecisionCanvas.tsx`](../../src/components/app/stocks/DecisionCanvas.tsx); [`src/components/app/stocks/OrderPanel.tsx`](../../src/components/app/stocks/OrderPanel.tsx))
- **Decision lifecycle:** add a `Decision Flight` status strip to `DecisionLifecyclePage.tsx`: packet locked, paper linked, rehearsal pending/running, live outcome pending/matured, and reflection complete. The current lifecycle already renders plan readiness, revisions, execution facts, and attribution, so this is an extension of the canonical record. ([`src/components/app/pages/DecisionLifecyclePage.tsx`](../../src/components/app/pages/DecisionLifecyclePage.tsx))
- **New focused route:** add `DecisionFlightPage.tsx` and a `decision-flight` workspace route. Use a three-column or tabbed layout: locked evidence, replay cockpit, and outcome comparison. `ProfessionalChart`, `flight-sim` controls, `WhyButton`, and existing status/Pill components are sufficient for the first version. ([`src/components/app/pages/FlightSimulatorPage.tsx`](../../src/components/app/pages/FlightSimulatorPage.tsx); [`src/components/app/evidence/WhyButton.tsx`](../../src/components/app/evidence/WhyButton.tsx); [`src/components/app/workspace-routes.ts`](../../src/components/app/workspace-routes.ts))
- **Review Hub:** add “Flights needing reveal,” “live outcome matured,” and “reflection due” to the existing queue. The user should be able to open the exact plan and packet, not search for same-symbol fills. ([`src/components/app/pages/ReviewHub.tsx`](../../src/components/app/pages/ReviewHub.tsx))
- **Research Network:** make a completed flight an attachable `BUNDLE`/`REPLAY_RESULT` evidence item with version history and export. Keep the current single-user/local copy and label future team review as gated. ([`src/components/app/pages/ResearchNetworkPage.tsx`](../../src/components/app/pages/ResearchNetworkPage.tsx))
- **Trust surface:** display packet hash, source/cutoff coverage, provider status, missingness, replay assumptions, worker heartbeat, and reconciliation state. Any unavailable branch should say why it cannot be run. This follows the existing Trust Control Room convention that unavailable capabilities are listed rather than averaged away. ([`src/components/app/pages/TrustControlRoom.tsx`](../../src/components/app/pages/TrustControlRoom.tsx); [`src/lib/quant/trust.ts`](../../src/lib/quant/trust.ts))

### APIs and server execution

Protect the new routes with the same request authentication and local/InsForge book resolution used by the current agent and paper routes. The browser should not call FYERS, NSE, or the intelligence backend directly; it should call the frontend server, which owns provider keys and validates the packet. ([`src/routes/api/agent/$.ts`](../../src/routes/api/agent/$.ts); [`src/lib/request-auth.server.ts`](../../src/lib/request-auth.server.ts); [`src/lib/workspace-session.ts`](../../src/lib/workspace-session.ts))

Recommended minimal API contract:

| Route | Responsibility | Mutation boundary |
| --- | --- | --- |
| `POST /api/decision-flights/prepare` | Validate an existing plan, resolve typed evidence/research/news/history, calculate eligibility, create the immutable packet/hash, and return a flight ID. | Workspace/research record plus append-only event; never a paper balance mutation. |
| `GET /api/decision-flights/:id` | Return the packet, current replay read model, live paper link, trust state, and allowed next actions. | Read-only. |
| `POST /api/decision-flights/:id/action` | Record a blind decision/thesis/action at the current cursor using an idempotent action ID; reject stale cursor/version or changed packet hash. | Flight event stream only. |
| `POST /api/decision-flights/:id/step` | Advance the server-owned replay through one or more bars, revealing only data allowed by the manifest. | Flight event stream/read model only; never `BookState` cash/holdings. |
| `POST /api/decision-flights/:id/finalize` | Calculate replay summary, counterfactuals, unresolved reasons, and save the review projection. | Flight record/research item; no order creation. |
| `GET /api/decision-flights/:id/export` | Export the packet, manifest, events, source hashes, evaluation version, and outcome. | Read-only export. |

The paper branch continues through `/api/paper/orders` and the existing `BookService`; it should receive only the user’s explicit order submission, never a replay action. This keeps the current separation between research/replay and account authority. ([`src/routes/api/paper/$.ts`](../../src/routes/api/paper/$.ts); [`src/lib/book-service.server.ts`](../../src/lib/book-service.server.ts); [`src/lib/copilot/context.server.ts`](../../src/lib/copilot/context.server.ts))

### Workers and maturation

1. Add a small `decision-flight` job runner or extend the existing paper worker with a separate savepointed pass. It should not run the replay cursor on a timer; the user’s explicit action/step is the replay clock. The worker’s responsibility is to mature linked live decisions after the exchange-session horizon, resolve completed bars only, and emit one idempotent `DECISION_FLIGHT_MATURED` event.
2. Use the existing exchange calendar and completed-bar policy for maturity. Pending or unpriced outcomes remain pending; no calendar-day shortcut, same-session candle, generated label, or interpolated bar is allowed. The intelligence maturation worker already demonstrates this fail-closed pattern: it waits for completed provider bars and retries unresolved horizons. ([`src/lib/exchange-calendar.ts`](../../src/lib/exchange-calendar.ts); [`backend-extension/quantplus_intelligence/scheduler.py`](../../backend-extension/quantplus_intelligence/scheduler.py); [`backend-extension/quantplus_intelligence/history.py`](../../backend-extension/quantplus_intelligence/history.py))
3. Reuse the current worker lease, savepoint, hosted/local routing, and reconciliation status. A flight failure must not roll back or corrupt a paper order; a paper-book failure must not silently finalize a flight. ([`src/lib/paper-worker.server.ts`](../../src/lib/paper-worker.server.ts); [`src/lib/paper-book/engine.ts`](../../src/lib/paper-book/engine.ts))

### Evaluation and acceptance

**Correctness gates:**

- No future bars or news are returned before the replay cursor; decision-time actions cannot fill on the decision bar unless the configured execution contract explicitly says so. Existing replay and flight-simulator tests provide the pattern for these assertions. ([`src/lib/replay.test.ts`](../../src/lib/replay.test.ts); [`src/lib/quant/quant.test.ts`](../../src/lib/quant/quant.test.ts))
- A flight action cannot mutate the main or practice paper book. Compare book version, sequence, cash, holdings, orders, fills, and ledger before/after every replay command.
- A packet’s plan, evidence availability times, trust snapshot, replay manifest, and source hashes are immutable. Reusing an action ID with a changed payload rejects; retrying the same payload returns the same result, following the paper-book idempotency contract. ([`src/lib/paper-book/commands.ts`](../../src/lib/paper-book/commands.ts))
- Stop/target ambiguity, missing history, unavailable news, unverified fees, suspected corporate actions, and provider failures produce `UNRESOLVED`/`UNAVAILABLE` with reasons, not a grade or fabricated observation. The existing flight simulator and decision attribution already use explicit markers/nulls for several of these cases. ([`src/lib/quant/flight-sim.ts`](../../src/lib/quant/flight-sim.ts); [`src/lib/quant/decision-plan.ts`](../../src/lib/quant/decision-plan.ts))
- Every displayed number has a source/as-of/cutoff or a named deterministic formula. Every score has an evaluator version and sample count. `WhyButton` should resolve the same claim graph for packet, replay, and outcome values. ([`src/lib/quant/evidence.ts`](../../src/lib/quant/evidence.ts); [`src/lib/copilot/grounding.ts`](../../src/lib/copilot/grounding.ts))

**Product evaluation:** pre-register a small set of workflow measures before the pilot: eligible-plan-to-flight start rate, flight completion rate, percentage of matured decisions with a reflection, time from decision to review, and user-reported ability to answer “what did I know?” The first release should evaluate workflow completion and evidence fidelity, not return uplift. Directional accuracy, Brier score, calibration, and strategy performance remain separate maturity-gated measurements; the repository explicitly records that existing research configurations did not beat the best constant baseline and that human-reviewed/matured forecast gates remain open. ([`src/components/app/pages/TrackRecordPage.tsx`](../../src/components/app/pages/TrackRecordPage.tsx); [`IMPLEMENTATION_STATUS.md`](../../IMPLEMENTATION_STATUS.md); [`PREDICTION_PERFORMANCE.md`](../../PREDICTION_PERFORMANCE.md))

### Compounding proprietary dataset and workflow advantage

Each completed flight creates a structured, time-aware record of:

- what evidence was selected, ignored, contradicted, or unavailable;
- the thesis, counter-thesis, invalidation, horizon, sizing logic, and risk budget;
- every plan revision, stop widening, delay, no-trade decision, behavior prompt, and paper intent;
- the provider observation, fill method, liquidity limitation, charges, protection events, and ledger outcome;
- the hidden historical actions, visible news count, thesis revisions, partial fills, gaps, and counterfactual results; and
- the user’s later reflection and thesis/execution/process attribution.

This is a more defensible moat than a growing pile of generated stock opinions. More flights can improve **personalized process review**—for example, matching a user’s next rehearsal to repeated stop-widening or poor-data behavior—without claiming that the system predicts prices. Aggregated, consented, de-identified flight records could later support better evaluation of research workflows, evidence usefulness, execution assumptions, and abstention, but those are future research questions. The default local-first posture and consent-based behavior analysis make privacy a product rule: do not silently export journal text or train a model on it. ([`src/lib/quant/behavior.ts`](../../src/lib/quant/behavior.ts); [`src/components/app/pages/BehaviorPage.tsx`](../../src/components/app/pages/BehaviorPage.tsx); [`src/lib/workspace-session.ts`](../../src/lib/workspace-session.ts); [`INSFORGE_MIGRATION.md`](../../INSFORGE_MIGRATION.md))

## 3. Risks, explicit non-goals, and a 90-day build outline

### Main implementation risks and mitigations

| Risk | Why it matters here | Mitigation for Decision Flight Recorder |
| --- | --- | --- |
| Hindsight leakage | The value proposition collapses if later news, bars, current research, or revised evidence enter the original decision. The repository has already treated point-in-time cutoffs as an integrity boundary. ([`MASTER_ROADMAP.md`](../../MASTER_ROADMAP.md); [`backend-extension/quantplus_intelligence/research_grounding.py`](../../backend-extension/quantplus_intelligence/research_grounding.py)) | Hash one packet at lock time; preserve available-at times; freeze source fingerprints; hide future bars/news by cursor; reject evidence after cutoff; test late articles, same-bar fills, and changed manifests. |
| False precision in replay | Daily OHLC cannot order a same-bar stop and target; provider history may have gaps, halts, or suspected corporate actions; paper execution does not model exchange queue priority or every broker rule. ([`src/lib/quant/decision-plan.ts`](../../src/lib/quant/decision-plan.ts); [`src/lib/quant/flight-sim.ts`](../../src/lib/quant/flight-sim.ts); [`IMPLEMENTATION_STATUS.md`](../../IMPLEMENTATION_STATUS.md)) | Show assumptions and markers; return unresolved when ordering is unknowable; label spread/participation/latency as a simulation; never call the result exchange-realistic. |
| Incomplete evidence coverage | Current news archive/backfill, multilingual interpretation, corporate-action adjustment, and provider entitlements still have open gates. ([`ROADMAP_IMPLEMENTATION_20261015.md`](../../ROADMAP_IMPLEMENTATION_20261015.md); [`INTELLIGENCE.md`](../../INTELLIGENCE.md)) | Add an eligibility preflight; permit a flight only with the minimum required bars and packet fields; otherwise show the exact missing capability and keep the plan usable without a fake result. |
| Local/InsForge split authority | Local mode is still authoritative and hosted activation is pending; silently mixing flight state across providers would create another migration problem. ([`README.md`](../../README.md); [`INSFORGE_MIGRATION.md`](../../INSFORGE_MIGRATION.md)) | Ship local-first; route all writes through shared commands and one book service; keep replay outside account authority; add InsForge schema only after fresh isolation/worker/readback approval. |
| Persuasive AI contamination | Research conviction is explicitly uncalibrated and the copilot is read-only. Turning prose into a flight score would recreate the unsupported prediction surface. ([`src/components/app/stocks/AgentPrediction.tsx`](../../src/components/app/stocks/AgentPrediction.tsx); [`src/lib/copilot/context.server.ts`](../../src/lib/copilot/context.server.ts); [`IMPLEMENTATION_STATUS.md`](../../IMPLEMENTATION_STATUS.md)) | No model is required in v1. If a summary is added later, feed it the locked packet and typed outcome only, run the existing grounding check, and label it explanatory rather than authoritative. |
| Privacy and behavioral overreach | Journal text and behavior patterns are sensitive and current behavior analysis is deliberately consent-based and local. ([`src/lib/quant/behavior.ts`](../../src/lib/quant/behavior.ts); [`src/components/app/pages/BehaviorPage.tsx`](../../src/components/app/pages/BehaviorPage.tsx)) | Add consent for longitudinal learning/export; keep raw reflections local by default; do not add a leaderboard, social sharing, or hidden profiling. |
| Storage growth and latency | The local book rewrites the whole JSON document, and the status notes that latency grows with book size. ([`IMPLEMENTATION_STATUS.md`](../../IMPLEMENTATION_STATUS.md)) | Store compact immutable packet/event summaries, cap retained replay payloads, keep large raw archives in their existing stores, and measure book size/latency before enabling hosted migration. |
| Low repeat usage | A flight that requires too much writing or waits days for maturation will not become a habit. | Make the minimum packet one click from a complete plan; support no-trade flights; allow replay completion immediately; make live maturation a later notification, not a blocker. |

### Explicitly do not build yet

- **No live broker routing, live-money authority, or automatic paper-order submission from a flight.** The user must explicitly submit through the existing paper boundary; the project is paper-only. ([`Plan.md`](../../Plan.md); [`src/routes/api/paper/$.ts`](../../src/routes/api/paper/$.ts))
- **No options, futures, BSE/global execution, or contract/lot expansion.** The current release explicitly excludes observed option chains and several non-NSE scopes. ([`IMPLEMENTATION_STATUS.md`](../../IMPLEMENTATION_STATUS.md); [`src/components/app/pages/CapabilitiesPage.tsx`](../../src/components/app/pages/CapabilitiesPage.tsx))
- **No generic chatbot, social feed, public leaderboard, copy trading, or multi-reviewer collaboration.** The feature’s moat is private decision lineage, not engagement content; hosted collaboration is still gated. ([`src/components/app/pages/ResearchNetworkPage.tsx`](../../src/components/app/pages/ResearchNetworkPage.tsx))
- **No unsupported stock prediction or “flight score” presented as probability.** A replay can answer what a defined rule would have done on a defined path; it cannot establish future directional edge. ([`src/lib/quant/track-record.ts`](../../src/lib/quant/track-record.ts); [`PREDICTION_PERFORMANCE.md`](../../PREDICTION_PERFORMANCE.md))
- **No autonomous agent that rewrites a thesis, changes risk, or selects a replay to flatter the result.** User actions and deterministic rules own the packet; research remains separate from account authority. ([`MASTER_ROADMAP.md`](../../MASTER_ROADMAP.md); [`src/lib/paper-book/commands.ts`](../../src/lib/paper-book/commands.ts))
- **No full causal attribution, personalized optimizer, or training-data export before consent and evaluation.** Counterfactuals should remain explicitly parameterized what-ifs, not claims about what “caused” a return.

### Phased 90-day build outline

#### Days 0–15 — Lock the contract and ship a local vertical slice

- Define `DecisionFlight`, canonical hashing, status transitions, event names, eligibility rules, and unresolved states.
- Link an existing decision plan to a `BUNDLE` packet and `REPLAY_RESULT` projection in local `research_items`; record lifecycle events in the existing book event stream.
- Add `Lock & rehearse` from Decision Canvas and a minimal flight route that imports the plan into `flight-sim`.
- Support one symbol, daily provider bars, blind BUY/HOLD/SELL, same plan quantity/stop/target, and no-trade branch.
- Acceptance: one local journey can lock a plan, complete a no-lookahead rehearsal, save the result, reload it, and prove that main/practice book hashes are unchanged. Relevant checks include typecheck, focused quant/replay tests, existing `npm test`, and the browser route coverage. ([`package.json`](../../package.json); [`src/lib/replay.test.ts`](../../src/lib/replay.test.ts); [`src/lib/quant/quant.test.ts`](../../src/lib/quant/quant.test.ts))

#### Days 16–35 — Make the flight server-authoritative and auditable

- Add authenticated prepare/get/action/step/finalize/export routes.
- Move replay state transitions behind the server boundary; make action IDs, cursor/version checks, packet hashes, and event sequences idempotent.
- Add provider/history/news manifest fingerprints and explicit unavailable/coverage responses.
- Add fault tests for duplicate actions, stale cursors, changed payloads, provider failure, malformed history, missing news, same-bar ambiguity, and attempted paper-book mutation.
- Acceptance: restart/reload does not change the outcome; replay never writes cash, holdings, orders, fills, or ledger; every visible metric resolves to a packet field or deterministic formula.

#### Days 36–55 — Connect the live paper outcome and review surfaces

- Add `Decision Flight` status to `DecisionLifecyclePage` and `ReviewHub`.
- Link the existing paper order/audit to the flight; use `executionFacts()` and `attributeOutcome()` for the live side.
- Add a savepointed maturity pass to the server worker using completed exchange bars and the existing calendar; emit one maturity event and leave insufficient history pending.
- Add three-pane comparison: knowable evidence, live paper audit, and replay/counterfactual result.
- Acceptance: a paper order and its flight remain distinct but linked; a risk-reducing exit still works; a plan can be reviewed after a browser restart; no outcome is scored before its horizon.

#### Days 56–75 — Trust, evidence graph, and learning loop

- Register packet/replay/outcome claims with `EvidenceClaim` and render `Why am I seeing this?` for every derived value.
- Add trust/preflight panels for provider freshness, history coverage, news archive availability, worker heartbeat, reconciliation, and replay assumptions.
- Add reflection prompts based on existing behavior patterns and plan revisions, with consent and sample-size labels.
- Allow completed flights to attach to Research Network bundles and Strategy Lab studies without turning them into predictions.
- Acceptance: browser workflows cover lock, no-trade, paper-link, replay, unavailable state, review, export, and offline read-only behavior; axe/navigation checks remain green.

#### Days 76–90 — Evaluation, soak, and readiness decision

- Freeze a small product evaluation registration: completion, review latency, reflection completion, evidence/cutoff accuracy, and user-reported clarity of the four questions (know, believe, risk, learn).
- Run adversarial no-lookahead and paper-isolation suites, local restart/restore drills, simulated-clock maturity tests, and the existing full checks.
- Run a bounded internal demo/pilot with real provider data only where coverage is available; report missingness, unresolved flights, latency, and provider failures.
- Decide whether the feature is ready for opt-in InsForge schema work. Do not turn on hosted flags or deploy as part of this feature; the migration document requires fresh hosted isolation/worker checks and final readback approval first. ([`INSFORGE_MIGRATION.md`](../../INSFORGE_MIGRATION.md); [`ROADMAP_IMPLEMENTATION_20261015.md`](../../ROADMAP_IMPLEMENTATION_20261015.md))

The 90-day success condition is not “the feature predicts better.” It is: **a user can create one evidence-locked decision, practise the same rule against a hidden real-history path, see the paper-account consequences, understand every limitation, and return later to a structured review that compounds into better process data.** That is the narrowest feature capable of making the existing Quant Plus foundations feel like one product.
