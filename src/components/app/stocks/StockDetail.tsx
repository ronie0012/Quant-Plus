import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Bot, Gauge, Layers, Newspaper } from "lucide-react";
import { Card, CardHead, Pill, SourceTag } from "@/components/app/cards";
import { MetricStrip, ProgressBar, Segmented } from "@/components/app/pages/workspace";
import { OrderPanel } from "@/components/app/stocks/OrderPanel";
import { AnimatedNumber } from "@/components/site/AnimatedNumber";
import { series, toPath } from "@/data/market";
import {
  agentViews,
  committeeVerdict,
  marketDepth,
  stockNews,
  stockSentiment,
  stockStats,
  type Nifty50Stock,
} from "@/data/nifty50";
import { formatNum } from "@/hooks/use-dashboard-data";
import { cn } from "@/lib/utils";

const ranges = ["1D", "1W", "1M", "6M", "1Y"] as const;
const pointsFor = { "1D": 84, "1W": 104, "1M": 128, "6M": 156, "1Y": 190 } as const;

function PriceChart({ stock, range }: { stock: Nifty50Stock; range: (typeof ranges)[number] }) {
  const [hover, setHover] = useState<number | null>(null);
  const up = stock.changePct >= 0;
  const width = 1000;
  const height = 320;

  const points = useMemo(
    () => series(stock.seed + range.length * 7, pointsFor[range], up ? 0.45 : -0.3, 1),
    [stock.seed, range, up],
  );
  const path = toPath(points, width, height);
  const spread = stock.price * (range === "1D" ? 0.012 : range === "1W" ? 0.035 : 0.14);
  const priceAt = (index: number) => stock.price + ((points[index] ?? 0.5) - 0.5) * spread * 2;

  return (
    <div className="relative min-w-0 px-2 pb-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-[240px] w-full sm:h-[320px]"
        role="img"
        aria-label={`${stock.symbol} ${range} demonstrative price trend`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - rect.left) / rect.width;
          setHover(
            Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))),
          );
        }}
      >
        <defs>
          <linearGradient id={`sd-fill-${stock.symbol}`} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor={up ? "var(--color-positive)" : "var(--color-negative)"}
              stopOpacity="0.24"
            />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.2, 0.4, 0.6, 0.8].map((line) => (
          <line
            key={line}
            x1="0"
            x2={width}
            y1={height * line}
            y2={height * line}
            stroke="var(--color-border)"
          />
        ))}
        <path d={`${path} L${width},${height} L0,${height} Z`} fill={`url(#sd-fill-${stock.symbol})`} />
        <path
          key={`${stock.symbol}-${range}`}
          d={path}
          fill="none"
          strokeWidth="1.7"
          className={cn("animate-draw", up ? "stroke-positive" : "stroke-negative")}
          style={{ ["--draw-length" as string]: "2800" }}
        />
        {hover !== null && (
          <>
            <line
              x1={(hover / (points.length - 1)) * width}
              x2={(hover / (points.length - 1)) * width}
              y1="0"
              y2={height}
              stroke="var(--color-border-strong)"
            />
            <circle
              cx={(hover / (points.length - 1)) * width}
              cy={height - (points[hover] ?? 0) * height}
              r="4"
              className={up ? "fill-positive" : "fill-negative"}
            />
          </>
        )}
      </svg>
      {hover !== null && (
        <span className="pointer-events-none absolute top-3 right-4 border border-border bg-background/85 px-2.5 py-1.5 font-mono text-[10px] num-tabular">
          ₹{formatNum(priceAt(hover))}
        </span>
      )}
    </div>
  );
}

