# Fast prediction delivery

The stock page now shows the latest completed decision above the chart, without
an entrance-animation delay. Browsing Markets or search results preloads saved
research into the browser query cache. Preloading is read-only and does not start
model calls.

## Measured result

100 in-process HTTP reads of an actual completed HDFCBANK prediction:

| Metric | Time |
| --- | ---: |
| Median | 2.594 ms |
| 95th percentile | 4.829 ms |
| Maximum | 7.017 ms |

All five analyst reports and the original final decision were returned. Zero
model calls were made. The benchmark copied the saved run to an isolated database;
it does not measure Supabase authentication, network travel or browser rendering.
Reproduce it from `D:\QP\agent-service` with:

```powershell
python scripts/benchmark_prediction_serving.py
```

Saved HDFCBANK full runs previously took 430.77 and 980.65 seconds. Those are
observations from stage events, not speed guarantees for future runs.

## How analysis stays complete

The existing analyst and decision models, prompts, token budgets, debate rounds,
devil's advocate, risk panel, portfolio manager and research-only authority remain.
Completed results keep their original data cutoff. Older research is labelled
and is not represented as a prediction calculated at the current quote tick.

The backend's startup worker runs the same full graph for configured stocks,
refreshes ahead of the regular expiry when capacity allows, and also revisits
recently requested stocks. Initial defaults are HDFCBANK, RELIANCE, TCS, INFY and
ICICIBANK. One background job runs at a time; the default two-job installation
reserves capacity for a foreground visitor. Jobs for the same stock coalesce.
Available research remains visible when refresh capacity is busy or the operator
has paused analysis. Results older than the maximum allowed age are not served.

Debate turns and risk reviewers save completed findings individually. A retry reuses them only
when evidence, proposal, prompt and model configuration match. Per-key model
pacing now reserves separate request slots to prevent parallel request bursts.
Same-instrument data downloads coalesce and file reads/replacements are serialized
to prevent the observed Windows cache race. PIT filtering still runs on every read.

## Operation

Restart the agent service to load these changes. Keep one server worker; multiple
processes require a shared distributed job coordinator before enabling warming.
The warm worker consumes the existing model budget and obeys concurrency limits
and the operator pause. Failed warm jobs back off before retrying.
Warming stops after total daily usage reaches 50% of the day cap by default,
leaving the remaining budget for requested analyses (one in-flight run can cross
that threshold). It never raises the configured daily cap.

```dotenv
STOCK_PREDICTION_WARM_ENABLED=true
STOCK_PREDICTION_WARM_SYMBOLS=HDFCBANK,RELIANCE,TCS,INFY,ICICIBANK
STOCK_PREDICTION_WARM_INTERVAL_SECONDS=30
STOCK_PREDICTION_WARM_AHEAD_SECONDS=300
STOCK_PREDICTION_REFRESH_SECONDS=900
STOCK_PREDICTION_MAX_STALE_SECONDS=86400
STOCK_PREDICTION_MAX_CONCURRENT=2
STOCK_PREDICTION_WARM_DAY_TOKEN_FRACTION=0.5
```

Fraction-of-a-second delivery applies to completed results already available.
An unseen stock, expired result or new model configuration still requires a full
analysis. Warming coverage and freshness depend on model throughput and the chosen
stock list. These changes preserve the research method; they do not demonstrate
improved forecast accuracy or establish a market-leading ranking. That requires
separate time-separated forecast evaluation against baselines.
