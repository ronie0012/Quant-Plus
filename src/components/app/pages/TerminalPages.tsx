import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  ChevronRight,
  Filter,
  Search,
  ShieldCheck,
  Star,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHead, EmptyState, Pill, Skeleton, SourceTag } from "@/components/app/cards";
import { MetricStrip, PageIntro, ProgressBar, Segmented, SparkChart } from "./workspace";
import {
  formatINR,
  formatNum,
  relativeTime,
  useInstruments,
  useNews,
  useSentiment,
  useWatchlist,
  useMarkedHoldings,
  useIndexHistory,
  useAnalyses,
} from "@/hooks/use-dashboard-data";
import { toPath } from "@/data/market";
import { StockBoard } from "@/components/app/stocks/StockBoard";
import { cn } from "@/lib/utils";
import { useStockMetrics, useStockQuotes } from "@/hooks/use-agent-stock";
import { useMarketIntelligence } from "@/hooks/use-intelligence";
import { useCalendar } from "@/hooks/use-quant-data";
import { useJournal } from "@/hooks/use-trading-product";
import { useOrders } from "@/hooks/use-orders";
import { PortfolioIntelligence } from "@/components/app/pages/PortfolioIntelligence";
import { WatchlistPicker } from "@/components/app/stocks/WatchlistPicker";

const marketRanges = ["1D", "1W", "1M", "3M", "1Y"] as const;

function ProviderIndexChart({
  symbol,
  range,
  positive,
}: {
  symbol: string;
  range: string;
  positive: boolean;
}) {
  const history = useIndexHistory(symbol, range);
  const closes = history.data?.candles.map((c) => c.close) ?? [];
  const low = closes.length ? Math.min(...closes) : 0;
  const high = closes.length ? Math.max(...closes) : 1;
  const span = high - low || 1;
  const path =
    closes.length > 1
      ? toPath(
          closes.map((value) => (value - low) / span),
          1000,
          280,
        )
      : "";
  return (
    <div className="relative h-[280px]">
      <svg
        viewBox="0 0 1000 280"
        preserveAspectRatio="none"
        className="h-full w-full"
        role="img"
        aria-label={`${symbol} provider price history`}
      >
        {[0.2, 0.4, 0.6, 0.8].map((line) => (
          <line
            key={line}
            x1="0"
            x2="1000"
            y1={280 * line}
            y2={280 * line}
            stroke="var(--color-border)"
          />
        ))}
        {path ? (
          <path
            d={path}
            fill="none"
            strokeWidth="2"
            className={positive ? "stroke-positive" : "stroke-negative"}
          />
        ) : (
          <text x="500" y="140" textAnchor="middle" className="fill-subtle text-[14px]">
            {history.isLoading
              ? "Loading provider history…"
              : history.isError
                ? "Provider history unavailable"
                : "No provider history for this range"}
          </text>
        )}
      </svg>
      {history.isError && (
        <button
          type="button"
          className="absolute bottom-8 left-1/2 min-h-11 -translate-x-1/2 rounded-md border border-border px-3 text-xs text-primary-soft hover:text-foreground"
          onClick={() => void history.refetch()}
        >
          Retry history
        </button>
      )}
      <span className="absolute right-3 bottom-3 font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
        {history.data?.source ? `${history.data.source} OHLCV` : "Awaiting provider history"}
      </span>
    </div>
  );
}

