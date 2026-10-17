import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHead, EmptyState, Pill, Skeleton } from "@/components/app/cards";
import { ProgressBar } from "@/components/app/pages/workspace";
import { WhyButton } from "@/components/app/evidence/WhyButton";
import { stockBySymbol } from "@/data/nifty50";
import { formatINR, useAccount, useMarkedHoldings } from "@/hooks/use-dashboard-data";
import { useCalendar, useHistories, useIndexBars } from "@/hooks/use-quant-data";
import { useJournal, useRiskLimits } from "@/hooks/use-trading-product";
import {
  analysePortfolio,
  twin,
  type PortfolioRisk,
  type Position,
} from "@/lib/quant/portfolio-risk";
import { deliveryCharges } from "@/lib/paper-fees";
import { cn } from "@/lib/utils";

const pct = (v: number | null | undefined, d = 1) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);

function turnoverCost(turnover: number) {
  if (turnover <= 0) return 0;
  try {
    const at = new Date().toISOString();
    // Half the turnover is bought and half sold in a rebalance, on average.
    const half = Math.round((turnover / 2) * 100);
    return (
      (deliveryCharges("BUY", half, at).total_paise +
        deliveryCharges("SELL", half, at).total_paise) /
      100
    );
  } catch {
    return null;
  }
}

