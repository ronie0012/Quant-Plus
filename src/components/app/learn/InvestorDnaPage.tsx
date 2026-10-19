import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHead, Skeleton } from "@/components/app/cards";
import { PageIntro, ProgressBar } from "@/components/app/pages/workspace";
import { useInvestorDna } from "@/hooks/use-learning";
import {
  levelIndex,
  PRACTICE_NOTES,
  profileGap,
  QUESTIONS,
  RISK_LABELS,
  RISK_LEVELS,
  type Answers,
  type RiskLevel,
} from "@/lib/learn/investor-dna";
import { cn } from "@/lib/utils";

/**
 * Investor DNA: eight questions split into risk capacity and risk tolerance,
 * then the revealed profile from the user's own paper trades.
 */
export function InvestorDnaPage() {
  const dna = useInvestorDna();
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Learn"
        title="Investor DNA"
        body="A starting point for paper practice, not a personality test. Separate the risk your finances can support from the risk you feel comfortable taking."
        status="Step 1 · About 4 minutes"
      />
      <div className="max-w-2xl space-y-2 text-sm leading-relaxed text-muted-foreground">
        <p>
          <strong className="text-foreground">Capacity</strong> is your financial ability to absorb
          a loss. <strong className="text-foreground">Tolerance</strong> is your comfort with
          uncertainty. Your stated practice profile uses the more cautious of the two.
        </p>
        <p>
          Your completed answers are saved with your workspace. An unfinished draft stays in this
          browser tab. You can skip this step or retake it later; no wallet or trade is required.
        </p>
      </div>
      {dna.loading ? (
        <Skeleton className="h-72" />
      ) : editing || !dna.complete ? (
        <Questionnaire
          initial={dna.answers}
          saving={dna.saving}
          failed={Boolean(dna.saveError)}
          draftKey="quant-plus:investor-dna-draft"
          onCancel={dna.complete ? () => setEditing(false) : undefined}
          onSubmit={async (answers) => {
            await dna.save(answers);
            setEditing(false);
          }}
        />
      ) : (
        <Result dna={dna} onRetake={() => setEditing(true)} />
      )}
      {!dna.complete && !editing && (
        <Link
          to="/app/$section"
          params={{ section: "learn" }}
          className="inline-flex min-h-11 items-center self-start text-sm text-primary-soft underline underline-offset-4"
        >
          Skip for now · Back to learning
        </Link>
      )}
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        Investor DNA shapes paper-practice limits and how research is framed for you. It is
        educational and is not investment advice or a suitability assessment for real money.
      </p>
    </div>
  );
}

