# Agentic recommendation system: from oracle to instrument

Date: 2026-10-20. Scope: the stock recommendation graph in `D:\QP\agent-service\app\agents`
and the evaluation, forward, evo and calibration layers around it. Research note only;
nothing here changes code or claims performance.

## 1. Diagnosis: what our own records say

### Takeaway

The architecture is not the problem. The question it asks, the information it is given,
the way it is scored and its cost per forecast are. Adding more agents to the current graph
will not create edge. The foundations around it (PIT discipline, code-owned numbers,
governance, forward clock, death engine) are rare and worth keeping.

### Evidence from the repository

| Finding | Source |
| --- | --- |
| 14 official direction evals, all FAIL; `beats_best_constant=False` on every completed run | `agent-service/REPORT.md` §3.1 |
| LLM paper arm lost −0.33% to −1.18% per eval; holding cash beat it in 6/7 | `data/llm_direction_arm.json` |
| LLM overlay on the deterministic core: −₹88.8k before inference costs, now OFF | `REPORT.md` §10, `data/overlay_ablation_20261010.json` |
| Independent ML audit: null certified at N=477; the only PASS was **volatility skill** | `REPORT.md` §3.4 |
| Devil's Advocate: 72/72 live sessions HEALTHY; BROKEN only on a synthetic canary | `AGENT_REPORT.md` §2.1 |
| Conviction carries no signal (Spearman +0.033); calibration inverted every run | `trader_risk.py` comment, `AGENT_REPORT.md` §3 |
| Inference spend was 43% of the narrow book's paper profit | `REPORT.md` §2.3 |
| Cold runs take 430–980 s; an eval of 24 sessions costs ≈1.2–1.5M tokens | `PREDICTION_PERFORMANCE.md`, `AGENT_REPORT.md` §2.4 |

### Root causes

1. **Wrong question.** Absolute 20-day direction of a single large-cap is mostly market beta
   plus noise. The graph tries to answer it from tape statistics a linear model reads better,
   eight headlines, two index returns and fundamentals that are explicitly `unavailable`
   (`analysts.py:317`). With no information advantage, there is nothing for reasoning to find.
2. **Scoring can't separate skill from luck.** Each eval has 12–17 decisive cases and binary
   accuracy, and holds on decisive moves count as misses. In the "reliably wrong" run
   (accuracy 0.118, p=0.002), `agent_inverse` also scores 0.118: the metric was measuring
   abstention, not an anti-signal (`data/eval_report_retry_20261006T160307Z.json`).
3. **One expensive forecast per stock.** At ~60k tokens and several minutes per name, the
   system can never produce enough forecasts to measure itself. The forward clock needs about
   60 weeks to judge one founder.
4. **Correlated reasoning.** Bull, Bear, Manager and Devil read the same ledger, and the
   models are similar. Debate between near-identical reasoners produces agreement, not
   independent evidence; the all-HEALTHY Devil is the symptom.
5. **Contaminated history.** Models have read 2023–2025 market history. Gao, Jiang & Yan
   (2025) show memorization inflates apparent LLM forecast skill in-sample, which then
   collapses after the training cutoff, and anonymization is only a partial fix. Only forward
   data can promote a signal; the constitution already says this.

## 2. The redesign in one picture

```
 EVIDENCE        typed, PIT, provenance-stamped facts (tape, disclosures, events, flows)
    │
 FORECASTERS     many cheap, diverse, blind-capable LLM + classical forecasters
    │            each sees one evidence slice and emits a PROBABILITY, not BUY/SELL
 AGGREGATOR      code: track-record-weighted median, extremized, per horizon
    │
 CALIBRATOR      code: isotonic + conformal intervals from forward-settled labels
    │
 DECISION        deterministic core decides; meta-label model sizes; personal fit layer
    │
 EXPLAINER       LLM narrates validated numbers; cannot change them (existing pattern)
    │
 LEDGER          hash-chained, timestamped before outcome; settled and scored by code
    │
 EVOLUTION       forecasters live or die by proper scoring rules (existing evo arena)
```

The LLM moves from **oracle** (answer: buy or sell?) to **instrument** (read, extract,
compare, estimate a probability, explain). Code owns aggregation, calibration, money and
death, consistent with the current constitution.

## 3. Ten moves, ranked by expected value

### Move 1: Forecast Cards scored with proper scoring rules (foundation)

Replace `FinalDecision{action,size}` as the research output with a **Forecast Card**:

- `p_outperform` vs NIFTY 50 and vs the sector index at 5 and 20 sessions
- return quantiles (10/50/90) and a volatility forecast for the same horizons
- `p_event_shock`: probability of a ±2σ move driven by a scheduled event
- `abstain: bool` with a reason; abstentions are not scored as wrong

