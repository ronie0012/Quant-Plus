import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Activity, BrainCircuit, Database, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const panels = {
  Portfolio: {
    icon: ShieldCheck,
    kicker: "Paper book",
    title: "Practice without pretending",
    description:
      "Your virtual deposits and recorded fills populate your paper book. No sample holdings are inserted.",
    rows: [
      ["Wallet", "Ready for virtual funds", "positive"],
      ["Recorded fills", "Shown after execution", "default"],
      ["Sample holdings", "None inserted", "muted"],
    ],
  },
  Markets: {
    icon: Activity,
    kicker: "Market access",
    title: "Know when the tape is real",
    description:
      "Market observations require a connected provider. Missing quotes and history remain unavailable.",
    rows: [
      ["Quotes", "Provider required", "warning"],
      ["History", "Unavailable until connected", "muted"],
      ["Source", "Shown with freshness", "default"],
    ],
  },
  Research: {
    icon: BrainCircuit,
    kicker: "AI research",
    title: "Inspect the reasoning",
    description:
      "Request research when its service is available. Inspect the supplied evidence and uncertainty; research quality remains under evaluation.",
    rows: [
      ["Progress", "Visible while running", "positive"],
      ["Evidence", "Review supplied sources", "default"],
      ["Research quality", "Under evaluation", "warning"],
    ],
  },
} as const;

type PanelName = keyof typeof panels;
const panelOrder = Object.keys(panels) as PanelName[];

export function DashboardPreview({ stage = 7, className }: { stage?: number; className?: string }) {
  const [tab, setTab] = useState<PanelName>("Portfolio");
  const [hydrated, setHydrated] = useState(false);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const idPrefix = useId().replace(/:/g, "");
  const activePanel = panels[tab];
  const ActiveIcon = activePanel.icon;

  useEffect(() => setHydrated(true), []);

  const moveTab = (event: KeyboardEvent<HTMLButtonElement>, direction: 1 | -1) => {
    event.preventDefault();
    const index = panelOrder.indexOf(tab);
    const next = (index + direction + panelOrder.length) % panelOrder.length;
    const nextTab = panelOrder[next];
    if (!nextTab) return;
    setTab(nextTab);
    tabs.current[next]?.focus();
  };

  return (
    <div
      className={cn(
        "overflow-hidden border border-border bg-panel shadow-[0_36px_100px_-70px_color-mix(in_oklab,var(--color-primary)_75%,transparent)]",
        className,
      )}
      data-stage={stage}
      data-dashboard-hydrated={hydrated}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-7">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          </span>
          <p className="font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
            Workspace preview
          </p>
        </div>
        <span className="inline-flex items-center gap-2 border border-border-strong px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          <Database aria-hidden="true" className="h-3.5 w-3.5 text-primary-soft" />
          Source-aware by default
        </span>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
        <div className="border-b border-border p-5 sm:p-7 lg:border-r lg:border-b-0">
          <p className="label-tech">Decision workspace</p>
          <p className="mt-4 max-w-sm text-[clamp(1.45rem,3vw,2.45rem)] leading-[1.1] tracking-tight">
            See what is known before you act.
          </p>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
            A clear surface for market context, paper execution and research that keeps evidence,
            data state and uncertainty visible.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {[
              ["Data", "Provider state", Database],
              ["Signal", "Quant context", Activity],
              ["Risk", "Before orders", ShieldCheck],
            ].map(([label, value, Icon]) => {
              const ItemIcon = Icon as typeof Database;
              return (
                <div
                  key={label as string}
                  className="flex items-center gap-3 border border-border bg-background/35 px-3 py-3"
                >
                  <ItemIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-primary-soft" />
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] tracking-[0.16em] text-subtle uppercase">
                      {label as string}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{value as string}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 p-5 sm:p-7">
          <div
            role="tablist"
            aria-label="Workspace overview"
            className="flex gap-1 overflow-x-auto border-b border-border pb-1"
          >
            {panelOrder.map((name, index) => {
              const selected = tab === name;
              return (
                <button
                  key={name}
                  ref={(element) => {
                    tabs.current[index] = element;
                  }}
                  id={`${idPrefix}-tab-${name.toLowerCase()}`}
                  type="button"
                  role="tab"
                  disabled={!hydrated}
                  aria-selected={selected}
                  aria-controls={`${idPrefix}-panel`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setTab(name)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowRight" || event.key === "ArrowDown") moveTab(event, 1);
                    if (event.key === "ArrowLeft" || event.key === "ArrowUp") moveTab(event, -1);
                    if (event.key === "Home") {
                      event.preventDefault();
                      const firstTab = panelOrder[0];
                      if (!firstTab) return;
                      setTab(firstTab);
                      tabs.current[0]?.focus();
                    }
                    if (event.key === "End") {
                      event.preventDefault();
                      const last = panelOrder.length - 1;
                      const lastTab = panelOrder[last];
                      if (!lastTab) return;
                      setTab(lastTab);
                      tabs.current[last]?.focus();
                    }
                  }}
                  className={cn(
                    "min-h-11 shrink-0 border-b-2 px-3 font-mono text-[11px] tracking-[0.1em] uppercase transition-colors duration-200 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-primary-soft",
                    selected
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>

          <div
            id={`${idPrefix}-panel`}
            role="tabpanel"
            aria-labelledby={`${idPrefix}-tab-${tab.toLowerCase()}`}
            tabIndex={0}
            className="mt-6 min-h-[18rem] border border-dashed border-border bg-background/25 p-5 outline-none focus-visible:ring-2 focus-visible:ring-primary-soft sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="label-tech text-primary-soft">{activePanel.kicker}</p>
                <h3 className="mt-3 text-xl tracking-tight sm:text-2xl">{activePanel.title}</h3>
              </div>
              <ActiveIcon aria-hidden="true" className="h-5 w-5 shrink-0 text-primary-soft" />
            </div>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {activePanel.description}
            </p>

            <dl className="mt-7 grid gap-2 border-t border-border pt-5">
              {activePanel.rows.map(([label, value, tone]) => (
                <div key={label} className="flex flex-wrap items-center justify-between gap-3 py-1">
                  <dt className="font-mono text-[11px] tracking-[0.14em] text-subtle uppercase">
                    {label}
                  </dt>
                  <dd
                    className={cn(
                      "flex items-center gap-2 text-right text-xs",
                      tone === "positive" && "text-positive",
                      tone === "warning" && "text-warning",
                      tone === "muted" && "text-muted-foreground",
                      tone === "default" && "text-foreground",
                    )}
                  >
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 sm:px-7">
        <p className="font-mono text-[10px] tracking-[0.14em] text-subtle uppercase">
          Honest states · no sample prices
        </p>
        <p className="font-mono text-[10px] tracking-[0.14em] text-subtle uppercase">
          Local-first research surface
        </p>
      </div>
    </div>
  );
}