/** Dedicated instrument workspace: price, agent prediction, sentiment, news and dealing. */
export function StockDetail({ stock }: { stock: Nifty50Stock }) {
  const [range, setRange] = useState<(typeof ranges)[number]>("1D");
  const stats = useMemo(() => stockStats(stock), [stock]);
  const committee = useMemo(() => committeeVerdict(stock), [stock]);
  const views = useMemo(() => agentViews(stock), [stock]);
  const sentiment = useMemo(() => stockSentiment(stock), [stock]);
  const news = useMemo(() => stockNews(stock), [stock]);
  const depth = useMemo(() => marketDepth(stock), [stock]);
  const up = stock.changePct >= 0;
  const rangePos = Math.min(
    100,
    Math.max(0, ((stock.price - stats.weekLow) / (stats.weekHigh - stats.weekLow || 1)) * 100),
  );

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="dash-rise relative overflow-hidden rounded-xl border border-border bg-panel/60 px-5 py-6 sm:px-7">
        <div aria-hidden className="pointer-events-none absolute inset-0 grid-lines opacity-20" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent"
        />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              to="/app/$section"
              params={{ section: "markets" }}
              className="inline-flex items-center gap-1.5 font-mono text-[9px] tracking-[0.2em] uppercase text-subtle transition-colors hover:text-primary-soft"
            >
              <ArrowLeft className="h-3 w-3" />
              Markets
            </Link>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h1 className="font-mono text-[clamp(1.6rem,3.2vw,2.4rem)] tracking-tight">
                {stock.symbol}
              </h1>
              <Pill tone="primary">NSE · EQ</Pill>
              <Pill>{stock.sector}</Pill>
            </div>
            <p className="mt-2 text-[13.5px] text-muted-foreground">{stock.company}</p>
          </div>
          <div className="text-left lg:text-right">
            <p className="font-mono text-[clamp(1.7rem,3.4vw,2.6rem)] num-tabular">
              ₹<AnimatedNumber value={stock.price} locale="en-IN" />
            </p>
            <p className={cn("mt-1 font-mono text-[13px]", up ? "text-positive" : "text-negative")}>
              {up ? "+" : ""}
              {formatNum((stock.price * stock.changePct) / 100)} · {up ? "+" : ""}
              {formatNum(stock.changePct)}%
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 lg:justify-end">
              <SourceTag label="Demonstrative quote" />
            </div>
          </div>
        </div>
        <div className="relative mt-6">
          <MetricStrip
            items={[
              { label: "Open", value: `₹${formatNum(stats.open)}` },
              { label: "Day range", value: `₹${formatNum(stats.low)} – ₹${formatNum(stats.high)}` },
              { label: "Volume", value: `${(stats.volume / 1e6).toFixed(2)}M` },
              {
                label: "Committee verdict",
                value: committee.verdict,
                note: `${committee.conviction}% conviction`,
                tone:
                  committee.verdict === "BUY"
                    ? "positive"
                    : committee.verdict === "SELL"
                      ? "negative"
                      : "primary",
              },
            ]}
          />
        </div>
      </header>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.9fr)_minmax(320px,.8fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card glow delay={160}>
            <CardHead
              title={`${stock.symbol} price action`}
              meta={`${range} · demonstrative series`}
              action={<Segmented items={ranges} value={range} onChange={setRange} label="Chart range" />}
            />
            <PriceChart stock={stock} range={range} />
            <div className="grid gap-px border-t border-border bg-border sm:grid-cols-3">
              {[
                { label: "Momentum", value: stats.momentum },
                { label: "Volatility", value: stats.volatility },
                { label: "Liquidity", value: stats.liquidity },
              ].map((metric, index) => (
                <div key={metric.label} className="bg-panel/80 p-4">
                  <div className="flex justify-between font-mono text-[9px] tracking-[0.16em] uppercase text-subtle">
                    <span>{metric.label}</span>
                    <span className="text-muted-foreground">{metric.value}</span>
                  </div>
                  <div className="mt-3">
                    <ProgressBar
                      value={metric.value}
                      tone={metric.value > 60 ? "positive" : "primary"}
                      delay={420 + index * 90}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card delay={220}>
            <CardHead
              title="Quant AI view"
              meta={`Target ₹${formatNum(committee.target)}`}
              action={
                <span className="flex items-center gap-2 font-mono text-[9px] tracking-[0.16em] uppercase text-primary-soft">
                  <Bot className="h-3.5 w-3.5" /> Single analysis
                </span>
              }
            />
            <div className="p-5">
              <div className="flex flex-wrap items-center gap-3">
                <Pill
                  tone={
                    committee.verdict === "BUY"
                      ? "positive"
                      : committee.verdict === "SELL"
                        ? "negative"
                        : "neutral"
                  }
                >
                  {committee.verdict}
                </Pill>
                <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-subtle">
                  Conviction {committee.conviction}%
                </span>
              </div>
              <div className="mt-3">
                <ProgressBar
                  value={committee.conviction}
                  tone={committee.verdict === "SELL" ? "negative" : "primary"}
                  delay={320}
                />
              </div>
              <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
                {summary}
              </p>
              <ul className="mt-4 grid gap-2">
                {highlights.map((point, index) => (
                  <li
                    key={point}
                    className="dash-rise flex gap-2 text-[12.5px] leading-relaxed text-muted-foreground"
                    style={{ ["--d" as string]: `${300 + index * 70}ms` }}
                  >
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-primary-soft" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="border-t border-border px-5 py-4 text-[11.5px] leading-relaxed text-subtle">
              This view is generated over demonstrative data for educational illustration. It is not
              investment advice or a recommendation to transact.
            </p>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card delay={260}>
              <CardHead
                title="Sentiment"
                meta={`${sentiment.label} · score ${sentiment.score}`}
                action={<Gauge className="h-4 w-4 text-primary-soft" />}
              />
              <div className="p-5">
                <div className="flex items-end justify-between">
                  <p className="font-mono text-4xl num-tabular">{sentiment.score}</p>
                  <Pill
                    tone={
                      sentiment.label === "GREED"
                        ? "positive"
                        : sentiment.label === "FEAR"
                          ? "negative"
                          : "neutral"
                    }
                  >
                    {sentiment.label}
                  </Pill>
                </div>
                <div className="mt-4">
                  <ProgressBar
                    value={sentiment.score}
                    tone={sentiment.score >= 66 ? "positive" : sentiment.score <= 34 ? "negative" : "primary"}
                    delay={340}
                  />
                </div>
                <ul className="mt-5 space-y-4">
                  {sentiment.breakdown.map((row, index) => (
                    <li key={row.label}>
                      <div className="flex justify-between font-mono text-[9px] tracking-[0.16em] uppercase text-subtle">
                        <span>{row.label}</span>
                        <span className="text-muted-foreground">{row.value}</span>
                      </div>
                      <div className="mt-2">
                        <ProgressBar value={row.value} tone="primary" delay={400 + index * 80} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>

            <Card delay={300}>
              <CardHead
                title="Market depth"
                meta="Five levels · demonstrative"
                action={<Layers className="h-4 w-4 text-primary-soft" />}
              />
              <table className="w-full min-w-0 border-collapse">
                <thead>
                  <tr className="border-b border-border bg-background/30 font-mono text-[9px] tracking-[0.16em] uppercase text-subtle">
                    <th scope="col" className="px-4 py-2 text-left font-normal">Bid qty</th>
                    <th scope="col" className="px-4 py-2 text-right font-normal">Bid</th>
                    <th scope="col" className="px-4 py-2 text-right font-normal">Ask</th>
                    <th scope="col" className="px-4 py-2 text-right font-normal">Ask qty</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-[11px] num-tabular">
                  {depth.map((level) => (
                    <tr key={level.bid} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2.5 text-left text-subtle">{level.bidQty}</td>
                      <td className="px-4 py-2.5 text-right text-positive">{formatNum(level.bid)}</td>
                      <td className="px-4 py-2.5 text-right text-negative">{formatNum(level.ask)}</td>
                      <td className="px-4 py-2.5 text-right text-subtle">{level.askQty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          <Card delay={340}>
            <CardHead
              title="News & drivers"
              meta={`${news.length} items`}
              action={<Newspaper className="h-4 w-4 text-primary-soft" />}
            />
            <ul className="divide-y divide-border">
              {news.map((item) => (
                <li key={item.id} className="p-4 transition-colors hover:bg-panel-elevated">
                  <p className="text-[13px] leading-relaxed">{item.headline}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-subtle">
                      {item.source} · {item.minutesAgo} min ago
                    </span>
                    <Pill tone={item.tone === "POSITIVE" ? "positive" : "warning"}>{item.tone}</Pill>
                    <Pill tone={item.impact === "HIGH" ? "warning" : "neutral"}>{item.impact}</Pill>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <OrderPanel stock={stock} />

          <Card delay={320}>
            <CardHead title="Key statistics" meta="Demonstrative fundamentals" />
            <dl className="grid grid-cols-2 gap-px bg-border">
              {[
                ["Market cap", `₹${(stats.marketCapCr / 100000).toFixed(2)}L Cr`],
                ["P/E ratio", formatNum(stats.peRatio, 1)],
                ["Dividend yield", `${formatNum(stats.dividendYield)}%`],
                ["Beta", formatNum(stats.beta)],
                ["Index weight", `${formatNum(stock.weight)}%`],
                ["52W range", `₹${formatNum(stats.weekLow, 0)} – ₹${formatNum(stats.weekHigh, 0)}`],
              ].map(([label, value]) => (
                <div key={label} className="bg-panel/80 px-4 py-3.5">
                  <dt className="font-mono text-[9px] tracking-[0.16em] uppercase text-subtle">
                    {label}
                  </dt>
                  <dd className="mt-1.5 font-mono text-[12.5px] num-tabular">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="border-t border-border p-5">
              <div className="flex justify-between font-mono text-[9px] tracking-[0.16em] uppercase text-subtle">
                <span>52-week position</span>
                <span className="text-muted-foreground">{Math.round(rangePos)}%</span>
              </div>
              <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-panel-elevated">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-primary/70"
                  style={{ width: `${rangePos}%` }}
                />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
