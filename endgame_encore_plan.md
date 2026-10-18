# Quant Plus — Endgame Encore Plan

_Drafted 18 October 2026. Planning document; nothing here is implemented yet unless it names an existing file._

## 1. Core proposition (unchanged)

> A paper-trading platform with agentic AI stock research, which aligns the news
> that affects each stock in one single place, so the user does not need to visit
> 100 places to gather information and practise trading. A single-stop solution
> for newcomers who know nothing about the stock market.

Live trading is out of scope because of SEBI restrictions; Quant Plus stays
paper-trading only. Every feature in this plan strengthens one of the three
pillars:

1. **Agentic AI research and recommendations**
2. **News aligned to the stocks it affects**
3. **Paper trading and learning for beginners**

The plan adds four layers:

| Layer | Pillar it strengthens | One-line purpose |
| --- | --- | --- |
| **Ripple Engine** | News + AI | Shows how a news event spreads to every connected stock, not just the one named |
| **Investor DNA** | AI recommendations | Personalises practice and research framing from stated profile + revealed behaviour |
| **Market Driving School** | Beginners | Teaches the market by simulation, story, live events and an AI tutor, with a "trading licence" |
| **Proof Court (grading ledger)** | Trust in all of the above | Locks every prediction and grades it against reality, including our own AI |

---

## 2. Honest starting point

`PROJECT_PRESENTATION.md` §18.2 records that **none of the 11 stored agent runs beat
the best constant baseline** (accuracy 5.9%–50%). Therefore:

- Do not position the agent as a better price predictor. Position it as a research
  and explanation engine whose calls are publicly graded.
- Every new prediction-like output (ripples, recommendations, twin forecasts) goes
  into the same graded ledger, so the product can always answer "how good is your AI?"

Existing building blocks to reuse:

| File | Reuse |
| --- | --- |
| `src/lib/quant/track-record.ts` | Matured-forecast scoring, Brier score, baselines → Proof Court |
| `src/lib/quant/evidence.ts` | Evidence claims and source links → ripple evidence chains |
| `src/lib/quant/behavior.ts` | Behaviour metrics → revealed risk profile |
| `src/lib/quant/flight-sim.ts` | No-look-ahead replay → Time Machine stories, licence tests |
| `src/lib/quant/regime.ts`, `attention.ts`, `events.ts` | Market context for ripple calculations |
| `src/lib/quant/decision-plan.ts`, `risk-compiler.ts` | Stops, sizing, risk limits → pre-trade checks, licence tests |
| Committee agent pipeline (§7 of presentation) | Agents that consume ripple evidence |
| News pipeline (§12 of presentation) | Source of events for the Ripple Engine |

---

## 3. Ripple Engine (flagship)

### 3.1 Problem

News rarely affects only the company it names. Example:

> "Crude oil jumps 6%" → oil marketing companies ↓ · paint makers ↓ (crude-derived
> inputs) · airlines ↓ · ONGC / Oil India ↑ · rupee weakens → IT exporters ↑

Most apps show the headline next to the named stock only. Beginners cannot see the
second and third layers; experienced traders work them out mentally, and that is
part of their edge.

### 3.2 What it does

1. **Company relationship map (knowledge graph) for Indian equities**
   - Edge types: supplier, customer, competitor, shared raw material / commodity
     input, currency exposure (exporter/importer), promoter group (Tata, Adani,
     Reliance, …), common lenders, index membership and weight, sector.
   - Nodes also include ~15 macro factors: crude, rupee/USD, US yields, gold,
     steel, coal, natural gas, monsoon, repo rate, FII flows, etc.
   - Sources: annual reports, BRSR (ESG) disclosures, earnings-call transcripts,
     exchange filings. LLM agents extract relationships zero-shot; a hand-checked
     seed covers NIFTY 100 first.
   - Every edge stores: type, direction, strength, source document, extraction
     date, model version, reviewer status.