export function Questionnaire({
  initial,
  saving,
  failed,
  onCancel,
  onSubmit,
  cancelLabel = "Cancel",
  submitLabel = "See my DNA",
  className,
  draftKey,
}: {
  initial: Answers;
  saving: boolean;
  failed: boolean;
  onCancel: (() => void) | undefined;
  onSubmit: (answers: Answers) => Promise<void>;
  cancelLabel?: string;
  submitLabel?: string;
  className?: string;
  draftKey?: string;
}) {
  const [answers, setAnswers] = useState<Answers>(initial);
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(!draftKey);
  const [submitError, setSubmitError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const submitted = useRef(false);
  const initialAnswers = useRef(initial);
  const previousIndex = useRef(0);
  const busy = saving || submitting;
  useEffect(() => {
    if (draftKey) {
      try {
        const draft = JSON.parse(sessionStorage.getItem(draftKey) ?? "null") as {
          answers?: Answers;
          index?: number;
        } | null;
        if (draft?.answers) {
          const valid: Answers = { ...initialAnswers.current };
          for (const q of QUESTIONS) {
            const value = draft.answers[q.id];
            if (value && q.options.some((o) => o.value === value)) valid[q.id] = value;
          }
          setAnswers(valid);
          setIndex(Math.max(0, Math.min(QUESTIONS.length - 1, Math.floor(draft.index ?? 0) || 0)));
        }
      } catch {
        /* Draft storage is optional. */
      }
    }
    setReady(true);
  }, [draftKey]);
  useEffect(() => {
    if (!ready || !draftKey || submitted.current) return;
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({ answers, index }));
    } catch {
      /* Optional draft. */
    }
  }, [answers, index, ready, draftKey]);
  useEffect(() => {
    if (index !== previousIndex.current) questionRef.current?.focus();
    previousIndex.current = index;
  }, [index]);
  const question = QUESTIONS[index]!;
  const last = index === QUESTIONS.length - 1;
  const chosen = answers[question.id];
  const answered = QUESTIONS.filter((q) => q.options.some((o) => o.value === answers[q.id])).length;
  const showError = failed || submitError;

  async function advance() {
    if (!chosen || busy) return;
    if (!last) {
      setIndex(index + 1);
      return;
    }
    const missing = QUESTIONS.findIndex((q) => !q.options.some((o) => o.value === answers[q.id]));
    if (missing >= 0) {
      setIndex(missing);
      return;
    }
    setSubmitting(true);
    setSubmitError(false);
    try {
      await onSubmit(answers);
      submitted.current = true;
      if (draftKey) {
        try {
          sessionStorage.removeItem(draftKey);
        } catch {
          /* Optional draft. */
        }
      }
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card glow className={cn("mx-auto w-full max-w-2xl", className)}>
      <form
        aria-label="Investor DNA questionnaire"
        aria-busy={busy}
        onSubmit={(event) => {
          event.preventDefault();
          void advance();
        }}
      >
        <div className="flex flex-col gap-2 border-b border-border px-5 py-4">
          <div className="flex items-center justify-between text-[12px] text-subtle">
            <span>
              Question {index + 1} of {QUESTIONS.length}
            </span>
            <span>
              {question.dimension === "CAPACITY" ? "Part 1 · Capacity" : "Part 2 · Tolerance"}
            </span>
          </div>
          <ProgressBar value={(answered / QUESTIONS.length) * 100} />
          <p className="text-xs text-muted-foreground">
            {answered} of {QUESTIONS.length} answered · Choose one answer per question.
          </p>
        </div>
        <fieldset
          disabled={busy || !ready}
          aria-describedby={`dna-hint-${question.id}`}
          className="flex min-w-0 flex-col gap-4 px-5 py-5"
        >
          <legend className="sr-only">{question.prompt}</legend>
          <div>
            <h2
              ref={questionRef}
              tabIndex={-1}
              className="text-lg leading-snug font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-primary"
            >
              {question.prompt}
            </h2>
            <p
              id={`dna-hint-${question.id}`}
              className="mt-2 text-sm leading-relaxed text-muted-foreground"
            >
              {question.id === "income"
                ? "Choose a broad band, not an exact amount. Your answer contributes to the capacity estimate saved with your workspace."
                : question.hint}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {question.options.map((option) => {
              const on = chosen === option.value;
              return (
                <label
                  key={option.value}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3.5 py-3 text-sm transition-colors focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background",
                    on
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
                  )}
                >
                  <input
                    type="radio"
                    name={question.id}
                    value={option.value}
                    checked={on}
                    onChange={() => setAnswers({ ...answers, [question.id]: option.value })}
                    className="h-4 w-4 shrink-0 accent-primary"
                  />
                  {option.label}
                </label>
              );
            })}
          </div>
        </fieldset>
        {showError && (
          <p role="alert" className="px-5 pb-3 text-sm text-warning">
            Could not save your answers. Your draft is still here. Try saving again.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3.5">
          <div className="flex gap-2">
            {index > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIndex(index - 1)}
                disabled={busy}
                className="min-h-11 gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Back
              </Button>
            )}
            {onCancel && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11"
                disabled={busy}
                onClick={() => {
                  if (draftKey) {
                    try {
                      sessionStorage.removeItem(draftKey);
                    } catch {
                      /* Optional draft. */
                    }
                  }
                  onCancel();
                }}
              >
                {cancelLabel}
              </Button>
            )}
          </div>
          <Button
            type="submit"
            size="sm"
            disabled={!chosen || busy || !ready}
            className="min-h-11 gap-1.5"
          >
            {last ? (busy ? "Saving…" : submitLabel) : "Next"}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      </form>
    </Card>
  );
}

