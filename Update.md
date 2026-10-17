# Quant Plus Product Experience Update

**Status:** Product direction and information-architecture plan
**Date:** 16 October 2026

## Executive decision

Quant Plus should keep its depth, but stop presenting every internal capability as an equal-level destination.

The product should be organized around the trader's decision lifecycle:

```text
Find an idea
→ Understand the evidence
→ Challenge the thesis
→ Write a plan
→ Check risk
→ Paper trade
→ Review and learn
```

The recommended product structure is:

```text
Home
Discover
Portfolio
Review
More
```

The stock workspace is the centre of gravity, but it should be opened contextually from Discover, search, watchlist, alerts, portfolio or an AI answer rather than appearing as another permanent sidebar destination.

The deeper product model is a **Decision Canvas** inside the stock workspace. A decision connects evidence, AI research, counter-evidence, planning, risk, paper execution and review.

## The core product promise

Quant Plus should not lead with an unproven claim of AI prediction. It should lead with:

> **An evidence-first decision workspace for Indian equities.**

Alternative product line:

> **From market noise to a decision you can defend.**

The product helps a user understand what changed, investigate the evidence, challenge their own thesis, practise the decision with controlled risk, and learn from the outcome.

This is stronger and more credible than positioning Quant Plus as a collection of AI predictions or market widgets.

## Why the current experience feels overwhelming

The existing navigation follows the implementation history of the product instead of the user's intent:

- The sidebar exposes roughly 30 destinations across four groups.
- The dashboard exposes around 15 equally weighted panels.
- AI research is split across Research, Decisions, Committee, Agent Activity, History and Quant AI.
- Portfolio concerns are split across Portfolio, Orders, Wallet, Portfolio X-ray and Risk Centre.
- Internal names such as Flight Simulator, Trust Control Room and Regime Map require users to understand the builder's mental model.
- Features wait to be discovered instead of appearing at the moment they are useful.

The product is not lacking capability. It is lacking hierarchy, sequencing and a clear centre.

## Recommended information architecture

| Area | User question | Primary contents |
| --- | --- | --- |
| **Home / Today** | What needs my attention? | Market summary, portfolio summary, alerts, unfinished plans, completed research and next actions |
| **Discover** | What is worth investigating? | Markets, screener, watchlist, events and regime context |
| **Stock workspace** | What is happening, and should I practise a decision? | Chart, AI verdict, evidence, news, events, decision plan, risk preview and paper trade |
| **Portfolio** | How is my book exposed? | Holdings, orders, wallet, exposure, risk, basket and alerts |
| **Review** | Am I improving my process? | Decision journal, history, track record, trading habits, replay and strategy analysis |
| **More** | Where are the advanced and system tools? | Data status, settings, help, roadmap, research network and advanced agent views |

Nothing important needs to be deleted. Existing routes can remain available as deep links or redirects while only the canonical destinations are shown in the primary navigation.

## The Decision Canvas

The stock workspace should gradually become a decision workspace rather than a collection of disconnected stock panels.

### 1. What happened?

Show verified observations first:

- Price and market context
- Volume and technical observations
- Relevant news and official events
- Data source, timestamp and freshness
- Missing or degraded inputs

### 2. What does the evidence support?

Show the AI research as a structured verdict:

- Main thesis
- Supporting evidence
- Key drivers
- What remains unknown
- Methodology and evidence references

### 3. What could make the thesis wrong?

Make the adversarial layer prominent:

- Counter-case
- Contradictory evidence
- Weak assumptions
- Invalidation condition
- Important missing data

Committee and Agent Activity should become a **How this verdict was built** detail view or drawer, not primary navigation items.

### 4. What is the plan?

The user should be able to move naturally through:

```text
Write plan → Check risk → Paper trade
```

The plan should include entry idea, risk amount, position size, exit logic, time horizon and invalidation conditions.

The final action should be labelled **Paper trade** or **Practise this idea**, not simply Buy, because Quant Plus is a paper-trading product.

### 5. What happened afterward?

Connect the decision to:

- Open position
- Alerts
- Plan completion
- Outcome attribution
- Post-trade reflection
- Review history

The decision should become the persistent object that connects the stock workspace, Portfolio and Review.

