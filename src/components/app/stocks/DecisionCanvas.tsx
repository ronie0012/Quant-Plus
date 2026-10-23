import { CheckCircle2, Circle, Eye, FileText, ShieldCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Card, CardHead, Pill, SourceTag } from "@/components/app/cards";
import { WhyButton } from "@/components/app/evidence/WhyButton";
import { useJournal, type JournalEntry } from "@/hooks/use-trading-product";
import { planReadiness } from "@/lib/quant/decision-plan";

type CanvasStep = {
  label: string;
  done: boolean;
  hint: string;
};

function latestDecision(entries: JournalEntry[] | undefined, symbol: string) {
  return (
    [...(entries ?? [])]
      .filter((entry) => entry.symbol === symbol)
      .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0] ?? null
  );
}

function stepsFor(entry: JournalEntry | null): CanvasStep[] {
  if (!entry) {
    return [
      { label: "Evidence", done: false, hint: "Collect sourced observations." },
      { label: "Thesis", done: false, hint: "Write what must be true." },
      { label: "Risk", done: false, hint: "Define the loss boundary." },
      { label: "Outcome", done: false, hint: "Paper trade or watch only." },
      { label: "Review", done: false, hint: "Learn after the horizon." },
    ];
  }
  const plan = entry.plan ?? null;
  const readiness = planReadiness(entry);
  return [
    {
      label: "Evidence",
      done: Boolean(plan?.evidence_items?.length),
      hint: plan?.evidence_items?.length
        ? `${plan.evidence_items.length} sourced item(s)`
        : "Collect sourced observations.",
    },
    {
      label: "Thesis",
      done: Boolean(entry.thesis.trim() && plan?.expected_outcome?.trim()),
      hint: entry.thesis.trim() ? "Thesis recorded." : "Write what must be true.",
    },
    {
      label: "Risk",
      done: plan?.decision === "NO_TRADE" || Boolean(plan?.risk_preview) || readiness.ready,
      hint:
        plan?.decision === "NO_TRADE" ? "No-trade boundary recorded." : "Check the loss boundary.",
    },
    {
      label: "Outcome",
      done: Boolean(entry.order_id) || plan?.decision === "NO_TRADE",
      hint: entry.order_id
        ? "Linked paper order."
        : plan?.decision === "NO_TRADE"
          ? "Watch-only decision."
          : "Paper trade or watch only.",
    },
    {
      label: "Review",
      done: Boolean(entry.reflection.trim()),
      hint: entry.reflection.trim() ? "Reflection recorded." : "Learn after the horizon.",
    },
  ];
}

/**
 * The stock workspace's persistent decision handoff. The full editor remains
 * on Review, but this card keeps the same symbol, evidence state and outcome
 * visible at the moment an idea is being investigated.
 */
export function DecisionCanvas({
  symbol,
  quote,
}: {
  symbol: string;
  quote?: { price: number; source?: string | null; as_of?: string | null } | null;
}) {
  const journal = useJournal();
  const entry = latestDecision(journal.data, symbol);
  const steps = stepsFor(entry);
  const plan = entry?.plan;
  const decisionState =
    plan?.decision === "NO_TRADE"
      ? "WATCH ONLY"
      : entry?.order_id
        ? "PAPER TRADED"
        : entry
          ? "IN PROGRESS"
          : "NOT STARTED";
  const tone = plan?.decision === "NO_TRADE" ? "primary" : entry?.order_id ? "positive" : "neutral";

  return (
    <Card glow aria-label={`${symbol} decision canvas`}>
      <CardHead
        title="Decision canvas"
        meta="Evidence → thesis → risk → paper trade or watch only → review"
        action={<Pill tone={tone}>{decisionState}</Pill>}
      />
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-subtle">
          <SourceTag label="Decision record" />
          {quote?.price != null && (
            <span className="font-mono">
              ₹{quote.price.toFixed(2)} · {quote.source ?? "provider"}
              {quote.as_of ? ` · observed ${new Date(quote.as_of).toLocaleString("en-IN")}` : ""}
            </span>
          )}
          {quote?.as_of && (
            <WhyButton
              claim={{
                id: `stock-observation:${symbol}`,
                label: `${symbol} observed quote`,
                value: `₹${quote.price.toFixed(2)}`,
                statement: `${symbol} was observed at ₹${quote.price.toFixed(2)} before the decision record was opened.`,
                source: { name: quote.source ?? "Provider quote" },
                observation: { provider: quote.source ?? "Provider quote", as_of: quote.as_of },
                calculation: {
                  formula: "Direct provider observation; no forecast implied.",
                  inputs: [],
                },
                model_version: "market observation v1",
                page: "research",
                instrument: symbol,
              }}
            />
          )}
        </div>

        <ol className="grid gap-2 sm:grid-cols-5">
          {steps.map((step) => (
            <li key={step.label} className="border border-border bg-background/25 p-3">
              <div className="flex items-center gap-2">
                {step.done ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-positive" aria-hidden="true" />
                ) : (
                  <Circle className="h-3.5 w-3.5 text-subtle" aria-hidden="true" />
                )}
                <span className="text-[11px] font-medium uppercase tracking-[0.05em]">
                  {step.label}
                </span>
              </div>
              <p className="mt-2 text-[10.5px] leading-relaxed text-subtle">{step.hint}</p>
            </li>
          ))}
        </ol>

        {entry && (
          <div className="border-l-2 border-primary/50 bg-primary/5 px-3 py-2 text-[12px] text-muted-foreground">
            <span className="font-medium text-foreground">Current thesis:</span>{" "}
            {entry.thesis || "Untitled thesis"}
            {plan?.counter_thesis && (
              <span className="mt-1 block">
                <span className="font-medium text-foreground">Counter-case:</span>{" "}
                {plan.counter_thesis}
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Link
            to="/app/$section"
            params={{ section: "journal" }}
            search={{ symbol, ...(entry ? { plan: entry.id } : {}) } as never}
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-[12px] font-medium text-primary-soft hover:bg-primary/15"
          >
            <FileText className="h-3.5 w-3.5" />
            {entry ? "Continue decision plan" : "Create decision plan"}
          </Link>
          <Link
            to="/app/$section"
            params={{ section: "journal" }}
            search={{ symbol, ...(entry ? { plan: entry.id } : {}) } as never}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-[12px] font-medium text-muted-foreground hover:text-foreground"
          >
            {entry?.order_id || plan?.decision === "NO_TRADE" ? (
              <Eye className="h-3.5 w-3.5" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            {entry?.order_id || plan?.decision === "NO_TRADE"
              ? "Review decision"
              : "Check risk / watch only"}
          </Link>
        </div>
        <p className="text-[10.5px] leading-relaxed text-subtle">
          Research is an input, not an order. The canvas always ends in a deliberate paper-trading
          or watch-only decision.
        </p>
      </div>
    </Card>
  );
}
