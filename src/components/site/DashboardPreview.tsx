import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const panels = {
  Portfolio:
    "Your virtual deposits and recorded fills populate your paper book. No sample holdings are inserted.",
  Markets:
    "Market observations require a connected provider. Missing quotes and history remain unavailable.",
  Research:
    "Request research in the terminal and inspect its progress, evidence and uncertainty. Forecast quality remains under evaluation.",
};
export function DashboardPreview({ stage = 7, className }: { stage?: number; className?: string }) {
  const [tab, setTab] = useState<keyof typeof panels>("Portfolio");
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <div className={cn("border border-border bg-panel p-6", className)}>
      <p className="font-mono text-xs text-subtle">Quant Plus workspace / Product overview</p>
      <div className="mt-6 flex gap-3" role="group" aria-label="Workspace overview">
        {(Object.keys(panels) as Array<keyof typeof panels>).map((name) => (
          <button
            key={name}
            disabled={!ready}
            aria-pressed={tab === name}
            onClick={() => setTab(name)}
            className={cn(
              "border border-border px-3 py-2 text-sm",
              tab === name && "bg-primary/15 text-primary",
            )}
          >
            {name}
          </button>
        ))}
      </div>
      <div
        className="mt-6 min-h-40 border border-dashed border-border p-6"
        style={{ opacity: stage > 0 ? 1 : 0 }}
      >
        <h3 className="text-xl">{tab}</h3>
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">{panels[tab]}</p>
      </div>
    </div>
  );
}
