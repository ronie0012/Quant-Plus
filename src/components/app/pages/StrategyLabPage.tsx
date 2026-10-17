import { useMemo, useState } from "react";
import { FlaskConical, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHead, EmptyState, Pill } from "@/components/app/cards";
import { MetricStrip, PageIntro } from "@/components/app/pages/workspace";
import { WhyButton } from "@/components/app/evidence/WhyButton";
import { nifty50 } from "@/data/nifty50";
import { useHistories, useIndexBars } from "@/hooks/use-quant-data";
import {
  useResearchItems,
  useSaveResearchItem,
  type ResearchItem,
} from "@/hooks/use-workspace-prefs";
import { deliveryCharges } from "@/lib/paper-fees";
import {
  compileHypothesis,
  describeCondition,
  evaluateStrategy,
  liquidSubset,
  type Evaluation,
  type StrategySpec,
  type Universe,
} from "@/lib/quant/strategy";
import { regimeLabeller } from "@/lib/quant/track-record";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "Find liquid NSE stocks that outperform their sector after a high-volume breakout, but only when market breadth is positive.",
  "Buy banking stocks when RSI below 30, hold for 7 days with a 4% stop and 8% target.",
  "IT stocks that gap up 2% above their 50-day moving average, hold for 5 sessions.",
  "Stocks that have fallen 6% in the last 5 days while above the 200-day moving average, hold for 10 days.",
];

const pct = (v: number | null | undefined, d = 2) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);
const day = (t: number) => new Date(t * 1000).toLocaleDateString("en-IN");

function roundTripPct() {
  try {
    const at = new Date().toISOString();
    const n = 1_00_000_00;
    return (
      ((deliveryCharges("BUY", n, at).total_paise + deliveryCharges("SELL", n, at).total_paise) /
        n) *
      100
    );
  } catch {
    return 0.25;
  }
}

const VERDICT_TONE: Record<Evaluation["verdict"], "positive" | "negative" | "warning" | "primary"> =
  {
    PROMOTE: "positive",
    SHADOW: "primary",
    INCONCLUSIVE: "warning",
    REJECT: "negative",
  };

/**
 * Natural-language research compiler: hypothesis → typed definition →
 * falsification pipeline → promotion, shadow run or rejection.
 */
