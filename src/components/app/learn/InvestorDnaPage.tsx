import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHead, Pill, Skeleton } from "@/components/app/cards";
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
        body="What you say about risk, and what your paper trades show. Quant Plus uses the more cautious answer to size your practice."
        status="Stays on this device"
      />
      {dna.loading ? (
        <Skeleton className="h-72" />
      ) : editing || !dna.complete ? (
        <Questionnaire
          initial={dna.answers}
          saving={dna.saving}
          failed={Boolean(dna.saveError)}
          onCancel={dna.complete ? () => setEditing(false) : undefined}
          onSubmit={async (answers) => {
            await dna.save(answers);
            setEditing(false);
          }}
        />
      ) : (
        <Result dna={dna} onRetake={() => setEditing(true)} />
      )}
      <p className="text-[12px] leading-relaxed text-subtle">
        Investor DNA shapes paper-practice limits and how research is framed for you. It is
        educational and is not investment advice or a suitability assessment for real money.
      </p>
    </div>
  );
}

function Questionnaire({
  initial,
  saving,
  failed,
  onCancel,
  onSubmit,
}: {
  initial: Answers;
  saving: boolean;
  failed: boolean;
  onCancel: (() => void) | undefined;
  onSubmit: (answers: Answers) => Promise<void>;
}) {
  const [answers, setAnswers] = useState<Answers>(initial);
  const [index, setIndex] = useState(0);
  const question = QUESTIONS[index]!;
  const last = index === QUESTIONS.length - 1;
  const chosen = answers[question.id];

  return (
    <Card glow className="mx-auto w-full max-w-2xl">
      <div className="flex flex-col gap-2 border-b border-border px-5 py-4">
        <div className="flex items-center justify-between text-[12px] text-subtle">
          <span>
            Question {index + 1} of {QUESTIONS.length}
          </span>
          <span>{question.dimension === "CAPACITY" ? "Your money" : "Your nerves"}</span>
        </div>
        <ProgressBar value={((index + (chosen ? 1 : 0)) / QUESTIONS.length) * 100} />
      </div>
      <fieldset className="flex flex-col gap-4 px-5 py-5">
        <legend className="sr-only">{question.prompt}</legend>
        <div>
          <p className="text-[18px] leading-snug font-semibold tracking-tight">{question.prompt}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{question.hint}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {question.options.map((option) => {
            const on = chosen === option.value;
            return (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md border px-3.5 py-3 text-[13px] transition-colors",
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
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid h-4 w-4 shrink-0 place-items-center rounded-full border",
                    on ? "border-primary bg-primary" : "border-border-strong",
                  )}
                >
                  {on && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                </span>
                {option.label}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3.5">
        <div className="flex gap-2">
          {index > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIndex(index - 1)}
              className="gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Back
            </Button>
          )}
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
        {failed && (
          <p role="alert" className="text-[12px] text-warning">
            Could not save. Try again.
          </p>
        )}
        <Button
          type="button"
          size="sm"
          disabled={!chosen || saving}
          onClick={() => (last ? void onSubmit(answers) : setIndex(index + 1))}
          className="gap-1.5"
        >
          {last ? (saving ? "Saving…" : "See my DNA") : "Next"}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
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
              className="h-8 gap-1.5"
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
          <LevelScale label="Risk capacity — what you can afford to lose" value={stated.capacity} />
          <LevelScale
            label="Risk tolerance — what you are willing to sit through"
            value={stated.tolerance}
          />
          {stated.capacity !== stated.tolerance && (
            <p className="rounded-md border border-border bg-background/40 px-3.5 py-3 text-[12px] leading-relaxed text-muted-foreground">
              Your capacity and tolerance differ, so your practice profile uses the more cautious of
              the two.
            </p>
          )}
        </div>
      </Card>

      <Card>
        <CardHead title="What your trades show" meta="From your closed paper trades" />
        <div className="flex flex-col gap-5 px-5 py-5">
          {revealed.level ? (
            <>
              <LevelScale label="Revealed risk" value={revealed.level} />
              {gap && <p className="text-[15px] leading-snug font-medium text-foreground">{gap}</p>}
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
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                People are often bolder on paper than in a real fall. After {revealed.min_sample}{" "}
                closed paper trades, Quant Plus compares what you said with what you actually do.
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
            <Button asChild size="sm" className="h-8 gap-1.5">
              <Link to="/app/$section" params={{ section: "learn" }}>
                See my licence
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Button>
            <span className="text-[12px] text-subtle">Updates as you trade</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