/** Portfolio intelligence: exposure, clusters, liquidity, stress and a digital twin. */
export function PortfolioIntelligence() {
  const { data: holdings, isLoading } = useMarkedHoldings();
  const { data: account } = useAccount();
  const { data: limits } = useRiskLimits();
  const { data: journal } = useJournal();
  const calendar = useCalendar();
  const nifty = useIndexBars("NIFTY");
  const symbols = (holdings ?? []).map((h) => h.symbol);
  const histories = useHistories(symbols, "1Y");
  const [outflow, setOutflow] = useState("");
  const [weights, setWeights] = useState<Record<string, number> | null>(null);

  const positions: Position[] = useMemo(
    () =>
      (holdings ?? []).map((h) => ({
        symbol: h.symbol,
        sector: stockBySymbol(h.symbol)?.sector ?? h.sector ?? "Unclassified",
        quantity: h.quantity,
        price: Number(h.last_price || h.avg_price || 0),
        bars: histories.bars[h.symbol] ?? [],
      })),
    [holdings, histories.bars],
  );
  const cash = Number(account?.available_cash ?? account?.wallet_balance ?? 0);
  const openRisk = (journal ?? [])
    .filter((e) => e.plan?.decision === "TRADE" && e.order_id && e.outcome === "OPEN")
    .reduce((t, e) => t + (e.plan?.risk_preview?.planned_loss ?? 0), 0);
  const dailyLimit = limits?.daily_loss_limit ?? 0;
  const monthlyOutflow = Number(outflow) > 0 ? Number(outflow) : 0;
  const options = useMemo(
    () => ({
      ...(nifty.data ? { index: nifty.data.candles } : {}),
      daily_loss_limit: dailyLimit,
      open_risk: openRisk,
      monthly_outflow: monthlyOutflow,
    }),
    [nifty.data, dailyLimit, openRisk, monthlyOutflow],
  );
  const risk = useMemo(
    () => analysePortfolio(positions, cash, options),
    [positions, cash, options],
  );

  const twinResult = useMemo(
    () => (weights ? twin(positions, cash, weights, options) : null),
    [weights, positions, cash, options],
  );
  const upcoming = (calendar.data?.events ?? []).filter((e) => {
    const symbol = e.symbol ?? e.event.split(":")[0]?.trim();
    const t = Date.parse(e.event_time);
    return (
      symbol &&
      symbols.includes(symbol) &&
      t >= Date.now() - 86_400_000 &&
      t <= Date.now() + 30 * 86_400_000
    );
  });
  const eventValue = upcoming.reduce((t, e) => {
    const symbol = e.symbol ?? e.event.split(":")[0]?.trim();
    const p = risk.positions.find((x) => x.symbol === symbol);
    return t + (p?.value ?? 0);
  }, 0);

  if (isLoading) return <Skeleton className="h-64" />;
  if (!positions.length)
    return (
      <Card>
        <EmptyState
          title="No holdings to analyse"
          hint="Portfolio intelligence appears once the paper book holds positions."
        />
      </Card>
    );

  const why = (id: string, label: string, value: string, statement: string, formula: string) => (
    <WhyButton
      claim={{
        id: `xray:${id}`,
        label,
        value,
        statement,
        source: { name: "Paper book holdings" },
        observation: { provider: "Provider daily bars, 1 year", as_of: nifty.data?.as_of ?? null },
        calculation: { formula, inputs: [] },
        model_version: "portfolio-risk v1",
        page: "xray",
      }}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      <Card glow>
        <CardHead
          title="What can hurt me next?"
          meta={`${risk.positions.length} holdings · ${risk.uncovered.length ? `${risk.uncovered.length} without enough history` : "history coverage complete"}`}
        />
        <dl className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
          {[
            [
              "1-day 95% VaR",
              risk.var_95_1d == null ? "—" : formatINR(risk.var_95_1d),
              "1.645 × portfolio daily σ (from covariance of 120 common sessions) × equity",
            ],
            [
              "Portfolio beta",
              risk.portfolio_beta == null ? "—" : risk.portfolio_beta.toFixed(2),
              "Weight-averaged 120-session beta to NIFTY 50 (market factor)",
            ],
            [
              "Effective positions",
              risk.effective_positions == null ? "—" : String(risk.effective_positions),
              "1 ÷ Herfindahl index of invested weights (issuer concentration)",
            ],
            [
              "Max drawdown (current weights)",
              pct(risk.max_drawdown),
              "Largest peak-to-trough fall of today's weights replayed over common history",
            ],
          ].map(([label, value, formula]) => (
            <div key={label} className="bg-panel/80 px-4 py-4">
              <dt className="flex items-center gap-1 font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                {label}
                {why(label!, label!, value!, `${label} is ${value}.`, formula!)}
              </dt>
              <dd className="mt-2 font-mono text-xl">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHead
            title="What should I reduce first?"
            meta="Ranked by contribution to portfolio variance, not by prediction"
          />
          <ol className="divide-y divide-border">
            {risk.reduce_first.map((r, i) => (
              <li key={r.symbol} className="px-5 py-3 text-[12.5px]">
                <span className="mr-2 font-mono text-subtle">{i + 1}</span>
                <span className="font-mono">{r.symbol}</span> — {r.reason}
              </li>
            ))}
            {!risk.reduce_first.length && (
              <li className="px-5 py-4 text-sm text-muted-foreground">
                Needs 30+ sessions of history for at least one holding.
              </li>
            )}
          </ol>
        </Card>
        <Card>
          <CardHead title="Stress scenarios" meta="Beyond flat percentage shocks" />
          <ul className="divide-y divide-border">
            {risk.stress.map((s) => (
              <li
                key={s.name}
                className="flex items-start justify-between gap-3 px-5 py-3 text-[12.5px]"
              >
                <span>
                  {s.name}
                  <span className="block text-[10.5px] text-subtle">{s.basis}</span>
                </span>
                <span className="font-mono text-negative">{formatINR(s.loss)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHead title="Exposure, liquidity and gap risk" meta="Per holding" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[12px]">
            <thead className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
              <tr>
                {[
                  "Symbol",
                  "Sector",
                  "Weight",
                  "Risk contrib.",
                  "Marginal risk",
                  "Beta",
                  "Days to exit",
                  "Gap p95 loss",
                  "120d drawdown",
                  "20d momentum",
                ].map((h) => (
                  <th key={h} className="px-4 py-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {risk.positions.map((p) => (
                <tr key={p.symbol} className="border-t border-border">
                  <td className="px-4 py-2 font-mono">{p.symbol}</td>
                  <td className="px-4 py-2 text-subtle">{p.sector}</td>
                  <td className="px-4 py-2 font-mono">{pct(p.weight)}</td>
                  <td className="px-4 py-2 font-mono">{pct(p.risk_contribution)}</td>
                  <td className="px-4 py-2 font-mono">
                    {p.marginal_risk == null ? "—" : pct(p.marginal_risk, 2)}
                  </td>
                  <td className="px-4 py-2 font-mono">{p.beta?.toFixed(2) ?? "—"}</td>
                  <td
                    className={cn(
                      "px-4 py-2 font-mono",
                      p.exit_days != null && p.exit_days > 1 && "text-warning",
                    )}
                  >
                    {p.exit_days ?? "—"}
                  </td>
                  <td className="px-4 py-2 font-mono">
                    {p.gap_loss == null ? "—" : formatINR(p.gap_loss)}
                  </td>
                  <td className="px-4 py-2 font-mono">
                    {p.drawdown_contribution == null ? "—" : formatINR(p.drawdown_contribution)}
                  </td>
                  <td className="px-4 py-2 font-mono">{pct(p.momentum_20d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-5 py-3 text-[11px] text-subtle">
          Days to exit assume 10% participation in 20-session average volume. Momentum tilt:{" "}
          {risk.factor.momentum_tilt == null ? "—" : `${risk.factor.momentum_tilt}%`} weighted
          20-session return. {risk.factor.size_note}
        </p>
      </Card>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card>
          <CardHead title="Sector concentration" />
          <ul className="space-y-2.5 p-5">
            {risk.sector_weights.map((s) => (
              <li key={s.sector} className="text-[12px]">
                <span className="flex justify-between">
                  {s.sector} <span className="font-mono">{pct(s.weight)}</span>
                </span>
                <ProgressBar
                  value={s.weight * 100}
                  tone={s.weight > 0.35 ? "warning" : "primary"}
                />
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHead title="Correlation clusters" meta="Holdings moving together (ρ ≥ 0.6)" />
          <ul className="space-y-2 p-5 text-[12.5px]">
            {risk.clusters.length ? (
              risk.clusters.map((c) => (
                <li key={c.members.join()}>
                  <span className="font-mono">{c.members.join(" · ")}</span>
                  <span className="block text-[11px] text-subtle">
                    Average correlation {c.avg_correlation}; they behave like one larger position.
                  </span>
                </li>
              ))
            ) : (
              <li className="text-muted-foreground">
                No tightly correlated groups among covered holdings.
              </li>
            )}
          </ul>
        </Card>
        <Card>
          <CardHead title="Budget, events and cash runway" />
          <dl className="space-y-2 p-5 text-[12.5px]">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Open planned risk vs daily limit</dt>
              <dd className="font-mono">
                {formatINR(risk.budget.used)} / {formatINR(risk.budget.limit)}
              </dd>
            </div>
            <ProgressBar
              value={risk.budget.used_pct ?? 0}
              tone={(risk.budget.used_pct ?? 0) > 80 ? "negative" : "primary"}
            />
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Holdings with events in 30 days</dt>
              <dd className="font-mono">
                {upcoming.length} · {formatINR(eventValue)}
              </dd>
            </div>
            <label className="block pt-2 text-[12px] text-muted-foreground">
              Monthly cash outflow (₹)
              <input
                type="number"
                value={outflow}
                onChange={(e) => setOutflow(e.target.value)}
                placeholder="e.g. 25000"
                className="mt-1 w-full border border-border bg-background p-2 font-mono"
              />
            </label>
            {risk.cash_runway.map((r) => (
              <div key={r.scenario} className="flex justify-between">
                <dt className="text-muted-foreground">Runway: {r.scenario.toLowerCase()}</dt>
                <dd className="font-mono">
                  {r.months == null ? "Set an outflow" : `${r.months} months`}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <Card>
        <CardHead
          title="Portfolio digital twin"
          meta="Drag allocations; nothing is traded"
          action={
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setWeights(null)}
              aria-label="Reset twin"
            >
              <RotateCcw /> Reset
            </Button>
          }
        />
        <div className="grid gap-5 p-5 xl:grid-cols-[1fr_1fr]">
          <ul className="space-y-3">
            {risk.positions.map((p) => {
              const value = weights?.[p.symbol] ?? p.weight;
              return (
                <li
                  key={p.symbol}
                  className="grid grid-cols-[90px_1fr_60px] items-center gap-3 text-[12px]"
                >
                  <span className="font-mono">{p.symbol}</span>
                  <input
                    type="range"
                    min={0}
                    max={0.6}
                    step={0.005}
                    value={value}
                    aria-label={`${p.symbol} target weight`}
                    onChange={(e) =>
                      setWeights({
                        ...Object.fromEntries(risk.positions.map((x) => [x.symbol, x.weight])),
                        ...(weights ?? {}),
                        [p.symbol]: Number(e.target.value),
                      })
                    }
                  />
                  <span className="text-right font-mono">{pct(value)}</span>
                </li>
              );
            })}
          </ul>
          {twinResult ? (
            <TwinSummary base={risk} next={twinResult.analysis} turnover={twinResult.turnover} />
          ) : (
            <p className="text-sm text-muted-foreground">Move a slider to see the twin.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

function TwinSummary({
  base,
  next,
  turnover,
}: {
  base: PortfolioRisk;
  next: PortfolioRisk;
  turnover: number;
}) {
  const cost = turnoverCost(turnover);
  const worstBase = Math.max(0, ...base.stress.map((s) => s.loss));
  const worstNext = Math.max(0, ...next.stress.map((s) => s.loss));
  const illiquid = next.positions.filter((p) => p.exit_days != null && p.exit_days > 1);
  const rows: [string, string, string, boolean][] = [
    [
      "Top sector weight",
      pct(base.sector_weights[0]?.weight),
      pct(next.sector_weights[0]?.weight),
      (next.sector_weights[0]?.weight ?? 0) > (base.sector_weights[0]?.weight ?? 0),
    ],
    [
      "Effective positions",
      String(base.effective_positions ?? "—"),
      String(next.effective_positions ?? "—"),
      (next.effective_positions ?? 0) < (base.effective_positions ?? 0),
    ],
    [
      "Worst historical drawdown",
      pct(base.max_drawdown),
      pct(next.max_drawdown),
      (next.max_drawdown ?? 0) < (base.max_drawdown ?? 0),
    ],
    [
      "1-day 95% VaR",
      base.var_95_1d == null ? "—" : formatINR(base.var_95_1d),
      next.var_95_1d == null ? "—" : formatINR(next.var_95_1d),
      (next.var_95_1d ?? 0) > (base.var_95_1d ?? 0),
    ],
    ["Worst scenario loss", formatINR(worstBase), formatINR(worstNext), worstNext > worstBase],
    [
      "Risk budget usage",
      base.budget.used_pct == null ? "—" : `${base.budget.used_pct}%`,
      next.budget.used_pct == null ? "—" : `${next.budget.used_pct}%`,
      false,
    ],
  ];
  return (
    <div className="space-y-3">
      <table className="w-full text-[12px]">
        <thead className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
          <tr>
            <th className="py-1 text-left">Measure</th>
            <th className="py-1 text-right">Now</th>
            <th className="py-1 text-right">Twin</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, now, twinValue, worse]) => (
            <tr key={label} className="border-t border-border">
              <td className="py-1.5">{label}</td>
              <td className="py-1.5 text-right font-mono">{now}</td>
              <td className={cn("py-1.5 text-right font-mono", worse && "text-warning")}>
                {twinValue}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[12px]">
        Turnover {formatINR(turnover)} · estimated charges{" "}
        {cost == null ? "unknown" : formatINR(cost)}
      </p>
      {illiquid.length > 0 && (
        <p className="text-[12px] text-warning">
          Liquidity constraint:{" "}
          {illiquid.map((p) => `${p.symbol} (${p.exit_days} days to exit)`).join(", ")}.
        </p>
      )}
      <Pill tone="neutral">Simulation only · uses the same history and formulas as above</Pill>
    </div>
  );
}
