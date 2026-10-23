import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpenCheck,
  CircleAlert,
  History,
  LineChart,
  RotateCcw,
  ShieldCheck,
  Target,
} from "lucide-react";
import { Card, CardHead, EmptyState, Pill } from "@/components/app/cards";
import { PageIntro } from "@/components/app/pages/workspace";
import { useAnalyses } from "@/hooks/use-dashboard-data";
import { useJournal, type JournalEntry } from "@/hooks/use-trading-product";
import { planReadiness } from "@/lib/quant/decision-plan";

function reviewReason(entry: JournalEntry) {
  if (entry.plan?.invalidated_at) return "The thesis was marked invalidated.";
  if (entry.outcome !== "OPEN" && !entry.reflection.trim())
    return "The outcome is recorded but has no reflection.";
  if (
    entry.plan?.time_exit &&
    Date.parse(entry.plan.time_exit) < Date.now() &&
    !entry.reflection.trim()
  )
    return "The planned review horizon has elapsed.";
  if (entry.order_id && entry.outcome === "OPEN")
    return "The linked paper decision is still awaiting an outcome.";
  if (entry.plan?.decision === "NO_TRADE" && !entry.reflection.trim())
    return "Capture why waiting was the correct decision.";
  return null;
}

function ReviewLink({
  to,
  label,
  icon: Icon,
  meta,
}: {
  to: string;
  label: string;
  icon: typeof History;
  meta: string;
}) {
  return (
    <Link
      to="/app/$section"
      params={{ section: to }}
      className="group flex items-center gap-3 border border-border bg-background/25 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <Icon className="h-4 w-4 shrink-0 text-primary-soft" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-medium">{label}</span>
        <span className="mt-0.5 block text-[10.5px] text-subtle">{meta}</span>
      </span>
      <ArrowRight
        className="h-3.5 w-3.5 text-subtle transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

/** Canonical Review landing surface for the decision, research and learning loop. */
export function ReviewHub() {
  const journal = useJournal();
  const analyses = useAnalyses();
  const queue = useMemo(
    () =>
      (journal.data ?? [])
        .map((entry) => ({ entry, reason: reviewReason(entry) }))
        .filter((item) => item.reason),
    [journal.data],
  );
  const open = (journal.data ?? []).filter((entry) => entry.outcome === "OPEN").length;
  const reflected = (journal.data ?? []).filter((entry) => entry.reflection.trim()).length;
  const mature = (analyses.data ?? []).length;

  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Review"
        title="Review"
        body="Review the decision record, execution, research maturity and trading process together. Profit is an outcome; the process is what you can improve."
        action={<Pill tone="primary">Paper account · educational</Pill>}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Open decisions", open, "Plans awaiting an outcome"],
          ["Review queue", queue.length, "Decisions needing attention"],
          ["Reflections", reflected, "Journal entries with a post-decision note"],
        ].map(([label, value, hint]) => (
          <Card key={String(label)} className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-subtle">
              {label}
            </p>
            <p className="mt-2 font-mono text-2xl num-tabular">{value}</p>
            <p className="mt-1 text-[11px] text-subtle">{hint}</p>
          </Card>
        ))}
      </div>

      <Card glow>
        <CardHead
          title="What needs review?"
          meta="Prioritised from decision records and outcomes"
        />
        {journal.isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">Loading review queue…</p>
        ) : queue.length ? (
          <ul className="divide-y divide-border">
            {queue.slice(0, 8).map(({ entry, reason }) => (
              <li key={entry.id} className="flex items-center gap-3 px-5 py-3">
                <CircleAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-medium">
                    {entry.symbol} · {entry.thesis || "Untitled decision"}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-subtle">{reason}</span>
                </span>
                <Link
                  to="/app/$section"
                  params={{ section: "journal" }}
                  search={{ symbol: entry.symbol, plan: entry.id }}
                  className="shrink-0 text-[11px] font-medium text-primary-soft hover:text-foreground"
                >
                  Review
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Nothing is waiting"
            hint="Complete a decision or paper trade to create a review record."
          />
        )}
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <ReviewLink
          to="journal"
          label="Decision journal"
          meta="Plans, evidence, risk, outcomes and reflection"
          icon={BookOpenCheck}
        />
        <ReviewLink
          to="history"
          label="Research history"
          meta={`${mature} recent research record(s)`}
          icon={History}
        />
        <ReviewLink
          to="track-record"
          label="Track record"
          meta="Matured outcomes, calibration and abstentions"
          icon={Target}
        />
        <ReviewLink
          to="behavior"
          label="Trading habits"
          meta="Consent-based process patterns and protections"
          icon={ShieldCheck}
        />
        <ReviewLink
          to="replay"
          label="Replay"
          meta="Practise without future information"
          icon={RotateCcw}
        />
        <ReviewLink
          to="strategy-lab"
          label="Strategy lab"
          meta="Test and falsify a repeatable hypothesis"
          icon={LineChart}
        />
      </div>

      <p className="text-[11px] leading-relaxed text-subtle">
        Research maturity is shown with sample size and horizon. No unverified accuracy number is
        used as proof of predictive skill.
      </p>
    </div>
  );
}
