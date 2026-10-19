import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  Coffee,
  Dna,
  GraduationCap,
  History,
  ShieldCheck,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHead, Pill, Skeleton } from "@/components/app/cards";
import { PageIntro, ProgressBar } from "@/components/app/pages/workspace";
import { formatINR } from "@/hooks/use-dashboard-data";
import { useInvestorDna, useLearning, useLicence } from "@/hooks/use-learning";
import { rippleName, useRippleOrigins } from "@/hooks/use-ripple";
import { CONCEPTS, MASTERED, masteryOf } from "@/lib/learn/concepts";
import { RISK_LABELS } from "@/lib/learn/investor-dna";
import { factorById, FACTORS, propagate, whatIfOrigin } from "@/lib/quant/ripple";
import { cn } from "@/lib/utils";

/**
 * One recommended next step, followed by the optional path and practice record.
 */
export function LearnPage() {
  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Learn"
        title="Build your market confidence"
        body="Understand your starting point, run a small business, then practise market concepts. Learn at your pace; a wallet and trades are optional."
        status="Paper practice"
        action={
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => window.dispatchEvent(new Event("quant-plus:resume-onboarding"))}
          >
            Getting started
          </Button>
        }
      />
      <LearningPath />
      <details className="rounded-lg border border-border bg-panel/80">
        <summary className="min-h-11 cursor-pointer px-5 py-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary">
          Your practice licence & risk limits
        </summary>
        <div className="px-3 pb-3">
          <p className="px-2 pb-3 text-sm text-muted-foreground">
            An in-app learning milestone, not a professional qualification. Progress reflects
            practice habits, not readiness to invest real money.
          </p>
          <LicenceCard />
        </div>
      </details>
      <details className="rounded-lg border border-border bg-panel/80">
        <summary className="min-h-11 cursor-pointer px-5 py-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary">
          Optional daily practice · Ripple question
        </summary>
        <div className="px-3 pb-3">
          <RippleQuestion />
        </div>
      </details>
    </div>
  );
}

