import { useMemo, useState } from "react";
import { Card, CardHead, EmptyState, Pill, Skeleton } from "@/components/app/cards";
import { MetricStrip, PageIntro, Segmented } from "@/components/app/pages/workspace";
import { WhyButton } from "@/components/app/evidence/WhyButton";
import { useCalendar, useIndexBars } from "@/hooks/use-quant-data";
import { useMarketNews, useMarketSentiment, useSectorSentiment } from "@/hooks/use-intelligence";
import {
  analogSentence,
  FEATURE_LABELS,
  featureHistory,
  findAnalogs,
  type FeatureKey,
} from "@/lib/quant/regime";
import type { Distribution } from "@/lib/quant/stats";
import { cn } from "@/lib/utils";

const HORIZONS = ["1", "5", "20"] as const;
const pct = (v: number | null | undefined, d = 2) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);
const fmt = (key: FeatureKey, v: number | undefined) =>
  v == null
    ? "—"
    : key === "implied_vol"
      ? v.toFixed(2)
      : key === "liquidity"
        ? `${v.toFixed(2)}×`
        : key === "correlation"
          ? v.toFixed(2)
          : pct(v);

/**
 * Market-regime map: observable features, the nearest historical states and
 * what followed them, shown as a distribution with the unconditional
 * distribution beside it. Not a forecast.
 */
