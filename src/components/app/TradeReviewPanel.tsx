import { useState } from "react";
import { Sparkles, Square } from "lucide-react";
import { Card, CardHead } from "@/components/app/cards";
import { Button } from "@/components/ui/button";
import { CopilotMessageView } from "@/components/app/CopilotMessage";
import { useCopilot } from "@/hooks/use-copilot";
import { useJournal } from "@/hooks/use-trading-product";

/**
 * Quant AI reviews a journal entry's process. The server reads the exact
 * journal entry and its linked order audit trail; nothing is inferred from
 * same-symbol trades.
 */
export function TradeReviewPanel() {
  const { data: journal } = useJournal();
  const [id, setId] = useState<string>("");
  const copilot = useCopilot({ mode: "journal_review", persist: true });
  const entries = journal ?? [];
  const entry = entries.find((e) => e.id === id) ?? entries[0];
  const answer = [...copilot.messages].reverse().find((m) => m.role === "assistant");

  const reviewed = entries.filter((e) => e.reflection).length;
  const complete = entries.filter((e) => e.thesis && e.invalidation && e.risks?.length).length;
  const coverage = entries.length
    ? Math.round(((complete + reviewed) / (entries.length * 2)) * 100)
    : 0;

  function review() {
    if (!entry) return;
    copilot.reset();
    void copilot.send(
      `Review the process of my journal entry on ${entry.symbol}. Give: 1) what was sound, 2) what was weak, 3) one process improvement. Judge the process, not the outcome.`,
      {
        mode: entry.order_id ? "post_trade" : "journal_review",
        context: { journal_id: entry.id, ...(entry.order_id ? { order_id: entry.order_id } : {}) },
      },
    );
  }

  return (
    <Card className="mt-5 p-5">
      <CardHead title="Quant AI trade review" />
      <div className="mt-4 grid gap-5 lg:grid-cols-[220px_1fr]">
        <div className="border border-border p-4">
          <p className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
            Journal process coverage
          </p>
          <p className="mt-2 font-mono text-4xl num-tabular text-primary-soft">{coverage}</p>
          <div className="mt-3 h-1 bg-border">
            <div
              className="h-full bg-primary transition-[width] duration-700"
              style={{ width: `${coverage}%` }}
            />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-subtle">
            Percentage of completed thesis checks and reflections. This does not measure trading
            ability.
          </p>
        </div>
        <div>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Write a journal entry above, then ask Quant AI to review it.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <label htmlFor="review-entry" className="sr-only">
                  Journal entry to review
                </label>
                <select
                  id="review-entry"
                  value={entry?.id ?? ""}
                  onChange={(e) => setId(e.target.value)}
                  className="h-10 min-w-0 flex-1 border border-border bg-background px-2 text-sm"
                >
                  {entries.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.symbol} · {e.thesis.slice(0, 60) || "Untitled thesis"}
                      {e.order_id ? " · linked order" : ""}
                    </option>
                  ))}
                </select>
                {copilot.busy ? (
                  <Button variant="outline" onClick={() => copilot.stop()}>
                    <Square /> Stop
                  </Button>
                ) : (
                  <Button onClick={review}>
                    <Sparkles />
                    Review with Quant AI
                  </Button>
                )}
              </div>
              {copilot.error && (
                <p className="mt-3 border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative">
                  {copilot.error}
                </p>
              )}
              {answer && (
                <div className="mt-4">
                  <CopilotMessageView message={answer} pending={copilot.busy} />
                </div>
              )}
              <p className="mt-3 font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                Educational process review · not investment advice · saved to Quant AI history
              </p>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
