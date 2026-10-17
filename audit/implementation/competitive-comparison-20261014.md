# Competitive comparison — 2026-10-14

**Status: qualified, desk-research comparison.** Competitor facts below come from their public pages
and third-party reviews read on 2026-10-14. No competitor was used hands-on, so their latency,
accessibility, accounting accuracy and AI usefulness were **not measured**. Those cells say
"not measured" and are never counted as a Quant Plus win. Quant Plus figures come from this
repository's measured evidence (paths given). Refresh this file before any external claim.

## Declared set

| Tool                      | Why included                                                  | Primary sources (2026-10-14)                                                                                                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TradingView Paper Trading | Most widely used general paper-trading simulator covering NSE | [TradingView help: paper trading main functionality](https://www.tradingview.com/support/solutions/43000516466-paper-trading-main-functionality/); [Trader For Tomorrow tutorial](https://tutorial.traderfortomorrow.com/tradingview-how-to/do-paper-trading-in-indian-stock-market) |
| Neostox                   | Dedicated Indian paper-trading platform (equity + F&O)        | [neostox.com](https://neostox.com/); [AlgoTest review](https://algotest.in/blog/neostox-review-and-alternatives/)                                                                                                                                                                    |
| Sensibull Virtual Trading | Leading Indian options practice tool                          | [Google Play listing](https://play.google.com/store/apps/details?id=com.sensibull.mobile&hl=en_IN); [Strike.money overview](https://www.strike.money/stock-market/paper-trading)                                                                                                     |
| StockGro                  | Frequently listed as an Indian "virtual trading" app          | [StockGro FAQ](https://www.stockgro.club/faq/)                                                                                                                                                                                                                                       |

StockGro's own FAQ states that it is **not** a paper or virtual trading platform; it now positions
itself as a SEBI-registered advisory and research platform. It is therefore excluded from the
paper-trading rows below. Third-party lists still describe older virtual-money competitions.

## Comparison

| Dimension                   | Quant Plus (measured here)                                                                                                                       | TradingView                                            | Neostox                                                          | Sensibull                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------- | --------------------------------------- |
| Instruments                 | NSE cash equity, delivery only (NIFTY 50 master from official NSE files)                                                                         | "Almost every asset class" on TradingView (official)   | Stocks, futures, options (official)                              | F&O focus; stock options (listing)      |
| Options practice            | **Not available** (excluded: no validated observed chain)                                                                                        | Yes, per asset coverage                                | Yes (chain, strategies)                                          | Yes (payoff, Greeks)                    |
| Price data                  | Fyers live quotes, eligibility-checked; stale/delayed refused                                                                                    | Not stated on the help page                            | Official page: "Market prices on Neostox are delayed by 30 days" | "Almost real-time" F&O quotes (listing) |
| Charges                     | Itemised, dated statutory + exchange charges per fill (NSE/FA/73061; `src/lib/paper-fees.ts`)                                                    | Official: "no fees" simulator; costs are not simulated | Dashboard shows "fees and taxes paid"; method not published      | Not stated                              |
| Accounting integrity        | Integer paise, append-only ledger, reconciliation on every soak checkpoint; 0 failures over 10 simulated sessions (`audit/implementation/soak/`) | Not measured                                           | Not measured                                                     | Not measured                            |
| Session rules               | Verified NSE calendar (circular hashes); DAY orders expire at the real close; unverified dates fail closed                                       | Tutorial: orders only during market hours              | Not stated                                                       | Not stated                              |
| Fill realism                | Bid/ask, partial fills, reservations, limit/stop/protections                                                                                     | Market/limit/stop + SL/TP (official)                   | Market & limit, target/SL (official)                             | Not stated                              |
| Idempotency/fault tolerance | Duplicate-intent storm settles once; concurrent processes lose no updates (`scripts/test-faults.mjs`)                                            | Not measured                                           | Not measured                                                     | Not measured                            |
| AI copilot grounding        | Typed read-only tools, citation IDs, automatic evidence check; **≥200-answer human review not yet done**                                         | No comparable feature found                            | No comparable feature found                                      | No comparable feature found             |
| Accessibility               | Automated axe WCAG 2 A/AA: 0 serious/critical on every route (colour contrast excluded, pending review)                                          | Not measured                                           | Not measured                                                     | Not measured                            |
| Latency                     | End-to-end HTTP on the reference laptop: read p95 12–30 ms, order ack p95 47 ms, provider excluded (`audit/implementation/benchmarks/`)          | Not measured                                           | Not measured                                                     | Not measured                            |
| Multi-user / mobile         | Single local profile; hosted InsForge mode built and live-isolation-tested but not enabled; no mobile app                                        | Web + apps, global                                     | Web + app                                                        | Web + app                               |
| Price                       | Local, self-hosted (needs own Fyers + model keys)                                                                                                | Paper trading free (third-party guides)                | Trial, then subscription (official; AlgoTest: from ₹303/month)   | Not verified                            |

## Conclusions (qualified)

- **Where Quant Plus is measurably strong:** accounting realism for NSE cash delivery (dated,
  itemised charges; reconciled ledger), verified session rules, and fault behaviour. Of the tools
  reviewed, only Neostox publicly reports fees, and its calculation method is not published.
  TradingView states that its simulator has no fees. This is a documented difference in _design_.
  It is not a measured accuracy comparison against those tools.
- **Where Quant Plus is behind:** no options practice, which Sensibull and Neostox both offer. It is
  also limited to a single-user local deployment, has no mobile app, and covers far fewer
  instruments than TradingView.
- **Unproven:** AI usefulness (no human-reviewed answer set), forecast skill (fewer than 500
  matured forecasts) and real-time multi-session reliability (the 10-trading-session live soak is
  still to run). No superiority claim may be made on these.
- **Not comparable:** latency and accessibility were measured only for Quant Plus.