## Home should become a next-actions feed

The dashboard should stop behaving like a wall of widgets. It should answer three questions:

### How is my money?

- Portfolio value
- Current exposure
- Biggest contributor and risk
- Available cash
- Open decisions

### What is the market doing?

- Market regime
- Breadth
- Volatility
- Session state
- Important market events

### What should I do next?

The third section should be a prioritised feed assembled from all relevant product features:

```text
Your TCS alert triggered                 → Review alert
INFY plan is incomplete                  → Finish plan
HDFCBANK reports results tomorrow        → Inspect event risk
RELIANCE research finished               → Review AI verdict
Three trades followed a recent loss     → Review trading habits
```

Each feature should advertise itself only when it is relevant. This is more useful than making the user search through the entire sidebar.

## Put features where the decision happens

| Feature | Primary location |
| --- | --- |
| Behavioural warning | Inside the order ticket and pre-trade review |
| Track record | Beside the AI verdict |
| Event radar | On the relevant stock workspace and portfolio holding |
| Market regime | Small market-state chip in the top bar and stock header |
| Data quality | Inline when degraded, with a detail view in More |
| Risk preview | Immediately before paper execution |
| Research completion | Home next-actions feed and the relevant stock workspace |
| Review reminder | After a trade or when a plan reaches its review horizon |

The rule is:

> **A feature should appear where the user needs its decision, not where the engineering team implemented it.**

## AI experience

Quant AI should stop feeling like one more destination. It should be available everywhere through:

- The contextual AI dock
- Command search
- The stock workspace
- Portfolio and review actions

The main AI interactions should be task-oriented:

- Explain what changed
- Build the evidence brief
- Challenge my thesis
- Compare this with another instrument
- Show portfolio impact
- Create a paper decision plan
- Review this trade

The output should be structured rather than a long generic paragraph:

```text
What the evidence supports
3 verified observations

What the evidence does not support
2 missing or stale inputs

Counter-case
The thesis depends on...

Risk boundary
The idea is invalidated if...

Next step
Create a plan / Wait for better evidence
```

The AI should feel like a quiet research partner, not an oracle.

### Track record language

Track record should appear beside the AI verdict, but only with honest maturity and sample-size context. Until the evaluation gates are met, do not present an attractive-looking accuracy number as proof of predictive skill.

Use states such as:

```text
Historical record
Not enough matured outcomes for a reliable hit-rate estimate
```

or:

```text
Outcome maturity: 18 of 200 calls resolved
Calibration: insufficient sample
```

Once a genuine evaluation gate is passed, show accuracy with horizon, sample size, date range and baseline.

## Portfolio experience

Portfolio should answer:

> **What is my portfolio exposed to, and what can hurt it next?**

The first view should prioritise:

- Exposure map
- Concentration
- Risk by sector or factor
- Largest contributors and detractors
- Upcoming events affecting holdings
- Open protection or missing protection
- Suggested review actions

Orders, Wallet and Basket remain available, but as execution and accounting layers rather than equal-level navigation items.

## Review experience

Review should answer:

> **Am I improving my process?**

It should connect:

- Decision journal
- Research history
- Track record
- Trading habits
- Replay
- Strategy analysis

Review should measure more than profit and loss:

- Plan completion
- Thesis invalidation rate
- Repeated behavioural mistakes
- Difference between planned and actual exits
- Performance by setup
- Whether the result came from the thesis or execution

## Plain-language naming

| Current name | Recommended name |
| --- | --- |
| Flight Simulator | Replay |
| Portfolio X-ray | Exposure |
| Trust Control Room | Data Status |
| Committee | AI Debate or Verdict Details |
| Decision Plans | Trade Plans or Plans |
| Behavioural Risk | Trading Habits |
| Agent Activity | Research Trace, inside the verdict |
| Regime Map | Market Context |
| Research Network | Research Review, under More |

Avoid naming that requires users to learn the internal product vocabulary.

## Focus and advanced tools

The existing focus-mode idea can become progressive disclosure instead of two separate products.

### Focus mode — default

- Home / Today
- Discover
- Stock workspace
- Portfolio
- Review

### Advanced tools — available through More and command search