2. **News → event → propagation**
   - Classify each news item into an event type (input-cost shock, demand shock,
     regulation, rating change, management event, macro move, …).
   - Propagate across the graph with decay by hop and by time:
     first-order (day 0), second-order (days 1–3), third-order.
   - For each affected stock output: direction, expected magnitude, lag, confidence,
     and the full reasoning chain.
   - Magnitude comes from historical event studies, e.g. "the last 9 times crude
     rose >5%, paint stocks fell a median 2.1% within 3 days", computed point-in-time.

3. **Agent committee uses ripples as evidence**
   - Recommendations become: "Watch Asian Paints: input-cost pressure from the
     crude move. Here is the chain, the history, and the counter-case."
   - The ripple chain is attached as evidence claims through `evidence.ts`.

4. **One-tap paper trade of a ripple** so beginners learn cause and effect with no
   money at risk.

5. **Graded and self-correcting**
   - Every ripple prediction is locked with a timestamp and graded at its horizon
     (Proof Court, §6).
   - Edges that keep being wrong lose weight; edges that keep being right gain it.
     The map learns the Indian market specifically and publishes its own record.

6. **Beginner surfaces**
   - "Why did my stock move?" button traces a price move back to the source event.
   - Daily lesson generated from that day's strongest ripple (§5).
   - Plain-language and Hindi/regional-language explanations, including voice.

### 3.3 Why it is cutting edge

- **Finance evidence:** Cohen & Frazzini, "Economic Links and Predictable Returns"
  (Journal of Finance, 2008) — markets underreact to news about a firm's customers,
  so second-order ripples are where the information is.
- **Recent AI research:**
  - FinNLP 2025: LLMs can extract stock relationship graphs zero-shot.
  - arXiv 2606.29290 (June 2026, preprint): supply-chain-propagated LLM text
    signals kept predictive power after standard controls; a shuffled-graph placebo
    showed the relationships themselves mattered.
  - arXiv 2607.10932 (July 2026, preprint): dynamic LLM-built financial knowledge
    graphs for cross-entity information diffusion.
- **Gap:** this work is academic and mostly US-focused. No beginner-friendly product
  for Indian equities connected to paper trading and a public track record was found.

### 3.4 Data model sketch

```ts
type EdgeType =
  | "SUPPLIER" | "CUSTOMER" | "COMPETITOR" | "INPUT_COMMODITY"
  | "FX_EXPOSURE" | "PROMOTER_GROUP" | "LENDER" | "INDEX" | "SECTOR";

type RippleEdge = {
  from: string;            // symbol or macro factor id
  to: string;              // symbol
  type: EdgeType;
  sign: 1 | -1;            // same or opposite direction
  weight: number;          // 0-1, recalibrated from graded outcomes
  source: { doc: string; published_at: string; extracted_at: string; model_version: string };
  reviewed: boolean;
};

type RippleEvent = {
  id: string;
  news_id: string;
  event_type: string;
  origin: string;          // symbol or factor
  shock: number;           // signed magnitude estimate
  available_at: string;    // point-in-time
};

type RippleImpact = {
  event_id: string;
  symbol: string;
  hop: 1 | 2 | 3;
  direction: "UP" | "DOWN";
  expected_move: number;   // from historical event study
  lag_days: number;
  confidence: number;
  chain: string[];         // origin → ... → symbol, each step citing an edge
};
```

Each `RippleImpact` is also written as a `Forecast` (extended `track-record.ts`) so
it is graded like any other call.

### 3.5 Build plan (≈5 weeks)

| Week | Deliverable |
| --- | --- |
| 1 | NIFTY 100 relationship map: LLM extraction + manual review, macro factor nodes |
| 2 | News → event classifier; propagation with hop/time decay; historical event studies for magnitude |
| 3 | Committee agent integration, news feed integration, animated ripple map UI |
| 4 | Beginner surfaces: "Why did it move?", plain-language + Hindi voice explanations |
| 5 | Ripple prediction ledger, grading, edge-weight recalibration |

### 3.6 Risks

- The underreaction effect is measured in US markets; the Indian effect must be
  proven through our own ledger.