function LicenceCard() {
  const licence = useLicence();
  const dna = useInvestorDna();
  if (licence.loading || dna.loading) return <Skeleton className="h-64" />;
  const stage = licence.stages[licence.level]!;
  const next = licence.next;
  const limits = licence.suggested;

  return (
    <Card glow>
      <div className="grid gap-px bg-border lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="flex flex-col gap-4 bg-panel/80 px-5 py-5">
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-primary/50 bg-primary/10 text-[18px] font-semibold text-primary-soft">
              {stage.badge}
            </span>
            <div className="min-w-0">
              <p className="text-[12px] text-subtle">Your trading licence</p>
              <p className="text-[22px] leading-tight font-semibold tracking-tight">{stage.name}</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{stage.summary}</p>
            </div>
          </div>
          <ol className="grid grid-cols-4 gap-1.5" aria-label="Licence levels">
            {licence.stages.map((s) => (
              <li key={s.level} className="flex flex-col gap-1">
                <span
                  className={cn(
                    "h-1.5 rounded-full",
                    s.level <= licence.level ? "bg-primary" : "bg-border",
                  )}
                />
                <span
                  className={cn(
                    "text-[11px]",
                    s.level === licence.level ? "font-medium text-foreground" : "text-subtle",
                  )}
                >
                  {s.badge}
                </span>
              </li>
            ))}
          </ol>
          {limits && (
            <div className="mt-auto rounded-md border border-border bg-background/40 px-3.5 py-3">
              <p className="text-[12px] font-medium text-foreground">
                Practice limits for {stage.name}
                {dna.practice ? ` · ${RISK_LABELS[dna.practice]} profile` : ""}
              </p>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-[12px]">
                <div>
                  <dt className="text-subtle">Per order</dt>
                  <dd className="font-medium num-tabular">{formatINR(limits.max_order_value)}</dd>
                </div>
                <div>
                  <dt className="text-subtle">Per stock</dt>
                  <dd className="font-medium num-tabular">{limits.max_position_pct}%</dd>
                </div>
                <div>
                  <dt className="text-subtle">Daily loss</dt>
                  <dd className="font-medium num-tabular">{formatINR(limits.daily_loss_limit)}</dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {licence.applied ? (
                  <Pill tone="positive">Applied to your risk limits</Pill>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-11 gap-1.5"
                    disabled={licence.applying}
                    onClick={() => void licence.apply(limits)}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    {licence.applying ? "Applying…" : "Apply to my risk limits"}
                  </Button>
                )}
                <span className="text-[11px] text-subtle">Enforced on every paper order.</span>
              </div>
              {licence.applyError && (
                <p role="alert" className="mt-2 text-[12px] text-warning">
                  Could not update risk limits.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="bg-panel/80 px-5 py-5">
          {next ? (
            <>
              <p className="text-[12px] text-subtle">Next licence</p>
              <p className="text-[16px] font-semibold">
                {next.badge} · {next.name}
              </p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{next.summary}</p>
              <ul className="mt-4 flex flex-col divide-y divide-border rounded-md border border-border">
                {next.requirements.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-3.5 py-3">
                    <span
                      className={cn(
                        "grid h-5 w-5 shrink-0 place-items-center rounded-full border",
                        r.done
                          ? "border-positive bg-positive/20 text-positive"
                          : "border-border-strong",
                      )}
                    >
                      <span className="sr-only">{r.done ? "Done: " : "Not done: "}</span>
                      {r.done && <Check className="h-3 w-3" aria-hidden="true" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium">{r.label}</p>
                      <p className="text-[12px] text-subtle">{r.detail}</p>
                      {!r.done && r.progress > 0 && (
                        <div className="mt-1.5 max-w-xs">
                          <ProgressBar value={r.progress * 100} />
                        </div>
                      )}
                    </div>
                    {r.done ? (
                      <span className="shrink-0 text-[12px] text-positive">{r.progress_label}</span>
                    ) : (
                      <Link
                        to="/app/$section"
                        params={{ section: r.section }}
                        aria-label={`${r.progress > 0 ? "Continue" : "Start"}: ${r.label}`}
                        className="inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-primary-soft hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        {r.progress > 0 ? r.progress_label : "Start"}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="flex h-full flex-col justify-center">
              <p className="text-[16px] font-semibold">Every licence earned</p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                You plan, size and exit with discipline. Keep reviewing your trades — habits fade
                without practice.
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

type PathStep = {
  section: string;
  icon: LucideIcon;
  title: string;
  body: string;
  status: string;
  done: boolean;
};

function LearningPath() {
  const dna = useInvestorDna();
  const { learning, mastery, loading } = useLearning();
  const licence = useLicence();
  const mastered = CONCEPTS.filter((c) => masteryOf(mastery, c.id) >= MASTERED).length;
  const replayDone = licence.stages[1]?.requirements.find((r) => r.id === "replay")?.done ?? false;
  const steps: PathStep[] = [
    {
      section: "investor-dna",
      icon: Dna,
      title: "Investor DNA",
      body: "Separate financial capacity from comfort with risk.",
      status: dna.complete && dna.practice ? RISK_LABELS[dna.practice] : "4 minutes",
      done: dna.complete,
    },
    {
      section: "be-the-company",
      icon: Coffee,
      title: "Be the Company",
      body: "Run a chai brand to its IPO and learn what a share is.",
      status: learning.company_completed_at
        ? "Completed"
        : "About 10 minutes · resumes in this tab",
      done: Boolean(learning.company_completed_at),
    },
    {
      section: "tutor",
      icon: GraduationCap,
      title: "AI tutor",
      body: "Start with a quick check. Ask the AI tutor when you need help.",
      status: `${mastered} / ${CONCEPTS.length} concepts practised to target`,
      done: mastered === CONCEPTS.length,
    },
    {
      section: "replay",
      icon: History,
      title: "Time machine",
      body: "Apply what you learned to a hidden stretch of market history.",
      status: replayDone ? "Completed a replay" : "Optional paper practice",
      done: replayDone,
    },
  ];
  const next = steps.find((step) => !step.done);
  const returning =
    dna.complete || Boolean(learning.company_completed_at) || (learning.checks_answered ?? 0) > 0;
  if (loading || dna.loading || licence.loading) return <Skeleton className="h-64" />;
  return (
    <section aria-labelledby="learning-path" className="flex flex-col gap-3">
      <Card glow>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-medium text-primary-soft">
              {next
                ? returning
                  ? "Pick up where you left off"
                  : "Start here"
                : "Keep your skills fresh"}
            </p>
            <h2 id="learning-path" className="mt-2 text-xl font-semibold">
              {next
                ? `${steps.indexOf(next) + 1}. ${next.title}`
                : "Your learning path is complete"}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {next?.body ?? "Revisit a concept or review a past practice session."}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {next?.status ?? "All four steps completed"} · Suggested order; every step is
              available.
            </p>
          </div>
          <Button asChild className="min-h-11 shrink-0 self-start">
            <Link to="/app/$section" params={{ section: next?.section ?? "tutor" }}>
              {next
                ? next.section === "investor-dna"
                  ? "Start Investor DNA"
                  : `Continue ${next.title}`
                : "Revisit the tutor"}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </Card>
      <h3 className="mt-3 text-sm font-semibold">Your learning path</h3>
      <ol className="grid gap-3 sm:grid-cols-2">
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <li key={step.section}>
              <Link
                to="/app/$section"
                params={{ section: step.section }}
                className="group flex h-full flex-col gap-3 rounded-lg border border-border bg-panel/80 px-4 py-4 transition-colors hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className="flex items-center justify-between">
                  <span className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-panel-elevated text-primary-soft">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  {step.done ? (
                    <Pill tone="positive">Done</Pill>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Step {i + 1}
                      {next === step ? " · Up next" : ""}
                    </span>
                  )}
                </span>
                <span>
                  <span className="block text-[14px] font-semibold">{step.title}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </span>
                </span>
                <span className="mt-auto flex items-center justify-between text-[12px] text-subtle">
                  {step.status}
                  <ArrowRight
                    className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:text-primary-soft"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const CHOICES = [
  { id: "UP", label: "Likely to rise" },
  { id: "DOWN", label: "Likely to fall" },
] as const;

/** One cause-and-effect question per day from today's news, or a rotating scenario. */
function RippleQuestion() {
  const { origins } = useRippleOrigins();
  const { recordCheck } = useLearning();
  const [picked, setPicked] = useState<"UP" | "DOWN" | null>(null);

  const question = useMemo(() => {
    const day = Math.floor(Date.now() / 86_400_000);
    const factor = FACTORS[day % FACTORS.length]!;
    const fallback = whatIfOrigin(factor.id, day % 2 ? "UP" : "DOWN", "");
    const candidates = [...origins, fallback];
    for (const origin of candidates) {
      const impact = propagate(origin.origin, origin.direction).find((i) => i.hop === 1);
      if (impact) return { origin, impact };
    }
    return null;
  }, [origins]);
  if (!question) return null;
  const { origin, impact } = question;
  const factor = factorById(origin.origin);
  const event = factor
    ? origin.direction === "UP"
      ? factor.up
      : factor.down
    : `${rippleName(origin.origin)} ${origin.direction === "UP" ? "rises" : "falls"}`;
  const correct = picked === impact.direction;

  return (
    <Card>
      <CardHead
        title="Today's ripple question"
        meta={origin.kind === "NEWS" ? `From the news · ${origin.source}` : "Practice scenario"}
        action={<Waves className="h-4 w-4 text-primary-soft" aria-hidden="true" />}
      />
      <div className="flex flex-col gap-4 px-5 py-5">
        <p className="text-[15px] leading-snug">
          <span className="font-semibold">{event}.</span>{" "}
          <span className="text-muted-foreground">
            What is the most likely first effect on {rippleName(impact.symbol)} ({impact.symbol})?
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          {CHOICES.map((choice) => (
            <Button
              key={choice.id}
              type="button"
              variant="outline"
              size="sm"
              disabled={picked != null}
              onClick={() => {
                setPicked(choice.id);
                void recordCheck("ripple", choice.id === impact.direction);
              }}
              className={cn(
                "min-h-11",
                picked != null &&
                  choice.id === impact.direction &&
                  "border-positive/60 bg-positive/10",
                picked === choice.id && !correct && "border-negative/60 bg-negative/10",
              )}
            >
              {choice.label}
            </Button>
          ))}
        </div>
        {picked && (
          <div className="flex flex-col gap-3 rounded-md border border-border bg-background/40 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p aria-live="polite" className="text-[13px] leading-relaxed text-muted-foreground">
              <span className={cn("font-medium", correct ? "text-positive" : "text-negative")}>
                {correct ? "Right. " : "Not this time. "}
              </span>
              {impact.edges.at(-1)!.why}
            </p>
            <Button asChild size="sm" variant="ghost" className="min-h-11 shrink-0 gap-1.5">
              <Link to="/app/$section" params={{ section: "ripple" }}>
                See the full ripple
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
