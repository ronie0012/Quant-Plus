import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Card, CardHead } from "@/components/app/cards";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useJournal } from "@/hooks/use-trading-product";
import { useOrders } from "@/hooks/use-orders";

/** Quant AI reviews a journal thesis against the account's own simulated fills. */
export function TradeReviewPanel() {
  const { data: journal } = useJournal();
  const { data: orders } = useOrders();
  const [id, setId] = useState<string>("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entries = journal ?? [];
  const entry = entries.find((e) => e.id === id) ?? entries[0];

  const reviewed = entries.filter((e) => e.reflection).length;
  const complete = entries.filter((e) => e.thesis && e.invalidation && e.risks.length).length;
  const wins = entries.filter((e) => e.outcome === "WIN").length;
  const closed = entries.filter((e) => ["WIN", "LOSS", "FLAT"].includes(e.outcome)).length;
  const iq = entries.length ? Math.round((complete / entries.length) * 40 + (reviewed / entries.length) * 30 + (closed ? (wins / closed) * 30 : 15)) : 0;

  async function review() {
    if (!entry) return;
    setBusy(true); setError(null); setText("");
    const fills = (orders ?? []).filter((o) => o.symbol === entry.symbol && o.status === "FILLED").slice(0, 10)
      .map((o) => `${o.side} ${o.quantity} @ ₹${o.price} on ${o.created_at.slice(0, 10)}`).join("; ") || "no fills yet";
    const message = `Review my simulated trade decision on ${entry.symbol}. Thesis: "${entry.thesis}". Risks: "${entry.risks.join(", ")}". Invalidation: "${entry.invalidation}". Outcome: ${entry.outcome}. Reflection: "${entry.reflection}". Fills: ${fills}. Give: 1) what was sound, 2) what was weak, 3) one process improvement. Judge the process, not the outcome.`;
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` }, body: JSON.stringify({ message }) });
      if (!res.ok || !res.body) throw new Error(res.status === 429 ? "Quant AI is busy — try again shortly." : res.status === 402 ? "AI credits are exhausted for this workspace." : "Quant AI could not review this trade.");
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let acc = "";
      for (;;) { const { value, done } = await reader.read(); if (done) break; acc += value; setText(acc); }
    } catch (e) { setError(e instanceof Error ? e.message : "Review failed."); } finally { setBusy(false); }
  }

  return (
    <Card className="mt-5 p-5">
      <CardHead title="Quant AI trade review" />
      <div className="mt-4 grid gap-5 lg:grid-cols-[220px_1fr]">
        <div className="border border-border p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">Trading IQ</p>
          <p className="mt-2 font-mono text-4xl num-tabular text-primary-soft">{iq}</p>
          <div className="mt-3 h-1 bg-border"><div className="h-full bg-primary transition-[width] duration-700" style={{ width: `${iq}%` }} /></div>
          <p className="mt-3 text-[11px] leading-relaxed text-subtle">Process score from thesis completeness, reflections and closed-trade outcomes.</p>
        </div>
        <div>
          {entries.length === 0 ? <p className="text-sm text-muted-foreground">Write a journal entry above, then ask Quant AI to review it.</p> : (
            <>
              <div className="flex flex-wrap gap-2">
                <select value={entry?.id ?? ""} onChange={(e) => setId(e.target.value)} className="h-10 min-w-0 flex-1 border border-border bg-background px-2 text-sm">
                  {entries.map((e) => <option key={e.id} value={e.id}>{e.symbol} · {e.thesis.slice(0, 60) || "Untitled thesis"}</option>)}
                </select>
                <Button onClick={() => void review()} disabled={busy}><Sparkles />{busy ? "Reviewing…" : "Review with Quant AI"}</Button>
              </div>
              {error && <p className="mt-3 border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative">{error}</p>}
              {text && <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{text}</p>}
              <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.16em] text-subtle">Educational process review · not investment advice</p>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
