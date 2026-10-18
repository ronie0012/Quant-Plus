# Frontier retail and professional trading products as of 2026

Research scope: identify product patterns that can create a surprising user experience for an India-focused, evidence-aware trading and paper-practice product. The aim is not to find a better price predictor. The more defensible opportunity is to help a user move from an uncertain idea to an explicit, testable, risk-bounded decision and then learn from the result.

## 1. What is mainstream, and what is genuinely emerging?

### Takeaway

Charts, screeners, alerts, backtests, educational content, paper accounts, social feeds and copy trading are established product primitives. The frontier is the combination of these primitives into an auditable workflow: an agent clarifies intent, gathers evidence, exposes disagreement and missing information, creates a market-state rehearsal, enforces risk boundaries, and records what the user believed before the outcome was known.

### Cited findings

- Charting plus public idea sharing is mature. TradingView exposes a large public Ideas feed with long/short labels, commentary, images, comments and creator profiles; its 2026 footer also lists screeners, news flow, portfolios, macro maps, an MCP server and a social network as existing products. This is evidence that “chart plus community” is an established category, not a frontier wedge. [TradingView Ideas](https://www.tradingview.com/ideas/) (current page accessed 18 Oct 2026)
- Education is also a mature consumer pattern in India. Zerodha’s Varsity describes itself as a free, extensive collection of stock-market and financial lessons covering subjects including futures, commodities and technical analysis. [Zerodha Varsity](https://zerodha.com/varsity/) (current page accessed 18 Oct 2026)
- Paper trading is established and useful, but it is not a faithful market simulator. Alpaca describes paper trading as a real-time simulation using real-time quotes, while explicitly excluding market impact, information leakage, latency slippage, queue position, price improvement, regulatory fees and dividends. [Alpaca Paper Trading](https://docs.alpaca.markets/docs/paper-trading), updated 7 July 2026
- Backtesting and no-code strategy automation are already productized. Composer lets a user describe goals in natural language, generates an editable strategy, backtests it, compares it with benchmarks, models fees and slippage, automates rebalancing, and lets users publish/remix strategies in a community. [Composer](https://www.composer.trade/) (current page accessed 18 Oct 2026)
- Social/copy investing is mature. eToro describes CopyTrader as real-time automatic replication of another investor’s trades, offers a team of up to 100 traders, and provides a virtual $100,000 demo portfolio. Its own disclosure says past performance is not an indication of future results and that copied traders may be inexperienced or have different objectives. [eToro CopyTrader](https://www.etoro.com/copytrader/) (current page accessed 18 Oct 2026)
- Agentic brokerage is moving from concept to shipped consumer product. Public’s 19 September 2026 prompting guide says a user prompt is converted into an executable workflow only after the AI asks follow-up questions, locks down missing parameters, presents the workflow for review and approval, and exposes an activity feed. [Public, “A technical guide to prompting Agents”](https://public.com/ai-agents/how-it-works), 19 September 2026
- Public’s agent product goes beyond chat: its page describes agents that monitor markets, execute trades, manage cash, analyze holdings, model trades and maintain activity and transaction histories. The page also exposes a marketplace of reusable agents. These are product claims, not evidence of superior returns. [Public AI Agents](https://public.com/ai-agents) (2026 product page accessed 18 Oct 2026)
- Public has also exposed brokerage access through the Model Context Protocol (MCP). Its MCP page says connected agents can query portfolios, screen stocks, set conditional logic and place orders across stocks, ETFs, options, crypto and bonds; it also describes dedicated accounts, real-time confirmations and activity visibility. The page explicitly puts third-party agent risk and data handling on the user. [Public MCP Server](https://public.com/mcp-trading) (2026 product page accessed 18 Oct 2026)
- Robinhood’s 2026 agent product similarly packages intent, tools and controls: users choose a model, build an agent, connect specialized agent apps, and can set agents to scan the market, review portfolios, build watchlists and trade. Robinhood describes dedicated accounts, trade approvals enabled by default and external-agent access via MCP. [Robinhood Agents](https://robinhood.com/us/en/agents/) (2026 product page accessed 18 Oct 2026)
- Robinhood’s support documentation shows the current agent pattern is already operationally specific: an external agent can read balances and positions, analyze news/social sentiment/quotes, build portfolios, rebalance and place orders through a dedicated MCP account. The same documentation warns that the user remains responsible and that agents may trade without confirmation if the user requests that behavior. [Robinhood, “Onboarding an external agent”](https://robinhood.com/us/en/support/articles/onboarding-an-external-agent/) (2026 support documentation accessed 18 Oct 2026)
- FINRA’s 27 January 2026 observations distinguish conversational, process-automation, trade-surveillance and trade-execution agents. FINRA says agents can plan, make decisions and take actions without predefined rules, but identifies autonomy, scope/authority, auditability, data sensitivity, domain knowledge, reward misalignment, hallucination and bias as risks. [FINRA, “Emerging Trend in GenAI: Observations on AI Agents”](https://www.finra.org/media-center/blog/observations-on-ai-agents), 27 January 2026
- FINRA’s June 2024 notice says GenAI can summarize complex documents, synthesize financial and market data, query SEC filings and earnings-call transcripts, and support investor education or human compliance review. It also calls out accuracy, privacy, bias, intellectual property and threat-actor risks. [FINRA Regulatory Notice 24-09](https://www.finra.org/rules-guidance/notices/24-09), 27 June 2024
- Professional research products are converging around a persistent evidence workspace rather than a single chatbot. AlphaSense currently presents “SuperAnalyst” as an always-on AI agent and describes a platform spanning SEC filings, expert insights, financial data, earnings and research workflows. The product positioning is enterprise-focused and its capability claims are vendor claims, but it is credible evidence that agentic research plus proprietary/curated source corpora is becoming a professional workflow. [AlphaSense Press and Platform](https://www.alpha-sense.com/press/), [AlphaSense Platform](https://www.alpha-sense.com/platform/), current pages accessed 18 Oct 2026
- Multimodal/source convergence is increasingly visible even when a product does not claim a full multimodal model. TradingView’s current footer says its SEC filings and other documents are provided by Quartr and combines market data, reference data, filings, charts and community ideas in one surface. This supports the direction of combining filings, transcripts, documents, market data and user-created annotations; it does not by itself prove accurate chart or image understanding. [TradingView Ideas](https://www.tradingview.com/ideas/), current page accessed 18 Oct 2026
- A large evidence-and-risk gap remains between agent capability and trustworthy decision support. A joint SEC/NASAA/FINRA investor alert warns that AI-generated information may be inaccurate, incomplete, outdated or fabricated, and specifically says investors should not rely solely on AI to predict market direction or security prices. [FINRA, “Artificial Intelligence (AI) and Investment Fraud”](https://www.finra.org/investors/insights/artificial-intelligence-and-investment-fraud), 25 January 2024
- The warning is consistent with the academic evidence base: the NBER study “Generative AI at Work” found productivity gains from a conversational assistant in customer support, especially for novice workers, but it studied work assistance rather than trading returns or market prediction. The paper was issued in 2023 and published in the *Quarterly Journal of Economics* in 2025. [NBER Working Paper 31161](https://www.nber.org/papers/w31161), April 2023; published version noted on the page as 2025

### Inferences

- “AI chat over a chart” is likely to be copied quickly. Public, Robinhood and professional-research vendors are already shipping some form of agent, MCP connectivity, research or workflow automation. A small team should not treat the existence of an LLM interface as the moat. [Public AI Agents](https://public.com/ai-agents); [Robinhood Agents](https://robinhood.com/us/en/agents/); [FINRA AI-agent observations](https://www.finra.org/media-center/blog/observations-on-ai-agents)
- The emerging unit of value is a decision workflow, not a data view: intent clarification → evidence retrieval → thesis and counter-thesis → scenario/rehearsal → bounded action → observation → post-outcome review. This is an inference from the workflow structure described by Public and Robinhood and the governance requirements highlighted by FINRA. [Public prompting guide](https://public.com/ai-agents/how-it-works); [Robinhood external agent support](https://robinhood.com/us/en/support/articles/onboarding-an-external-agent/); [FINRA AI-agent observations](https://www.finra.org/media-center/blog/observations-on-ai-agents)
- The strongest India-specific differentiation is likely to come from local evidence coverage and local practice realism: NSE/BSE event timing, exchange filings, company result PDFs, concall transcripts, Indian corporate actions, F&O contract conventions, taxes/charges, liquidity and gap behavior. The cited sources establish the value of connecting filings, transcripts, data and execution; they do not establish that any one vendor has solved Indian evidence coverage. [FINRA Regulatory Notice 24-09](https://www.finra.org/rules-guidance/notices/24-09); [Public MCP Server](https://public.com/mcp-trading)
- A “surprising” experience can be honest if the surprise comes from seeing one’s own uncertainty, hidden exposure or repeated behavioral error—not from a model claiming to know the next price. This follows from the regulators’ warnings on prediction claims and from the fact that existing simulators disclose material differences from live execution. [FINRA AI and Investment Fraud](https://www.finra.org/investors/insights/artificial-intelligence-and-investment-fraud); [Alpaca Paper Trading](https://docs.alpaca.markets/docs/paper-trading)

### Gaps

- I did not find a reliable, current primary source showing a retail product that combines Indian exchange filings, earnings-call audio/transcripts, chart images, point-in-time news, an auditable evidence graph and a branching paper-trade rehearsal in one workflow. That absence is itself a product opportunity, but it is not proof that no such product exists.
- Vendor pages generally describe features, safeguards and examples, not independent evaluations of decision quality, calibration, risk reduction or returns. Treat all vendor performance language as marketing unless supported by audited or peer-reviewed evidence.
- A commonly cited SEBI statistic about retail F&O losses was not used here because the current SEBI primary page was not reliably retrievable during this pass. It should be verified directly from SEBI before being used in product positioning or investor education copy. A reliable regulatory source to consult is the [SEBI investor portal](https://investor.sebi.gov.in/).

## 2. Five emerging patterns that could become a flagship WOW feature

### Takeaway

The best candidates are combinations of already-feasible components. Each pattern below is technically achievable for a small product team in 6–12 months if the product remains paper-first, uses a narrow instrument universe and treats AI as an evidence organizer and workflow controller rather than a price oracle.

### Cited Findings

#### Pattern A — The agentic decision contract

- A user describes intent in ordinary language; the system turns it into explicit fields: instrument, time horizon, entry condition, invalidation condition, position size, maximum loss, execution mode, evidence required and “do not trade if” constraints. Public’s agent guide specifically describes asking for missing asset, percentage, account, timing and sizing details before activating a workflow. [Public prompting guide](https://public.com/ai-agents/how-it-works), 19 September 2026
- Public says every agent requires user approval before activation, and allows users to edit, pause or shut down the workflow; it also keeps a running activity feed. [Public AI Agents](https://public.com/ai-agents) (2026)
- Robinhood uses dedicated accounts and approval controls for agentic activity, while its external-agent documentation demonstrates that a third-party agent can read portfolio data and place trades. [Robinhood Agents](https://robinhood.com/us/en/agents/); [Robinhood external agent support](https://robinhood.com/us/en/support/articles/onboarding-an-external-agent/)
- FINRA’s 2026 guidance makes auditability, scope and authority first-class design concerns, which supports a visible decision-contract UI instead of a hidden autonomous chain of thought. [FINRA AI-agent observations](https://www.finra.org/media-center/blog/observations-on-ai-agents), 27 January 2026

**Product form:** “Tell me what you are trying to test.” The product asks the minimum clarifying questions, renders a compact decision contract, and lets the user approve a paper-only workflow. The contract becomes the stable object that can be replayed, shared, measured and revised.

**Live demo:** Say, “I’m considering a 2% paper position in an Indian auto stock before results, but only if the thesis is supported by margin improvement.” The agent asks what “margin improvement” means, what result date matters, whether the user means consolidated or standalone numbers, what invalidates the thesis, and how much loss is tolerable. It then shows the contract and refuses to simulate a trade until the user confirms.

**6–12 month feasibility:** High. A workflow DSL, structured validation, event triggers, audit log and paper-order adapter are ordinary application engineering. LLMs are useful for clarification and extraction; deterministic code should own constraints and order simulation.

**Copy risk / moat:** The prompt-to-workflow surface is easy to copy. The moat can accumulate in the user’s library of decision contracts, the history of which constraints were changed, which evidence was considered, and how well the user’s decisions were calibrated over time.

#### Pattern B — Evidence graph with a live bull/bear courtroom

- FINRA explicitly identifies filing and earnings-call transcript retrieval, large-document summarization and financial-data synthesis as plausible GenAI uses, while warning about accuracy and data integrity. [FINRA Regulatory Notice 24-09](https://www.finra.org/rules-guidance/notices/24-09), 27 June 2024
- AlphaSense positions its platform around a combination of SEC filings, financial data, expert insights, earnings and an always-on research agent, demonstrating that professional users value source-connected research rather than generic text generation. [AlphaSense Platform](https://www.alpha-sense.com/platform/); [AlphaSense Press](https://www.alpha-sense.com/press/) (current pages accessed 18 Oct 2026)
- TradingView’s current product footer shows the convergence of charts, market data, community ideas and SEC documents provided by Quartr in a single product ecosystem. [TradingView Ideas](https://www.tradingview.com/ideas/) (current page accessed 18 Oct 2026)
- The SEC/NASAA/FINRA investor alert says AI outputs must be checked against authentic, multiple sources because outputs can be false, outdated or made up. [FINRA AI and Investment Fraud](https://www.finra.org/investors/insights/artificial-intelligence-and-investment-fraud), 25 January 2024

**Product form:** Every material claim is a node linked to a source, date, page/section/timestamp and confidence label. A “courtroom” view forces two cases: what supports the thesis, what weakens it, what the company has not disclosed, and which new evidence would change the decision. The model can draft both sides, but it cannot silently convert a weak source into a strong fact.

**Live demo:** Select an Indian company and ask, “What changed since the last result?” The product highlights a margin number from the filing, a management statement from the concall transcript, a change in guidance language, a relevant exchange announcement and a price/volume reaction. The user can click each claim to see the original page or transcript timestamp. The surprising moment is not a prediction; it is seeing that the bullish story depends on one unverified assumption or that a supposedly new narrative was already disclosed two quarters earlier.

**6–12 month feasibility:** Medium-high for PDFs, HTML filings, tables, news and transcripts; medium for audio alignment and chart/image extraction; low for fully reliable interpretation of arbitrary financial graphics. Start with cited text, tables and page-level document images. Use OCR and multimodal models only where a human can inspect the source.

**Copy risk / moat:** Summarization is easy to copy. A point-in-time evidence graph with source lineage, revisions, Indian-language/English aliases, entity resolution, historical claim changes and user corrections becomes a data and workflow moat. The product should preserve what was knowable at the time to avoid hindsight contamination.

#### Pattern C — Thesis flight simulator / event-driven decision rehearsal

- Alpaca’s documentation demonstrates that real-time paper trading is technically accessible, but it also documents the gap between simulation and live trading: no market impact, information leakage, latency slippage, queue position, regulatory fees or dividends. [Alpaca Paper Trading](https://docs.alpaca.markets/docs/paper-trading), updated 7 July 2026
- Composer combines natural-language strategy creation, backtesting, benchmark comparison, historical allocation graphs and fee/slippage modeling. [Composer](https://www.composer.trade/) (current page accessed 18 Oct 2026)
- eToro exposes a $100,000 virtual demo account for practice, showing that virtual portfolios are mainstream but generally not the same as a guided, decision-focused rehearsal. [eToro CopyTrader](https://www.etoro.com/copytrader/) (current page accessed 18 Oct 2026)
- Public’s agent materials describe trade planning, scenario exploration and risk discussion as part of the agent workflow, but its examples are still brokerage-oriented and are not independent evidence that scenario analysis predicts outcomes. [Public AI Agents](https://public.com/ai-agents)

**Product form:** Instead of “backtest this strategy,” the user enters a live decision point: before results, after a gap, ahead of a policy announcement, or when a portfolio breaches a risk boundary. The product creates several plausible market paths and asks the user to act under uncertainty. Each path records the exact evidence, assumptions, simulated fills, risk and decision timestamp.

**Suggested rehearsal modes:**

1. **Historical replay:** hide future candles and future news; reveal the market one event or time slice at a time.
2. **Event tree:** branch on gap-up, gap-down, flat reaction, liquidity shock or delayed confirmation.
3. **Counterfactual:** show what would have happened if the user had waited for a defined confirmation, halved size or followed the original invalidation rule.
4. **Execution realism:** include spread, slippage, gaps, quantity limits, charges and partial-fill assumptions, with a visible “simulation limitations” panel.
5. **Decision autopsy:** compare thesis quality and rule adherence separately from P&L.

**Live demo:** Freeze the tape five minutes before an earnings announcement. Show the filing evidence, a bull case and a bear case. Ask the user to choose “enter,” “wait,” “reduce size” or “no trade,” then reveal a historical or recorded event path. The demo can make the user feel the cost of ambiguity without claiming the system knew the result.

**6–12 month feasibility:** High for daily candles, event windows, historical filings/news snapshots and a conservative fill model; medium for intraday order-book realism; low for exchange-grade microstructure. A small team should begin with liquid NSE/BSE cash equities and event windows, not all derivatives.

**Copy risk / moat:** A generic replay slider is easy to copy. A library of point-in-time Indian events, source snapshots, decision contracts, user actions, execution assumptions and post-event outcomes is difficult to reproduce. The more users rehearse, the more the system can identify recurring errors such as chasing gaps, widening stops, over-sizing near events or confusing a price reaction with thesis validation.

#### Pattern D — Personal risk twin and adaptive guardrails

- Robinhood’s external-agent documentation includes portfolio-risk analysis as an agent task, while Public describes portfolio insights, risk management, stop-loss/hedging workflows and real-time market monitoring. These are evidence of demand for portfolio-aware automation, not evidence that AI risk estimates are accurate. [Robinhood external agent support](https://robinhood.com/us/en/support/articles/onboarding-an-external-agent/); [Public AI Agents](https://public.com/ai-agents)
- FINRA identifies autonomous scope, data sensitivity, reward misalignment and lack of transparency as specific agent risks. This argues for a user-controlled “risk policy” that is separate from the language model and enforced by deterministic checks. [FINRA AI-agent observations](https://www.finra.org/media-center/blog/observations-on-ai-agents), 27 January 2026
- Alpaca’s explicit list of simulation exclusions shows why a risk view should surface assumptions instead of displaying one apparently precise risk number. [Alpaca Paper Trading](https://docs.alpaca.markets/docs/paper-trading)
- eToro’s copy-trading disclosures show why a track record or copied position is not enough: objectives, experience and financial status may differ across users, and past performance is not a reliable future indicator. [eToro CopyTrader](https://www.etoro.com/copytrader/)

**Product form:** A “risk twin” is a living, user-specific model of constraints and exposure, not a return forecast. It learns from explicit settings and observed behavior: concentration, correlated holdings, event exposure, average holding period, typical loss-taking, repeated rule violations and liquidity assumptions. It then intervenes at decision time: “This trade would make your two correlated positions 48% of paper equity,” or “You have changed your invalidation rule three times in the last four rehearsals.”

**Live demo:** The user proposes a new position. The product instantly shows factor/sector overlap, event concentration, gap risk, maximum simulated loss under three sizes, and the user’s own historical tendency to override stops. The agent suggests a safer experiment—smaller size, wait for a filing, or rehearse first—but does not say “buy” or “sell.”

**6–12 month feasibility:** High for exposure, concentration, event calendar, deterministic loss limits and behavior analytics; medium for factor modeling and correlation under changing regimes. The team can deliver value without claiming a calibrated probability of loss.

**Copy risk / moat:** A static risk dashboard is easy to copy. Longitudinal, consented behavioral data—decision timestamps, overrides, thesis changes, risk-boundary adherence and outcomes—can compound into a personal learning moat. A privacy-preserving cohort benchmark could add a network effect later, but should not expose or rank users by returns.

#### Pattern E — Collaborative intelligence with dissent and provenance

- TradingView’s Ideas feed demonstrates mature community publishing and reactions around market views. [TradingView Ideas](https://www.tradingview.com/ideas/)
- eToro demonstrates mature social/copy mechanics, including discoverable investors, real-time copying and community discussion. [eToro CopyTrader](https://www.etoro.com/copytrader/)
- Composer demonstrates remixable strategies and a community where users can publish, edit and invest in shared strategies. [Composer](https://www.composer.trade/)
- These products make views and trades shareable, but their cited pages do not establish a strong evidence provenance standard, a requirement to publish disconfirming evidence, or a clean separation between decision quality and outcome luck. That is the opening for an evidence-aware collaborative product.

**Product form:** A user or group creates a thesis room around an instrument/event. Members can add evidence cards, counter-evidence, questions, assumptions, scenario branches and confidence levels. The room supports forks: “same evidence, different conclusion.” At the end, the room freezes the pre-event record and generates a post-event review showing which claims were supported, contradicted or simply unobservable.

**Live demo:** Two users independently review the same Indian earnings filing. One builds a margin-expansion thesis; another challenges revenue quality and working-capital assumptions. The product merges both evidence graphs, highlights the true disagreement, runs the same rehearsal under each thesis and lets the group vote on “enter / wait / no trade” without converting the vote into a recommendation.

**6–12 month feasibility:** Medium-high for shared workspaces, comments, source cards, permissions, forks and event locks; medium for real-time collaborative simulation and moderation. The first version can use invite-only rooms and structured templates rather than an open social network.

**Copy risk / moat:** A social feed is easy to copy and susceptible to popularity bias. A provenance-rich history of claims, dissent, corrections, scenario choices, user expertise tags and outcome reviews can create a network/workflow moat. The most defensible network is a corpus of useful, attributable reasoning—not a leaderboard of winners.

### Inferences

- The strongest single flagship is a combination of Patterns A–D: **Thesis Flight Simulator** — an evidence graph feeds an agentic decision contract; the contract enters a paper-first event rehearsal; a personal risk twin constrains size and records behavior; the system later performs a decision autopsy. This is an inference from the capability and risk patterns in Public, Robinhood, FINRA, Alpaca and Composer, not a claim that any source explicitly proposes this exact product. [Public prompting guide](https://public.com/ai-agents/how-it-works); [Robinhood Agents](https://robinhood.com/us/en/agents/); [FINRA AI-agent observations](https://www.finra.org/media-center/blog/observations-on-ai-agents); [Alpaca Paper Trading](https://docs.alpaca.markets/docs/paper-trading); [Composer](https://www.composer.trade/)
- A live demo should be built around a “decision reveal,” not an AI stock pick: the user states a thesis, the product reveals a missing assumption or correlated risk, the user chooses among actions, and the simulator later shows how each action would have behaved under different paths. This is more honest and more memorable than showing a model-generated target price. [FINRA AI and Investment Fraud](https://www.finra.org/investors/insights/artificial-intelligence-and-investment-fraud); [Alpaca Paper Trading](https://docs.alpaca.markets/docs/paper-trading)
- The moat should be layered: source lineage and point-in-time snapshots (data moat), structured decision contracts and event replays (workflow moat), user-specific behavior and calibration history (personalization moat), and invite-only evidence rooms or anonymized cohort benchmarks (network moat). An LLM prompt layer alone has low defensibility. [FINRA Regulatory Notice 24-09](https://www.finra.org/rules-guidance/notices/24-09); [Public AI Agents](https://public.com/ai-agents); [eToro CopyTrader](https://www.etoro.com/copytrader/)
- The best first wedge is not broad “AI for all markets.” It is one narrow Indian workflow with high consequence and rich evidence: pre-earnings rehearsal for liquid NSE/BSE equities, or event-driven portfolio risk review around results, corporate actions and major exchange announcements. The narrower the event grammar, the easier it is to preserve point-in-time truth and build high-quality evaluation data. This is an implementation inference based on the simulation limitations documented by Alpaca and the source-convergence capabilities described by FINRA and AlphaSense. [Alpaca Paper Trading](https://docs.alpaca.markets/docs/paper-trading); [FINRA Regulatory Notice 24-09](https://www.finra.org/rules-guidance/notices/24-09); [AlphaSense Platform](https://www.alpha-sense.com/platform/)

### Gaps

- I did not find independent, peer-reviewed evidence that consumer agentic trading products improve returns. The product research should measure workflow outcomes instead: source citation accuracy, missing-parameter detection, risk-limit adherence, calibration, time to decision, and reduction in hindsight edits.
- I did not find a primary source documenting a retail simulator that faithfully models Indian exchange microstructure, queue position, spread, market impact, taxes, charges, corporate actions and event-time gaps simultaneously. Any India launch should state precisely which assumptions are modeled.
- “Multimodal” remains underspecified in vendor materials. Before promising chart/PDF/audio understanding, evaluate each modality separately: table extraction, page citation, chart value extraction, audio timestamping, speaker attribution and contradiction detection.
- Personalization creates privacy and consent requirements. The moat should be built from user-authorized decision history and derived statistics, with clear controls to delete, export or keep private a user’s journal and behavior profile.

## 3. Recommended flagship, build plan, and epistemic guardrails

### Takeaway

Build **Thesis Flight Simulator: India** as a single flagship surface. The user brings a stock, event or portfolio question; the product turns it into a cited decision contract, runs a paper-only scenario rehearsal, explains risk and uncertainty, and returns later with a pre-registered decision autopsy. The wow moment is that the system can show exactly what the user believed, what evidence supported it, what would have invalidated it and how alternative actions behaved—without pretending to know the future.

### Cited Findings

- The product can borrow the safest interaction pattern already appearing in agentic brokerage: clarify missing parameters, show the workflow, require explicit approval, retain an activity log and permit pause/edit/shutdown. [Public prompting guide](https://public.com/ai-agents/how-it-works); [Public AI Agents](https://public.com/ai-agents); [Robinhood Agents](https://robinhood.com/us/en/agents/)
- The product should borrow professional research’s evidence integration—filings, transcripts, financial data, expert/news material and source-linked summaries—while avoiding unsupported “AI analyst” positioning. [FINRA Regulatory Notice 24-09](https://www.finra.org/rules-guidance/notices/24-09); [AlphaSense Platform](https://www.alpha-sense.com/platform/)
- The product should inherit paper trading’s honesty about simulation limitations. Alpaca’s documentation is a useful model: enumerate exclusions instead of implying that simulated fills equal live execution. [Alpaca Paper Trading](https://docs.alpaca.markets/docs/paper-trading)
- The product should separate assistance from prediction. FINRA/SEC/NASAA warn that AI outputs can be inaccurate or fabricated and should not be relied on alone for price prediction; the NBER evidence supports AI as a productivity/learning aid in another domain, not as evidence of trading alpha. [FINRA AI and Investment Fraud](https://www.finra.org/investors/insights/artificial-intelligence-and-investment-fraud); [NBER Working Paper 31161](https://www.nber.org/papers/w31161)

### Proposed user journey

1. **Start with a decision, not a ticker.** “I am considering a 2% paper position in Company X before its result.”
2. **Clarify intent.** Ask time horizon, instrument, event, evidence threshold, maximum paper loss, invalidation rule, size and whether the user wants to rehearse entry, waiting or no-trade.
3. **Assemble the evidence ledger.** Ingest only sources available before the decision timestamp: company filing/result PDF, exchange notice, transcript or concall text, relevant prior guidance, corporate actions and market context. Show source date, document page or transcript timestamp and extraction confidence.
4. **Stage the courtroom.** Present “supports thesis,” “weakens thesis,” “unknown,” and “what would change my mind.” Require at least one disconfirming item or explicitly label “no disconfirming evidence found.”
5. **Create the decision contract.** Render the thesis, trigger, invalidation, time horizon, size, max loss, no-trade conditions and evidence dependencies as editable structured fields.
6. **Run the rehearsal.** Offer historical replay and three to five scenario branches. Use visible assumptions for price gaps, spread, slippage, charges, partial fills, liquidity and delayed evidence.
7. **Ask the human to act.** The choices are “enter paper position,” “wait for confirmation,” “reduce size,” “hedge/rebalance,” “watch only” or “no trade.” The model does not choose for the user.
8. **Track the event.** New evidence is labeled as new; the original contract remains immutable. If a claim changes, show the diff rather than rewriting history.
9. **Perform the autopsy.** Separate thesis quality, evidence quality, process adherence, execution realism and outcome. A profitable decision can be poor process; a losing decision can be well-calibrated.
10. **Feed learning back into the risk twin.** Update the user’s behavior profile only from explicit, explainable events: changed size, overridden invalidation, repeated chase entries, concentration, event clustering or consistent waiting discipline.

### Six-to-twelve-month implementation slice

**Months 0–2: decision ledger and paper core**

- Build a versioned event/evidence schema: source URL, source type, published time, observed time, entity, claim, page/timestamp, extraction status, confidence and user correction.
- Build the decision-contract schema and deterministic validator. The LLM may propose values; application code enforces required fields, allowed instruments and risk ceilings.
- Add paper positions, orders, fills, fees, slippage and event-time locking. Clearly label all simulation assumptions.

**Months 2–4: India evidence MVP**

- Start with a small, licensed or permitted corpus of NSE/BSE company announcements, result PDFs, exchange notices and selected transcript/text sources. Preserve point-in-time snapshots.
- Add PDF/HTML extraction, tables, page citations and basic contradiction detection. Do not promise arbitrary chart-image extraction yet.
- Create a source viewer with highlighted evidence and “open original” links.

**Months 4–7: rehearsal engine**

- Add event windows around results and corporate actions, daily/intraday replay where data rights permit, scenario branches, conservative gap/slippage assumptions and counterfactuals.
- Add replay scoring: decision timestamp, action, thesis confidence, risk budget, rule adherence and post-event outcome.
- Add the first live demo narrative: one stock, one upcoming/recorded event, two thesis sides, three paths, one decision autopsy.

**Months 7–10: personal risk twin**

- Add concentration, sector/factor overlap, event exposure, maximum simulated loss and behavior signals.
- Add an explicit “why this intervention appeared” panel. Never surface a black-box risk score without the contributing positions, assumptions and date.
- Add user-controlled privacy, export and deletion for behavioral data.

**Months 10–12: collaborative rooms**

- Allow invite-only evidence rooms, forks, dissent cards, pre-event freeze and post-event review.
- Add anonymized cohort comparisons only after enough data and consent: “Your average pre-event size is above your own baseline,” not “you rank below winning traders.”
- Add an agent app/MCP-style read-only integration only after paper workflows are stable; execution should remain out of scope for the flagship until auditability is proven.

### Demo script that is visibly impressive but honest

**Scenario:** “Should I rehearse a paper trade in an Indian auto stock before tomorrow’s result?”

- The user asks in natural language.
- The agent asks three targeted questions: what metric matters, what invalidates the thesis, and what is the maximum paper loss.
- The product displays a source-linked evidence wall: latest result, prior guidance, management language, exchange notice, valuation/context data and a compact bull/bear split.
- It flags one missing fact and one conflicting statement instead of producing a confident summary.
- It generates a decision contract and shows that the proposed size would create a specified sector/event concentration.
- The user chooses “wait for confirmation.”
- The simulator reveals three paths: gap-up, gap-down and flat/ambiguous; it displays the hypothetical fills and the exact limitations.
- The product lets the user compare “enter now,” “wait,” and “half-size” without saying which is correct.
- The post-event screen compares the pre-registered thesis with the outcome and explains whether the user followed their own process.

This demo is surprising because the system remembers the user’s prior belief, makes uncertainty legible, and turns a market event into a repeatable learning loop. It does not need to claim prediction accuracy or returns.

### Moat scorecard

| Pattern | Copyability of surface | Compounding moat | Best evidence asset |
|---|---:|---:|---|
| Prompt-to-agent workflow | High | Medium | Versioned decision contracts, overrides and rule history |
| Evidence graph | Medium | High | Point-in-time Indian source corpus, claim lineage and corrections |
| Thesis flight simulator | Medium | High | Event snapshots, fill assumptions, user actions and counterfactual outcomes |
| Personal risk twin | Medium | High | Consent-based longitudinal behavior and calibration data |
| Collaborative evidence rooms | Medium | High if curated | Dissent, forks, source provenance and post-event reviews |

Scores are strategic inferences, not measured market data. They are grounded in the cited product pattern: agent prompts and social feeds are already visible across vendors, while longitudinal, source-linked, point-in-time decision history is less exposed as a consumer primitive. [Public AI Agents](https://public.com/ai-agents); [Robinhood Agents](https://robinhood.com/us/en/agents/); [eToro CopyTrader](https://www.etoro.com/copytrader/); [Composer](https://www.composer.trade/)

### Guardrails for evidence-aware honesty

- Label every generated claim as **source-backed**, **derived calculation**, **historical analogy**, **scenario assumption**, **user input** or **model interpretation**. This is a product inference from FINRA’s accuracy, integrity and auditability concerns. [FINRA Regulatory Notice 24-09](https://www.finra.org/rules-guidance/notices/24-09); [FINRA AI-agent observations](https://www.finra.org/media-center/blog/observations-on-ai-agents)
- Preserve point-in-time truth. The post-event system may know the outcome, but the pre-event contract must remain unchanged. This is necessary to avoid hindsight and is consistent with the need to audit multi-step agent outcomes described by FINRA. [FINRA AI-agent observations](https://www.finra.org/media-center/blog/observations-on-ai-agents)
- Make “no trade” and “insufficient evidence” first-class outputs. FINRA warns against relying on AI-generated information for prediction, and broker disclosures repeatedly state that agent output is not a recommendation. [FINRA AI and Investment Fraud](https://www.finra.org/investors/insights/artificial-intelligence-and-investment-fraud); [Public AI Agents](https://public.com/ai-agents); [Robinhood external agent support](https://robinhood.com/us/en/support/articles/onboarding-an-external-agent/)
- Measure process outcomes, not return promises: citation correctness, extraction accuracy, contradiction detection, missing-field detection, user comprehension, risk-limit adherence, replay realism, calibration and hindsight-edit rate.
- Keep execution behind a separate, explicit mode. Public, Robinhood and FINRA show that connected agents can place orders, but the same sources show the associated scope, monitoring, data and audit risks. A paper-first product can deliver the WOW experience with far less operational and regulatory surface area. [Public MCP Server](https://public.com/mcp-trading); [Robinhood external agent support](https://robinhood.com/us/en/support/articles/onboarding-an-external-agent/); [FINRA AI-agent observations](https://www.finra.org/media-center/blog/observations-on-ai-agents)

### Gaps

- Need a source-rights and data-quality plan for NSE/BSE announcements, company PDFs, audio/transcripts, news, corporate actions and intraday data before committing to a production roadmap.
- Need user research with Indian traders to validate which event matters first: earnings, corporate actions, index changes, macro policy, F&O expiry or intraday gaps.
- Need a benchmark set of manually adjudicated evidence questions: “What changed in the filing?”, “Which claim is unsupported?”, “What was knowable at 9:15?”, and “Did the user’s decision contract match the action?”
- Need a simulation calibration study comparing model fills with historical Indian market data. Alpaca’s public limitations are a useful reminder that paper trading can be directionally helpful while still being materially different from live trading. [Alpaca Paper Trading](https://docs.alpaca.markets/docs/paper-trading)
- Need legal/compliance review of whether personalized risk coaching, agent-generated research, paper-trade recommendations or shared thesis rooms could be construed as investment advice in the target jurisdiction. This note is product research, not legal advice; FINRA’s 2024 notice is a useful reference for the principle that existing obligations continue to apply when firms use GenAI. [FINRA Regulatory Notice 24-09](https://www.finra.org/rules-guidance/notices/24-09)