Score forward-only with Brier, log-loss and CRPS, plus Brier **skill** score against
baselines (base rate, momentum, always-outperform, the deterministic core). Accuracy on 12
cases is retired. Abstention becomes a measurable feature through coverage-vs-skill curves
(selective prediction), not a scoring artifact.

Why first: everything else needs a scoreboard that can detect skill in months, not years.

### Move 2: Ask relative questions (listwise sector tournaments)

The user's real decision is "which stock", not "will the market rise". Rank stocks
**within a sector**, which removes most beta, the exact error the M4 counter-trend
guardrail had to patch.

- Each day, sample sets of 5–8 same-sector NIFTY 500 names; a cheap forecaster ranks each set
  listwise on blind evidence cards; aggregate with a Plackett–Luce model into a daily
  cross-sectional score. This mirrors the listwise LLM tournaments at ICLR 2026, which beat
  noisy pairwise single-shot judgments.
- Measure daily rank IC against forward excess returns.

The statistical win: with ~100 names a day, skill becomes detectable fast. If true IC is 0.03
with daily IC dispersion of 0.10, a t-stat of 2 needs about (2 × 0.10 / 0.03)² ≈ 45 trading
days, roughly two months instead of the forward clock's ~60 weeks.

Caution: Sodha (2025) found reasoning models did *worse* than direct LLMs and classical
learners at short-horizon NIFTY ranking once costs were included, with performance degrading
as the universe grew. So use small listwise sets, short budgets, direct (non-thinking) models,
and keep ridge/momentum baselines in every report.

### Move 3: Read what quant models can't (India disclosure edge)

LLMs have a genuine comparative advantage at turning unstructured disclosures into typed
facts. Indian markets publish many of them, and the collectors already exist but are
`NOT_COLLECTED`:

| Signal | Why it might carry information |
| --- | --- |
| Insider/promoter purchases (SEBI PIT/SAST disclosures) | BSE study (2007–2015): insider purchase portfolios earned positive abnormal returns, outsiders did not |
| Promoter pledge creation/release | Forced-selling and governance risk |
| Bulk/block deals | NSE study (2012–2021): volume and delivery rise before bulk deals; a front-running footprint |
| Concall and annual-report **changes** quarter over quarter | "Lazy Prices": changes in report language predict returns, strongest under low attention |
| Guidance revisions vs prior guidance; management credibility (guidance vs actuals) | LLM-native comparison task |
| Auditor resignation, rating actions, related-party transactions | Rare, high-impact red flags |

Pipeline: collector → LLM extraction behind the existing schema gate (`app/events`) →
deterministic **event studies** per event type (CAR at 1/5/20 sessions, PIT universe,
costs) → only event types with forward-confirmed abnormal returns become features. This is an
**Event Alpha Library**, and each entry carries its own evidence card.

The "diff" idea is the most LLM-native: give the model last quarter's and this quarter's
transcripts and ask for typed changes (new risks, dropped claims, tone shift, guidance
deltas). The model compares texts; it does not predict prices.

### Move 4: A silicon crowd instead of one long chain

Replace the serial 10-call graph per stock with **N independent cheap forecasters**, each
with a different information diet: technical-only, disclosures-only, news-only,
flows-only, sector-relative, and one blind "everything" forecaster. Optionally mix model
families.

- Aggregate in code: median, then weights from each forecaster's rolling Brier skill, then
  mild extremization (independent signals justify pushing the consensus away from 0.5).
- Schoenegger et al. (2024): a 12-LLM ensemble was statistically indistinguishable from a
  925-person human crowd on real forecasting questions. They also found LLMs biased above
  50% (acquiescence), so calibrate per forecaster before aggregating.
- Diversity of **information** is what makes errors independent. The current debate has
  diverse roles but identical information.

Cost sketch: ~2k tokens × 6 forecasters × 100 names ≈ 1.2M tokens a day, within the
current 6M operational cap, versus ~60k tokens for a single name today.

### Move 5: Blindfold protocol (contamination firewall)

Run every historical forecast twice: **named** (real ticker, dates) and **blind**
(company → "Company A", dates removed, prices rebased to 100, sector kept).

- Named-vs-blind disagreement estimates memorization per prompt (in the spirit of
  Lookahead Propensity, Gao et al. 2025).
- Only blind-consistent skill counts in historical diagnostics; promotion still requires
  forward data.
- Glasserman & Lin (2023) found anonymized headlines sometimes performed *better* in-sample
  because names distract. Blind mode may be a better default, not just a test.

This partially re-opens burned history for diagnosis without letting it promote anything.

### Move 6: Lead with risk, the one thing we've measured as working

