import { useJournal, useTradingPreferences } from "@/hooks/use-trading-product";
import { useCalendar } from "@/hooks/use-quant-data";
import { classifyEvent, EVENT_LABELS } from "@/lib/quant/events";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Sparkles, Loader2 } from "lucide-react";
import { Card, CardHead, Pill, SourceTag } from "@/components/app/cards";
import { MetricStrip, ProgressBar, Segmented } from "@/components/app/pages/workspace";
import { OrderPanel } from "@/components/app/stocks/OrderPanel";
import { ProfessionalChart } from "@/components/app/stocks/ProfessionalChart";
import { type InstrumentMeta, type Nifty50Stock } from "@/data/nifty50";
import { formatNum } from "@/hooks/use-dashboard-data";
import { cn } from "@/lib/utils";
import {
  useStockPrediction,
  useStockQuote,
  useMarketHistory,
  useStockMetrics,
  useStockFundamentals,
} from "@/hooks/use-agent-stock";
import { AgentPrediction } from "@/components/app/stocks/AgentPrediction";
import { StockMarketData } from "@/components/app/stocks/StockMarketData";
import { StockNewsIntelligence } from "@/components/app/stocks/StockNewsIntelligence";
import { paperQuoteError } from "@/lib/paper-trading";

const ranges = ["1D", "1W", "1M", "6M", "1Y"] as const;
/** Dedicated instrument workspace: price, agent prediction, sentiment, news and dealing. */
export function StockDetail({
  stock: reference,
  showDemoPanels = true,
}: {
  stock: InstrumentMeta;
  showDemoPanels?: boolean;
}) {
  const feed = useStockQuote(reference.symbol);
  const { data: preferences } = useTradingPreferences();
  const calendar = useCalendar();
  const { data: journal } = useJournal();
  // Chart overlays: NSE calendar events and your own decision plans for this symbol.
  const chartEvents = useMemo(
    () => [
      ...(calendar.data?.events ?? [])
        .filter((e) => (e.symbol ?? e.event.split(":")[0]?.trim()) === reference.symbol)
        .map((e) => ({
          time: Math.floor(Date.parse(e.event_time) / 1000),
          label: e.event,
          kind: EVENT_LABELS[classifyEvent(e.event) ?? "BOARD_MEETING"],
        })),
      ...(journal ?? [])
        .filter((e) => e.symbol === reference.symbol)
        .map((e) => ({
          time: Math.floor(Date.parse(e.created_at) / 1000),
          label: e.thesis.slice(0, 80) || "Decision plan",
          kind: e.plan?.decision === "NO_TRADE" ? "No-trade decision" : "Decision plan",
        })),
    ],
    [calendar.data, journal, reference.symbol],
  );
  const analysis = useStockPrediction(reference.symbol);
  const quote = feed.quote;
  // Unobserved values stay null; they are never displayed as zero.
  const stock: Nifty50Stock = {
    ...reference,
    price: quote?.price ?? null,
    changePct: quote?.change_pct ?? null,
  };
  const completedAnalysis =
    analysis.data?.status === "done" ? analysis.data : analysis.data?.previous_result;
  const verdict = completedAnalysis?.decision?.action.toUpperCase();
  const [range, setRange] = useState<(typeof ranges)[number]>("1D");
  const metrics = useStockMetrics(reference.symbol);
  const fundamentals = useStockFundamentals(reference.symbol);
  const history = useMarketHistory(reference.symbol, range);
  const chartCandles = useMemo(() => {
    const data = history.data?.candles;
    if (
      !data?.length ||
      !quote?.price ||
      !quote.as_of ||
      feed.stale ||
      quote.market_session !== "open"
    )
      return data;
    const last = data[data.length - 1]!;
    const tradeTime = Date.parse(quote.as_of) / 1000;
    const duration =
      { "1m": 60, "15m": 900, "60m": 3600, "1d": 86400 }[history.data!.interval] ?? 60;
    if (tradeTime < last.time) return data;
    // Update the provider's current bar with real ticks. Historical candles
    // retain their original values; an absent bar waits for history refresh.
    if (tradeTime >= last.time + duration) return data;
    return [
      ...data.slice(0, -1),
      {
        ...last,
        close: quote.price,
        high: Math.max(last.high, quote.price),
        low: Math.min(last.low, quote.price),
      },
    ];
  }, [history.data, quote, feed.stale]);
  const up = (stock.changePct ?? 0) >= 0;
  const weekLow = fundamentals.data?.week_low ?? metrics.data?.week_low;
  const weekHigh = fundamentals.data?.week_high ?? metrics.data?.week_high;
  const rangePos =
    weekLow != null && weekHigh != null && quote?.price != null
      ? Math.min(100, Math.max(0, ((quote.price - weekLow) / (weekHigh - weekLow || 1)) * 100))
      : null;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="dash-rise border-b border-border pb-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              to="/app/$section"
              params={{ section: "markets" }}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-subtle transition-colors hover:text-primary-soft"
            >
              <ArrowLeft className="h-3 w-3" />
              Markets
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <h1 className="text-[28px] leading-tight font-semibold tracking-tight">
                {stock.symbol}
              </h1>
              <Pill tone="primary">NSE · EQ</Pill>
              <Pill>{stock.sector}</Pill>
            </div>
            <p className="mt-1 text-[14px] text-muted-foreground">{stock.company}</p>
          </div>
          <div className="text-left lg:text-right">
            <p className="font-mono text-[32px] leading-tight font-semibold num-tabular tracking-tight">
              {quote?.price != null ? `₹${formatNum(quote.price)}` : "—"}
            </p>
            <p
              className={cn(
                "mt-1 font-mono text-[14px] font-medium",
                quote?.change_pct == null ? "text-subtle" : up ? "text-positive" : "text-negative",
              )}
            >
              {quote?.change != null && quote.change_pct != null
                ? `${up ? "+" : ""}${formatNum(quote.change)} · ${up ? "+" : ""}${formatNum(quote.change_pct)}%`
                : "Waiting for market quote"}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 lg:justify-end">
              <SourceTag
                label={
                  quote?.source === "fyers"
                    ? "Fyers"
                    : quote?.source === "yahoo"
                      ? "Yahoo fallback · may be delayed"
                      : "Connecting feed"
                }
              />
              {quote?.as_of && (
                <span className="font-mono text-[11px] text-subtle">
                  {new Date(quote.as_of).toLocaleString("en-IN")}
                </span>
              )}
              {quote && (
                <Pill tone={feed.stale || quote.delayed ? "warning" : "positive"}>
                  {quote.market_session === "closed"
                    ? "Market closed · last quote"
                    : feed.stale
                      ? "Stale quote"
                      : quote.delayed
                        ? "Delayed feed"
                        : "Live"}
                </Pill>
              )}
              {feed.error && (
                <p role="alert" className="text-xs text-negative">
                  {feed.error}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="mt-5">
          <MetricStrip
            items={[
              { label: "Open", value: quote?.open != null ? `₹${formatNum(quote.open)}` : "—" },
              {
                label: "Day range",
                value:
                  quote?.low != null && quote.high != null
                    ? `₹${formatNum(quote.low)} – ₹${formatNum(quote.high)}`
                    : "—",
              },
              {
                label: "Volume",
                value: quote?.volume != null ? `${(quote.volume / 1e6).toFixed(2)}M` : "—",
              },
              {
                label: analysis.data?.previous_result ? "Previous AI verdict" : "Quant AI verdict",
                value:
                  verdict ??
                  (analysis.error
                    ? "Unavailable"
                    : analysis.data?.status.startsWith("failed")
                      ? "Failed"
                      : "Analysing"),
                note: completedAnalysis?.thesis
                  ? `Agent opinion ${Math.round(completedAnalysis.thesis.conviction * 100)}/100 (uncalibrated)`
                  : "Agentic AI",
                tone: verdict === "BUY" ? "positive" : verdict === "SELL" ? "negative" : "primary",
              },
            ]}
          />
        </div>
      </header>

      <section
        aria-label="Latest agent prediction"
        className="rounded-lg border border-primary/30 bg-primary/5 p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-center gap-3">
          <Sparkles className="h-4 w-4 text-primary-soft" aria-hidden="true" />
          <h2 className="text-sm text-primary-soft">Latest full research</h2>
          {verdict ? (
            <Pill
              tone={verdict === "BUY" ? "positive" : verdict === "SELL" ? "negative" : "neutral"}
            >
              {verdict}
            </Pill>
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-subtle" aria-label="Analysis pending" />
          )}
          <span className="ml-auto text-xs text-subtle">Research only · daily timeframe</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {completedAnalysis?.decision?.rationale ??
            "No completed prediction yet. Full research includes analyst, debate and risk review; findings appear as each stage finishes."}
        </p>
        {completedAnalysis && (
          <p className="mt-2 font-mono text-[10px] text-subtle">
            Data cutoff {new Date(completedAnalysis.as_of).toLocaleString("en-IN")}
            {analysis.data?.status !== "done"
              ? " · refreshing in background"
              : completedAnalysis.serving?.freshness === "stale"
                ? " · older research; refresh pending"
                : ""}
          </p>
        )}
        {analysis.error && (
          <p role="alert" className="mt-2 text-xs text-warning">
            {analysis.error.message}
          </p>
        )}
      </section>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.9fr)_minmax(320px,.8fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card glow delay={160}>
            <CardHead
              title={`${stock.symbol} price action`}
              meta={`${range} · ${history.data?.source === "fyers" ? "Fyers candles" : "Yahoo fallback · may be delayed"}`}
              action={
                <Segmented items={ranges} value={range} onChange={setRange} label="Chart range" />
              }
            />
            {chartCandles?.length ? (
              <ProfessionalChart
                stock={stock}
                marketCandles={chartCandles}
                events={chartEvents}
                marketSource={
                  history.data?.source === "fyers" ? "Fyers OHLCV" : "Yahoo OHLCV · may be delayed"
                }
                {...(preferences
                  ? {
                      defaultChartType: preferences.chart_type,
                      showVolume: preferences.show_volume,
                    }
                  : {})}
                {...(history.data?.interval
                  ? {
                      intervalSeconds:
                        { "1m": 60, "15m": 900, "60m": 3600, "1d": 86400 }[history.data.interval] ??
                        60,
                    }
                  : {})}
              />
            ) : (
              <p className="p-6 text-sm text-muted-foreground">
                {history.error?.message ?? "Loading market history…"}
              </p>
            )}
            {history.data && history.error && (
              <p className="px-5 py-2 text-xs text-warning">
                History refresh failed; showing cached candles.
              </p>
            )}
            {showDemoPanels && (
              <>
                <p className="px-5 py-2 text-xs text-subtle">
                  Technical factors use completed provider candles; unavailable factors are left
                  blank.
                </p>
                <div className="grid gap-px border-t border-border bg-border sm:grid-cols-3">
                  {[
                    { label: "Momentum", value: metrics.data?.momentum },
                    { label: "Volatility", value: metrics.data?.volatility },
                    { label: "RSI", value: metrics.data?.rsi },
                  ].map((metric, index) => (
                    <div key={metric.label} className="bg-panel/80 p-4">
                      <div className="flex justify-between font-medium text-[11px] tracking-[0.06em] uppercase text-subtle">
                        <span>{metric.label}</span>
                        <span className="text-muted-foreground">
                          {metric.value == null ? "Unavailable" : formatNum(metric.value)}
                        </span>
                      </div>
                      {metric.label === "RSI" && metric.value != null && (
                        <div className="mt-3">
                          <ProgressBar
                            value={metric.value}
                            tone="primary"
                            delay={420 + index * 90}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          <AgentPrediction analysis={analysis} />
          <StockMarketData quote={quote} stale={feed.stale} />

          <StockNewsIntelligence symbol={reference.symbol} />
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <OrderPanel
            key={stock.symbol}
            stock={stock}
            quoteError={
              !feed.connected ? "Connecting to live market prices…" : paperQuoteError(quote)
            }
            marketClosed={quote?.market_session === "closed"}
            practiceQuoteError={
              !feed.connected
                ? "Connecting to market prices…"
                : paperQuoteError(quote, Date.now(), "LAST_SESSION_PRACTICE")
            }
          />

          {showDemoPanels && (
            <Card delay={320}>
              <CardHead title="Key statistics" meta="Provider fundamentals" />
              <dl className="grid grid-cols-2 gap-px bg-border">
                {[
                  [
                    "Market cap",
                    fundamentals.data?.market_cap != null
                      ? `₹${(fundamentals.data.market_cap / 10000000).toFixed(2)} Cr`
                      : "—",
                  ],
                  [
                    "P/E ratio",
                    fundamentals.data?.pe_ratio != null
                      ? formatNum(fundamentals.data.pe_ratio, 1)
                      : "—",
                  ],
                  [
                    "Dividend yield",
                    fundamentals.data?.dividend_yield != null
                      ? `${formatNum(fundamentals.data.dividend_yield * 100)}%`
                      : "—",
                  ],
                  [
                    "Beta",
                    fundamentals.data?.beta != null ? formatNum(fundamentals.data.beta) : "—",
                  ],
                  [
                    "52W range",
                    weekLow != null && weekHigh != null
                      ? `₹${formatNum(weekLow, 0)} – ₹${formatNum(weekHigh, 0)}`
                      : "—",
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="bg-panel/80 px-4 py-3.5">
                    <dt className="font-medium text-[11px] tracking-[0.06em] uppercase text-subtle">
                      {label}
                    </dt>
                    <dd className="mt-1.5 font-mono text-[12.5px] num-tabular">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="border-t border-border p-5">
                <div className="flex justify-between font-medium text-[11px] tracking-[0.06em] uppercase text-subtle">
                  <span>52-week position</span>
                  <span className="text-muted-foreground">
                    {rangePos == null ? "—" : `${Math.round(rangePos)}%`}
                  </span>
                </div>
                <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-panel-elevated">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-primary/70"
                    style={{ width: `${rangePos ?? 0}%` }}
                  />
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