export function StrategyLabPage() {
  const [text, setText] = useState(EXAMPLES[0]!);
  const [spec, setSpec] = useState<StrategySpec | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [running, setRunning] = useState(false);
  const [shadowSince, setShadowSince] = useState<string | null>(null);
  const [studyId, setStudyId] = useState<string | null>(null);
  const cost = roundTripPct();
  const universeSymbols = useMemo(
    () =>
      spec
        ? nifty50
            .filter((s) => !spec.universe.sector || s.sector === spec.universe.sector)
            .map((s) => s.symbol)
        : [],
    [spec],
  );
  const histories = useHistories(universeSymbols, "1Y");
  const nifty = useIndexBars("NIFTY");
  const studies = useResearchItems("STRATEGY");
  const save = useSaveResearchItem();

  function compile() {
    const compiled = compileHypothesis(text, Number(cost.toFixed(3)));
    setSpec(compiled);
    setEvaluation(null);
    setShadowSince(null);
    setStudyId(null);
  }

  function run(target = spec, since = shadowSince) {
    if (!target) return;
    setRunning(true);
    // Yield to the browser so the button state renders before the computation.
    window.setTimeout(() => {
      try {
        let universe: Universe = nifty50
          .filter(
            (s) =>
              (!target.universe.sector || s.sector === target.universe.sector) &&
              histories.bars[s.symbol]?.length,
          )
          .map((s) => ({ symbol: s.symbol, sector: s.sector, bars: histories.bars[s.symbol]! }));
        if (target.universe.liquid_only)
          universe = liquidSubset(universe, Math.min(30, universe.length));
        const index = nifty.data?.candles ?? null;
        setEvaluation(
          evaluateStrategy(target, universe, index, regimeLabeller(index ?? []), since, 100),
        );
      } finally {
        setRunning(false);
      }
    }, 30);
  }

  async function persist() {
    if (!spec || !evaluation) return;
    const since =
      shadowSince ?? (evaluation.verdict === "SHADOW" ? new Date().toISOString() : null);
    const body = {
      spec,
      shadow_since: since,
      result: {
        verdict: evaluation.verdict,
        reasons: evaluation.reasons,
        test: evaluation.segments.test,
        baseline_test: evaluation.baseline.test,
        placebo_p: evaluation.placebo.p_value,
        walk_forward_oos: evaluation.walk_forward.oos_mean,
        evaluated_at: new Date().toISOString(),
        data_through: histories.sources[universeSymbols[0] ?? ""]?.as_of ?? null,
      },
    };
    try {
      const saved = await save.mutateAsync({
        ...(studyId ? { id: studyId } : { kind: "STRATEGY" as const }),
        title: spec.hypothesis.slice(0, 300),
        status:
          evaluation.verdict === "SHADOW"
            ? "SHADOW"
            : evaluation.verdict === "PROMOTE"
              ? "APPROVED"
              : evaluation.verdict === "REJECT"
                ? "REJECTED"
                : "DRAFT",
        body,
      });
      if (saved) setStudyId(saved.id);
      setShadowSince(since);
      toast.success(studyId ? "Study re-evaluated; previous version kept" : "Study saved");
    } catch {
      toast.error("Study could not be saved");
    }
  }

  function open(item: ResearchItem) {
    const stored = item.body as { spec?: StrategySpec; shadow_since?: string | null };
    if (!stored.spec) return;
    setText(stored.spec.hypothesis);
    setSpec(stored.spec);
    setShadowSince(stored.shadow_since ?? null);
    setStudyId(item.id);
    setEvaluation(null);
  }

  const ready =
    spec &&
    histories.loaded >= Math.max(1, Math.floor(universeSymbols.length * 0.6)) &&
    !histories.loading;
  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Research compiler"
        title="Describe a hypothesis. Try to break it."
        body="Plain language is compiled into a typed, visible strategy definition. Anything the compiler did not understand is listed, never guessed. Each definition then faces the same falsification pipeline: baseline, walk-forward, costs, regimes, a placebo test, parameter sensitivity and a shadow paper run before it can be promoted."
        status="Backtests are evidence, not proof"
      >
        <MetricStrip
          items={[
            {
              label: "Universe",
              value: spec ? universeSymbols.length : "—",
              note: spec?.universe.description ?? "Compile a hypothesis",
            },
            {
              label: "History loaded",
              value: spec ? `${histories.loaded}/${histories.total}` : "—",
            },
            {
              label: "Round-trip cost",
              value: `${cost.toFixed(3)}%`,
              note: "Statutory + exchange charges, today's schedule",
            },
            { label: "Saved studies", value: studies.data?.length ?? 0 },
          ]}
        />
      </PageIntro>
      <Card glow>
        <CardHead title="Hypothesis" meta="Plain language" />
        <div className="space-y-3 p-5">
          <textarea
            aria-label="Hypothesis"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-24 w-full border border-border bg-background p-3 text-[13.5px] outline-none"
          />
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <Button
                key={example}
                size="sm"
                variant="outline"
                className="h-auto max-w-full whitespace-normal py-1 text-left text-[11px]"
                onClick={() => setText(example)}
              >
                {example.slice(0, 64)}…
              </Button>
            ))}
          </div>
          <Button onClick={compile} disabled={text.trim().length < 10}>
            <FlaskConical /> Compile
          </Button>
        </div>
      </Card>

      {spec && (
        <Card>
          <CardHead title="Strategy definition" meta="Typed and inspectable" />
          <div className="grid gap-5 p-5 lg:grid-cols-2">
            <Definition label="Universe" items={[spec.universe.description]} />
            <Definition
              label="Entry conditions (all must hold at the close)"
              items={spec.entry.map(describeCondition)}
              empty="None recognised"
            />
            <Definition
              label="Market filter"
              items={spec.market_filter.map(
                (f) => `NIFTY 50 above its ${f.period}-session SMA (proxy for ${f.proxy_for})`,
              )}
              empty="None"
            />
            <Definition
              label="Exit"
              items={[
                `Time exit after ${spec.exit.holding_days} sessions`,
                spec.exit.stop_pct != null ? `Stop ${spec.exit.stop_pct}% below entry` : "No stop",
                spec.exit.target_pct != null
                  ? `Target ${spec.exit.target_pct}% above entry`
                  : "No target",
                "Entry at the next session's open; one position per symbol",
              ]}
            />
            <Definition
              label="Transaction costs and slippage"
              items={[
                `${spec.costs.round_trip_pct}% round trip`,
                `${spec.costs.slippage_bps} bps slippage each side`,
              ]}
            />
            <Definition
              label="Train / validation / test"
              items={[
                `${spec.split.train * 100}% / ${spec.split.validation * 100}% / ${spec.split.test * 100}% of the timeline, in order`,
              ]}
            />
            <Definition label="Survivorship rule" items={[spec.survivorship]} />
            <Definition label="Corporate-action policy" items={[spec.corporate_actions]} />
            <Definition label="Required data" items={spec.required_data} />
            <Definition label="Falsification tests" items={spec.falsification} />
            {spec.assumptions.length > 0 && (
              <Definition
                label="Assumptions the compiler made"
                items={spec.assumptions}
                tone="warning"
              />
            )}
            {spec.unparsed.length > 0 && (
              <Definition label="Not understood (ignored)" items={spec.unparsed} tone="negative" />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-4">
            <Button onClick={() => run()} disabled={!ready || running || !spec.entry.length}>
              {running ? <Loader2 className="animate-spin" /> : <FlaskConical />} Run falsification
              pipeline
            </Button>
            {!ready && (
              <span className="text-[11.5px] text-subtle">
                Loading history for {universeSymbols.length} symbols…
              </span>
            )}
            {evaluation && (
              <Button variant="outline" onClick={() => void persist()} disabled={save.isPending}>
                <Save /> {studyId ? "Save new version" : "Save study"}
              </Button>
            )}
          </div>
        </Card>
      )}

      {evaluation && spec && <EvaluationView evaluation={evaluation} spec={spec} />}

      <Card>
        <CardHead
          title="Saved studies"
          meta="Versioned; shadow studies keep tracking new signals"
        />
        {studies.data?.length ? (
          <ul className="divide-y divide-border">
            {studies.data.map((item) => {
              const result = (
                item.body as { result?: { verdict?: Evaluation["verdict"]; evaluated_at?: string } }
              ).result;
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <span className="min-w-0 flex-1 text-[12.5px]">
                    {item.title}
                    <span className="mt-0.5 block font-mono text-[11px] text-subtle">
                      v{item.version} ·{" "}
                      {result?.evaluated_at
                        ? `evaluated ${new Date(result.evaluated_at).toLocaleString("en-IN")}`
                        : "not evaluated"}
                    </span>
                  </span>
                  {result?.verdict && (
                    <Pill tone={VERDICT_TONE[result.verdict]}>{result.verdict}</Pill>
                  )}
                  <Button size="sm" variant="outline" onClick={() => open(item)}>
                    Open
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            title="No studies saved"
            hint="Compile and evaluate a hypothesis, then save it to track it over time."
          />
        )}
      </Card>
    </div>
  );
}

function Definition({
  label,
  items,
  empty,
  tone,
}: {
  label: string;
  items: string[];
  empty?: string;
  tone?: "warning" | "negative";
}) {
  return (
    <div>
      <p className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">{label}</p>
      <ul
        className={cn(
          "mt-1.5 list-disc space-y-0.5 pl-5 text-[12.5px]",
          tone === "warning" && "text-warning",
          tone === "negative" && "text-negative",
        )}
      >
        {items.length ? (
          items.map((item) => <li key={item}>{item}</li>)
        ) : (
          <li className="text-subtle">{empty ?? "—"}</li>
        )}
      </ul>
    </div>
  );
}

function EvaluationView({ evaluation, spec }: { evaluation: Evaluation; spec: StrategySpec }) {
  const steps: { n: number; title: string; body: React.ReactNode; pass: boolean | null }[] = [
    {
      n: 1,
      title: "Baseline comparison",
      pass: evaluation.baseline.beats,
      body: `Test-period net mean ${pct(evaluation.segments.test.mean_net)} per trade vs ${pct(evaluation.baseline.test)} for any entry with the same ${spec.exit.holding_days}-session hold.`,
    },
    {
      n: 2,
      title: "Walk-forward validation",
      pass: evaluation.walk_forward.oos_mean == null ? null : evaluation.walk_forward.oos_mean > 0,
      body: (
        <>
          Out-of-sample mean {pct(evaluation.walk_forward.oos_mean)}.
          <ul className="mt-1 space-y-0.5 font-mono text-[10.5px]">
            {evaluation.walk_forward.folds.map((f) => (
              <li key={f.from}>
                {day(f.from)} → {day(f.to)} · parameter scale {f.factor}× chosen in-sample ·{" "}
                {f.trades} trades · {pct(f.mean_net)}
              </li>
            ))}
          </ul>
        </>
      ),
    },
    {
      n: 3,
      title: "Cost-adjusted evaluation",
      pass: evaluation.costs.net == null ? null : evaluation.costs.net > 0,
      body: `Gross ${pct(evaluation.costs.gross)} → net ${pct(evaluation.costs.net)} per trade. Costs turned ${pct(evaluation.costs.cost_eaten_share, 0)} of trades from gains into losses.`,
    },
    {
      n: 4,
      title: "Regime analysis",
      pass: null,
      body: (
        <ul className="space-y-0.5 font-mono text-[10.5px]">
          {evaluation.regimes.map((r) => (
            <li key={r.regime}>
              {r.regime}: {r.stats.trades} trades · {pct(r.stats.mean_net)} · hit{" "}
              {pct(r.stats.hit_rate, 0)}
            </li>
          ))}
        </ul>
      ),
    },
    {
      n: 5,
      title: "Placebo test",
      pass: evaluation.placebo.p_value == null ? null : evaluation.placebo.p_value < 0.1,
      body: `${evaluation.placebo.runs} random-entry runs with identical exits averaged ${pct(evaluation.placebo.placebo_mean)}; p = ${evaluation.placebo.p_value == null ? "—" : evaluation.placebo.p_value.toFixed(3)} (share of placebos at least as good).`,
    },
    {
      n: 6,
      title: "Parameter sensitivity",
      pass:
        evaluation.sensitivity_consistency == null
          ? null
          : evaluation.sensitivity_consistency >= 0.6,
      body: (
        <ul className="space-y-0.5 font-mono text-[10.5px]">
          {evaluation.sensitivity.map((s) => (
            <li key={s.factor}>
              {s.factor}× parameters: {s.trades} trades · {pct(s.mean_net)}
            </li>
          ))}
        </ul>
      ),
    },
    {
      n: 7,
      title: "Shadow paper run",
      pass: evaluation.shadow.since
        ? evaluation.shadow.signals >= 10
          ? (evaluation.shadow.mean_net ?? 0) > 0
          : null
        : null,
      body: evaluation.shadow.since
        ? `Tracking since ${new Date(evaluation.shadow.since).toLocaleDateString("en-IN")}: ${evaluation.shadow.signals} new signals, ${pct(evaluation.shadow.mean_net)} net.`
        : "Starts when a study that passes the historical tests is saved. New signals after that date are scored as they mature.",
    },
  ];
  return (
    <Card>
      <CardHead
        title="Falsification pipeline"
        meta={`Train ${day(evaluation.periods.train[0])} → test ends ${day(evaluation.periods.test[1] - 1)}`}
        action={
          <span className="flex items-center gap-1">
            <Pill tone={VERDICT_TONE[evaluation.verdict]}>{evaluation.verdict}</Pill>
            <WhyButton
              claim={{
                id: `strategy:verdict:${spec.hypothesis.slice(0, 40)}`,
                label: "Strategy verdict",
                value: evaluation.verdict,
                statement: evaluation.reasons.join(" "),
                source: { name: "Provider daily OHLCV, 1 year" },
                calculation: {
                  formula:
                    "Promote only if: ≥20 test trades, positive net test mean, beats baseline, placebo p < 0.10, positive walk-forward OOS mean, ≥60% sign-consistent sensitivity, then ≥10 positive shadow signals",
                  inputs: [
                    { name: "test trades", value: String(evaluation.segments.test.trades) },
                    {
                      name: "placebo p",
                      value:
                        evaluation.placebo.p_value == null
                          ? "—"
                          : evaluation.placebo.p_value.toFixed(3),
                    },
                  ],
                },
                model_version: "strategy-compiler v1",
                page: "strategy-lab",
              }}
            />
          </span>
        }
      />
      <div className="grid gap-px bg-border sm:grid-cols-3">
        {(["train", "validation", "test"] as const).map((k) => (
          <div key={k} className="bg-panel p-4 text-[12px]">
            <p className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">{k}</p>
            <p className="mt-1 font-mono text-lg">{pct(evaluation.segments[k].mean_net)}</p>
            <p className="text-subtle">
              {evaluation.segments[k].trades} trades · hit {pct(evaluation.segments[k].hit_rate, 0)}{" "}
              · t {evaluation.segments[k].t_stat?.toFixed(2) ?? "—"}
            </p>
          </div>
        ))}
      </div>
      <ol className="divide-y divide-border">
        {steps.map((step) => (
          <li key={step.n} className="grid gap-2 px-5 py-3 sm:grid-cols-[220px_1fr_80px]">
            <span className="text-[13px]">
              <span className="mr-2 font-mono text-[10px] text-subtle">{step.n}</span>
              {step.title}
            </span>
            <span className="text-[12px] text-muted-foreground">{step.body}</span>
            <span className="sm:text-right">
              <Pill tone={step.pass == null ? "neutral" : step.pass ? "positive" : "negative"}>
                {step.pass == null ? "Info" : step.pass ? "Pass" : "Fail"}
              </Pill>
            </span>
          </li>
        ))}
        <li className="px-5 py-4">
          <p className="text-[13px]">
            <span className="mr-2 font-mono text-[10px] text-subtle">8</span>Promotion or rejection:{" "}
            <Pill tone={VERDICT_TONE[evaluation.verdict]}>{evaluation.verdict}</Pill>
          </p>
          <ul className="mt-1.5 list-disc pl-6 text-[12px] text-muted-foreground">
            {evaluation.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </li>
      </ol>
    </Card>
  );
}