export function RegimePage() {
  const [horizonText, setHorizon] = useState<(typeof HORIZONS)[number]>("5");
  const horizon = Number(horizonText);
  const nifty = useIndexBars("NIFTY");
  const bank = useIndexBars("BANK");
  const vix = useIndexBars("VIX");
  const sentiment = useMarketSentiment();
  const sectors = useSectorSentiment();
  const news = useMarketNews();
  const calendar = useCalendar();
  const rows = useMemo(
    () => featureHistory(nifty.data?.candles ?? [], bank.data?.candles, vix.data?.candles),
    [nifty.data, bank.data, vix.data],
  );
  const result = useMemo(
    () => findAnalogs(nifty.data?.candles ?? [], rows, { k: 14, horizon, spacing: 5 }),
    [nifty.data, rows, horizon],
  );
  const breadth = Object.values(sentiment.data?.components ?? {}).find(
    (component) => component.advancing != null && component.declining != null,
  );
  const breadthValue =
    breadth?.advancing != null &&
    breadth.declining != null &&
    breadth.advancing + breadth.declining > 0
      ? breadth.advancing / (breadth.advancing + breadth.declining)
      : null;
  const dayAgo = Date.now() - 86_400_000;
  const newsCount = (news.data?.articles ?? []).filter(
    (a) => Date.parse(a.published_at) >= dayAgo,
  ).length;
  const weekAhead = Date.now() + 7 * 86_400_000;
  const eventCount = (calendar.data?.events ?? []).filter((e) => {
    const t = Date.parse(e.event_time);
    return t >= Date.now() - 86_400_000 && t <= weekAhead;
  }).length;
  const leader = Object.entries(sectors.data?.sectors ?? {})
    .filter(([, s]) => s.available && s.change_pct != null)
    .sort((a, b) => (b[1].change_pct ?? 0) - (a[1].change_pct ?? 0))[0];
  const sentence = analogSentence(result);
  const loading = nifty.isLoading;

  const current: {
    label: string;
    value: string;
    formula: string;
    source: string;
    analog: boolean;
  }[] = [
    ...(Object.keys(FEATURE_LABELS) as FeatureKey[]).map((key) => ({
      label: FEATURE_LABELS[key].label,
      value: fmt(key, result.current?.values[key]),
      formula: FEATURE_LABELS[key].formula,
      source: `${nifty.data?.source ?? "provider"} index history`,
      analog: result.features.includes(key),
    })),
    {
      label: "Breadth",
      value: breadthValue == null ? "Unavailable" : `${(breadthValue * 100).toFixed(0)}% advancing`,
      formula: "Advancing ÷ (advancing + declining) NIFTY 50 constituents, current session",
      source: "Market sentiment service",
      analog: false,
    },
    {
      label: "News intensity",
      value: news.data ? `${newsCount} articles / 24h` : "Unavailable",
      formula: "Count of market news articles published in the last 24 hours",
      source: "Market news providers",
      analog: false,
    },
    {
      label: "Event density",
      value: calendar.data ? `${eventCount} events / 7d` : "Unavailable",
      formula: "NSE board meetings and corporate actions in the next 7 days",
      source: "NSE corporate calendar",
      analog: false,
    },
    {
      label: "Sector leader today",
      value: leader ? `${leader[0]} ${leader[1].change_pct!.toFixed(2)}%` : "Unavailable",
      formula: "Sector with the highest current-session change",
      source: "Sector sentiment service",
      analog: false,
    },
    {
      label: "FII / DII flows",
      value: "Unavailable",
      formula: "No institutional-flow source is connected",
      source: "—",
      analog: false,
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Market regime"
        title="Market regime"
        body="The current market is described by observable features computed only from data available at each date. The nearest historical states are listed with what happened next, as a range. A wide range is the honest answer more often than a direction."
        status={`${rows.length} historical states`}
        action={
          <Segmented
            items={HORIZONS}
            value={horizonText}
            onChange={setHorizon}
            label="Forward window in sessions"
          />
        }
      >
        <MetricStrip
          items={[
            {
              label: "Analogs",
              value: result.analogs.length,
              note: `${result.features.length} features matched`,
            },
            {
              label: `Analog median (${horizon}d)`,
              value: pct(result.forward.median),
              tone: (result.forward.median ?? 0) >= 0 ? "positive" : "negative",
            },
            {
              label: "Analog 5–95% range",
              value: `${pct(result.forward.p5, 1)} to ${pct(result.forward.p95, 1)}`,
            },
            {
              label: "Positive share",
              value: pct(result.forward.positive_share, 0),
              note: `All sessions: ${pct(result.unconditional.positive_share, 0)}`,
            },
          ]}
        />
      </PageIntro>
      {loading ? (
        <Skeleton className="h-72" />
      ) : !rows.length ? (
        <Card>
          <EmptyState
            title="Index history unavailable"
            hint="The regime map needs at least 61 sessions of NIFTY 50 history from the provider."
          />
        </Card>
      ) : (
        <>
          <Card glow>
            <div className="flex items-start gap-2 p-5 text-[14px] leading-relaxed">
              <p>{sentence}</p>
              <WhyButton
                claim={{
                  id: `regime:analogs:${horizon}`,
                  label: "Market analogs",
                  value: `${result.analogs.length} states`,
                  statement: sentence,
                  observation: {
                    provider: `${nifty.data?.source ?? "provider"} NIFTY 50, BANK NIFTY, INDIA VIX daily bars`,
                    as_of: nifty.data?.as_of ?? null,
                  },
                  calculation: {
                    formula:
                      "Nearest neighbours by root-mean-square z-score distance over the matched features; analogs at least 5 sessions apart with a complete forward window",
                    inputs: result.features.map((f) => ({
                      name: FEATURE_LABELS[f].label,
                      value: fmt(f, result.current?.values[f]),
                    })),
                  },
                  model_version: "regime-analogs v1",
                  history: `Unconditional ${horizon}-session distribution over ${result.unconditional.n} sessions: median ${pct(result.unconditional.median)}, ${pct(result.unconditional.positive_share, 0)} positive.`,
                  page: "regime",
                }}
              />
            </div>
          </Card>
          <div className="grid items-start gap-5 xl:grid-cols-[1.1fr_.9fr]">
            <Card>
              <CardHead
                title="Regime map"
                meta="Risk appetite (momentum, trend) vs stress (volatility, VIX, gaps)"
              />
              <RegimeMap points={result.map} />
            </Card>
            <Card>
              <CardHead
                title="Current observable features"
                meta="Analog matching uses the historical features only"
              />
              <ul className="divide-y divide-border">
                {current.map((row) => (
                  <li
                    key={row.label}
                    className="flex items-center justify-between gap-3 px-5 py-2.5 text-[12.5px]"
                  >
                    <span className="flex items-center gap-1">
                      {row.label}
                      {row.analog && <Pill tone="primary">matched</Pill>}
                      <WhyButton
                        claim={{
                          id: `regime:feature:${row.label}`,
                          label: row.label,
                          value: row.value,
                          statement: `${row.label} is ${row.value}.`,
                          source: { name: row.source },
                          calculation: { formula: row.formula, inputs: [] },
                          page: "regime",
                        }}
                      />
                    </span>
                    <span className={cn("font-mono", row.value === "Unavailable" && "text-subtle")}>
                      {row.value}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHead
                title={`What followed: next ${horizon} sessions`}
                meta="Analogs vs all sessions"
              />
              <DistributionBars analog={result.forward} all={result.unconditional} />
            </Card>
            <Card>
              <CardHead title="Nearest historical states" meta="Closest first" />
              <div className="max-h-[360px] overflow-y-auto">
                <table className="w-full text-left text-[12px]">
                  <thead className="sticky top-0 bg-panel font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                    <tr>
                      <th className="px-4 py-2">Date</th>
                      <th className="px-4 py-2">Distance</th>
                      <th className="px-4 py-2">Next {horizon}d</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.analogs.map((a) => (
                      <tr key={a.time} className="border-t border-border">
                        <td className="px-4 py-2 font-mono">
                          {new Date(a.time * 1000).toLocaleDateString("en-IN")}
                        </td>
                        <td className="px-4 py-2 font-mono">{a.distance.toFixed(2)}</td>
                        <td
                          className={cn(
                            "px-4 py-2 font-mono",
                            a.forward_return >= 0 ? "text-positive" : "text-negative",
                          )}
                        >
                          {pct(a.forward_return)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
          <p className="text-[11px] text-subtle">
            One year of daily history gives a small, overlapping sample; analogs from the same
            period are correlated. Treat the range as context for position sizing, not as a signal.
          </p>
        </>
      )}
    </div>
  );
}

function RegimeMap({
  points,
}: {
  points: { time: number; x: number; y: number; analog: boolean; current: boolean }[];
}) {
  if (!points.length) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const sx = (v: number) => 30 + ((v - minX) / Math.max(1e-9, maxX - minX)) * 360;
  const sy = (v: number) => 250 - ((v - minY) / Math.max(1e-9, maxY - minY)) * 230;
  const ordered = [...points].sort(
    (a, b) => Number(a.analog) + Number(a.current) * 2 - (Number(b.analog) + Number(b.current) * 2),
  );
  return (
    <div className="p-4">
      <svg
        viewBox="0 0 400 270"
        className="h-auto w-full"
        role="img"
        aria-label="Scatter of historical market states; analogs and the current state highlighted"
      >
        <line x1="30" y1="250" x2="390" y2="250" stroke="var(--color-border)" />
        <line x1="30" y1="20" x2="30" y2="250" stroke="var(--color-border)" />
        {ordered.map((p) => (
          <circle
            key={p.time}
            cx={sx(p.x)}
            cy={sy(p.y)}
            r={p.current ? 6 : p.analog ? 4 : 2}
            className={p.current ? "fill-warning" : p.analog ? "fill-primary" : "fill-subtle/40"}
          >
            <title>{new Date(p.time * 1000).toLocaleDateString("en-IN")}</title>
          </circle>
        ))}
        <text x="210" y="266" textAnchor="middle" className="fill-subtle font-mono text-[11px]">
          risk appetite →
        </text>
        <text
          x="10"
          y="135"
          textAnchor="middle"
          transform="rotate(-90 10 135)"
          className="fill-subtle font-mono text-[11px]"
        >
          stress →
        </text>
      </svg>
      <p className="mt-1 flex gap-3 text-[11px] text-subtle">
        <span className="text-warning">● today</span>
        <span className="text-primary-soft">● analogs</span>
        <span>● other sessions</span>
      </p>
    </div>
  );
}

function DistributionBars({ analog, all }: { analog: Distribution; all: Distribution }) {
  const rows: [string, keyof Distribution][] = [
    ["5th percentile", "p5"],
    ["25th percentile", "p25"],
    ["Median", "median"],
    ["75th percentile", "p75"],
    ["95th percentile", "p95"],
  ];
  const max = Math.max(
    ...rows.flatMap(([, k]) => [Math.abs(Number(analog[k] ?? 0)), Math.abs(Number(all[k] ?? 0))]),
    0.001,
  );
  return (
    <div className="space-y-2.5 p-5">
      {rows.map(([label, key]) => (
        <div key={key} className="grid grid-cols-[110px_1fr] items-center gap-3 text-[11.5px]">
          <span className="text-muted-foreground">{label}</span>
          <div className="space-y-1">
            {(
              [
                ["Analogs", analog[key] as number | null, "bg-primary"],
                ["All", all[key] as number | null, "bg-subtle/60"],
              ] as const
            ).map(([name, value, color]) => (
              <div key={name} className="relative h-3 bg-background/50">
                <span className="absolute inset-y-0 left-1/2 w-px bg-border-strong" />
                {value != null && (
                  <span
                    className={cn(
                      "absolute inset-y-0.5",
                      color,
                      value >= 0 ? "left-1/2" : "right-1/2",
                    )}
                    style={{ width: `${(Math.abs(value) / max) * 50}%` }}
                  />
                )}
                <span className="absolute right-1 -top-0.5 font-mono text-[11px]">
                  {name} {value == null ? "—" : `${(value * 100).toFixed(2)}%`}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="pt-2 text-[11px] text-subtle">
        n = {analog.n} analogs vs {all.n} sessions.
      </p>
    </div>
  );
}