The only audited PASS was volatility skill. Make risk forecasts the hero output:

- expected 5/20-session ranges with **conformal prediction** intervals, which guarantee
  coverage when exchangeability holds and are honest when they fail (coverage is reported)
- drawdown probability for a position, event-volatility windows, "how wrong could I be"
- LLM contribution: regime-aware context. Recent work found in-context LLM volatility
  forecasts beat GARCH baselines when regime-aware, but degraded in high-volatility regimes
  when naive; another study found a daily LLM risk score added nothing beyond implied
  volatility. Benchmark against India VIX and GARCH from day one.

Users value risk honesty, it is provable, and it is safer regulatorily than direction calls.

### Move 7: Meta-labeling on the deterministic core

The overlay failed because an *uncalibrated prompt* vetoed and resized trades. The
principled version (López de Prado's meta-labeling): the deterministic core proposes; a
**secondary statistical model** predicts P(this core trade succeeds) from LLM-extracted
features (event types, disclosure flags, crowd probability, exhaustion); size follows the
calibrated probability within `[0, core]`. `app/memory/calibrate.py` already refuses to
train under 50 forward labels and caps size at half-Kelly. Promotion only through G1–G5
against the core.

### Move 8: Living theses with executable falsifiers

The Manager already writes "one falsifier". Make it machine-checkable: compile falsifiers
into the Strategy DSL (`app/foundry/dsl.py`), for example "close below 20-day low", "VIX
above the 85th percentile", "promoter pledge increases", "results miss". Code watches them
on the live feed and moves the thesis HEALTHY → WEAKENED → BROKEN through the existing
`record_thesis()` versioning, with a notification. Then the Devil finally has teeth: the
market breaks theses, not prose. Each settled thesis gets an autopsy, which connects to the
Decision Flight Recorder concept in `Future Trading Moat/codebase fit.md`.

### Move 9: The personal layer is the real recommendation

A forecast is a commodity; fit is the moat. Recommendation =
`f(calibrated forecast, user's paper portfolio, Investor DNA, behavior history)`:

- next best action, explicitly including "do nothing" and "reduce concentration"
- marginal contribution to portfolio risk and correlation with existing holdings
- behavioral flags from the user's own journal and orders: disposition effect, chasing
  after 5-day blowoffs (the exhaustion features already exist), overtrading
- the same stock can be a good idea for one user and a bad one for another; say so

### Move 10: A public proof ledger

Every Forecast Card is hash-chained and timestamped before its outcome; settlement and
scoring are done by code. The Track Record page shows the crowd vs baselines with Brier
skill, calibration plots, coverage and abstention rate, including bad weeks. Optionally
publish a daily root hash. Almost no retail AI product can show a pre-registered, forward,
cost-aware record. That is the trust moat already argued in `Future Trading Moat/trust moat.md`.

## 4. Out-of-the-box bets (pre-register before testing)

1. **Human + machine hybrid crowd.** Users make blind paper forecasts in the Learn area
   (Investor DNA, company sim). Schoenegger et al. found that simply averaging human and
   machine forecasts beat both. Users' forecasts become a proprietary dataset and a
   forecaster in the arena, and users see their own Brier score next to the AI's.
2. **Narrative crowding sensor.** When news tone, forecasters and retail flows converge
   on one story, treat convergence as a crowding/volatility signal, not confirmation. The
   LLM serves as a synthetic retail reader. Test as a volatility predictor first, a
   contrarian direction signal only if it survives.
3. **Robustness score.** Perturb the evidence (drop one source, flip one headline, shift
   prices ±1σ) and measure how often the forecast flips; `app/eval/perturb.py` exists.
   Fragile forecasts get abstained automatically.
4. **Forecasters as genomes.** Put each forecaster persona and information diet into the evo
   arena; Brier skill decides survival, the seed bank allows resurrection on matching regime
   fingerprints. The system then evolves its own analyst team under statistical death rules.
5. **Ripple-conditioned futures.** Use the Ripple Engine's shocks ("crude +15%",
   "RBI hike") to generate conditional scenario distributions for the user's whole paper
   portfolio, scored later against what actually happened.
6. **Disagreement as a product.** Show where forecasters disagree and why. High
   disagreement predicts higher realized volatility in many forecasting settings; test it here.

## 5. What to keep, and what to retire

Keep: PIT enforcement, code-owned numbers and sizing, claim-grounding validation,
checkpoint/resume, `RESEARCH_ONLY` authority, forward clock, burned-dataset registry,
evo arena, calibration refusal under 50 labels, constitution R1–R15.

Retire as the main research path (keep archival for comparability): the serial
analyst → debate → manager → devil → trader → risk → PM chain per stock, binary 20-day
accuracy gates, LLM-owned direction.

