import { useState } from "react";
import { Check, Loader2, Send, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHead, Pill, Skeleton } from "@/components/app/cards";
import { PageIntro, ProgressBar, Segmented } from "@/components/app/pages/workspace";
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
        body="Short checks find what you already know and what to practise next. The tutor asks questions first, so you work the answer out yourself."
        status={`${mastered} of ${CONCEPTS.length} concepts mastered`}
      />
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(240px,.7fr)_minmax(0,1.3fr)]">
        <Card className="lg:self-start">
          <CardHead
            title="Concepts"
            meta={`${learning.checks_answered ?? 0} check${learning.checks_answered === 1 ? "" : "s"} answered`}
          />
          {loading ? (
            <div className="p-5">
              <Skeleton className="h-60" />
            </div>
          ) : (
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
                        "flex w-full flex-col gap-1.5 px-5 py-2.5 text-left transition-colors hover:bg-panel-elevated",
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
                          <Check className="h-3.5 w-3.5 text-positive" aria-label="Mastered" />
                        )}
                      </span>
                      <ProgressBar value={p * 100} tone={p >= MASTERED ? "positive" : "primary"} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="flex min-w-0 flex-col gap-5">
          <QuickCheck
            key={concept.id}
            concept={concept}
            mastery={masteryOf(mastery, concept.id)}
            onAnswer={(correct) => {
              // Pin the topic so the feedback stays visible after mastery changes.
              setSelected(concept.id);
              void recordCheck(concept.id, correct);
            }}
          />
          <TutorChat concept={concept} />
        </div>
      </div>
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
  onAnswer: (correct: boolean) => void;
}) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const check = concept.checks[index % concept.checks.length]!;
  const answered = picked != null;
  const correct = picked === check.answer;

  return (
    <Card glow>
      <CardHead
        title={`Quick check · ${concept.title}`}
        meta={concept.meaning}
        action={
          <Pill tone={mastery >= MASTERED ? "positive" : "neutral"}>
            {Math.round(mastery * 100)}% known
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
                onAnswer(i === check.answer);
              }}
              className={cn(
                "flex items-center justify-between gap-3 rounded-md border px-3.5 py-2.5 text-left text-[13px] transition-colors",
                !answered && "border-border hover:border-primary/60 hover:bg-primary/5",
                answered &&
                  i === check.answer &&
                  "border-positive/60 bg-positive/10 text-foreground",
                answered && i === picked && !correct && "border-negative/60 bg-negative/10",
                answered && i !== check.answer && i !== picked && "border-border opacity-60",
              )}
            >
              {option}
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
            <p aria-live="polite" className="text-[13px] leading-relaxed text-muted-foreground">
              <span className={cn("font-medium", correct ? "text-positive" : "text-negative")}>
                {correct ? "Right. " : "Not quite. "}
              </span>
              {check.why}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 shrink-0"
              onClick={() => {
                setPicked(null);
                setIndex(index + 1);
              }}
            >
              Another question
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
  const copilot = useCopilot();
  const visible = copilot.messages.filter((m) => m.text || copilot.busy);

  const send = (text: string) => {
    const question = text.trim();
    if (!question) return;
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
      <CardHead
        title="Ask the tutor"
        meta={`Talking about ${concept.title.toLowerCase()}`}
        action={
          <Segmented
            items={EXPLAIN_LANGUAGES}
            value={language}
            onChange={setLanguage}
            label="Tutor language"
          />
        }
      />
      <div className="flex flex-col gap-3 px-5 py-4">
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
                onClick={() => send(prompt)}
                className="rounded-full border border-border px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
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
                  "max-w-[92%] rounded-lg border px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap",
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
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            send(draft);
          }}
        >
          <label className="sr-only" htmlFor="tutor-question">
            Your question
          </label>
          <input
            id="tutor-question"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask anything about this topic…"
            maxLength={500}
            className="h-9 min-w-0 flex-1 rounded-md border border-border-strong bg-background px-3 text-[13px] placeholder:text-subtle"
          />
          {copilot.busy ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 gap-1.5"
              onClick={copilot.stop}
            >
              <Square className="h-3 w-3" aria-hidden="true" />
              Stop
            </Button>
          ) : (
            <Button type="submit" size="sm" className="h-9 gap-1.5" disabled={!draft.trim()}>
              {copilot.busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Ask
            </Button>
          )}
        </form>
      </div>
    </Card>
  );
}