- Strategy Lab
- Replay
- Research Network
- Market Context details
- Basket tools
- Detailed track record
- Agent traces

Avoid forcing new users to choose between Simple and Pro before they understand the core loop. Use a calm default and reveal depth progressively.

## Onboarding should teach the loop once

The onboarding checklist should become a guided version of the product itself:

```text
Set up paper account
        ↓
Choose a few instruments
        ↓
Open the first stock workspace
        ↓
Read the evidence-led AI verdict
        ↓
Write a decision plan
        ↓
Check risk
        ↓
Paper trade or choose “watch only”
        ↓
Review the outcome
```

The user should not be required to place a trade to complete onboarding. “Evidence is insufficient — wait” is a valid outcome and reinforces disciplined behaviour.

## Features to merge, hide or contextualize

### Merge into the stock workspace

- Research
- Committee
- Agent Activity
- Quant AI context
- News
- Event information
- Decision plan
- Risk preview

### Merge into Portfolio

- Orders
- Wallet
- Exposure
- Risk
- Basket
- Alerts

### Merge into Review

- Journal
- History
- Track Record
- Trading Habits
- Replay
- Strategy analysis

### Move to More

- Data Status
- Settings
- Help
- Roadmap
- Research Network
- Advanced agent views

### Remove from the primary navigation

Options Lab should not appear as a normal active destination while observed option-chain data and contract validation are unavailable. It can remain on the roadmap or in a capability explanation.

## Presentation story

The product should be presented through one complete decision instead of a tour of every module:

1. **Home:** Show what changed and what needs attention.
2. **Discover:** Select an instrument worth investigating.
3. **Stock workspace:** Show evidence, AI reasoning and the counter-case.
4. **Plan:** Write a thesis, invalidation condition and risk boundary.
5. **Paper trade:** Run the preflight and practise the decision.
6. **Review:** Return to the outcome and show what was learned.

The closing message should be:

> Quant Plus does not just tell you what to look at. It helps you form a thesis, attack it, practise it and remember whether your process was sound.

## Implementation sequence

### Phase 1 — Navigation and surface reduction

- Define the five primary areas.
- Update `WORKSPACE_ROUTES` to distinguish canonical destinations from secondary routes.
- Keep existing routes as aliases or redirects so nothing is lost.
- Replace internal labels with plain-language labels.
- Remove unavailable Options from the primary navigation.

### Phase 2 — Home / Today

- Replace the widget-heavy dashboard hierarchy with three sections: money, market, next actions.
- Add a prioritised action feed.
- Make every feed item deep-link into the relevant stock, plan, alert, research or review state.

### Phase 3 — Stock workspace / Decision Canvas

- Make the AI verdict the main research surface.
- Add evidence, counter-case and methodology details.
- Bring events and track-record status beside the verdict.
- Connect plan creation, risk preview and paper execution.
- Add the persistent decision lifecycle.

### Phase 4 — Portfolio and Review consolidation

- Group accounting, exposure and risk under Portfolio.
- Group journal, history, behaviour, replay and strategy analysis under Review.
- Move internal research and operational surfaces into contextual detail views or More.

### Phase 5 — Premium polish and trust

- Use fewer, larger, more intentional content blocks.
- Keep data freshness and degraded states visible at the moment they matter.
- Remove or quarantine synthetic and demonstrative market observations.
- Make motion communicate state changes rather than decorate the interface.
- Keep paper-trading boundaries explicit.

## Success measures

The redesign should be evaluated by user behaviour rather than the number of visible features:

- Time from sign-in to first useful market insight
- Time from instrument discovery to completed decision plan
- Percentage of users who inspect evidence or counter-evidence
- Percentage of plans that reach a paper-trading or watch-only outcome
- Percentage of completed trades that receive a review
- Number of dead-end navigation sessions
- Number of users who can complete the core loop without opening the command palette or help
- AI citation and grounding quality
- User understanding of why a decision was made and what would invalidate it

## Final product principle

Do not delete the depth. Hide the depth until it becomes useful.

The product should feel simple on the first day, powerful by the second week and coherent after six months.

Quant Plus should present one connected decision lifecycle, not a catalogue of the features used to build it.