- The 2026 papers are preprints, not peer reviewed.
- Extracted edges can be wrong: show source and review status on every edge.
- Present ripples as explained possibilities for practice, never as trading signals.

---

## 4. Investor DNA (profile-based personalisation)

### 4.1 Regulatory boundary

Collecting income, job and risk appetite and then recommending specific stocks is
**personalised investment advice** under the SEBI Investment Adviser and Research
Analyst regulations, which require registration. SEBI's January 2025 circular and
the 2024 rules on associating with unregistered finfluencers put the
education/advice line under scrutiny (reports differ on whether a three-month
data-lag rule for educators survived into the final circular; a later draft
proposes a 30-day lag). **Confirm against SEBI's text or with a lawyer before any
public launch.**

Safe design: the profile shapes **how the user practises and learns**, not real buy
instructions.

- Sets practice wallet size, risk limits and learning path.
- Filters and frames agent research: "For a profile like yours, this small-cap is
  high-risk practice material."
- Every surface labelled "Educational paper practice, not investment advice."

### 4.2 Two-layer profile

| Layer | Captures | Source |
| --- | --- | --- |
| **Stated** (risk capacity) | Student / working, job role, income band, goals, horizon, experience, questionnaire | Onboarding |
| **Revealed** (risk tolerance) | Panic exits, revenge trades, disposition effect (cutting winners, holding losers), overtrading, rule breaks | Paper-trade behaviour via `behavior.ts` |

The app shows the gap:

> "You said Aggressive. Your behaviour says Cautious: you exit 80% of trades within a
> 2% loss. Here is your adjusted practice profile."

The profile keeps updating as the user trades.

### 4.3 What the profile drives

- Driving School starting level (§5).
- Risk guardrails in `risk-compiler.ts` (max loss per trade, concentration).
- Which agent recommendations and ripples are shown, and how they are framed.
- The AI tutor's examples and language.

### 4.4 Build (≈1 week)

Onboarding flow + stated profile schema; revealed-profile metrics on top of
`behavior.ts`; "stated vs revealed" card; wiring into risk limits and research framing.

---

## 5. Market Driving School (learning for newcomers)

Metaphor: nobody gets a driving licence by watching videos. You learn in a
simulator, drive with an instructor, then take a test. With 91% of individual F&O
traders losing money in FY25 (SEBI), "a licence before you trade" is easy for anyone
to understand.

### Level 0 — "Be the Company"

A 10-minute simulation where the beginner **runs a company**: starts a chai brand,
raises money from friends (equity), grows it, lists it in an IPO, and watches their
own share price react to their quarterly results. Teaches shares, dilution, profit,
P/E, dividends, IPOs and why prices move — from the inside. Strongest demo hook.

### Level 1 — Time Machine stories

Interactive stories through real Indian market history with an AI mentor character:
Harshad Mehta 1992, the 2008 crash, the COVID crash and recovery 2020. A year plays
out in 10 minutes, dates and names hidden until the reveal, decisions along the way.
Reuses `flight-sim.ts` for no-look-ahead replay.

### Level 2 — Learning from today's news

Daily lesson from a real ripple: "Crude rose today. Predict which sectors moved, then
see the actual map." Respect the data-delay rules in §4.1 before using live data in
lessons.

### Level 3 — Socratic AI tutor

- Asks instead of lectures: "Your stock fell 4% but the market fell 5%. Did you lose
  or win?"
- Knowledge tracing (as used by adaptive edtech): tracks mastery per concept,
  detects specific misconceptions (e.g. confusing price with value), revisits them.
- Hindi and regional languages with voice — NSE crossed 13 crore unique investors in
  April 2026, growth is strongest in tier 2–4 cities, ~40% are under 30.
- Uses the learner's own trades as material.

### Level 4 — The trading licence

Earned by discipline, not profit; graded through Proof Court.

