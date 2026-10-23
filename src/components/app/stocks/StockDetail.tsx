import {
  useCreateAlert,
  useJournal,
  usePriceAlerts,
  useTradingPreferences,
} from "@/hooks/use-trading-product";
import { toast } from "sonner";
import { useCalendar } from "@/hooks/use-quant-data";
import { classifyEvent, EVENT_LABELS } from "@/lib/quant/events";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, CandlestickChart, Sparkles, Loader2 } from "lucide-react";
import { usePriceFlash } from "@/hooks/use-price-flash";
import { Card, CardHead, Pill } from "@/components/app/cards";
import { ProgressBar, Segmented } from "@/components/app/pages/workspace";
import { RippleWatchlistButton } from "@/components/app/ripple/RippleResearchActions";
import { OrderPanel } from "@/components/app/stocks/OrderPanel";
import { WatchlistRail } from "@/components/app/stocks/WatchlistRail";
import { useTradingDesk } from "@/components/app/trading-desk-context";
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
import { ForecastCard } from "@/components/app/stocks/ForecastCard";
import { StockMarketData } from "@/components/app/stocks/StockMarketData";
import { StockNewsIntelligence } from "@/components/app/stocks/StockNewsIntelligence";
import { DecisionCanvas } from "@/components/app/stocks/DecisionCanvas";
import { StockRipplePanel } from "@/components/app/stocks/StockRipplePanel";
import { paperQuoteError } from "@/lib/paper-trading";

const ranges = ["1D", "1W", "1M", "6M", "1Y", "5Y"] as const;
type Range = (typeof ranges)[number];
/** Bar sizes each range supports; mirrors the agent service's history contract. */
const INTERVALS: Record<Range, readonly string[]> = {
  "1D": ["1m", "5m", "15m"],
  "1W": ["1m", "5m", "15m", "60m"],
  "1M": ["5m", "15m", "60m", "1d"],
  "6M": ["60m", "1d"],
  "1Y": ["1d"],
  "5Y": ["1d"],
};
const INTERVAL_LABELS: Record<string, string> = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "60m": "1h",
  "1d": "1D",
};
const INTERVAL_SECONDS: Record<string, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "60m": 3600,
  "1d": 86400,
};

