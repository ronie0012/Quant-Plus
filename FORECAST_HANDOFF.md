# Forecast system implementation — handoff log

Design: `research_notes/Agentic Recommendation Redesign/blueprint.md` (10 moves).
Code: `backend-extension/quantplus_intelligence/forecast/` (pure Python, no new deps).
Tests: `backend-extension/tests/test_forecast_*.py`.
Run tests: `cd D:\Quant-Plus\backend-extension; D:\Quant-Plus\.local-data\backend-runtime\Scripts\python.exe -B -m pytest tests/test_forecast_*.py -q -p no:cacheprovider`

Rules followed: numbers in code, LLM only via injected callables (tests are offline),
RESEARCH_ONLY, forward-only scoring, no Supabase, no deployment, no commits.

## Status (updated after each step)

| # | Move | Module | Status |
|---|------|--------|--------|
| 1 | Forecast Cards + proper scoring | `schema.py`, `scoring.py`, `baselines.py` | done, tested |
| 2 | Listwise sector tournaments | `tournament.py` | done, tested |
| 3 | Disclosure event library + concall diffs | `events.py`, `textdiff.py` | done, tested |
| 4 | Silicon crowd forecasters + aggregation | `forecasters.py`, `aggregate.py` | done, tested |
| 5 | Blindfold protocol | `evidence.py` | done, tested |
| 6 | Risk-first (vol + conformal ranges) | `risk.py`, `calibration.py` | done, tested |
| 7 | Meta-labeling on core | `metalabel.py` | done, tested |
| 8 | Executable falsifiers | `falsifiers.py` | done, tested |
| 9 | Personal fit layer | `personal.py` | done, tested |
| 10 | Hash-chained proof ledger | `ledger.py` | done, tested |
| W | Wildcards: robustness, disagreement | `robustness.py` | done, tested |
| S | Service + API routes | `service.py`, `forecast_api.py`, `api.py` | done, tested |
| F | Frontend Forecast Card on stock page | `ForecastCard.tsx`, `forecast-api.ts`, routes | done, typecheck+build pass |

## Log
- 2026-10-20: all 10 moves + wildcards implemented in `forecast/` and composed in `service.py`.
  `tests/test_forecast_system.py`: 22 passed (hermetic, offline, fake LLM callables).
- Backend routes (under /api/v1, website key): GET/POST `stocks/{sym}/forecast?horizon=5|20`,
  GET `forecast/scoreboard`, POST `forecast/settle` (operator only, NOT proxied). 24 tests pass.
  Ledger file: env `FORECAST_LEDGER_PATH` (default `data/forecast_ledger.sqlite3` in backend cwd).
- Frontend: `src/components/app/stocks/ForecastCard.tsx` (shown above AgentPrediction in
  `StockDetail.tsx`), `src/lib/forecast-api.ts`, new route `src/routes/api/forecast/$.ts`,
  POST added to `src/routes/api/stocks/$.ts`, proxy allowlist in `src/routes/api/agent/$.ts`
  (GET/POST `stocks/{sym}/forecast`, GET `forecast/scoreboard`; settle is NOT browser-reachable).
- Verified: 340/340 backend-extension tests, `tsc --noEmit`, eslint on changed files,
  `node scripts/test-agent-proxy.mjs`, `npm run build`. Extension installed into
  `D:\QP\agent-service` with `scripts/install-intelligence-backend.py`; app imports and
  registers `/api/v1/stocks/{stock}/forecast`, `/api/v1/forecast/scoreboard`, `/api/v1/forecast/settle`.
- NOT done: backend process not restarted; no live end-to-end forecast generated (would bill
  ~6 model calls per stock). No commits made.

## What each move does today vs what is still unwired

| Move | Working now | Still to wire (next steps) |
|---|---|---|
| 1 Forecast Card + scoring | Card schema, Brier/log-loss/CRPS/skill/reliability/coverage, scoreboard API, UI | Track Record page section showing reliability + coverage curves from `/api/forecast/scoreboard` |
| 2 Tournaments | `tournament.run` + Plackett-Luce + `llm_ranker` + `daily_ic` | Daily job: per sector (catalog `stock_catalog()` sector), build blind blocks with `evidence.render`, rank, store strengths; settle daily IC; API + UI "sector rank" |
| 3 Event library | `events.classify`, PIT `in_window`, `study`, `admit` (Bonferroni-style bar), `event_prior`; `textdiff.diff` + grounded `labelled_changes` | Feed real announcements (backend `app/data_acquisition` NSE/BSE collectors are NOT_COLLECTED) into `events=` of `service.build`; transcripts source for diffs; run forward event studies |
| 4 Silicon crowd | 6 LLM diets + momentum/reversal baselines, strict parse, track-record weights, debias, extremize | API passes no headlines/flows yet, so `news` and `flows` forecasters abstain. Wire `news_service.stock_news` headlines and delivery/flows into `forecast_api._generate` |
| 5 Blindfold | Blind render (name/date scrub, no ticker); `robustness.memorisation_gap` | Script to run named vs blind on a sample and report gaps |
| 6 Risk-first | EWMA vol, quantiles, conformal margin (auto after 30 settled), drawdown, event shock | Benchmark vs India VIX/GARCH once settled data exists |
| 7 Meta-label | `MetaLabeler` (down-only, refuses <50 labels), `compare` holdout | Feed forward-settled core trades from backend `app/forward` records; promotion via existing G1–G5 gates |
| 8 Falsifiers | Safe DSL, `evaluate`, `defaults`; rules shown on card | Live watcher: evaluate each open card's falsifiers on fresh quotes (FYERS stream) and show HEALTHY/WEAKENED/BROKEN + notify |
| 9 Personal fit | `personal.fit` + `behaviour_flags` | Route that accepts paper book (from `.local-data/workspace.json` via frontend server) and UI "What this means for you" |
| 10 Proof ledger | Hash chain, lock-before-outcome, exactly-once settle, verify, scoreboard | Schedule `POST /api/v1/forecast/settle` daily after close (backend `scripts/run_job.py` / schtasks); optional daily public head hash |
| W Wildcards | leave-one-out robustness (on card), memorisation gap, narrative crowding | Pre-register crowding→volatility test |
| Batch | — | Daily forward run over NIFTY 100 (loop `_generate` with pacing; respect day token cap) so the 45-session IC gate can be measured |