| Licence | Practical test | Unlocks |
| --- | --- | --- |
| 🟢 Learner | Finish "Be the Company" + one Time Machine story | Paper trading in large caps |
| 🟡 L1 | 10 trades, each with a stop-loss and risk < 2% per trade | Mid caps, agent recommendations |
| 🟠 L2 | Get through a simulated crash without breaking your own rules | Small caps, Ripple Engine trades |
| 🔴 L3 | Calibration score above baseline over 30 graded predictions | Advanced tools (options stay locked) |

### Build (≈5–7 weeks total)

| Item | Estimate |
| --- | --- |
| Licence system + gating of existing features | 1 week |
| "Be the Company" simulation | 1–2 weeks |
| AI tutor with knowledge tracing + vernacular voice | 2 weeks |
| Time Machine stories | 1–2 weeks |
| Daily ripple lessons | after Ripple Engine week 4 |

---

## 6. Proof Court (grading ledger for every recommendation)

- One ledger schema for every call: Quant Plus committee, Ripple Engine impacts,
  user predictions, and optionally external tips (WhatsApp/Telegram/finfluencer)
  pasted by the user.
- Each call is locked with a timestamp and graded at its horizon: target hit, stop
  hit, or expired. Extends `Forecast` / `Matured` in `track-record.ts`.
- Scorecards per source: calls, hit rate, average outcome, Brier score, whether it
  beats the baseline.
- **Our own AI sits on the same scorecard.** "We don't ask you to trust any tipster,
  including our AI. We show you their record."
- Optional "Tip X-Ray" for external tips: SEBI registration check, NSE ASM/GSM
  surveillance list, volume/price anomaly, base rate of the promised move,
  scam-language signals. Show risk signals with evidence; never label anyone a fraud.

Build: ≈2 weeks; it is the foundation the Ripple Engine and licences grade against.

---

## 7. How it all connects

```
Sign up → Investor DNA (stated profile)
       → Driving School level chosen to match the profile
       → News → Ripple Engine (who is affected and why)
       → Agent committee research (reasoning chain + counter-case), framed for DNA and licence level
       → Beginner explanation (plain language / voice)
       → Paper trade (practice) → updates revealed profile
       → Proof Court grades every call → ripple weights + licence progress update
       → AI tutor teaches from the user's own trades
```

One screen, one evidence trail: someone who knows nothing → learns → practises →
gets AI research and news impact → builds proven discipline.

---

## 8. Combined roadmap

| Phase | Scope | Estimate |
| --- | --- | --- |
| 0 | Proof Court ledger (extend `track-record.ts`) | 2 weeks |
| 1 | Investor DNA onboarding + revealed profile; licence system + gating | 2 weeks |
| 2 | Ripple Engine weeks 1–3 (map, propagation, agent + UI integration) | 3 weeks |
| 3 | "Be the Company" simulation | 1–2 weeks |
| 4 | Ripple Engine weeks 4–5 (beginner surfaces, grading, recalibration) | 2 weeks |
| 5 | AI tutor (knowledge tracing, vernacular voice) | 2 weeks |
| 6 | Time Machine stories; daily ripple lessons | 2 weeks |
| Later | Mirror Market (see §10) | ongoing |

Keep all work local until deployment is explicitly approved (AGENTS.md); use
InsForge for hosted persistence when the cutover is validated.

---

## 9. Mentor demo script (≈3 minutes)

1. **Sign up live** — Investor DNA onboarding; show the starting licence.
2. **"Be the Company"** — 30 seconds of the chai-brand IPO: the beginner's own share
   price reacts to their results.
3. **Ripple Engine on that morning's real headline** — the ripple animates across
   the map; agents give research with the reasoning chain; a mentor taps "Explain in
   Hindi".