function ChartRangeControls({
  range,
  onRange,
  interval,
  onInterval,
}: {
  range: Range;
  onRange: (range: Range) => void;
  interval: string | undefined;
  onInterval: (interval: string) => void;
}) {
  const options = INTERVALS[range];
  return (
    <div className="flex items-center gap-1">
      <Segmented items={ranges} value={range} onChange={onRange} label="Chart range" />
      <label className="sr-only" htmlFor="chart-interval">
        Bar interval
      </label>
      <select
        id="chart-interval"
        value={interval ?? options[0]}
        onChange={(event) => onInterval(event.target.value)}
        disabled={options.length < 2}
        title="Bar interval"
        className="h-8 rounded-md border border-border bg-background/50 px-1.5 font-mono text-[12px] text-muted-foreground hover:text-foreground disabled:opacity-60"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {INTERVAL_LABELS[option]}
          </option>
        ))}
      </select>
    </div>
  );
}
/** Price → research → deliberate decision, with supplementary market detail on demand. */
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
  const [range, setRangeState] = useState<Range>("1D");
  const [interval, setInterval] = useState<string | null>(null);
  const setRange = (next: Range) => {
    setRangeState(next);
    setInterval(null);
  };
  const { data: priceAlerts } = usePriceAlerts();
  const createAlert = useCreateAlert();
  const chartAlerts = useMemo(
    () =>
      (priceAlerts ?? []).flatMap((alert) =>
        alert.symbol === reference.symbol &&
        alert.enabled &&
        !alert.triggered_at &&
        alert.threshold != null &&
        (alert.alert_type === "PRICE_ABOVE" || alert.alert_type === "PRICE_BELOW")
          ? [{ id: alert.id, price: alert.threshold, above: alert.alert_type === "PRICE_ABOVE" }]
          : [],
      ),
    [priceAlerts, reference.symbol],
  );
  const addChartAlert = (price: number, above: boolean) => {
    const threshold = Math.round(price * 20) / 20;
    createAlert.mutate(
      {
        symbol: reference.symbol,
        alert_type: above ? "PRICE_ABOVE" : "PRICE_BELOW",
        threshold,
        note: "Set from chart",
        enabled: true,
      },
      {
        onSuccess: () =>
          toast.success(
            `Alert set: ${reference.symbol} ${above ? "above" : "below"} ₹${formatNum(threshold)}`,
          ),
        onError: () => toast.error("Alert could not be saved"),
      },
    );
  };
  const metrics = useStockMetrics(reference.symbol);
  const fundamentals = useStockFundamentals(reference.symbol);
  const history = useMarketHistory(reference.symbol, range, interval);
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
    const duration = INTERVAL_SECONDS[history.data!.interval] ?? 60;
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

  // Without a live quote, the latest provider candle still gives a real reference price.
  const candles = history.data?.candles;
  const lastClose = quote?.price == null ? candles?.at(-1) : undefined;
  const priorClose = history.data?.interval === "1d" ? candles?.at(-2)?.close : undefined;
  const shownPrice = quote?.price ?? lastClose?.close ?? null;
  const shownChange =
    quote?.change != null && quote.change_pct != null
      ? { abs: quote.change, pct: quote.change_pct }
      : lastClose && priorClose
        ? {
            abs: lastClose.close - priorClose,
            pct: ((lastClose.close - priorClose) / priorClose) * 100,
          }
        : null;
  const shownUp = (shownChange?.pct ?? 0) >= 0;
  const flash = usePriceFlash(quote?.price);
  const { openTicket } = useTradingDesk();
  // Large dealing screens keep the ticket open beside the chart, as brokers do.
  const ticketRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (window.matchMedia("(min-width: 1536px)").matches && ticketRef.current)
      ticketRef.current.open = true;
  }, []);
  const trade = (side: "BUY" | "SELL") =>
    openTicket({ symbol: reference.symbol, side, ...(quote?.price ? { price: quote.price } : {}) });
  const feedState = !quote
    ? lastClose
      ? { label: "Last close", tone: "muted" as const }
      : feed.error
        ? { label: "Quote unavailable", tone: "muted" as const }
        : { label: "Connecting…", tone: "muted" as const }
    : quote.market_session === "closed"
      ? { label: "Market closed", tone: "muted" as const }
      : feed.stale
        ? { label: "Stale quote", tone: "warning" as const }
        : quote.delayed
          ? { label: "Delayed", tone: "warning" as const }
          : { label: "Live", tone: "positive" as const };
  const source =
    quote?.source === "fyers"
      ? "Fyers"
      : quote?.source === "yahoo"
        ? "Yahoo · may be delayed"
        : null;
  const intervalSeconds = history.data?.interval
    ? (INTERVAL_SECONDS[history.data.interval] ?? 60)
    : undefined;
  const stats = [
    { label: "Open", value: quote?.open != null ? formatNum(quote.open) : "—" },
    { label: "High", value: quote?.high != null ? formatNum(quote.high) : "—" },
    { label: "Low", value: quote?.low != null ? formatNum(quote.low) : "—" },
    {
      label: "Volume",
      value: quote?.volume != null ? `${(quote.volume / 1e6).toFixed(2)}M` : "—",
    },
    {
      label: "52W range",
      value:
        weekLow != null && weekHigh != null
          ? `${formatNum(weekLow, 0)} – ${formatNum(weekHigh, 0)}`
          : "—",
    },
  ];
  const sectionLink =
    "inline-flex min-h-10 items-center border-b-2 border-transparent px-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground";

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header className="dash-rise flex flex-col gap-3 rounded-lg border border-border bg-panel/60 px-4 py-3 xl:flex-row xl:items-center xl:gap-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/app/$section"
            params={{ section: "markets" }}
            aria-label="Back to markets"
            title="Markets"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-subtle transition-colors hover:border-border-strong hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[20px] leading-tight font-semibold tracking-tight">
                {stock.symbol}
              </h1>
              <Pill tone="primary">NSE · EQ</Pill>
            </div>
            <p className="truncate text-[12px] text-subtle">
              {stock.company} · {stock.sector}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p
            className={cn(
              "rounded px-1 font-mono text-[26px] leading-tight font-semibold num-tabular tracking-tight",
              flash,
            )}
          >
            {shownPrice != null ? `₹${formatNum(shownPrice)}` : "—"}
          </p>
          <p
            className={cn(
              "font-mono text-[14px] font-medium num-tabular",
              shownChange == null
                ? "text-[13px] text-subtle"
                : shownUp
                  ? "text-positive"
                  : "text-negative",
            )}
          >
            {shownChange
              ? `${shownUp ? "+" : ""}${formatNum(shownChange.abs)} (${shownUp ? "+" : ""}${formatNum(shownChange.pct)}%)`
              : "Waiting for market quote"}
          </p>
        </div>

        <dl className="grid grid-cols-3 gap-x-5 gap-y-2 text-[12px] sm:grid-cols-5 xl:ml-auto xl:flex xl:gap-6">
          {stats.map((metric) => (
            <div key={metric.label} className="min-w-0">
              <dt className="text-[11px] whitespace-nowrap text-subtle">{metric.label}</dt>
              <dd className="mt-0.5 font-mono whitespace-nowrap num-tabular text-foreground">
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => trade("BUY")}
            title="Paper buy (B)"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-positive/90 px-4 text-[13px] font-semibold text-background transition-colors hover:bg-positive"
          >
            Buy
            <kbd className="hidden rounded bg-background/20 px-1 font-sans text-[10px] sm:inline">
              B
            </kbd>
          </button>
          <button
            type="button"
            onClick={() => trade("SELL")}
            title="Paper sell (S)"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-negative/90 px-4 text-[13px] font-semibold text-background transition-colors hover:bg-negative"
          >
            Sell
            <kbd className="hidden rounded bg-background/20 px-1 font-sans text-[10px] sm:inline">
              S
            </kbd>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:flex-col xl:items-end xl:gap-1">
          <span
            role="status"
            title={feed.error ?? undefined}
            className={cn(
              "inline-flex items-center gap-1.5 text-[12px] font-medium",
              feedState.tone === "positive"
                ? "text-positive"
                : feedState.tone === "warning"
                  ? "text-warning"
                  : "text-muted-foreground",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                feedState.tone === "positive"
                  ? "live-dot bg-positive"
                  : feedState.tone === "warning"
                    ? "bg-warning"
                    : "bg-subtle",
              )}
            />
            {feedState.label}
          </span>
          {lastClose && (
            <span className="font-mono text-[11px] text-subtle">
              {new Date(lastClose.time * 1000).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
              })}
            </span>
          )}
          {(source || quote?.as_of) && (
            <span className="font-mono text-[11px] text-subtle">
              {source}
              {source && quote?.as_of ? " · " : ""}
              {quote?.as_of &&
                new Date(quote.as_of).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
            </span>
          )}
        </div>
      </header>

      <nav
        aria-label="Stock workspace sections"
        className="flex flex-wrap items-center gap-1 border-b border-border"
      >
        <a href="#stock-price" className={cn(sectionLink, "border-primary text-foreground")}>
          Chart
        </a>
        <a href="#stock-research" className={sectionLink}>
          Research
        </a>
        <a href="#stock-decision" className={sectionLink}>
          Decision plan
        </a>
        <div className="ml-auto pb-1">
          <RippleWatchlistButton key={reference.symbol} symbol={reference.symbol} />
        </div>
      </nav>

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section
          id="stock-price"
          aria-label="Price action"
          className="min-w-0 scroll-mt-24 xl:col-start-1 xl:row-start-1"
        >
          <Card delay={80}>
            <h2 className="sr-only">{`${stock.symbol} price action`}</h2>
            {chartCandles?.length ? (
              <ProfessionalChart
                stock={stock}
                marketCandles={chartCandles}
                events={chartEvents}
                marketSource={
                  history.data?.served_from_cache
                    ? `Last known candles · saved ${new Date(history.data.cached_at ?? "").toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} · provider offline`
                    : history.data?.source === "fyers"
                      ? "Fyers OHLCV"
                      : "Yahoo OHLCV · may be delayed"
                }
                alerts={chartAlerts}
                onCreateAlert={addChartAlert}
                toolbarStart={
                  <ChartRangeControls
                    range={range}
                    onRange={setRange}
                    interval={interval ?? history.data?.interval}
                    onInterval={setInterval}
                  />
                }
                {...(preferences
                  ? {
                      defaultChartType: preferences.chart_type,
                      showVolume: preferences.show_volume,
                    }
                  : {})}
                {...(intervalSeconds ? { intervalSeconds } : {})}
              />
            ) : (
              <>
                <div className="flex min-h-11 items-center border-b border-border px-2 py-1">
                  <ChartRangeControls
                    range={range}
                    onRange={setRange}
                    interval={interval ?? undefined}
                    onInterval={setInterval}
                  />
                </div>
                <div
                  role="status"
                  className="flex h-[380px] flex-col items-center justify-center gap-3 px-6 text-center sm:h-[480px]"
                >
                  {history.error ? (
                    <CandlestickChart className="h-8 w-8 text-subtle/60" aria-hidden="true" />
                  ) : (
                    <Loader2 className="h-6 w-6 animate-spin text-subtle" aria-hidden="true" />
                  )}
                  <div>
                    <p className="text-[14px] font-medium text-foreground">
                      {history.error ? "Chart data unavailable" : "Loading chart…"}
                    </p>
                    <p className="mt-1 text-[12px] text-subtle">
                      {history.error
                        ? "Market data is offline. The chart reloads automatically when it reconnects."
                        : `${range} candles for ${stock.symbol}`}
                    </p>
                  </div>
                </div>
              </>
            )}
            {history.data && history.error && (
              <p className="border-t border-border px-4 py-2 text-xs text-warning">
                History refresh failed; showing cached candles.
              </p>
            )}
            {showDemoPanels && (
              <details className="border-t border-border">
                <summary className="cursor-pointer px-4 py-3 text-[13px] font-medium text-muted-foreground">
                  Technical factors · momentum, volatility & RSI
                </summary>
                <div className="grid gap-px border-t border-border bg-border sm:grid-cols-3">
                  {[
                    { label: "Momentum", value: metrics.data?.momentum },
                    { label: "Volatility", value: metrics.data?.volatility },
                    { label: "RSI", value: metrics.data?.rsi },
                  ].map((metric, index) => (
                    <div key={metric.label} className="bg-panel p-4">
                      <div className="flex justify-between text-[12px] text-subtle">
                        <span>{metric.label}</span>
                        <span className="font-mono text-foreground">
                          {metric.value == null ? "—" : formatNum(metric.value)}
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
              </details>
            )}
          </Card>
        </section>

        <aside
          aria-label="Trading and market detail"
          className="flex min-w-0 flex-col gap-3 xl:sticky xl:top-[6rem] xl:col-start-2 xl:row-span-3 xl:row-start-1 xl:max-h-[calc(100dvh-6.75rem)] xl:self-start xl:overflow-y-auto xl:overscroll-contain xl:pr-0.5 [scrollbar-width:thin]"
        >
          <details ref={ticketRef} className="min-w-0 rounded-lg border border-border bg-panel/60">
            <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-[14px] font-medium">
              Paper order ticket
              <span className="text-[12px] font-normal text-subtle">Buy · Sell</span>
            </summary>
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
          </details>

          <WatchlistRail active={reference.symbol} />

          <details className="min-w-0 rounded-lg border border-border bg-panel/60 [&>div]:grid-cols-1">
            <summary className="cursor-pointer px-4 py-3 text-[13px] font-medium">
              Market depth & session detail
            </summary>
            <StockMarketData quote={quote} stale={feed.stale} />
          </details>

          {showDemoPanels && (
            <details className="min-w-0 rounded-lg border border-border bg-panel/60">
              <summary className="cursor-pointer px-4 py-3 text-[13px] font-medium">
                Key statistics & 52-week range
              </summary>
              <Card className="rounded-none border-x-0 border-b-0">
                <CardHead title="Key statistics" meta="Provider fundamentals" />
                <dl className="divide-y divide-border">
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
                    <div key={label} className="flex items-center justify-between px-4 py-2">
                      <dt className="text-[12px] text-subtle">{label}</dt>
                      <dd className="font-mono text-[12.5px] num-tabular">{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="border-t border-border px-4 py-3">
                  <div className="flex justify-between text-[12px] text-subtle">
                    <span>52-week position</span>
                    <span className="font-mono text-muted-foreground">
                      {rangePos == null ? "—" : `${Math.round(rangePos)}%`}
                    </span>
                  </div>
                  <div className="relative mt-2 h-1 overflow-hidden rounded-full bg-panel-elevated">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-primary/70"
                      style={{ width: `${rangePos ?? 0}%` }}
                    />
                  </div>
                </div>
              </Card>
            </details>
          )}
        </aside>

        <section
          id="stock-research"
          aria-label="Research and evidence"
          className="flex min-w-0 scroll-mt-24 flex-col gap-4 xl:col-start-1"
        >
          <section
            aria-label="Latest agent prediction"
            className="rounded-lg border border-border bg-panel/60 p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-center gap-3">
              <Sparkles className="h-4 w-4 text-primary-soft" aria-hidden="true" />
              <h2 className="text-sm font-semibold">Research summary</h2>
              {verdict ? (
                <Pill
                  tone={
                    verdict === "BUY" ? "positive" : verdict === "SELL" ? "negative" : "neutral"
                  }
                >
                  {verdict}
                </Pill>
              ) : analysis.isPending ||
                analysis.data?.status === "running" ||
                analysis.data?.status === "queued" ? (
                <Loader2
                  className="h-4 w-4 animate-spin text-subtle"
                  aria-label="Analysis pending"
                />
              ) : (
                <Pill>{analysis.error ? "Offline" : "Not completed"}</Pill>
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
                {analysis.error
                  ? " · status connection unavailable; refresh to reconnect"
                  : analysis.data?.status.startsWith("failed")
                    ? " · latest analysis failed; previous research retained"
                    : analysis.data?.status === "running" || analysis.data?.status === "queued"
                      ? " · new analysis in progress"
                      : completedAnalysis.serving?.freshness === "stale"
                        ? " · older research; refresh pending"
                        : ""}
              </p>
            )}
            {analysis.error && (
              <p role="alert" className="mt-2 text-xs text-muted-foreground">
                {analysis.error.message}
              </p>
            )}
          </section>

          <ForecastCard symbol={reference.symbol} lastPrice={shownPrice} />
          <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <AgentPrediction analysis={analysis} />
            <StockRipplePanel symbol={reference.symbol} />
          </div>
          <StockNewsIntelligence symbol={reference.symbol} />
        </section>

        <section
          id="stock-decision"
          aria-label="Decision planning"
          className="min-w-0 scroll-mt-24 xl:col-start-1"
        >
          <DecisionCanvas
            symbol={reference.symbol}
            quote={
              quote?.price != null
                ? { price: quote.price, source: quote.source ?? null, as_of: quote.as_of ?? null }
                : null
            }
          />
        </section>
      </div>
    </div>
  );
}