## To run / continue
1. Restart backend: `cd D:\QP\agent-service; D:\Quant-Plus\.local-data\backend-runtime\Scripts\python.exe -B -m uvicorn app.main:app --host 127.0.0.1 --port 8000`
2. Frontend: `npm.cmd run dev -- --host 127.0.0.1 --port 8080 --strictPort`, open `/app/stocks/RELIANCE`, press "Generate forecast".
3. Tests: see top of this file; plus `npx tsc --noEmit`, `node scripts/test-agent-proxy.mjs`, `npm run build`.
4. After edits to `backend-extension`, reinstall: `python -B scripts/install-intelligence-backend.py --backend D:\QP\agent-service`, then restart backend.
- Fix: proxy timeout for POST `stocks/{sym}/forecast` raised 20s -> 180s (`src/routes/api/agent/$.ts`);
  ForecastCard re-reads ledger after a failed generate. First live card locked: ADANIENT 5D, p=0.46,
  ~5.4k tokens; news/events/flows forecasters abstained (feeds not wired).
- Phase 2 wiring (backend, tested 27/27): `forecast/inputs.py` (PIT headlines, NSE announcement
  events, results surprise/scheduled, delivery flows; cutoff = last bar's session close),
  `service.generate_live/live_snapshot/status/personal_view/provider_fetch`, ledger side tables
  (`forecast_extras`, `forecast_tournaments`) + tournament IC gate in scoreboard,
  `forecast/jobs.py` CLI (daily, tournament, settle, blind-gap, risk-bench, metalabel, crowding),
  routes GET `stocks/{s}/forecast/status`, POST `stocks/{s}/forecast/personal`.

## Phase 2 completion (2026-10-20) — supersedes the "still to wire" table above

Frontend: `ForecastPanels.tsx` (sector rank, evidence sources/events, crowding, live tripwires,
personal fit with conservative/balanced/aggressive profile stored in localStorage),
`pages/ForecastLedgerSection.tsx` on the Track Record page (Brier skill, log-loss, CRPS, 80% coverage,
calibration table, coverage curve, per-forecaster skill, tournament IC gate, chain status).
Proxy: GET `stocks/{s}/forecast/status` (180s), POST `stocks/{s}/forecast/personal` (only path that
forwards a JSON body, capped at 200 KB). Ledger: WAL + 30s busy timeout (shared by backend and jobs).
Scheduler: `scripts/register-forecast-jobs.ps1` (NOT run; registers settle 16:15, daily 16:30,
tournament 17:30 weekdays).

Verified: 343/343 backend-extension tests; tsc, eslint, proxy test, `npm run build` pass.
Live: `jobs settle|risk-bench|metalabel|crowding` ran (all INSUFFICIENT — no settled data yet,
ledger chain valid); `jobs daily --limit 1` locked ADANIENT 20D (p=0.47) with delivery flows
answering; 5D card reused. ADANIENT had 0 news articles (provider fine; RELIANCE has 17).

| Item | State |
|---|---|
| Daily batch, settlement, tournaments | Done as jobs; need scheduling (run the .ps1) |
| News/flows/events into crowd | Done (`inputs.py`); news only counts headlines before last close |
| Tournaments + sector rank UI | Done; first data after first `tournament` run |
| Event library | Live NSE announcement titles + results surprise/scheduled feed the events slice; forward event studies (`events.study/admit`) still need settled event outcomes — no job yet computes per-event abnormal returns |
| Concall diffs | `textdiff` ready; NO transcript source exists — needs a provider before wiring |
| Blindfold report | `jobs blind-gap` (costs ~2 crowds per symbol) — not run yet |
| Risk bench | `jobs risk-bench` — needs ≥30 settled cards |
| Meta-label | `jobs metalabel` — needs ≥50 settled core forward decisions; backend forward ledger currently has 0 matured rows |
| Tripwires live | Done (status route + UI, 10-min refresh); no push notifications |
| Personal fit | Done (route + UI); other holdings' volatility approximated at 2%/day |
| Proof ledger | Done; daily head appended to `data/forecast_reports/ledger_heads.jsonl` by `settle` |
| Crowding test | Pre-registered in `jobs.CROWDING_PREREG`; runs when ≥30 cards per group settle |

Genuinely remaining: (1) run `scripts/register-forecast-jobs.ps1` (user decision: recurring token
spend); (2) restart backend to load the new status/personal routes; (3) per-event abnormal-return job
feeding `events.study`; (4) a transcript source for concall diffs; (5) optional notifications when a
tripwire turns BROKEN; (6) browser e2e test for the card (not written).
- Added `jobs event-study` (forward abnormal returns per disclosure type from events first seen by
  cards → `events.study/admit`; report in data/forecast_reports). 344/344 tests. Item (3) above is DONE;
  add `event-study` to the weekly schedule once cards carry events.
