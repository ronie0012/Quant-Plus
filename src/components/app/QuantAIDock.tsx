import { useEffect, useRef, useState } from "react";
import { ArrowUp, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; text: string };

const suggestions = [
  "Why is the market bullish today?",
  "Explain current volatility",
  "What drives NIFTY breadth?",
];

export function QuantAIDock() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setOpen(true);
    setInput("");
    setError(null);
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text: message }, { role: "assistant", text: "" }]);

    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ message }),
      });
      if (!res.ok || !res.body) {
        throw new Error(
          res.status === 429
            ? "Quant AI is busy right now — try again in a moment."
            : "Quant AI could not answer that request.",
        );
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += value;
        setMessages((m) => {
          const next = [...m];
          next[next.length - 1] = { role: "assistant", text: acc };
          return next;
        });
      }
      if (!acc) {
        setMessages((m) => {
          const next = [...m];
          next[next.length - 1] = {
            role: "assistant",
            text: "No answer was returned. Please try rephrasing your question.",
          };
          return next;
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setMessages((m) => m.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-40 flex w-[calc(100vw-2rem)] max-w-[420px] flex-col items-end gap-3 sm:right-6 sm:bottom-6">
      {/* conversation panel expands upward */}
      <div
        className={cn(
          "pointer-events-auto w-full origin-bottom overflow-hidden rounded-xl border border-border bg-panel-elevated/95 shadow-[0_24px_80px_-32px_rgba(46,125,255,0.45)] backdrop-blur transition-all duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]",
          open
            ? "max-h-[min(70vh,520px)] translate-y-0 scale-100 opacity-100"
            : "max-h-0 translate-y-3 scale-95 opacity-0",
        )}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.18em] uppercase text-primary-soft">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
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

        <div ref={scrollRef} className="max-h-[min(52vh,380px)] space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Ask about market structure, momentum, volatility or portfolio risk. Answers are
              educational analysis on demonstrative data — not investment advice.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "reveal-in max-w-[92%] rounded-lg px-3 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap",
                m.role === "user"
                  ? "ml-auto border border-primary/40 bg-primary/10 text-foreground"
                  : "border border-border bg-panel text-muted-foreground",
              )}
            >
              {m.text || (busy ? "Thinking…" : "")}
            </div>
          ))}
          {error && <p className="text-[12px] text-negative">{error}</p>}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void send(s)}
              className="rounded-full border border-border px-3 py-1.5 text-[11px] text-subtle transition-colors hover:border-primary/50 hover:text-primary-soft"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* compact input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="pointer-events-auto flex w-full items-center gap-2 rounded-full border border-primary/35 bg-panel-elevated/95 px-4 py-2.5 shadow-[0_18px_50px_-24px_rgba(46,125,255,0.6)] backdrop-blur transition-colors focus-within:border-primary/70"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-primary-soft" aria-hidden="true" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Ask Quant AI about markets..."
          aria-label="Ask Quant AI about markets"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-subtle"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send message"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}
