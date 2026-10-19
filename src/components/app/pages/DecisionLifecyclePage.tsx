import { useEffect, useMemo, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Circle, Download, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHead, EmptyState, Pill, Skeleton } from "@/components/app/cards";
import { MetricStrip, PageIntro, Segmented } from "@/components/app/pages/workspace";
import { RiskPreviewPanel } from "@/components/app/risk/RiskPreviewPanel";
import { WhyButton } from "@/components/app/evidence/WhyButton";
import { nifty50, stockBySymbol } from "@/data/nifty50";
import { useStockQuote } from "@/hooks/use-agent-stock";
import { useStockNews } from "@/hooks/use-intelligence";
import { useOrders } from "@/hooks/use-orders";
import { formatINR } from "@/hooks/use-dashboard-data";
import { useFills, usePredictionSnapshot, useSymbolHistory } from "@/hooks/use-quant-data";
import { useTradeGuard } from "@/hooks/use-trade-guard";
import {
  useDeleteJournalEntry,
  useJournal,
  useSaveJournalEntry,
  type JournalEntry,
} from "@/hooks/use-trading-product";
import {
  attributeOutcome,
  emptyPlan,
  executionFacts,
  planChecklist,
  planProblems,
  planReadiness,
  rewardRisk,
  riskBasedQuantity,
  widenedStops,
  type Attribution,
  type DecisionPlanBody,
  type EvidenceKind,
  type PlanEvidence,
} from "@/lib/quant/decision-plan";
import { validateCandles } from "@/lib/market-history";
import { cn } from "@/lib/utils";

const OUTCOMES = ["OPEN", "WIN", "LOSS", "FLAT", "CANCELLED"] as const;
type Plan = DecisionPlanBody & { invalidated_at?: string | null };

type Draft = {
  symbol: string;
  thesis: string;
  invalidation: string;
  reflection: string;
  outcome: (typeof OUTCOMES)[number];
  order_id: string;
  plan: Plan;
};

const blankDraft = (symbol: string): Draft => ({
  symbol,
  thesis: "",
  invalidation: "",
  reflection: "",
  outcome: "OPEN",
  order_id: "",
  plan: emptyPlan(),
});

const numberOrNull = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const ATTRIBUTION_TONE: Record<
  Attribution["label"],
  "positive" | "negative" | "warning" | "neutral" | "primary"
> = {
  SOUND_TRADE: "positive",
  GOOD_THESIS_BAD_EXECUTION: "warning",
  BAD_THESIS_GOOD_EXECUTION: "warning",
  GOOD_TRADE_BAD_PROCESS: "warning",
  BAD_THESIS_BAD_EXECUTION: "negative",
  NO_TRADE: "primary",
  UNRESOLVED: "neutral",
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
      {label}
      {children}
      {hint && (
        <span className="mt-1 block font-sans text-[10.5px] normal-case tracking-normal text-subtle">
          {hint}
        </span>
      )}
    </label>
  );
}

const inputClass =
  "mt-2 w-full border border-border bg-background p-2.5 font-sans text-[13px] normal-case tracking-normal text-foreground outline-none placeholder:text-subtle";

/**
 * The Decision Lifecycle: one connected object from market snapshot and
 * evidence through thesis, risk plan and order (or decision not to trade) to
 * execution and outcome analysis that separates thesis, execution and process.
 */