function LevelScale({ value, label }: { value: RiskLevel | null; label: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[12px] text-subtle">{label}</p>
        <p className="text-[13px] font-semibold">{value ? RISK_LABELS[value] : "Not yet known"}</p>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1" aria-hidden="true">
        {RISK_LEVELS.map((level) => (
          <span
            key={level}
            className={cn(
              "h-1.5 rounded-full",
              value != null && levelIndex(level) <= levelIndex(value) ? "bg-primary" : "bg-border",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function Result({
  dna,
  onRetake,
}: {
  dna: ReturnType<typeof useInvestorDna>;
  onRetake: () => void;
}) {
  const { stated, revealed } = dna;
  const gap = profileGap(stated.practice, revealed.level);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-5">
        <div>
          <h2 className="font-semibold">Profile saved. Next: see how a company works.</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Try the business simulation without funding a wallet.
          </p>
        </div>
        <Button asChild className="min-h-11">
          <Link to="/app/$section" params={{ section: "be-the-company" }}>
            Start Be the Company <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card glow>
          <CardHead
            title="What you said"
            meta="From your answers"
            action={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onRetake}
                className="min-h-11 gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Retake
              </Button>
            }
          />
          <div className="flex flex-col gap-5 px-5 py-5">
            <div>
              <p className="text-[12px] text-subtle">Your practice profile</p>
              <p className="mt-1 text-[26px] leading-tight font-semibold tracking-tight text-primary-soft">
                {RISK_LABELS[stated.practice]}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                {PRACTICE_NOTES[stated.practice]}
              </p>
            </div>
            <LevelScale
              label="Risk capacity — what you can afford to lose"
              value={stated.capacity}
            />
            <LevelScale
              label="Risk tolerance — what you are willing to sit through"
              value={stated.tolerance}
            />
            {stated.capacity !== stated.tolerance && (
              <p className="rounded-md border border-border bg-background/40 px-3.5 py-3 text-[12px] leading-relaxed text-muted-foreground">
                Your capacity and tolerance differ, so your practice profile uses the more cautious
                of the two.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHead title="What your trades show" meta="From your closed paper trades" />
          <div className="flex flex-col gap-5 px-5 py-5">
            <p className="text-sm leading-relaxed text-muted-foreground">
              This describes a sample of paper trades. It is not a validated assessment of
              real-money risk tolerance.
            </p>
            {revealed.level ? (
              <>
                <LevelScale label="Revealed risk" value={revealed.level} />
                {gap && (
                  <p className="text-[15px] leading-snug font-medium text-foreground">{gap}</p>
                )}
                <ul className="flex flex-col gap-2 text-[13px] leading-relaxed text-muted-foreground">
                  {revealed.observations.map((o) => (
                    <li key={o} className="flex gap-2">
                      <span
                        aria-hidden="true"
                        className="mt-2 h-1 w-1 shrink-0 rounded-full bg-subtle"
                      />
                      {o}
                    </li>
                  ))}
                </ul>
                <p className="text-[12px] text-subtle">Based on {revealed.sample} closed trades.</p>
              </>
            ) : (
              <>
                <LevelScale label="Revealed risk" value={null} />
                <p className="text-sm leading-relaxed text-muted-foreground">
                  No trades are needed to keep learning. If you later close {revealed.min_sample}{" "}
                  paper trades, a simple estimate compares their position sizes and losses with your
                  answers. It does not predict your behaviour with real money.
                </p>
                <div>
                  <ProgressBar value={(revealed.sample / revealed.min_sample) * 100} />
                  <p className="mt-1.5 text-[12px] text-subtle">
                    {revealed.sample} of {revealed.min_sample} closed trades
                  </p>
                </div>
              </>
            )}
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button asChild size="sm" className="min-h-11 gap-1.5">
                <Link to="/app/$section" params={{ section: "learn" }}>
                  Back to learning
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </Button>
              <span className="text-[12px] text-subtle">Updates as you trade</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
