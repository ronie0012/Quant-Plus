import { useMemo, useState } from "react";
import { Card, CardHead, EmptyState, Pill, Skeleton } from "@/components/app/cards";
import { MetricStrip, PageIntro, Segmented } from "@/components/app/pages/workspace";
import { WhyButton } from "@/components/app/evidence/WhyButton";
import { stockBySymbol } from "@/data/nifty50";
import {
  useHistories,
  useIndexBars,
  useResearchSessions,
  useFills,
  useAllOrders,
} from "@/hooks/use-quant-data";
import { useJournal } from "@/hooks/use-trading-product";
import { deliveryCharges } from "@/lib/paper-fees";
import {
  actionDirection,
  matureForecasts,
  regimeLabeller,
  segment,
  strengthProbability,
  trackSentence,
  trackStats,
  type Forecast,
  type Matured,
  type SegmentKey,
  type TrackStats,
} from "@/lib/quant/track-record";
import { attributeOutcome, executionFacts } from "@/lib/quant/decision-plan";
import { cn } from "@/lib/utils";

const HORIZONS = ["1", "5", "20"] as const;
const SEGMENTS: { key: SegmentKey; label: string }[] = [
  { key: "role", label: "Role" },
  { key: "regime", label: "Market regime" },
  { key: "sector", label: "Sector" },
  { key: "liquidity", label: "Liquidity bucket" },
  { key: "coverage", label: "Data coverage" },
  { key: "model_version", label: "Model version" },
];

const pct = (v: number | null | undefined, digits = 1) =>
  v == null ? "—" : `${(v * 100).toFixed(digits)}%`;

function roundTripCostRate() {
  try {
    const at = new Date().toISOString();
    const notional = 1_00_000_00;
    return (
      (deliveryCharges("BUY", notional, at).total_paise +
        deliveryCharges("SELL", notional, at).total_paise) /
      notional
    );
  } catch {
    return 0.0025;
  }
}

/**
 * Calibrated track records: matured forecasts per segment, scored against a
 * constant baseline. There is deliberately no single "AI confidence" figure.
 */
