import { useState } from "react";
import { Languages, Loader2, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/app/pages/workspace";
import { useCopilot } from "@/hooks/use-copilot";
import type { CopilotContext } from "@/lib/chat-api";

export const EXPLAIN_LANGUAGES = ["English", "हिन्दी"] as const;
export type ExplainLanguage = (typeof EXPLAIN_LANGUAGES)[number];

/**
 * Beginner explanation from the grounded copilot. The caller supplies the
 * facts to explain; the copilot is asked to use plain words, stay short and
 * say that the explanation is not a prediction or advice.
 */
export function AiExplain({
  facts,
  context,
  label = "Explain simply",
}: {
  /** What to explain, already reduced to facts the copilot can restate. */
  facts: string;
  context?: CopilotContext;
  label?: string;
}) {
  const [language, setLanguage] = useState<ExplainLanguage>("English");
  const copilot = useCopilot(context ? { context } : {});
  const reply = [...copilot.messages].reverse().find((message) => message.role === "assistant");

  const ask = () => {
    copilot.reset();
    void copilot.send(
      [
        `Explain this to a complete beginner in ${language === "English" ? "simple English" : "simple Hindi (Devanagari script)"}.`,
        "Use at most 120 words, short sentences and one everyday analogy. No jargon without a one-line meaning.",
        "End with one sentence saying this is a possible effect for paper practice, not a prediction or investment advice.",
        "",
        facts,
      ].join("\n"),
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={ask}
          disabled={copilot.busy}
          className="h-8 gap-1.5"
        >
          {copilot.busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {label}
        </Button>
        <span className="inline-flex items-center gap-1.5 text-[12px] text-subtle">
          <Languages className="h-3.5 w-3.5" aria-hidden="true" />
          <Segmented
            items={EXPLAIN_LANGUAGES}
            value={language}
            onChange={setLanguage}
            label="Explanation language"
          />
        </span>
        {copilot.busy && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={copilot.stop}
            className="h-8 gap-1.5"
          >
            <Square className="h-3 w-3" aria-hidden="true" />
            Stop
          </Button>
        )}
      </div>
      {copilot.error && (
        <p role="alert" className="text-[12px] text-warning">
          {copilot.error}
        </p>
      )}
      {(reply?.text || copilot.busy) && (
        <p
          aria-live="polite"
          className="rounded-md border border-border bg-background/40 px-3.5 py-3 text-[13px] leading-relaxed whitespace-pre-wrap text-muted-foreground"
        >
          {reply?.text || "Reading the evidence…"}
        </p>
      )}
    </div>
  );
}