export function DecisionLifecyclePage({ embedded = false }: { embedded?: boolean }) {
  const { data, isLoading } = useJournal();
  const save = useSaveJournalEntry();
  const remove = useDeleteJournalEntry();
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const requested =
    typeof search["symbol"] === "string" ? String(search["symbol"]).toUpperCase() : null;
  const requestedPlanId = typeof search["plan"] === "string" ? String(search["plan"]) : null;
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() =>
    blankDraft(requested && stockBySymbol(requested) ? requested : "RELIANCE"),
  );
  const [riskBudget, setRiskBudget] = useState("");
  const [filter, setFilter] = useState<"ALL" | "OPEN" | "TRADED" | "NO TRADE" | "REVIEWED">("ALL");
  useEffect(() => {
    if (requestedPlanId && data && !selected) {
      const requestedEntry = data.find((entry) => entry.id === requestedPlanId);
      if (requestedEntry) {
        load(requestedEntry);
        return;
      }
    }
    if (requested && stockBySymbol(requested) && !selected)
      setDraft((d) => ({ ...d, symbol: requested }));
  }, [data, requested, requestedPlanId, selected]);

  const active = data?.find((entry) => entry.id === selected) ?? null;
  const frozen = Boolean(active?.plan?.market_snapshot);
  const feed = useStockQuote(draft.symbol, !frozen);
  const quote = feed.quote?.symbol === draft.symbol ? feed.quote : null;
  const orders = useOrders(draft.symbol);
  const fills = useFills();
  const history = useSymbolHistory(draft.symbol, "1Y", Boolean(active?.order_id || active?.plan));
  const news = useStockNews(draft.symbol);
  const prediction = usePredictionSnapshot(draft.symbol);
  const plan = draft.plan;
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const setPlan = (patch: Partial<Plan>) =>
    setDraft((current) => ({ ...current, plan: { ...current.plan, ...patch } }));

  const guard = useTradeGuard(
    plan.decision === "TRADE" && plan.quantity && (plan.entry ?? quote?.price)
      ? {
          symbol: draft.symbol,
          side: plan.side,
          quantity: plan.quantity,
          order_type:
            plan.entry && quote?.price && Math.abs(plan.entry - quote.price) / quote.price > 0.002
              ? "LIMIT"
              : "MARKET",
          limit_price:
            plan.entry && quote?.price && Math.abs(plan.entry - quote.price) / quote.price > 0.002
              ? plan.entry
              : null,
          stop: plan.stop,
          target: plan.target,
          holding_days: plan.holding_period_days,
          plan_id: active?.id ?? null,
        }
      : null,
  );

  const entryLike = {
    thesis: draft.thesis,
    invalidation: draft.invalidation,
    plan,
    order_id: draft.order_id || null,
    reflection: draft.reflection,
    ...(active ? { created_at: active.created_at } : {}),
  };
  const checklist = planChecklist(entryLike);
  const readiness = planReadiness(entryLike);
  const problems = planProblems(plan);
  const rr = rewardRisk(plan);

  function load(entry: JournalEntry) {
    setSelected(entry.id);
    setDraft({
      symbol: entry.symbol,
      thesis: entry.thesis,
      invalidation: entry.invalidation,
      reflection: entry.reflection,
      outcome: entry.outcome,
      order_id: entry.order_id ?? "",
      plan: {
        ...emptyPlan(),
        ...(entry.plan ?? {}),
        evidence_items: entry.plan?.evidence_items ?? legacyEvidence(entry),
      },
    });
  }

  function reset(symbol = draft.symbol) {
    setSelected(null);
    setDraft(blankDraft(symbol));
    setRiskBudget("");
  }

  function snapshotNow(): Plan["market_snapshot"] {
    if (!quote?.price || !quote.as_of) return null;
    return {
      symbol: draft.symbol,
      price: quote.price,
      bid: quote.bid ?? null,
      ask: quote.ask ?? null,
      change_pct: quote.change_pct ?? null,
      volume: quote.volume ?? null,
      source: String(quote.source ?? "provider"),
      as_of: new Date(quote.as_of).toISOString(),
      captured_at: new Date().toISOString(),
      market_session: quote.market_session ?? null,
      delayed: quote.delayed ?? false,
      stale: feed.stale || quote.stale,
    };
  }

  function addEvidence(item: Omit<PlanEvidence, "id" | "available_at">) {
    setPlan({
      evidence_items: [
        ...plan.evidence_items,
        { ...item, id: crypto.randomUUID(), available_at: new Date().toISOString() },
      ],
    });
  }

  function persist() {
    const problemsNow = planProblems(plan);
    if (problemsNow.length) {
      toast.error(problemsNow[0]!);
      return;
    }
    const snapshot = plan.market_snapshot ?? (active ? null : snapshotNow());
    const body: Plan = {
      ...plan,
      market_snapshot: snapshot,
      // Fill expected costs from the compiler when the user has not set them.
      expected_fees: plan.expected_fees ?? (guard.preview ? guard.preview.fees_round_trip : null),
      expected_slippage:
        plan.expected_slippage ?? (guard.preview ? guard.preview.expected_slippage : null),
      time_exit: plan.time_exit ? new Date(plan.time_exit).toISOString() : null,
    };
    const entry = {
      symbol: draft.symbol,
      thesis: draft.thesis,
      invalidation: draft.invalidation,
      planned_exit: plannedExitText(body),
      evidence: body.evidence_items.map((e) => e.claim).slice(0, 200),
      risks: body.counter_thesis ? [body.counter_thesis] : [],
      order_id: draft.order_id || null,
      plan: body,
      ...(active
        ? { id: active.id, reflection: draft.reflection, outcome: draft.outcome }
        : {
            decision_snapshot: snapshot
              ? {
                  price: snapshot.price,
                  source: snapshot.source,
                  as_of: snapshot.as_of,
                  ...(snapshot.market_session ? { market_session: snapshot.market_session } : {}),
                }
              : null,
          }),
    };
    void save
      .mutateAsync(entry)
      .then(() => {
        toast.success(
          active
            ? "Journal entry saved · decision plan updated"
            : "Journal entry saved · decision plan saved with its market snapshot",
        );
        if (!active) reset();
      })
      .catch((error: unknown) =>
        toast.error(
          error instanceof Error && error.message.includes("IMMUTABLE")
            ? "The market snapshot, risk preview and evidence times are frozen once recorded."
            : "Plan could not be saved",
        ),
      );
  }

  // Outcome attribution for a plan that produced (or declined) a trade.
  const attribution = useMemo(() => {
    if (!active?.plan) return null;
    const bars = validateCandles(history.data?.candles).candles;
    const all = fills.data ?? [];
    const order = (orders.data ?? []).find((o) => o.id === active.order_id);
    const facts = active.order_id
      ? executionFacts(
          active.order_id,
          all.map((f) => ({ ...f, charges: f.charges?.total ?? 0 })),
          all
            .filter((f) => f.symbol === active.symbol && f.side !== active.plan!.side)
            .map((f) => ({ ...f, charges: f.charges?.total ?? 0 })),
        )
      : null;
    return attributeOutcome(
      { ...active, plan: active.plan },
      facts,
      order?.created_at ?? null,
      bars,
    );
  }, [active, history.data, fills.data, orders.data]);

  const entries = (data ?? []).filter((entry) => {
    if (filter === "OPEN") return entry.outcome === "OPEN" && entry.plan?.decision !== "NO_TRADE";
    if (filter === "TRADED") return Boolean(entry.order_id);
    if (filter === "NO TRADE") return entry.plan?.decision === "NO_TRADE";
    if (filter === "REVIEWED") return Boolean(entry.reflection);
    return true;
  });
  const fullPlans = (data ?? []).filter((e) => e.plan && planReadiness(e).ready).length;
  const sectionTitle = (n: number, title: string, done: boolean) => (
    <h3 className="flex items-center gap-2 text-[13px]">
      {done ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-positive" />
      ) : (
        <Circle className="h-3.5 w-3.5 text-subtle" />
      )}
      <span className="font-mono text-[10px] text-subtle">{String(n).padStart(2, "0")}</span>
      {title}
    </h3>
  );
  const done = (key: string) => checklist.find((item) => item.key === key)?.done ?? false;

  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        headingLevel={embedded ? 2 : 1}
        eyebrow="Decision lifecycle"
        title="Decision journal"
        body="Start with evidence, define the risk, then choose a paper trade or a watch-only outcome. Return here to compare the result with your original plan."
        action={
          <Button size="sm" onClick={() => reset()}>
            <Plus /> New plan
          </Button>
        }
      >
        <MetricStrip
          items={[
            { label: "Plans", value: data?.length ?? 0 },
            { label: "Complete before trading", value: fullPlans, tone: "positive" },
            {
              label: "Decided not to trade",
              value: (data ?? []).filter((e) => e.plan?.decision === "NO_TRADE").length,
              tone: "primary",
            },
            { label: "Reviewed", value: (data ?? []).filter((e) => e.reflection).length },
          ]}
        />
        <details className="mt-4 text-xs text-muted-foreground">
          <summary className="cursor-pointer py-2">How decision records are stored</summary>
          <p className="max-w-2xl pb-2 leading-relaxed">
            The market snapshot, compiled risk preview and evidence times are frozen once recorded.
            Stop and target changes are logged by the server so you can review the decision using
            information available at the time.
          </p>
        </details>
      </PageIntro>
      <div className="grid items-start gap-5 xl:grid-cols-[.75fr_1.25fr]">
        <Card>
          <CardHead title="Plans" meta="Newest first" />
          <div className="px-4 pt-3">
            <Segmented
              items={["ALL", "OPEN", "TRADED", "NO TRADE", "REVIEWED"] as const}
              value={filter}
              onChange={setFilter}
              label="Filter plans"
            />
          </div>
          {isLoading ? (
            <Skeleton className="m-5 h-44" />
          ) : entries.length ? (
            <ul className="mt-2 divide-y divide-border">
              {entries.map((entry) => {
                const r = planReadiness(entry);
                return (
                  <li key={entry.id}>
                    <Button
                      variant="ghost"
                      onClick={() => load(entry)}
                      className={cn(
                        "h-auto w-full justify-start rounded-none p-4 text-left",
                        selected === entry.id && "bg-primary/10",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 font-mono text-xs">
                          {entry.symbol}
                          {entry.plan?.decision === "NO_TRADE" && (
                            <Pill tone="primary">No trade</Pill>
                          )}
                          {entry.order_id && <Pill>Order linked</Pill>}
                        </span>
                        <span className="mt-1 block truncate text-[11px] text-subtle">
                          {entry.thesis || "Untitled thesis"}
                        </span>
                        <span className="mt-1 block font-mono text-[11px] text-subtle">
                          {new Date(entry.created_at).toLocaleString("en-IN")} ·{" "}
                          {entry.plan ? `${r.score}% ready` : "Legacy journal entry"}
                        </span>
                      </span>
                      <Pill
                        tone={
                          entry.outcome === "WIN"
                            ? "positive"
                            : entry.outcome === "LOSS"
                              ? "negative"
                              : "neutral"
                        }
                      >
                        {entry.outcome}
                      </Pill>
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              title="No plans here"
              hint="Write a plan before your next simulated trade, or record a decision not to trade."
            />
          )}
        </Card>

        <Card glow>
          <CardHead
            title={active ? `${active.symbol} decision plan` : "New decision plan"}
            meta={
              active
                ? `Written ${new Date(active.created_at).toLocaleString("en-IN")}`
                : "Snapshot is captured when you save"
            }
            action={
              <span className="flex items-center gap-2">
                <Pill tone={readiness.ready ? "positive" : "warning"}>
                  {readiness.score}% ready
                </Pill>
                {active && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Export plan as JSON"
                    title="Export plan as JSON"
                    onClick={() =>
                      download(`${active.symbol}-plan-${active.id.slice(0, 8)}.json`, active)
                    }
                  >
                    <Download />
                  </Button>
                )}
                {active && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Delete plan"
                    title="Delete plan"
                    onClick={() => {
                      if (
                        !window.confirm("Delete this decision plan? Its revision history is lost.")
                      )
                        return;
                      void remove.mutateAsync(active.id).then(() => reset());
                    }}
                  >
                    <Trash2 />
                  </Button>
                )}
              </span>
            }
          />
          <div className="grid gap-6 p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Instrument">
                <select
                  value={draft.symbol}
                  disabled={Boolean(active)}
                  onChange={(e) => set({ symbol: e.target.value, order_id: "" })}
                  className={inputClass}
                >
                  {nifty50.map((s) => (
                    <option key={s.symbol}>{s.symbol}</option>
                  ))}
                </select>
              </Field>
              <Field label="Side">
                <select
                  value={plan.side}
                  onChange={(e) => setPlan({ side: e.target.value as Plan["side"] })}
                  className={inputClass}
                >
                  <option value="BUY">Buy (enter long)</option>
                  <option value="SELL">Sell (exit)</option>
                </select>
              </Field>
              <Field label="Decision">
                <select
                  value={plan.decision}
                  onChange={(e) => setPlan({ decision: e.target.value as Plan["decision"] })}
                  className={inputClass}
                >
                  <option value="TRADE">Trade</option>
                  <option value="NO_TRADE">Decide not to trade</option>
                </select>
              </Field>
            </div>

            <section className="space-y-2">
              {sectionTitle(1, "Market snapshot", done("snapshot"))}
              {plan.market_snapshot ? (
                <p className="text-[12px] text-muted-foreground">
                  ₹{plan.market_snapshot.price} from {plan.market_snapshot.source} as of{" "}
                  {new Date(plan.market_snapshot.as_of).toLocaleString("en-IN")}
                  {plan.market_snapshot.bid != null && plan.market_snapshot.ask != null
                    ? ` · bid ₹${plan.market_snapshot.bid} / ask ₹${plan.market_snapshot.ask}`
                    : ""}
                  {plan.market_snapshot.stale ? " · stale" : ""}
                  {plan.market_snapshot.delayed ? " · delayed" : ""} · frozen
                </p>
              ) : active ? (
                <p className="text-[12px] text-warning">
                  This entry predates decision plans; no snapshot can be added after the fact.
                </p>
              ) : (
                <p className="text-[12px] text-muted-foreground">
                  {quote?.price
                    ? `Will record ₹${quote.price} (${quote.source ?? "provider"}${quote.as_of ? `, ${new Date(quote.as_of).toLocaleTimeString("en-IN")}` : ""}) when you save.`
                    : "Waiting for a live quote; without one the plan is saved without a snapshot."}
                </p>
              )}
            </section>

            <section className="space-y-2">
              {sectionTitle(2, "Evidence available now", done("evidence"))}
              <ul className="space-y-1.5">
                {plan.evidence_items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-2 border border-border p-2 text-[12px]"
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-1">
                        <Pill>{item.kind}</Pill> {item.claim}
                        <WhyButton
                          decisionAt={active?.created_at ?? null}
                          claim={{
                            id: `evidence:${item.id}`,
                            label: "Plan evidence",
                            value: item.kind,
                            statement: item.claim,
                            source: { name: item.source, url: item.url ?? null },
                            published_at: item.published_at,
                            available_at: item.available_at,
                            contradictions: item.contradicted_by
                              ? [
                                  {
                                    source: "Recorded contradiction",
                                    statement: item.contradicted_by,
                                  },
                                ]
                              : [],
                            ...(active
                              ? {
                                  decision: {
                                    label: `${active.symbol} plan`,
                                    at: active.created_at,
                                  },
                                }
                              : {}),
                            page: "journal",
                          }}
                        />
                      </span>
                      <span className="mt-0.5 block text-[10.5px] text-subtle">
                        {item.source}
                        {item.published_at
                          ? ` · published ${new Date(item.published_at).toLocaleString("en-IN")}`
                          : ""}{" "}
                        · available {new Date(item.available_at).toLocaleString("en-IN")}
                        {item.contradicted_by ? ` · contradicted by: ${item.contradicted_by}` : ""}
                      </span>
                    </span>
                    {!active?.plan?.evidence_items.some((e) => e.id === item.id) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setPlan({
                            evidence_items: plan.evidence_items.filter((e) => e.id !== item.id),
                          })
                        }
                      >
                        Remove
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              <EvidenceComposer onAdd={addEvidence} />
              <div className="flex flex-wrap gap-2">
                {(news.data?.articles ?? []).slice(0, 4).map((article) => (
                  <Button
                    key={article.id}
                    size="sm"
                    variant="outline"
                    className="h-auto max-w-full whitespace-normal py-1 text-left text-[11px]"
                    disabled={plan.evidence_items.some((e) => e.url === article.url)}
                    onClick={() =>
                      addEvidence({
                        claim: article.title,
                        kind: "NEWS",
                        source: article.source,
                        published_at: new Date(article.published_at).toISOString(),
                        url: article.url || null,
                      })
                    }
                  >
                    + News: {article.title.slice(0, 70)}
                  </Button>
                ))}
                {prediction.data?.status === "done" && prediction.data.thesis && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-[11px]"
                    onClick={() =>
                      addEvidence({
                        claim:
                          `Committee ${prediction.data!.decision?.action ?? "view"}: ${(prediction.data!.thesis!.key_evidence ?? []).slice(0, 2).join("; ")}`.slice(
                            0,
                            2000,
                          ),
                        kind: "RESEARCH",
                        source: "Quant Plus research committee",
                        published_at: new Date(prediction.data!.as_of).toISOString(),
                      })
                    }
                  >
                    + Committee research (
                    {new Date(prediction.data.as_of).toLocaleDateString("en-IN")})
                  </Button>
                )}
              </div>
            </section>

            <section className="space-y-3">
              {sectionTitle(3, "Thesis and what it should prove", done("thesis"))}
              <Field label="Thesis">
                <textarea
                  value={draft.thesis}
                  onChange={(e) => set({ thesis: e.target.value })}
                  placeholder="What must be true for this trade to work?"
                  className={cn(inputClass, "min-h-16")}
                />
              </Field>
              <Field
                label="What this trade should prove"
                hint="A falsifiable expectation: price, time and observable condition."
              >
                <textarea
                  value={plan.expected_outcome}
                  onChange={(e) => setPlan({ expected_outcome: e.target.value })}
                  placeholder="e.g. Closes above ₹2,650 within 10 sessions while sector breadth stays positive"
                  className={cn(inputClass, "min-h-14")}
                />
              </Field>
            </section>
            <section className="space-y-3">
              {sectionTitle(4, "Counter-thesis", done("counter"))}
              <textarea
                aria-label="Counter-thesis"
                value={plan.counter_thesis}
                onChange={(e) => setPlan({ counter_thesis: e.target.value })}
                placeholder="What could make the thesis wrong?"
                className={cn(inputClass, "min-h-14")}
              />
            </section>
            <section className="space-y-3">
              {sectionTitle(5, "Invalidation conditions", done("invalidation"))}
              <textarea
                aria-label="Invalidation conditions"
                value={draft.invalidation}
                onChange={(e) => set({ invalidation: e.target.value })}
                placeholder="Observable conditions that end the thesis, independent of the price stop"
                className={cn(inputClass, "min-h-14")}
              />
              {active && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={Boolean(plan.invalidated_at)}
                  onClick={() => setPlan({ invalidated_at: new Date().toISOString() })}
                >
                  {plan.invalidated_at
                    ? `Invalidated ${new Date(plan.invalidated_at).toLocaleString("en-IN")}`
                    : "Mark thesis invalidated now"}
                </Button>
              )}
            </section>

            {plan.decision === "TRADE" ? (
              <>
                <section className="space-y-3">
                  {sectionTitle(6, "Intended holding period", done("horizon"))}
                  <input
                    aria-label="Holding period in sessions"
                    type="number"
                    min="1"
                    value={plan.holding_period_days ?? ""}
                    onChange={(e) => {
                      const days = numberOrNull(e.target.value);
                      const sessions = days == null ? null : Math.floor(days);
                      setPlan({
                        holding_period_days: sessions,
                        time_exit:
                          plan.time_exit ??
                          (sessions
                            ? new Date(Date.now() + sessions * 1.45 * 86_400_000)
                                .toISOString()
                                .slice(0, 10)
                            : null),
                      });
                    }}
                    placeholder="Trading sessions"
                    className={inputClass}
                  />
                </section>
                <section className="space-y-3">
                  {sectionTitle(7, "Entry, stop, target and time exit", done("levels"))}
                  <div className="grid gap-3 sm:grid-cols-4">
                    {(["entry", "stop", "target"] as const).map((key) => (
                      <Field key={key} label={key}>
                        <input
                          type="number"
                          step="0.05"
                          value={plan[key] ?? ""}
                          onChange={(e) =>
                            setPlan({ [key]: numberOrNull(e.target.value) } as Partial<Plan>)
                          }
                          placeholder={key === "entry" && quote?.price ? String(quote.price) : "₹"}
                          className={inputClass}
                        />
                      </Field>
                    ))}
                    <Field label="Time exit">
                      <input
                        type="date"
                        value={plan.time_exit?.slice(0, 10) ?? ""}
                        onChange={(e) => setPlan({ time_exit: e.target.value || null })}
                        className={inputClass}
                      />
                    </Field>
                  </div>
                  {rr != null && (
                    <p className="text-[11.5px] text-muted-foreground">Reward-to-risk: {rr}</p>
                  )}
                  {active && widenedStops(plan).length > 0 && (
                    <p className="text-[11.5px] text-warning">
                      The stop has been widened {widenedStops(plan).length} time(s) since this plan
                      was written.
                    </p>
                  )}
                </section>
                <section className="space-y-3">
                  {sectionTitle(8, "Position-sizing logic", done("sizing"))}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Method">
                      <select
                        value={plan.sizing_method}
                        onChange={(e) =>
                          setPlan({ sizing_method: e.target.value as Plan["sizing_method"] })
                        }
                        className={inputClass}
                      >
                        <option value="FIXED_RISK">Fixed rupee risk</option>
                        <option value="FIXED_QUANTITY">Fixed quantity</option>
                        <option value="PERCENT_EQUITY">Percent of equity</option>
                      </select>
                    </Field>
                    {plan.sizing_method === "FIXED_RISK" && (
                      <Field label="Rupees at risk">
                        <input
                          type="number"
                          value={riskBudget}
                          onChange={(e) => {
                            setRiskBudget(e.target.value);
                            const entry = plan.entry ?? quote?.price ?? null;
                            const budget = numberOrNull(e.target.value);
                            const qty =
                              entry && plan.stop && budget
                                ? riskBasedQuantity(entry, plan.stop, budget)
                                : null;
                            if (qty)
                              setPlan({
                                quantity: qty,
                                max_acceptable_loss: plan.max_acceptable_loss ?? budget,
                                sizing_logic: `Risk ₹${budget} ÷ ₹${Math.abs((entry ?? 0) - (plan.stop ?? 0)).toFixed(2)} per share between entry and stop = ${qty} shares.`,
                              });
                          }}
                          placeholder="Needs entry and stop"
                          className={inputClass}
                        />
                      </Field>
                    )}
                    <Field label="Quantity">
                      <input
                        type="number"
                        min="1"
                        value={plan.quantity ?? ""}
                        onChange={(e) =>
                          setPlan({
                            quantity:
                              numberOrNull(e.target.value) == null
                                ? null
                                : Math.floor(Number(e.target.value)),
                          })
                        }
                        className={inputClass}
                      />
                    </Field>
                  </div>
                  <textarea
                    aria-label="Sizing logic"
                    value={plan.sizing_logic}
                    onChange={(e) => setPlan({ sizing_logic: e.target.value })}
                    placeholder="How the quantity follows from the risk you accept"
                    className={cn(inputClass, "min-h-12")}
                  />
                </section>
                <section className="space-y-3">
                  {sectionTitle(9, "Expected fees and slippage", done("costs"))}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Round-trip fees (₹)">
                      <input
                        type="number"
                        value={plan.expected_fees ?? ""}
                        onChange={(e) =>
                          setPlan({
                            expected_fees:
                              e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                          })
                        }
                        placeholder={
                          guard.preview ? String(guard.preview.fees_round_trip) : "From compiler"
                        }
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Slippage (₹)">
                      <input
                        type="number"
                        value={plan.expected_slippage ?? ""}
                        onChange={(e) =>
                          setPlan({
                            expected_slippage:
                              e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                          })
                        }
                        placeholder={
                          guard.preview ? String(guard.preview.expected_slippage) : "From compiler"
                        }
                        className={inputClass}
                      />
                    </Field>
                  </div>
                  {guard.preview && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setPlan({
                          expected_fees: guard.preview!.fees_round_trip,
                          expected_slippage: guard.preview!.expected_slippage,
                        })
                      }
                    >
                      Use compiler estimates
                    </Button>
                  )}
                </section>
                <section className="space-y-3">
                  {sectionTitle(10, "Maximum acceptable loss", done("max_loss"))}
                  <input
                    aria-label="Maximum acceptable loss"
                    type="number"
                    value={plan.max_acceptable_loss ?? ""}
                    onChange={(e) => setPlan({ max_acceptable_loss: numberOrNull(e.target.value) })}
                    placeholder="₹"
                    className={inputClass}
                  />
                </section>
                <section className="space-y-3">
                  {sectionTitle(11, "Pre-trade risk compiler", Boolean(guard.preview))}
                  <RiskPreviewPanel
                    preview={guard.preview}
                    protection={guard.protection}
                    blocks={guard.blocks.filter((b) => !b.startsWith("Review mode"))}
                    symbol={draft.symbol}
                  />
                </section>
                <section className="space-y-3">
                  {sectionTitle(12, "Resulting order", done("decision"))}
                  <select
                    aria-label="Linked order"
                    value={draft.order_id}
                    onChange={(e) => set({ order_id: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">Not linked yet</option>
                    {(orders.data ?? []).map((order) => (
                      <option key={order.id} value={order.id}>
                        {order.side} {order.quantity} · {order.order_type} ·{" "}
                        {order.status.toLowerCase()} ·{" "}
                        {new Date(order.created_at).toLocaleString("en-IN")}
                      </option>
                    ))}
                  </select>
                  <Link
                    to="/app/stocks/$symbol"
                    params={{ symbol: draft.symbol }}
                    className="inline-block text-[11.5px] text-primary-soft underline"
                  >
                    Open the {draft.symbol} ticket (select this plan there to link it automatically)
                  </Link>
                </section>
              </>
            ) : (
              <section className="space-y-3">
                {sectionTitle(6, "Why not trade", done("decision"))}
                <textarea
                  aria-label="Reason for not trading"
                  value={plan.no_trade_reason}
                  onChange={(e) => setPlan({ no_trade_reason: e.target.value })}
                  placeholder="What would have to change for you to act?"
                  className={cn(inputClass, "min-h-14")}
                />
              </section>
            )}

            {active && (
              <section className="space-y-3 border-t border-border pt-4">
                {sectionTitle(13, "Execution and outcome analysis", done("review"))}
                {attribution && (
                  <div className="space-y-2 border border-border p-3">
                    <p className="flex flex-wrap items-center gap-2 text-[13px]">
                      <Pill tone={ATTRIBUTION_TONE[attribution.label]}>{attribution.title}</Pill>
                      {attribution.pnl != null && (
                        <span
                          className={cn(
                            "font-mono",
                            attribution.pnl >= 0 ? "text-positive" : "text-negative",
                          )}
                        >
                          {formatINR(attribution.pnl)} realised
                        </span>
                      )}
                    </p>
                    {(
                      [
                        ["Thesis", attribution.thesis.grade, attribution.thesis.reasons],
                        ["Execution", attribution.execution.grade, attribution.execution.reasons],
                        [
                          "Process",
                          `${attribution.process.grade} · ${attribution.process.score}/100`,
                          attribution.process.reasons,
                        ],
                      ] as const
                    ).map(([label, grade, reasons]) => (
                      <div key={label} className="text-[12px]">
                        <span className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                          {label}:{" "}
                        </span>
                        <span>{grade}</span>
                        <ul className="mt-0.5 list-disc pl-5 text-muted-foreground">
                          {reasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    <p className="text-[10.5px] text-subtle">
                      The thesis is judged on the price path after the decision, the execution on
                      fills against the plan, and the process on what was written before the order.
                      Profit alone is never the grade.
                    </p>
                  </div>
                )}
                <textarea
                  aria-label="Reflection"
                  value={draft.reflection}
                  onChange={(e) => set({ reflection: e.target.value })}
                  placeholder="What happened, and what would you change in the process?"
                  className={cn(inputClass, "min-h-16")}
                />
                <Segmented
                  items={OUTCOMES}
                  value={draft.outcome}
                  onChange={(outcome) => set({ outcome })}
                  label="Outcome"
                />
                {(active.plan?.revisions ?? []).length > 0 && (
                  <details className="text-[11.5px]">
                    <summary className="cursor-pointer text-subtle">
                      Server-recorded revisions ({active.plan!.revisions.length})
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {active.plan!.revisions.map((revision, i) => (
                        <li key={`${revision.at}-${i}`} className="font-mono">
                          {new Date(revision.at).toLocaleString("en-IN")} · {revision.field}:{" "}
                          {String(revision.from)} → {String(revision.to)}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            )}

            {problems.length > 0 && (
              <ul className="space-y-1">
                {problems.map((problem) => (
                  <li key={problem} className="flex gap-2 text-[11.5px] text-negative">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {problem}
                  </li>
                ))}
              </ul>
            )}
            <div className="border border-border bg-background/40 p-3">
              <p className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                Lifecycle checklist
              </p>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {checklist.map((item) => (
                  <li
                    key={item.key}
                    className="flex items-start gap-2 text-[11.5px]"
                    title={item.hint}
                  >
                    {item.done ? (
                      <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-positive" />
                    ) : (
                      <Circle
                        className={cn(
                          "mt-0.5 h-3 w-3 shrink-0",
                          item.required ? "text-warning" : "text-subtle",
                        )}
                      />
                    )}
                    <span className={cn(!item.done && item.required && "text-warning")}>
                      {item.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <Button
              disabled={!draft.thesis.trim() || save.isPending || problems.length > 0}
              onClick={persist}
            >
              <Save /> {active ? "Save changes" : "Save entry / decision plan"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function EvidenceComposer({
  onAdd,
}: {
  onAdd: (item: Omit<PlanEvidence, "id" | "available_at">) => void;
}) {
  const [claim, setClaim] = useState("");
  const [kind, setKind] = useState<EvidenceKind>("OBSERVATION");
  const [source, setSource] = useState("");
  const [published, setPublished] = useState("");
  const [contradicted, setContradicted] = useState("");
  return (
    <div className="grid gap-2 border border-dashed border-border p-2 sm:grid-cols-[1fr_130px]">
      <input
        aria-label="Evidence claim"
        value={claim}
        onChange={(e) => setClaim(e.target.value)}
        placeholder="Evidence you have right now"
        className="h-9 border border-border bg-background px-2 text-[12.5px] outline-none"
      />
      <select
        aria-label="Evidence kind"
        value={kind}
        onChange={(e) => setKind(e.target.value as EvidenceKind)}
        className="h-9 border border-border bg-background px-2 text-[12px]"
      >
        {(["OBSERVATION", "NEWS", "RESEARCH", "CALCULATION", "USER_NOTE"] as const).map((k) => (
          <option key={k}>{k}</option>
        ))}
      </select>
      <input
        aria-label="Source"
        value={source}
        onChange={(e) => setSource(e.target.value)}
        placeholder="Source (document, provider, person)"
        className="h-9 border border-border bg-background px-2 text-[12.5px] outline-none"
      />
      <input
        aria-label="Publication date"
        type="datetime-local"
        value={published}
        onChange={(e) => setPublished(e.target.value)}
        className="h-9 border border-border bg-background px-2 text-[12px]"
      />
      <input
        aria-label="Contradicting source"
        value={contradicted}
        onChange={(e) => setContradicted(e.target.value)}
        placeholder="Contradicting source, if any"
        className="h-9 border border-border bg-background px-2 text-[12.5px] outline-none sm:col-span-2"
      />
      <Button
        size="sm"
        variant="outline"
        className="sm:col-span-2"
        disabled={claim.trim().length < 3 || !source.trim()}
        onClick={() => {
          const at = published ? new Date(published) : null;
          if (at && at.getTime() > Date.now()) {
            toast.error("Evidence cannot be published in the future.");
            return;
          }
          onAdd({
            claim: claim.trim(),
            kind,
            source: source.trim(),
            published_at: at ? at.toISOString() : null,
            contradicted_by: contradicted.trim() || null,
          });
          setClaim("");
          setSource("");
          setPublished("");
          setContradicted("");
        }}
      >
        Add evidence (stamped available now)
      </Button>
    </div>
  );
}

function legacyEvidence(entry: JournalEntry): PlanEvidence[] {
  return (entry.evidence ?? []).map((claim, i) => ({
    id: `legacy-${entry.id}-${i}`,
    claim,
    kind: "USER_NOTE",
    source: "Legacy journal entry",
    published_at: null,
    available_at: entry.created_at,
  }));
}

function plannedExitText(plan: Plan) {
  if (plan.decision === "NO_TRADE") return "No trade";
  return [
    plan.target != null ? `target ₹${plan.target}` : null,
    plan.stop != null ? `stop ₹${plan.stop}` : null,
    plan.time_exit ? `time exit ${plan.time_exit.slice(0, 10)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function download(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
