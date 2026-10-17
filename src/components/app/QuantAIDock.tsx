import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { ArrowUp, Sparkles, Square, X } from "lucide-react";
import { useCopilot } from "@/hooks/use-copilot";
import { CopilotMessageView } from "@/components/app/CopilotMessage";
import { cn } from "@/lib/utils";

const suggestions = [
  "Summarise today's market condition",
  "Explain my portfolio concentration",
  "What does breadth show right now?",
];

export function QuantAIDock() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // Attach the instrument on the current page so questions about "it" resolve correctly.
  const pageSymbol = /^\/app\/stocks\/([^/]+)/.exec(pathname)?.[1];
  const copilot = useCopilot({
    persist: true,
    ...(pageSymbol ? { context: { symbol: decodeURIComponent(pageSymbol).toUpperCase() } } : {}),
  });
  const { messages, busy, error } = copilot;
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setOpen(true);
    setInput("");
    await copilot.send(text);
  }

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-40 flex w-[calc(100vw-2rem)] max-w-[420px] flex-col items-end gap-3 sm:right-6 sm:bottom-6">
      {/* conversation panel expands upward */}
      <div
        className={cn(
          "pointer-events-auto w-full origin-bottom-right overflow-hidden rounded-lg border border-border-strong bg-panel-elevated shadow-[0_24px_60px_-24px_rgba(0,0,0,0.85)] transition-all duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]",
          open
            ? "max-h-[min(70vh,520px)] translate-y-0 scale-100 opacity-100"
            : "max-h-0 translate-y-3 scale-95 opacity-0",
        )}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary-soft" aria-hidden="true" />
            Quant AI
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close Quant AI"
            className="text-subtle transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          ref={scrollRef}
          className="max-h-[min(52vh,380px)] space-y-3 overflow-y-auto px-4 py-4"
          tabIndex={0}
          role="log"
          aria-label="Quant AI messages"
        >
          {messages.length === 0 && (
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Ask about market structure, an instrument, news or your paper portfolio. Answers cite
              the evidence they use and flag figures that are not in it. Read-only; not investment
              advice.
            </p>
          )}
          {messages.map((m, i) => (
            <CopilotMessageView
              key={i}
              message={m}
              pending={busy && i === messages.length - 1}
              compact
            />
          ))}
          {error && (
            <p role="alert" className="text-[12px] text-negative">
              {error}{" "}
              <button type="button" className="underline" onClick={() => copilot.retry()}>
                Retry
              </button>
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void send(s)}
              disabled={busy}
              className="rounded-full border border-border px-3 py-1.5 text-[11px] text-subtle transition-colors hover:border-primary/50 hover:text-primary-soft"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* closed: a small launcher, so the dock never covers page content */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="pointer-events-auto flex h-10 items-center gap-2 rounded-full border border-border-strong bg-panel-elevated px-4 text-[13px] font-medium text-foreground shadow-[0_12px_32px_-16px_rgba(0,0,0,0.9)] transition-colors hover:border-primary/60"
        >
          <Sparkles className="h-4 w-4 text-primary-soft" aria-hidden="true" />
          Ask Quant AI
        </button>
      )}

      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="pointer-events-auto flex w-full items-center gap-2 rounded-lg border border-border-strong bg-panel-elevated px-3.5 py-2 transition-colors focus-within:border-primary/70"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-primary-soft" aria-hidden="true" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            ref={inputRef}
            placeholder="Ask Quant AI about markets..."
            aria-label="Ask Quant AI about markets"
            maxLength={4000}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-subtle"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => copilot.stop()}
              aria-label="Stop answer"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border text-foreground"
            >
              <Square className="h-3 w-3" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Send message"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
          )}
        </form>
      )}
    </div>
  );
}