4. **Paper trade the ripple**, with the plain-words pre-trade check ("If this goes
   wrong you lose ₹4,200, 8% of your practice wallet").
5. **Proof Court** — the Ripple Engine's and the committee's own track records,
   including misses.
6. **Revealed profile** — "You said Aggressive. Your behaviour says Cautious."

Closing line: "We don't ask you to trust any tipster, including our AI. We show you
their record — and we teach you to need neither."

---

## 10. Long-term vision: Mirror Market

A digital twin of the Indian market populated by AI agents representing FIIs, DIIs
and mutual funds, retail F&O traders, proprietary desks, promoters/operators and
long-term investors, calibrated on public data (NSE FII/DII daily flows,
participant-wise open interest, AMFI SIP data, SEBI F&O studies). Users ask what-if
questions ("RBI cuts 25 bps", "FIIs sell ₹10,000 crore for 5 days") and see a range
of outcomes, which participant group drives the move, and where their portfolio
breaks.

- Academic basis: TwinMarket (NeurIPS 2025), LLM investor agents reproducing bubbles
  and crashes.
- The Ripple Engine's relationship map becomes the twin's skeleton.
- Must reproduce stylised facts (fat tails, volatility clustering) and sensible
  replays of known events (Budget 2024 STT hike, 4 June 2024 election day) before
  being trusted.
- Cost control: 6–10 LLM archetype agents cloned into thousands of rule-based agents.
- Positioned as stress-testing and education, not prediction; graded by Proof Court.

---

## 11. Guardrails

- Paper trading only; no broker execution.
- No personalised real-money advice; every surface labelled educational practice.
- Show risk signals with evidence; never accuse a named person of fraud.
- No accuracy claims beyond what the Proof Court ledger shows.
- Point-in-time data in every grading and event study; no look-ahead.
- Confirm SEBI education/advice and data-delay rules before public launch.

---

## 12. Sources

- SEBI FY25 F&O study coverage: [Business Standard](https://www.business-standard.com/markets/news/net-losses-of-traders-in-fo-widens-in-fy25-sebi-study-125070701221_1.html), [Moneylife](https://moneylife.in/article/91-percentage-of-retail-traders-lost-money-in-derivatives-losses-in-fo-surged-41-percentage-to-rs105-lakh-crore-in-fy2425-sebi-study/77613.html)
- SEBI FY22–24 study: [Business Standard](https://www.business-standard.com/markets/capital-market-news/sebi-study-exposes-massive-losses-for-individual-f-o-traders-in-india-124092400948_1.html)
- Investment scam warnings: [Outlook Money (I4C)](https://www.outlookmoney.com/news/i4c-warns-investors-against-fake-whatsapp-stock-tips-fake-trading-apps), [Open Magazine](https://openthemagazine.com/india/fake-profits-real-losses-the-new-investment-fraud-sweeping-whatsapp-and-telegram-groups)
- SEBI education vs advice: [Business Standard](https://www.business-standard.com/markets/news/sebi-finfluencer-circular-live-stock-data-market-education-rules-125013000571_1.html), [Finshots](https://finshots.in/archive/why-sebi-wants-trading-academies-to-step-back-from-live-data/), [Fox Mandal](https://foxmandal.in/news/cutting-ties-with-finfluencers-sebi-distinguishes-between-education-advice/)
- NSE investor base: [Bajaj Broking](https://www.bajajbroking.in/share-market-news/nse-adds-1-cr-investors-in-7-months-unique-base-crosses-13-cr), [Outlook Money](https://www.outlookmoney.com/invest/nse-registered-investor-base-growth-tops-130-million-10-million-added-in-7-months-as-retail-participation-deepens)
- Ripple research: [arXiv 2606.29290](https://arxiv.org/abs/2606.29290), [FinNLP 2025 zero-shot stock graphs](https://preview.aclanthology.org/ingest-emnlp/2025.finnlp-2.2.pdf), [arXiv 2607.10932](https://arxiv.org/abs/2607.10932); Cohen & Frazzini, "Economic Links and Predictable Returns", Journal of Finance (2008)
- Market twin: [TwinMarket (arXiv 2502.01506)](https://arxiv.org/html/2502.01506v5), [NeurIPS 2025 poster](https://neurips.cc/virtual/2025/poster/116676)
- Skill vs luck / decision-quality references: [Jesse Monte Carlo docs](https://docs.jesse.trade/docs/monte-carlo/interpreting-results), [Jurnl-It discipline score](https://jurnl.it.com/trading-discipline-score-template)