export function TrackRecordPage() {
  const [horizonText, setHorizon] = useState<(typeof HORIZONS)[number]>("5");
  const horizon = Number(horizonText);
  const [segmentKey, setSegmentKey] = useState<SegmentKey>("regime");
  const sessions = useResearchSessions();
  const journal = useJournal();
  const fills = useFills();
  const orders = useAllOrders();
  const nifty = useIndexBars("NIFTY");
  const symbols = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions.data ?? []) set.add(s.instrument.replace(/\.NS$/, ""));
    for (const e of journal.data ?? []) set.add(e.symbol);
    return [...set].filter((s) => stockBySymbol(s)).slice(0, 50);
  }, [sessions.data, journal.data]);
  const histories = useHistories(symbols, "1Y");
  const cost = roundTripCostRate();

  const result = useMemo(() => {
    const adv = Object.entries(histories.bars).map(([symbol, bars]) => {
      const recent = bars.slice(-20);
      return {
        symbol,
        value: recent.reduce((t, b) => t + b.close * b.volume, 0) / Math.max(1, recent.length),
      };
    });
    const sorted = [...adv].sort((a, b) => b.value - a.value);
    const bucket = (symbol: string): Forecast["liquidity"] => {
      const i = sorted.findIndex((x) => x.symbol === symbol);
      if (i < 0) return "UNKNOWN";
      return i < sorted.length / 3 ? "HIGH" : i < (2 * sorted.length) / 3 ? "MEDIUM" : "LOW";
    };
    const forecasts: Forecast[] = [];
    for (const s of sessions.data ?? []) {
      const symbol = s.instrument.replace(/\.NS$/, "");
      const reports = Object.keys(s.reports ?? {}).length;
      const base = {
        symbol,
        model_version: "Current research configuration",
        sector: stockBySymbol(symbol)?.sector ?? "Unclassified",
        liquidity: bucket(symbol),
        coverage: (reports >= 5
          ? "FULL"
          : reports > 0
            ? "PARTIAL"
            : "UNKNOWN") as Forecast["coverage"],
      };
      forecasts.push({
        ...base,
        id: `final:${s.id}`,
        as_of: s.as_of,
        role: "Committee final decision",
        direction: actionDirection(s.decision?.action),
        probability: strengthProbability(s.thesis?.conviction),
      });
      if (s.thesis?.direction)
        forecasts.push({
          ...base,
          id: `thesis:${s.id}`,
          as_of: s.as_of,
          role: "Initial thesis",
          direction: actionDirection(s.thesis.direction),
          probability: strengthProbability(s.thesis.conviction),
        });
      if (s.challenge?.status)
        forecasts.push({
          ...base,
          id: `challenge:${s.id}`,
          as_of: s.as_of,
          role: `Final decision · challenge ${s.challenge.status.toLowerCase()}`,
          direction: actionDirection(s.decision?.action),
          probability: strengthProbability(s.thesis?.conviction),
        });
    }
    for (const e of journal.data ?? []) {
      if (!e.plan || e.plan.decision !== "TRADE") continue;
      forecasts.push({
        id: `human:${e.id}`,
        symbol: e.symbol,
        as_of: e.plan.market_snapshot?.captured_at ?? e.created_at,
        role: "You (decision plans)",
        model_version: "Human",
        direction: e.plan.side === "BUY" ? "UP" : "DOWN",
        probability: null,
        sector: stockBySymbol(e.symbol)?.sector ?? "Unclassified",
        liquidity: bucket(e.symbol),
        coverage: e.plan.evidence_items.length ? "FULL" : "PARTIAL",
      });
    }
    const regimeAt = regimeLabeller(nifty.data?.candles ?? []);
    const bars = Object.fromEntries(
      Object.entries(histories.bars).map(([k, v]) => [
        k,
        v.map((b) => ({ time: b.time, close: b.close })),
      ]),
    );
    return {
      ...matureForecasts(forecasts, bars, horizon, regimeAt, cost),
      total: forecasts.length,
    };
  }, [sessions.data, journal.data, histories.bars, nifty.data, horizon, cost]);

  const committee = result.matured.filter((m) => m.role === "Committee final decision");
  const stats = trackStats(committee);
  const byRole = segment(result.matured, "role");
  const segments = segment(committee.length ? committee : result.matured, segmentKey);
  const human = result.matured.filter((m) => m.role === "You (decision plans)");
  const thesis = result.matured.filter((m) => m.role === "Initial thesis");
  const agreement = useMemo(() => {
    const finals = new Map(committee.map((m) => [m.id.slice(6), m]));
    const pairs = thesis
      .map((t) => [t, finals.get(t.id.slice(7))] as const)
      .filter((p): p is readonly [Matured, Matured] => !!p[1]);
    const changed = pairs.filter(([t, f]) => t.direction !== f.direction);
    const changedFinalRight = changed.filter(([, f]) => f.correct === true).length;
    const changedThesisRight = changed.filter(([t]) => t.correct === true).length;
    return { pairs: pairs.length, changed: changed.length, changedFinalRight, changedThesisRight };
  }, [committee, thesis]);

  // Research quality versus execution quality, from your own decision plans.
  const quality = useMemo(() => {
    const counts = { thesisGood: 0, thesisBad: 0, execGood: 0, execBad: 0, n: 0 };
    for (const e of journal.data ?? []) {
      if (!e.plan || !e.order_id) continue;
      const bars = histories.bars[e.symbol];
      if (!bars) continue;
      const all = fills.data ?? [];
      const facts = executionFacts(
        e.order_id,
        all.map((f) => ({ ...f, charges: f.charges?.total ?? 0 })),
        all
          .filter((f) => f.symbol === e.symbol && f.side !== e.plan!.side)
          .map((f) => ({ ...f, charges: f.charges?.total ?? 0 })),
      );
      const order = (orders.data ?? []).find((o) => o.id === e.order_id);
      const a = attributeOutcome({ ...e, plan: e.plan }, facts, order?.created_at ?? null, bars);
      counts.n++;
      if (a.thesis.grade === "GOOD") counts.thesisGood++;
      if (a.thesis.grade === "BAD") counts.thesisBad++;
      if (a.execution.grade === "GOOD") counts.execGood++;
      if (a.execution.grade === "BAD") counts.execBad++;
    }
    return counts;
  }, [journal.data, histories.bars, fills.data, orders.data]);

  const loading = sessions.isLoading || histories.loading;
  const sentence = trackSentence(committee, horizon);
  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Calibrated track record"
        title="Measured, not persuasive."
        body="Every committee forecast is scored only after its horizon has passed in observed prices. Accuracy is compared with a constant baseline, opinion strength is checked for calibration, and abstentions are counted rather than hidden. Opinion strength is not a probability; it is converted to one here (50% + strength ÷ 2) only so it can be tested."
        action={
          <Segmented
            items={HORIZONS}
            value={horizonText}
            onChange={setHorizon}
            label="Horizon in sessions"
          />
        }
      >
        <MetricStrip
          items={[
            {
              label: "Matured committee forecasts",
              value: stats.n,
              note: `${result.pending} pending · ${result.unpriced} without prices`,
            },
            {
              label: "Directional accuracy",
              value: pct(stats.accuracy),
              note: `Baseline (always up): ${pct(stats.baseline_accuracy)}`,
              tone: stats.beats_baseline ? "positive" : "warning",
            },
            {
              label: "Brier score",
              value: stats.brier == null ? "—" : stats.brier.toFixed(3),
              note: `Constant baseline ${stats.baseline_brier == null ? "—" : stats.baseline_brier.toFixed(3)} (lower is better)`,
            },
            {
              label: "Abstention rate",
              value: pct(stats.abstention_rate, 0),
              note: `Cost-adjusted mean ${pct(stats.cost_adjusted_mean, 2)} per call`,
            },
          ]}
        />
      </PageIntro>
      <Card glow>
        <div className="flex items-start gap-2 p-5 text-[14px] leading-relaxed">
          <p>{loading ? "Loading research sessions and price history…" : sentence}</p>
          <WhyButton
            claim={{
              id: `track:sentence:${horizon}`,
              label: "Track-record summary",
              value: `${stats.n} matured`,
              statement: sentence,
              source: { name: "Quant Plus research sessions (terminal/research)" },
              observation: { provider: "Provider daily closes, 1 year", as_of: null },
              calculation: {
                formula:
                  "Correct = sign(close[t+h] / close[t] − 1) matches the call; Brier = mean((p − hit)²); baseline = always 'up'; regimes = NIFTY vs 50-SMA and 20- vs 60-session volatility",
                inputs: [
                  { name: "horizon", value: `${horizon} sessions` },
                  { name: "round-trip cost", value: pct(cost, 3) },
                ],
              },
              model_version: "Current research configuration",
              page: "track-record",
            }}
          />
        </div>
      </Card>

      {loading ? (
        <Skeleton className="h-60" />
      ) : !result.total ? (
        <Card>
          <EmptyState
            title="No forecasts yet"
            hint="Completed committee research and your decision plans appear here once they exist."
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHead title="By role" meta="Committee, initial thesis and your own plans" />
              <StatsTable rows={byRole.map((r) => ({ label: r.value, stats: r.stats }))} />
            </Card>
            <Card>
              <CardHead
                title="Calibration"
                meta="Stated probability vs observed hit rate (committee)"
              />
              <CalibrationChart stats={stats} />
            </Card>
          </div>
          <Card>
            <CardHead
              title="Segments"
              meta="Committee final decisions"
              action={
                <select
                  aria-label="Segment by"
                  value={segmentKey}
                  onChange={(e) => setSegmentKey(e.target.value as SegmentKey)}
                  className="h-8 border border-border bg-background px-2 text-xs"
                >
                  {SEGMENTS.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              }
            />
            <StatsTable rows={segments.map((r) => ({ label: r.value, stats: r.stats }))} />
          </Card>
          <div className="grid gap-5 xl:grid-cols-3">
            <Comparison
              title="AI decision versus your decision"
              rows={[
                ["Committee accuracy", pct(stats.accuracy), stats.n],
                ["Your plans' accuracy", pct(trackStats(human).accuracy), human.length],
              ]}
              note="Your plans count as an 'up' call when the side is buy. Different instruments and dates: compare with care."
            />
            <Comparison
              title="First thesis versus final decision"
              rows={[
                ["Calls where the final view changed", String(agreement.changed), agreement.pairs],
                [
                  "…the final view was right",
                  String(agreement.changedFinalRight),
                  agreement.changed,
                ],
                [
                  "…the first thesis was right",
                  String(agreement.changedThesisRight),
                  agreement.changed,
                ],
              ]}
              note="Shows whether debate and challenge improved or degraded the initial view."
            />
            <Comparison
              title="Research quality versus execution quality"
              rows={[
                ["Thesis right / wrong", `${quality.thesisGood} / ${quality.thesisBad}`, quality.n],
                ["Execution good / poor", `${quality.execGood} / ${quality.execBad}`, quality.n],
              ]}
              note="From your plans with linked orders: thesis judged on the price path, execution on fills against the plan."
            />
          </div>
          <Card>
            <CardHead
              title="Forecast versus outcome"
              meta={`Most recent ${Math.min(30, committee.length)} matured committee calls`}
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[12px]">
                <thead className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                  <tr>
                    <th className="px-4 py-2">As of</th>
                    <th className="px-4 py-2">Symbol</th>
                    <th className="px-4 py-2">Call</th>
                    <th className="px-4 py-2">Stated p</th>
                    <th className="px-4 py-2">Realised</th>
                    <th className="px-4 py-2">Regime</th>
                    <th className="px-4 py-2">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {[...committee]
                    .sort((a, b) => b.as_of.localeCompare(a.as_of))
                    .slice(0, 30)
                    .map((m) => (
                      <tr key={m.id} className="border-t border-border">
                        <td className="px-4 py-2 font-mono">
                          {new Date(m.as_of).toLocaleDateString("en-IN")}
                        </td>
                        <td className="px-4 py-2 font-mono">{m.symbol}</td>
                        <td className="px-4 py-2">{m.direction}</td>
                        <td className="px-4 py-2 font-mono">{pct(m.probability, 0)}</td>
                        <td
                          className={cn(
                            "px-4 py-2 font-mono",
                            m.realized_return >= 0 ? "text-positive" : "text-negative",
                          )}
                        >
                          {pct(m.realized_return, 2)}
                        </td>
                        <td className="px-4 py-2 text-subtle">{m.regime}</td>
                        <td className="px-4 py-2">
                          <Pill
                            tone={
                              m.correct == null ? "neutral" : m.correct ? "positive" : "negative"
                            }
                          >
                            {m.correct == null ? "Abstained" : m.correct ? "Right" : "Wrong"}
                          </Pill>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="text-[11px] text-subtle">
            Analyst reports carry a summary and confidence but no direction, so per-analyst
            directional records are not available yet. The research service does not expose its
            configuration hash; all sessions are labelled with the current configuration it serves.
          </p>
        </>
      )}
    </div>
  );
}

function StatsTable({ rows }: { rows: { label: string; stats: TrackStats }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-left text-[12px]">
        <thead className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
          <tr>
            <th className="px-4 py-2">Segment</th>
            <th className="px-4 py-2">Matured</th>
            <th className="px-4 py-2">Accuracy</th>
            <th className="px-4 py-2">Baseline</th>
            <th className="px-4 py-2">Brier</th>
            <th className="px-4 py-2">Abstain</th>
            <th className="px-4 py-2">Net / call</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, stats }) => (
            <tr key={label} className="border-t border-border">
              <td className="px-4 py-2">{label}</td>
              <td className="px-4 py-2 font-mono">{stats.n}</td>
              <td
                className={cn(
                  "px-4 py-2 font-mono",
                  stats.beats_baseline == null
                    ? ""
                    : stats.beats_baseline
                      ? "text-positive"
                      : "text-warning",
                )}
              >
                {pct(stats.accuracy)}
              </td>
              <td className="px-4 py-2 font-mono text-subtle">{pct(stats.baseline_accuracy)}</td>
              <td className="px-4 py-2 font-mono">
                {stats.brier == null ? "—" : stats.brier.toFixed(3)}
              </td>
              <td className="px-4 py-2 font-mono">{pct(stats.abstention_rate, 0)}</td>
              <td className="px-4 py-2 font-mono">{pct(stats.cost_adjusted_mean, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CalibrationChart({ stats }: { stats: TrackStats }) {
  if (!stats.calibration.length)
    return (
      <p className="p-5 text-sm text-muted-foreground">
        No matured forecasts with a stated strength yet.
      </p>
    );
  return (
    <div className="p-5">
      <svg
        viewBox="0 0 220 220"
        className="mx-auto h-56 w-56"
        role="img"
        aria-label="Calibration: predicted versus observed hit rate"
      >
        <rect x="20" y="10" width="190" height="190" fill="none" stroke="var(--color-border)" />
        <line
          x1="20"
          y1="200"
          x2="210"
          y2="10"
          stroke="var(--color-border-strong)"
          strokeDasharray="4 4"
        />
        {stats.calibration.map((b) => {
          const x = 20 + ((b.predicted - 0.5) / 0.5) * 190;
          const y = 200 - b.observed * 190;
          return (
            <g key={b.bucket}>
              <circle
                cx={x}
                cy={y}
                r={Math.min(10, 3 + Math.sqrt(b.n))}
                className="fill-primary/70"
              />
              <text x={x + 8} y={y - 6} className="fill-subtle font-mono text-[10px]">
                n={b.n}
              </text>
            </g>
          );
        })}
        <text x="20" y="215" className="fill-subtle font-mono text-[10px]">
          50%
        </text>
        <text x="190" y="215" className="fill-subtle font-mono text-[10px]">
          100%
        </text>
        <text x="0" y="200" className="fill-subtle font-mono text-[10px]">
          0%
        </text>
      </svg>
      <p className="mt-2 text-center text-[11px] text-subtle">
        Points on the dashed line are well calibrated. Horizontal: stated; vertical: observed
        (0–100%).
      </p>
    </div>
  );
}

function Comparison({
  title,
  rows,
  note,
}: {
  title: string;
  rows: [string, string, number][];
  note: string;
}) {
  return (
    <Card>
      <CardHead title={title} />
      <dl className="space-y-2 p-5 text-[12.5px]">
        {rows.map(([label, value, n]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-mono">
              {value} <span className="text-subtle">(n={n})</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="px-5 pb-5 text-[11px] text-subtle">{note}</p>
    </Card>
  );
}