export function MarketsPage() {
  const { data, isLoading, isError, refetch } = useInstruments();
  const { data: sentiment } = useSentiment();
  const { data: news } = useNews();
  const [selected, setSelected] = useState(0);
  const [range, setRange] = useState<(typeof marketRanges)[number]>("1D");
  const [contextOpen, setContextOpen] = useState(false);
  const instrument = data?.[selected];
  if (isLoading)
    return (
      <div className="flex flex-col gap-5">
        <PageIntro
          eyebrow="Markets desk"
          title="Discover stocks"
          body="Building a unified view of current market structure."
        >
          <Skeleton className="h-24 w-full" />
        </PageIntro>
        <StockBoard />
      </div>
    );
  if (isError || !data?.length || !instrument)
    return (
      <div className="flex flex-col gap-5">
        <PageIntro
          eyebrow="Markets desk"
          title="Discover stocks"
          body="Index-level context is unavailable, so the constituent board is shown on its own."
        />
        <Card>
          <EmptyState
            title="No index feed"
            hint="The index source is temporarily unavailable."
            onRetry={() => void refetch()}
          />
        </Card>
        <StockBoard />
      </div>
    );

  const up = (instrument.change_pct ?? 0) >= 0;
  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Discover"
        title="Discover stocks"
        body="Check market context, choose a company, then open its evidence before making a decision."
        action={
          <SourceTag label={instrument.source ? instrument.source.toUpperCase() : "UNAVAILABLE"} />
        }
      >
        <MetricStrip
          items={data.slice(0, 4).map((i) => ({
            label: i.name,
            value:
              i.value == null
                ? "—"
                : `${i.kind === "commodity" ? "₹" : ""}${formatNum(i.value, i.kind === "commodity" ? 0 : 2)}`,
            note:
              i.change_pct == null
                ? "Unavailable"
                : `${i.change_pct >= 0 ? "+" : ""}${formatNum(i.change_pct)}%`,
            ...(i.change_pct == null
              ? {}
              : { tone: i.change_pct >= 0 ? ("positive" as const) : ("negative" as const) }),
          }))}
        />
      </PageIntro>
      <StockBoard />
      <details
        className="rounded-lg border border-border bg-panel/40"
        onToggle={(event) => setContextOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer px-5 py-4 text-sm font-medium">
          Index charts & market drivers
        </summary>
        {contextOpen && (
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(300px,.7fr)]">
            <Card glow delay={180}>
              <CardHead
                title={instrument.name}
                meta={`${instrument.symbol} · ${instrument.updated_at ? `updated ${relativeTime(instrument.updated_at)}` : "awaiting provider data"}`}
                action={
                  <Segmented
                    items={marketRanges}
                    value={range}
                    onChange={setRange}
                    label="Chart range"
                  />
                }
              />
              <div className="border-b border-border px-5 py-5">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="font-mono text-[clamp(1.8rem,4vw,3rem)] num-tabular">
                      {instrument.value != null
                        ? `${instrument.kind === "commodity" ? "₹" : ""}${formatNum(instrument.value, instrument.kind === "commodity" ? 0 : 2)}`
                        : "—"}
                    </p>
                    <p
                      className={cn(
                        "mt-2 font-mono text-sm",
                        up ? "text-positive" : "text-negative",
                      )}
                    >
                      {instrument.change_abs != null && instrument.change_pct != null
                        ? `${up ? "+" : ""}${formatNum(instrument.change_abs)} · ${up ? "+" : ""}${formatNum(instrument.change_pct)}%`
                        : "No provider change data"}
                    </p>
                  </div>
                  <Pill tone={sentiment?.label === "BULLISH" ? "positive" : "primary"}>
                    {sentiment?.label ?? "Awaiting regime"}
                  </Pill>
                </div>
              </div>
              <div className="relative overflow-hidden px-3 pt-4">
                <span
                  aria-hidden
                  className="scan-line pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-primary/35"
                />
                <ProviderIndexChart symbol={instrument.symbol} range={range} positive={up} />
              </div>
              <div className="grid gap-px border-t border-border bg-border sm:grid-cols-3">
                {[
                  { l: "Momentum", v: null },
                  { l: "Volatility", v: null },
                  { l: "Sentiment score", v: sentiment?.score ?? null },
                ].map((m, i) => (
                  <div key={m.l} className="bg-panel/80 p-4">
                    <div className="flex justify-between font-medium text-[11px] tracking-[0.06em] uppercase text-subtle">
                      <span>{m.l}</span>
                      <span className="text-muted-foreground">{m.v ?? "Unavailable"}</span>
                    </div>
                    <div className="mt-3">
                      <ProgressBar
                        value={m.v ?? 0}
                        tone={(m.v ?? 0) > 60 ? "positive" : "primary"}
                        delay={500 + i * 100}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <div className="flex flex-col gap-5">
              <Card delay={260}>
                <CardHead title="Instrument board" meta={`${data.length} tracked markets`} />
                <div className="divide-y divide-border">
                  {data.map((item, i) => (
                    <Button
                      key={item.symbol}
                      variant="ghost"
                      onClick={() => setSelected(i)}
                      className={cn(
                        "h-auto w-full justify-start rounded-none px-4 py-3 text-left shadow-none",
                        selected === i && "bg-primary/10",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-[11px] tracking-[0.06em] uppercase">
                          {item.name}
                        </span>
                        <span className="mt-1 block text-[11px] text-subtle">{item.symbol}</span>
                      </span>
                      <span className="text-right font-mono text-[11px] num-tabular">
                        <span className="block">
                          {item.value != null
                            ? formatNum(item.value, item.kind === "commodity" ? 0 : 2)
                            : "—"}
                        </span>
                        <span
                          className={
                            item.change_pct == null
                              ? "text-subtle"
                              : item.change_pct >= 0
                                ? "text-positive"
                                : "text-negative"
                          }
                        >
                          {item.change_pct == null
                            ? "—"
                            : `${item.change_pct >= 0 ? "+" : ""}${formatNum(item.change_pct)}%`}
                        </span>
                      </span>
                    </Button>
                  ))}
                </div>
              </Card>
              <Card delay={340}>
                <CardHead title="Market drivers" meta="Latest intelligence" />
                <ul className="divide-y divide-border">
                  {news?.slice(0, 3).map((n) => (
                    <li key={n.id} className="p-4">
                      <p className="text-[12.5px] leading-relaxed">{n.headline}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="font-medium text-[11px] uppercase text-subtle">
                          {n.source}
                        </span>
                        <Pill tone={n.impact === "HIGH" ? "warning" : "neutral"}>{n.impact}</Pill>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
        )}
      </details>
    </div>
  );
}

const portfolioViews = ["Holdings", "Allocation", "Contribution"] as const;
export function PortfolioPage() {
  const { data, isLoading, isError, refetch } = useMarkedHoldings();
  const calendar = useCalendar();
  const journal = useJournal();
  const orders = useOrders();
  const [view, setView] = useState<(typeof portfolioViews)[number]>("Holdings");
  if (isLoading)
    return (
      <PageIntro
        eyebrow="Portfolio intelligence"
        title="Portfolio"
        body="Calculating exposure and contribution."
      >
        <Skeleton className="h-24 w-full" />
      </PageIntro>
    );
  if (isError || !data?.length)
    return (
      <div className="space-y-5">
        <PageIntro
          eyebrow="Portfolio"
          title="Your paper portfolio"
          body="Track holdings, review exposure, and follow each position back to its decision."
        />
        <Card>
          <EmptyState
            title={isError ? "Portfolio unavailable" : "No portfolio positions yet"}
            hint={
              isError
                ? "Your holdings could not be loaded. Retry before making a decision."
                : "Start by researching a company. A position appears here only after a paper order fills."
            }
            onRetry={isError ? () => void refetch() : undefined}
          />
          {!isError && (
            <div className="flex flex-wrap gap-3 border-t border-border p-5">
              <Button asChild>
                <Link to="/app/$section" params={{ section: "markets" }}>
                  Explore stocks
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/app/$section" params={{ section: "wallet" }}>
                  View paper wallet
                </Link>
              </Button>
            </div>
          )}
        </Card>
      </div>
    );
  const rows = data.map((h) => {
    const invested = h.quantity * h.avg_price,
      current = h.quantity * h.last_price,
      pnl = current - invested,
      pct = invested ? (pnl / invested) * 100 : 0;
    return { ...h, invested, current, pnl, pct };
  });
  const invested = rows.reduce((s, r) => s + r.invested, 0),
    current = rows.reduce((s, r) => s + r.current, 0),
    pnl = current - invested,
    ret = invested ? (pnl / invested) * 100 : 0;
  const sectors = Object.entries(
    rows.reduce<Record<string, number>>((a, r) => {
      a[r.sector ?? "Other"] = (a[r.sector ?? "Other"] ?? 0) + r.current;
      return a;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const degraded = rows.filter((row) => row.quote_missing || row.quote_stale || row.quote_delayed);
  const coveredSymbols = new Set(rows.map((row) => row.symbol));
  const upcoming = (calendar.data?.events ?? [])
    .filter((event) => {
      const symbol = event.symbol ?? event.event.split(":")[0]?.trim();
      const at = Date.parse(event.event_time);
      return Boolean(
        symbol &&
        coveredSymbols.has(symbol) &&
        Number.isFinite(at) &&
        at >= Date.now() - 86_400_000 &&
        at <= Date.now() + 30 * 86_400_000,
      );
    })
    .slice(0, 6);
  const protectedSymbols = new Set(
    (orders.data ?? [])
      .filter(
        (order) =>
          order.status === "OPEN" && (order.stop_loss != null || order.target_price != null),
      )
      .map((order) => order.symbol),
  );
  const unprotected = rows.filter((row) => !protectedSymbols.has(row.symbol));
  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Portfolio intelligence"
        title="Portfolio"
        body="See what drives return, where risk concentrates, and how every position contributes."
        action={
          <Button asChild size="sm" className="font-medium text-[11px] tracking-[0.06em] uppercase">
            <Link to="/app/$section" params={{ section: "risk" }}>
              <ShieldCheck />
              Open risk centre
            </Link>
          </Button>
        }
      >
        <MetricStrip
          items={[
            { label: "Current value", value: formatINR(current), tone: "primary" },
            { label: "Invested capital", value: formatINR(invested) },
            {
              label: "Unrealised P&L",
              value: `${pnl >= 0 ? "+" : ""}${formatINR(pnl)}`,
              tone: pnl >= 0 ? "positive" : "negative",
            },
            {
              label: "Portfolio return",
              value: `${ret >= 0 ? "+" : ""}${ret.toFixed(2)}%`,
              tone: ret >= 0 ? "positive" : "negative",
            },
          ]}
        />
      </PageIntro>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,.75fr)]">
        <Card glow>
          <CardHead
            title="Portfolio ledger"
            meta={`${rows.length} positions · ${rows.length - degraded.length}/${rows.length} fresh marks · paper account`}
            action={
              <Segmented
                items={portfolioViews}
                value={view}
                onChange={setView}
                label="Portfolio view"
              />
            }
          />
          {view === "Holdings" && (
            <div className="overflow-x-auto">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-[1.2fr_.8fr_.8fr_.8fr_.7fr] border-b border-border px-5 py-2 font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                  <span>Instrument</span>
                  <span className="text-right">Invested</span>
                  <span className="text-right">Current</span>
                  <span className="text-right">P&L</span>
                  <span className="text-right">Return</span>
                </div>
                {rows.map((r) => (
                  <div
                    key={r.id}
                    className="group grid grid-cols-[1.2fr_.8fr_.8fr_.8fr_.7fr] items-center border-b border-border px-5 py-4 transition-colors hover:bg-panel-elevated/60"
                  >
                    <div>
                      <p className="font-mono text-[11px] tracking-[0.04em]">{r.symbol}</p>
                      <p className="mt-1 text-[11px] text-subtle">
                        {r.quantity} shares · {r.company}
                      </p>
                      <p
                        className={cn(
                          "mt-1 text-[10px]",
                          r.quote_missing || r.quote_stale || r.quote_delayed
                            ? "text-warning"
                            : "text-subtle",
                        )}
                      >
                        {r.quote_missing
                          ? "No fresh provider mark"
                          : r.quote_stale
                            ? "Stale carried-forward mark"
                            : r.quote_delayed
                              ? "Delayed provider mark"
                              : `Fresh ${r.quote_source ?? "provider"} mark`}
                        {r.quote_as_of
                          ? ` · ${new Date(r.quote_as_of).toLocaleString("en-IN")}`
                          : ""}
                      </p>
                    </div>
                    <span className="text-right font-mono text-[11px]">
                      {formatINR(r.invested)}
                    </span>
                    <span className="text-right font-mono text-[11px]">{formatINR(r.current)}</span>
                    <span
                      className={cn(
                        "text-right font-mono text-[11px]",
                        r.pnl >= 0 ? "text-positive" : "text-negative",
                      )}
                    >
                      {r.pnl >= 0 ? "+" : ""}
                      {formatINR(r.pnl)}
                    </span>
                    <span
                      className={cn(
                        "text-right font-mono text-[11px]",
                        r.pct >= 0 ? "text-positive" : "text-negative",
                      )}
                    >
                      {r.pct >= 0 ? "+" : ""}
                      {r.pct.toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {view === "Allocation" && (
            <div className="p-5">
              <div className="flex h-3 overflow-hidden rounded-full bg-border">
                {rows
                  .sort((a, b) => b.current - a.current)
                  .map((r, i) => (
                    <span
                      key={r.id}
                      className={cn(
                        "grow-bar",
                        i % 3 === 0
                          ? "bg-primary"
                          : i % 3 === 1
                            ? "bg-primary-soft/70"
                            : "bg-positive/60",
                      )}
                      style={{
                        width: `${(r.current / current) * 100}%`,
                        ["--d" as string]: `${i * 100}ms`,
                      }}
                    />
                  ))}
              </div>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {rows.map((r) => (
                  <div key={r.id} className="border border-border bg-background/20 p-4">
                    <div className="flex justify-between">
                      <span className="font-mono text-[10px]">{r.symbol}</span>
                      <span className="font-mono text-[11px] text-primary-soft">
                        {((r.current / current) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="mt-3">
                      <ProgressBar value={(r.current / current) * 100} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {view === "Contribution" && (
            <div className="space-y-4 p-5">
              {[...rows]
                .sort((a, b) => b.pnl - a.pnl)
                .map((r, i) => (
                  <div key={r.id}>
                    <div className="mb-2 flex justify-between text-[12px]">
                      <span>{r.symbol}</span>
                      <span className={r.pnl >= 0 ? "text-positive" : "text-negative"}>
                        {r.pnl >= 0 ? "+" : ""}
                        {formatINR(r.pnl)}
                      </span>
                    </div>
                    <ProgressBar
                      value={Math.max(
                        8,
                        (Math.abs(r.pnl) / Math.max(...rows.map((x) => Math.abs(x.pnl)))) * 100,
                      )}
                      tone={r.pnl >= 0 ? "positive" : "negative"}
                      delay={i * 80}
                    />
                  </div>
                ))}
            </div>
          )}
        </Card>
        <div className="flex flex-col gap-5">
          <Card>
            <CardHead title="Sector exposure" meta="Current market value" />
            <div className="space-y-5 p-5">
              {sectors.map(([name, value], i) => (
                <div key={name}>
                  <div className="mb-2 flex justify-between font-mono text-[10px]">
                    <span className="uppercase tracking-[0.06em] text-muted-foreground">
                      {name}
                    </span>
                    <span>{((value / current) * 100).toFixed(1)}%</span>
                  </div>
                  <ProgressBar value={(value / current) * 100} delay={i * 100} />
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHead title="Risk posture" meta="Concentration diagnostic" />
            <div className="p-5">
              <p className="text-2xl tracking-tight">
                {rows[0] && rows[0].current / current > 0.35 ? "Concentrated" : "Balanced"}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                Largest position represents{" "}
                {((Math.max(...rows.map((r) => r.current)) / current) * 100).toFixed(1)}% of current
                portfolio value.
              </p>
              <div className="mt-5">
                <ProgressBar
                  value={(Math.max(...rows.map((r) => r.current)) / current) * 100}
                  tone="warning"
                />
              </div>
            </div>
          </Card>
        </div>
      </div>
      {degraded.length > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardHead
            title="Data quality needs attention"
            meta="Portfolio totals include the last stored mark where a fresh quote is unavailable"
          />
          <ul className="divide-y divide-border">
            {degraded.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[12px]">
                <span className="font-mono">{row.symbol}</span>
                <span className="min-w-0 flex-1 text-subtle">
                  {row.quote_missing
                    ? "No current provider mark; valuation is unavailable for a fresh decision."
                    : row.quote_stale
                      ? "Carried-forward mark is stale."
                      : "Provider mark is delayed."}
                </span>
                <Link
                  to="/app/stocks/$symbol"
                  params={{ symbol: row.symbol }}
                  className="text-primary-soft hover:text-foreground"
                >
                  Inspect data
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card>
        <CardHead title="Portfolio attention" meta="Events, protection and decision continuity" />
        <div className="grid gap-px bg-border sm:grid-cols-3">
          <div className="bg-panel p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-subtle">
              Upcoming holding events
            </p>
            <p className="mt-2 font-mono text-xl">{upcoming.length}</p>
            <div className="mt-2 space-y-1 text-[11px] text-subtle">
              {upcoming.slice(0, 3).map((event) => (
                <p key={event.id}>
                  {event.symbol ?? event.event.split(":")[0]} · {event.event}
                </p>
              ))}
              {!upcoming.length && <p>No connected events in the next 30 days.</p>}
            </div>
          </div>
          <div className="bg-panel p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-subtle">
              Holdings without protection
            </p>
            <p className="mt-2 font-mono text-xl">{unprotected.length}</p>
            <p className="mt-2 text-[11px] leading-relaxed text-subtle">
              Protection is optional, but every unprotected holding should be an explicit decision.
            </p>
            <Link
              to="/app/$section"
              params={{ section: "orders" }}
              className="mt-2 inline-block text-[11px] text-primary-soft"
            >
              Inspect orders
            </Link>
          </div>
          <div className="bg-panel p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-subtle">
              Open decision plans
            </p>
            <p className="mt-2 font-mono text-xl">
              {(journal.data ?? []).filter((entry) => entry.outcome === "OPEN").length}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-subtle">
              Follow each holding back to its evidence, plan, order and review record.
            </p>
            <Link
              to="/app/$section"
              params={{ section: "journal" }}
              className="mt-2 inline-block text-[11px] text-primary-soft"
            >
              Open Review
            </Link>
          </div>
        </div>
      </Card>
      <PortfolioIntelligence />
    </div>
  );
}

const watchFilters = ["All", "Gainers", "Decliners"] as const;

/** Mean of observed moves only; unknown when no instrument has a quote. */
function averageMove(values: (number | null)[]) {
  const known = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (!known.length) return "—";
  const mean = known.reduce((sum, value) => sum + value, 0) / known.length;
  return `${mean >= 0 ? "+" : ""}${mean.toFixed(2)}% (${known.length}/${values.length})`;
}
export function WatchlistPage() {
  const { data, isLoading, isError, refetch } = useWatchlist();
  const [pickerOpen, setPickerOpen] = useState(false);
  const feed = useStockQuotes((data ?? []).map((item) => item.symbol));
  const [filter, setFilter] = useState<(typeof watchFilters)[number]>("All");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const liveData = useMemo(
    () =>
      data?.map((item) => ({
        ...item,
        // Missing provider observations stay unknown; they are never shown as zero.
        price: feed.quotes[item.symbol]?.price ?? null,
        change_pct: feed.quotes[item.symbol]?.change_pct ?? null,
      })) ?? [],
    [data, feed.quotes],
  );
  const filtered = useMemo(
    () =>
      liveData.filter(
        (w) =>
          (filter === "All" ||
            (w.change_pct != null &&
              (filter === "Gainers" ? w.change_pct >= 0 : w.change_pct < 0))) &&
          (w.symbol.toLowerCase().includes(query.toLowerCase()) ||
            w.company.toLowerCase().includes(query.toLowerCase())),
      ) ?? [],
    [liveData, filter, query],
  );
  const focus = filtered[selected] ?? filtered[0];
  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Personal market radar"
        title="Watchlist"
        body="Track movement, inspect structure and send an instrument directly into analysis."
        action={
          <Button
            size="sm"
            variant="outline"
            className="font-medium text-[11px] uppercase tracking-[0.06em]"
            onClick={() => setPickerOpen(true)}
          >
            <Star />
            Add company
          </Button>
        }
      >
        <MetricStrip
          items={[
            { label: "Tracked", value: data?.length ?? 0 },
            {
              label: "Advancing",
              value: liveData.filter((x) => x.change_pct != null && x.change_pct >= 0).length,
              tone: "positive",
            },
            {
              label: "Declining",
              value: liveData.filter((x) => x.change_pct != null && x.change_pct < 0).length,
              tone: "negative",
            },
            {
              label: "Average move",
              value: averageMove(liveData.map((x) => x.change_pct)),
              tone: "primary",
            },
          ]}
        />
      </PageIntro>
      {pickerOpen && (
        <WatchlistPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          existing={(data ?? []).map((item) => item.symbol)}
        />
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,.8fr)]">
        <Card>
          <CardHead
            title="Tracked instruments"
            meta="Personal list"
            action={
              <Segmented
                items={watchFilters}
                value={filter}
                onChange={(v) => {
                  setFilter(v);
                  setSelected(0);
                }}
                label="Watchlist filter"
              />
            }
          />
          <label className="m-4 flex items-center gap-2 border border-border bg-background/35 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-subtle" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(0);
              }}
              className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-subtle"
              placeholder="Search symbol or company"
              aria-label="Filter your watchlist"
            />
          </label>
          {isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : isError ? (
            <EmptyState
              title="Watchlist unavailable"
              hint="The source could not be reached."
              onRetry={() => void refetch()}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={data?.length ? "No matching companies" : "Your watchlist is empty"}
              hint={
                data?.length
                  ? "Try another search or movement filter."
                  : "Use Add company to choose what you want to follow. No order is placed."
              }
            />
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((w, i) => (
                <Button
                  key={w.id}
                  variant="ghost"
                  onClick={() => setSelected(i)}
                  className={cn(
                    "grid h-auto w-full grid-cols-[minmax(0,1fr)_80px_60px_16px] rounded-none px-4 py-4 text-left shadow-none sm:grid-cols-[minmax(0,1fr)_90px_70px_20px] sm:px-5",
                    focus?.id === w.id && "bg-primary/10",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block font-mono text-[11px] tracking-[0.04em]">
                      {w.symbol}
                    </span>
                    <span className="mt-1 block truncate text-[11px] text-subtle">{w.company}</span>
                  </span>
                  <span className="text-right font-mono text-[11px] text-subtle">
                    {w.price == null ? "No quote" : `₹${formatNum(w.price)}`}
                  </span>
                  <span
                    className={cn(
                      "text-right font-mono text-[11px]",
                      w.change_pct == null
                        ? "text-subtle"
                        : w.change_pct >= 0
                          ? "text-positive"
                          : "text-negative",
                    )}
                  >
                    {w.change_pct == null
                      ? "—"
                      : `${w.change_pct >= 0 ? "+" : ""}${formatNum(w.change_pct)}%`}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-subtle" />
                </Button>
              ))}
            </div>
          )}
        </Card>
        <Card glow>
          <CardHead
            title={focus?.symbol ?? "Instrument inspector"}
            meta={focus?.company ?? "Select an instrument"}
            action={
              focus && (
                <Pill
                  tone={
                    focus.change_pct == null
                      ? "neutral"
                      : focus.change_pct >= 0
                        ? "positive"
                        : "negative"
                  }
                >
                  {focus.change_pct == null ? "No quote" : "Day change"}
                </Pill>
              )
            }
          />
          {focus ? (
            <>
              <div className="p-5">
                <p className="font-mono text-3xl num-tabular">
                  {focus.price == null ? "Price unavailable" : `₹${formatNum(focus.price)}`}
                </p>
                {focus.change_pct != null && (
                  <p
                    className={cn(
                      "mt-2 font-mono text-sm",
                      focus.change_pct >= 0 ? "text-positive" : "text-negative",
                    )}
                  >
                    {focus.change_pct >= 0 ? "+" : ""}
                    {formatNum(focus.change_pct)}%
                  </p>
                )}
              </div>
              <SparkChart symbol={focus.symbol} height={180} className="h-44 px-2" />
              <FocusMetrics symbol={focus.symbol} />
              <div className="p-4">
                <Button
                  asChild
                  className="w-full font-medium text-[11px] uppercase tracking-[0.06em]"
                >
                  <Link to="/app/stocks/$symbol" params={{ symbol: focus.symbol }}>
                    <BarChart3 />
                    Analyze {focus.symbol}
                  </Link>
                </Button>
              </div>
            </>
          ) : (
            <EmptyState
              title="No matching instruments"
              hint="Adjust the search or movement filter."
            />
          )}
        </Card>
      </div>
    </div>
  );
}

/** Technical factors for the inspected instrument, from completed provider candles. */
function FocusMetrics({ symbol }: { symbol: string }) {
  const metrics = useStockMetrics(symbol);
  const cells: [string, number | null | undefined][] = [
    ["Momentum", metrics.data?.momentum],
    ["Volatility", metrics.data?.volatility],
    ["RSI", metrics.data?.rsi],
  ];
  return (
    <div className="border-y border-border">
      <div className="grid grid-cols-3 gap-px bg-border">
        {cells.map(([label, value]) => (
          <div className="bg-panel p-3" key={label}>
            <p className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
              {label}
            </p>
            <p
              className={cn(
                "mt-1.5 font-mono text-[13px] num-tabular",
                value == null && "text-subtle",
              )}
            >
              {metrics.isLoading ? "…" : value == null ? "Unavailable" : formatNum(value)}
            </p>
          </div>
        ))}
      </div>
      <p className="bg-panel px-3 py-2 text-[11px] text-subtle">
        {metrics.data?.source
          ? `Source: ${metrics.data.source}${metrics.data.as_of ? ` · as of ${new Date(metrics.data.as_of).toLocaleDateString("en-IN")}` : ""}`
          : "Technical factors need provider history"}
      </p>
    </div>
  );
}

const researchFilters = ["All", "Market", "Macro", "Risk", "AI"] as const;
export function ResearchPage() {
  const [filter, setFilter] = useState<(typeof researchFilters)[number]>("All");
  const [selected, setSelected] = useState(0);
  const { data: news } = useNews();
  const { data: analyses } = useAnalyses();
  const { data: intelligence } = useMarketIntelligence();
  const liveDesks = [
    {
      code: "MARKET",
      title: "Market intelligence",
      meta: intelligence?.updated_at
        ? `Updated ${relativeTime(intelligence.updated_at)}`
        : "Provider-backed",
      body:
        intelligence?.ai_explanation?.summary ??
        "Quantitative market context is being assembled from provider quotes, breadth, sectors, volatility and news.",
      metrics: [
        { label: "Score", value: intelligence?.score == null ? "—" : String(intelligence.score) },
        { label: "Regime", value: intelligence?.regime?.replaceAll("_", " ") ?? "Unavailable" },
      ],
      symbol: null as string | null,
    },
    ...(analyses ?? []).slice(0, 5).map((analysis) => ({
      code: analysis.symbol,
      title: `${analysis.symbol} research decision`,
      meta: `Completed ${relativeTime(analysis.created_at)}`,
      body:
        analysis.summary ??
        "Completed CodeCraft research session with persisted analyst and risk stages.",
      metrics: [
        { label: "Verdict", value: analysis.verdict },
        {
          label: "Opinion (uncalibrated)",
          value: analysis.conviction == null ? "—" : `${analysis.conviction}/100`,
        },
      ],
      symbol: analysis.symbol as string | null,
    })),
  ];
  const desks = liveDesks.filter(
    (d) =>
      filter === "All" ||
      (filter === "Market" && /Market|Sector|Earnings/.test(d.title)) ||
      (filter === "Macro" && /Macro/.test(d.title)) ||
      (filter === "Risk" && /Volatility/.test(d.title)) ||
      (filter === "AI" && /AI/.test(d.title)),
  );
  const active = desks[selected] ?? desks[0] ?? liveDesks[0];
  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Structured intelligence"
        title="Research terminal"
        body="Evidence-led briefs that separate what changed, why it matters and what remains unconfirmed."
        action={
          <Button asChild size="sm" className="font-medium text-[11px] uppercase tracking-[0.06em]">
            <Link to="/app/$section" params={{ section: "committee" }}>
              <BookOpen />
              Generate brief
            </Link>
          </Button>
        }
      >
        <MetricStrip
          items={[
            { label: "Live briefs", value: liveDesks.length },
            { label: "Latest updates", value: news?.length ?? 0 },
            { label: "Coverage", value: "Cross-market", tone: "primary" },
            { label: "Method", value: "Evidence first" },
          ]}
        />
      </PageIntro>
      <div className="flex justify-between gap-3">
        <Segmented
          items={researchFilters}
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setSelected(0);
          }}
          label="Research category"
        />
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)]">
        <div className="grid gap-4 sm:grid-cols-2">
          {desks.map((d, i) => (
            <button
              key={d.code}
              onClick={() => setSelected(i)}
              className={cn(
                "dash-rise group relative overflow-hidden rounded-lg border bg-panel/80 p-5 text-left transition-colors duration-200 hover:border-primary/40",
                active?.code === d.code ? "border-primary/50" : "border-border",
              )}
              style={{ ["--d" as string]: `${i * 70}ms` }}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] tracking-[0.04em] text-primary-soft">
                  {d.code}
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-subtle transition-transform group-hover:translate-x-1 group-hover:text-primary-soft" />
              </div>
              <h2 className="mt-8 text-xl tracking-tight">{d.title}</h2>
              <p className="mt-2 font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                {d.meta}
              </p>
              <p className="mt-5 text-[13px] leading-relaxed text-muted-foreground">{d.body}</p>
              <div className="mt-6 grid grid-cols-2 gap-2">
                {d.metrics.map((m) => (
                  <div key={m.label} className="border-t border-border pt-3">
                    <p className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                      {m.label}
                    </p>
                    <p className="mt-1 font-mono text-[12px]">{m.value}</p>
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>
        <Card glow className="h-fit xl:sticky xl:top-[88px]">
          <CardHead title="Report preview" meta={active?.meta} />
          <div className="p-5">
            <Pill tone="primary">{active?.code}</Pill>
            <h2 className="mt-5 text-2xl tracking-tight">{active?.title}</h2>
            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{active?.body}</p>
            <SparkChart symbol={active?.symbol} height={120} className="mt-6 h-28" />
            <Button
              asChild
              variant="outline"
              className="mt-6 w-full font-medium text-[11px] uppercase tracking-[0.06em]"
            >
              {active?.symbol ? (
                <Link to="/app/stocks/$symbol" params={{ symbol: active.symbol }}>
                  Open full research
                  <ChevronRight />
                </Link>
              ) : (
                <Link to="/app/$section" params={{ section: "markets" }}>
                  Open markets
                  <ChevronRight />
                </Link>
              )}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
