import { useRef, useState } from "react";
import { Check, Send, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHead, Pill, Skeleton } from "@/components/app/cards";
import { PageIntro, ProgressBar } from "@/components/app/pages/workspace";
import { EXPLAIN_LANGUAGES, type ExplainLanguage } from "@/components/app/AiExplain";
import { useCopilot } from "@/hooks/use-copilot";
import { useLearning } from "@/hooks/use-learning";
import {
  CONCEPTS,
  MASTERED,
  masteryOf,
  nextConcept,
  type Concept,
  type ConceptId,
} from "@/lib/learn/concepts";
import { cn } from "@/lib/utils";

/**
 * AI tutor: quick checks update a per-concept mastery estimate (knowledge
 * tracing), and a Socratic chat that asks before it tells.
 */
export function TutorPage() {
  const { mastery, loading, recordCheck, learning } = useLearning();
  const [selected, setSelected] = useState<ConceptId | null>(null);
  const concept = CONCEPTS.find((c) => c.id === selected) ?? nextConcept(mastery);
  const mastered = CONCEPTS.filter((c) => masteryOf(mastery, c.id) >= MASTERED).length;

  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Learn"
        title="AI tutor"
        body="1. Try a quick check. 2. Read the explanation. 3. Ask for help or try another question. You can practise without using AI."
        status={`${mastered} of ${CONCEPTS.length} at practice target`}
      />
      {loading ? (
        <Skeleton className="h-72" />
      ) : (
        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(240px,.7fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            <QuickCheck
              key={concept.id}
              concept={concept}
              mastery={masteryOf(mastery, concept.id)}
              onAnswer={async (correct) => {
                setSelected(concept.id);
                await recordCheck(concept.id, correct);
              }}
            />
            <details className="rounded-lg border border-border bg-panel/80">
              <summary className="min-h-11 cursor-pointer px-5 py-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary">
                Need help? Ask the AI tutor
              </summary>
              <TutorChat concept={concept} />
            </details>
          </div>
          <details className="self-start rounded-lg border border-border bg-panel/80">
            <summary className="min-h-11 cursor-pointer px-5 py-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary">
              Choose another concept · {CONCEPTS.length} topics
            </summary>
            <Card>
              <CardHead
                title="Concepts"
                meta={`${learning.checks_answered ?? 0} check${learning.checks_answered === 1 ? "" : "s"} answered`}
              />
              <ul className="divide-y divide-border">
                {CONCEPTS.map((c) => {
                  const p = masteryOf(mastery, c.id);
                  const on = c.id === concept.id;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => setSelected(c.id)}
                        className={cn(
                          "flex min-h-11 w-full flex-col gap-1.5 px-5 py-3 text-left transition-colors hover:bg-panel-elevated focus-visible:outline-2 focus-visible:outline-primary",
                          on && "bg-panel-elevated",
                        )}
                      >
                        <span className="flex items-center justify-between gap-2 text-[13px]">
                          <span
                            className={on ? "font-medium text-foreground" : "text-muted-foreground"}
                          >
                            {c.title}
                          </span>
                          {p >= MASTERED && (
                            <span className="text-xs text-positive">At target</span>
                          )}
                        </span>
                        <ProgressBar
                          value={p * 100}
                          tone={p >= MASTERED ? "positive" : "primary"}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="px-5 py-4 text-xs leading-relaxed text-muted-foreground">
                Progress is an estimate from your check answers, not a certification of knowledge.
              </p>
            </Card>
          </details>
        </div>
      )}
    </div>
  );
}

function QuickCheck({
  concept,
  mastery,
  onAnswer,
}: {
  concept: Concept;
  mastery: number;
  onAnswer: (correct: boolean) => Promise<void>;
}) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const check = concept.checks[index % concept.checks.length]!;
  const answered = picked != null;
  const correct = picked === check.answer;
  async function saveAnswer(choice: number) {
    setSaving(true);
    setSaveError(false);
    try {
      await onAnswer(choice === check.answer);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card glow>
      <CardHead
        title={`Quick check · ${concept.title}`}
        meta={concept.meaning}
        action={
          <Pill tone={mastery >= MASTERED ? "positive" : "neutral"}>
            {Math.round(mastery * 100)}% practice estimate
          </Pill>
        }
      />
      <div className="flex flex-col gap-4 px-5 py-5">
        <p className="text-[15px] leading-snug font-medium">{check.question}</p>
        <div className="flex flex-col gap-2">
          {check.options.map((option, i) => (
            <button
              key={option}
              type="button"
              disabled={answered}
              onClick={() => {
                setPicked(i);
                void saveAnswer(i);
              }}
              className={cn(
                "flex min-h-11 items-center justify-between gap-3 rounded-md border px-3.5 py-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary",
                !answered && "border-border hover:border-primary/60 hover:bg-primary/5",
                answered &&
                  i === check.answer &&
                  "border-positive/60 bg-positive/10 text-foreground",
                answered && i === picked && !correct && "border-negative/60 bg-negative/10",
                answered && i !== check.answer && i !== picked && "border-border opacity-60",
              )}
            >
              <span>
                {option}
                {answered && i === check.answer && (
                  <span className="sr-only"> · Correct answer</span>
                )}
                {answered && i === picked && <span className="sr-only"> · Your answer</span>}
              </span>
              {answered && i === check.answer && (
                <Check className="h-4 w-4 text-positive" aria-hidden="true" />
              )}
              {answered && i === picked && !correct && (
                <X className="h-4 w-4 text-negative" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
        {answered && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p role="status" className="text-sm leading-relaxed text-muted-foreground">
              <span className={cn("font-medium", correct ? "text-positive" : "text-negative")}>
                {correct ? "Right. " : "Not quite. "}
              </span>
              {check.why}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 shrink-0"
              disabled={saving || saveError}
              onClick={() => {
                setPicked(null);
                setIndex(index + 1);
              }}
            >
              Another question
            </Button>
          </div>
        )}
        {saving && (
          <p role="status" className="text-xs text-muted-foreground">
            Saving progress…
          </p>
        )}
        {saveError && (
          <div role="alert" className="text-sm text-warning">
            Progress could not be saved. Your explanation is still available.{" "}
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => void saveAnswer(picked!)}
            >
              Retry saving progress
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function TutorChat({ concept }: { concept: Concept }) {
  const [language, setLanguage] = useState<ExplainLanguage>("English");
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const copilot = useCopilot();
  const visible = copilot.messages.filter((m) => m.text || copilot.busy);

  const send = (text: string) => {
    const question = text.trim();
    if (!question || copilot.busy) return;
    setDraft("");
    void copilot.send(
      [
        `You are a patient stock-market tutor for a complete beginner. Reply in ${language === "English" ? "simple English" : "simple Hindi (Devanagari script)"}.`,
        `Current topic: ${concept.title} — ${concept.meaning}`,
        "Teach Socratically: first ask one short guiding question or give a tiny worked example with Indian rupee numbers, then explain in at most 100 words.",
        "Never recommend buying or selling a real security.",
        "",
        `Learner: ${question}`,
      ].join("\n"),
    );
  };

  return (
    <Card>
      <CardHead title="Ask the tutor" meta={`Talking about ${concept.title.toLowerCase()}`} />
      <div className="flex flex-col gap-3 px-5 py-4">
        <p className="text-sm leading-relaxed text-muted-foreground">
          AI replies can be mistaken. Use them to explore an idea, not to choose an investment. Your
          question is sent to the AI service when you press Ask.
        </p>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          Tutor language
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value as ExplainLanguage)}
            className="min-h-11 rounded-md border border-border-strong bg-background px-3 text-foreground"
          >
            {EXPLAIN_LANGUAGES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        {visible.length === 0 ? (
          <div className="flex flex-wrap gap-2">
            {[
              `What is ${concept.title.toLowerCase()}, simply?`,
              "Give me a real-life example",
              "Why does this matter for my trades?",
            ].map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => {
                  setDraft(prompt);
                  input.current?.focus();
                }}
                className="min-h-11 rounded-md border border-border px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
              >
                {prompt}
              </button>
            ))}
          </div>
        ) : (
          <ol className="flex max-h-[26rem] flex-col gap-2.5 overflow-y-auto" aria-live="polite">
            {visible.map((message, i) => (
              <li
                key={`${message.at}-${i}`}
                className={cn(
                  "max-w-[92%] rounded-lg border px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words",
                  message.role === "user"
                    ? "ml-auto border-primary/35 bg-primary/10 text-foreground"
                    : "border-border bg-background/30 text-muted-foreground",
                )}
              >
                {message.role === "user"
                  ? (message.text.split("Learner: ").at(-1) ?? message.text)
                  : message.text || "Thinking…"}
              </li>
            ))}
          </ol>
        )}
        {copilot.error && (
          <p role="alert" className="text-[12px] text-warning">
            {copilot.error}
          </p>
        )}
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            send(draft);
          }}
        >
          <label className="w-full text-sm font-medium" htmlFor="tutor-question">
            Your question
          </label>
          <input
            id="tutor-question"
            ref={input}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask anything about this topic…"
            maxLength={500}
            className="min-h-11 min-w-0 flex-1 rounded-md border border-border-strong bg-background px-3 text-base placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-primary"
          />
          {copilot.busy ? (
            <Button
              key="stop"
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 gap-1.5"
              onClick={(event) => {
                event.preventDefault();
                copilot.stop();
              }}
            >
              <Square className="h-3 w-3" aria-hidden="true" />
              Stop
            </Button>
          ) : (
            <Button
              key="ask"
              type="submit"
              size="sm"
              className="min-h-11 gap-1.5"
              disabled={!draft.trim()}
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              Ask
            </Button>
          )}
        </form>
      </div>
    </Card>
  );
}