## 6. Phased plan with kill gates

| Phase | Weeks | Build | Kill/advance gate |
| --- | --- | --- | --- |
| P0 Scoreboard | 1–2 | Forecast Card schema; Brier/log-loss/CRPS scoring; baselines; hash-chained ledger; daily forward run on NIFTY 100 with 2–3 cheap forecasters; switch on NSE/BSE disclosure collectors | Ledger settles exactly once; baselines reproduce; zero post-cutoff evidence |
| P1 Crowd | 3–6 | 6 information-diet forecasters; blind mode; track-record aggregation; listwise sector tournaments | After ~45 sessions: crowd rank IC t-stat > 2 vs momentum/ridge, else stop direction work and keep risk only |
| P2 Event library | 4–10 | Disclosure extraction; concall diffs; per-event-type forward event studies | An event type enters only with forward CAR significant after costs and multiple-testing (DSR registry) |
| P3 Decide | 8–14 | Conformal risk bands; meta-labeling on core; personal fit layer | Meta-label beats core under G1–G5; conformal coverage within ±3pp of nominal |
| P4 Trust | 10–16 | Executable falsifiers; public track record; human+AI hybrid crowd | Users can audit every forecast from cutoff to settlement |

Each gate failure is logged as a corpse in research memory, not quietly retried.

## 7. Capstone framing: AI predictions stay central

AI prediction is the project's core proposition, and this redesign keeps it there. It changes
the prediction's form (probability, range, relative outperformance, abstention) and how it
is proven (forward-only, proper scoring, public ledger), not whether the AI predicts.

- **The fast forecaster crowd** produces the prediction numbers daily across the universe.
- **The existing multi-agent graph** (analysts, debate, Devil's Advocate, risk panel) stays as
  the deep-dive explanation on the stock page, and its analysts can join the crowd as forecasters.
- **The stock-page card** shows: probability of beating NIFTY and sector, expected 80% range,
  volatility/event warning, agent agreement and dissent, the live track record, and the
  falsifiers that would kill the thesis.

Capstone narrative: built a multi-agent prediction system → measured it rigorously and
documented why it failed (small-n binary accuracy, memorisation, correlated agents) →
redesigned it into calibrated cross-sectional predictions → present the forward track record.
The failed evals are evidence of method, not a weakness to hide.

## 8. Honest framing

"Best ever" cannot be claimed and shouldn't be. What *can* be built and proven is the most
**measurably calibrated, forward-audited, personally relevant** recommendation system in
Indian retail: one that knows when it doesn't know, shows its full record, and gets
better by killing what doesn't work. Each claim should wait for its gate.

## Sources

- [Gao, Jiang & Yan, A Test of Lookahead Bias in LLM Forecasts (2025)](https://arxiv.org/html/2512.23847v1)
- [Glasserman & Lin, Assessing Look-Ahead Bias in GPT Sentiment Stock Predictions (2023)](https://arxiv.org/html/2309.17322v1)
- [Schoenegger et al., Wisdom of the Silicon Crowd (2024)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11800985/)
- [Sodha, When Reasoning Fails: Thinking LLMs for Stock Prediction, NIFTY (2025)](https://arxiv.org/html/2511.08608v1)
- [LLM-Driven Active Listwise Tournaments for Portfolio Selection (ICLR 2026)](https://iclr.cc/virtual/2026/10016541)
- [AlphaAgent: LLM-Driven Alpha Mining Against Alpha Decay (2025)](https://arxiv.org/html/2502.16789v1)
- [LLM-enhanced cross-sectional momentum (2025)](https://arxiv.org/pdf/2510.26228v1)
- [Regime-aware volatility forecasting via in-context learning (2026)](https://arxiv.org/html/2603.10299v1)
- [Calibration-induced degeneracy in LLM next-day risk forecasting (2026)](https://arxiv.org/pdf/2608.20304)
- [ECC Analyzer: earnings-call LLM signals for volatility (2024)](https://arxiv.org/html/2404.18470v2)
- [An Empirical Analysis of Legal Insider Trading in India (NITK)](https://idr.nitk.ac.in/items/2e0597cb-33a1-4f4d-bfd2-6970ede2914a/full)
- [Nanda & Barai, insider trades in India (Asian Journal of Accounting Research)](https://www.emerald.com/insight/content/doi/10.1108/AJAR-09-2020-0089/full/pdf)
- [Rabada & Barretto, Bulk deals and front-running on NSE (2023)](https://rcca.ndl.gov.in/items/4fbafa21-3191-40dd-8288-8fa6019189c0/full)
- [Lazy Prices and earnings calls (University of Kentucky dissertation)](https://uknowledge.uky.edu/accountancy_etds/15)
