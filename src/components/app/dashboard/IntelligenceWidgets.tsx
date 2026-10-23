import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, LayoutGrid } from "lucide-react";
import { Card, CardHead, Pill, Skeleton } from "@/components/app/cards";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useJournal } from "@/hooks/use-trading-product";
import { useMarkedHoldings } from "@/hooks/use-dashboard-data";
import { exchangeDay, useCalendar, useIndexBars } from "@/hooks/use-quant-data";
import {
  DASHBOARD_PANELS,
  MODE_LABELS,
  MODE_LAYOUTS,
  useWorkspacePrefs,
  type PanelId,
} from "@/hooks/use-workspace-prefs";
import type { WorkspaceMode } from "@/hooks/use-trading-product";
import { planReadiness } from "@/lib/quant/decision-plan";
import { EVENT_LABELS, calendarEvents, expiryEvents } from "@/lib/quant/events";
import { analogSentence, featureHistory, findAnalogs } from "@/lib/quant/regime";
import { useQuery } from "@tanstack/react-query";
import { paperOrderFetch } from "@/lib/paper-trading";
import { useStockQuotes } from "@/hooks/use-agent-stock";
import { toast } from "sonner";

export function PlansWidget() {
  const { data, isLoading } = useJournal();
  const open = (data ?? [])
    .filter((e) => e.outcome === "OPEN" && e.plan?.decision !== "NO_TRADE")
    .slice(0, 6);
  return (
    <Card>
      <CardHead
        title="Open decision plans"
        meta="Readiness before trading"
        action={
          <Link
            to="/app/$section"
            params={{ section: "journal" }}
            className="text-[11px] text-primary-soft"
          >
            All plans
          </Link>
        }
      />
      {isLoading ? (
        <Skeleton className="m-5 h-24" />
      ) : open.length ? (
        <ul className="divide-y divide-border">
          {open.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between gap-3 px-5 py-2.5 text-[12.5px]"
            >
              <span className="min-w-0">
                <span className="font-mono">{e.symbol}</span>{" "}
                <span className="text-subtle">{e.thesis.slice(0, 50)}</span>
              </span>
              <Pill tone={planReadiness(e).ready ? "positive" : "warning"}>
                {planReadiness(e).score}%
              </Pill>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-6 text-[12.5px] text-muted-foreground">
          No open plans. Write one before the next trade.
        </p>
      )}
    </Card>
  );
}

export function EventsWidget() {
  const calendar = useCalendar();
  const { data: holdings } = useMarkedHoldings();
  const held = new Set((holdings ?? []).map((h) => h.symbol));
  const now = Date.now();
  const events = [
    ...calendarEvents(
      calendar.data?.events ?? [],
      calendar.data?.fetched_at ?? new Date().toISOString(),
    ),
    ...expiryEvents(now, 2, exchangeDay),
  ]
    .filter((e) => Date.parse(e.event_at) >= now - 86_400_000)
    .sort(
      (a, b) =>
        Number(Boolean(b.symbol && held.has(b.symbol))) -
          Number(Boolean(a.symbol && held.has(a.symbol))) || a.event_at.localeCompare(b.event_at),
    )
    .slice(0, 6);
  return (
    <Card>
      <CardHead
        title="Event radar"
        meta="Holdings first"
        action={
          <Link
            to="/app/$section"
            params={{ section: "events" }}
            className="text-[11px] text-primary-soft"
          >
            Radar
          </Link>
        }
      />
      <ul className="divide-y divide-border">
        {events.map((e) => (
          <li key={e.id} className="px-5 py-2.5 text-[12px]">
            <span className="flex items-center gap-2">
              <Pill tone={e.symbol && held.has(e.symbol) ? "warning" : "neutral"}>
                {EVENT_LABELS[e.kind]}
              </Pill>
              <span className="truncate">{e.title}</span>
            </span>
            <span className="mt-0.5 block font-mono text-[11px] text-subtle">
              {new Date(e.event_at).toLocaleDateString("en-IN")} · {e.source}
            </span>
          </li>
        ))}
        {!events.length && (
          <li className="px-5 py-6 text-[12.5px] text-muted-foreground">
            No upcoming events from connected sources.
          </li>
        )}
      </ul>
    </Card>
  );
}

export function RegimeWidget() {
  const nifty = useIndexBars("NIFTY");
  const vix = useIndexBars("VIX");
  const bank = useIndexBars("BANK");
  const sentence = useMemo(() => {
    const bars = nifty.data?.candles ?? [];
    const rows = featureHistory(bars, bank.data?.candles, vix.data?.candles);
    return analogSentence(findAnalogs(bars, rows, { k: 14, horizon: 5 }));
  }, [nifty.data, bank.data, vix.data]);
  return (
    <Card>
      <CardHead
        title="Market regime"
        meta="Analogs, as a range"
        action={
          <Link
            to="/app/$section"
            params={{ section: "regime" }}
            className="text-[11px] text-primary-soft"
          >
            Map
          </Link>
        }
      />
      <p className="px-5 py-4 text-[12.5px] leading-relaxed text-muted-foreground">
        {nifty.isLoading ? "Loading index history…" : sentence}
      </p>
    </Card>
  );
}

/** Lightweight trust summary; the full control room lives on the Trust page. */
export function TrustWidget() {
  const feed = useStockQuotes(["RELIANCE", "HDFCBANK", "TCS", "INFY", "ICICIBANK"]);
  const worker = useQuery({
    queryKey: ["source-health", "paper-worker"],
    queryFn: () =>
      paperOrderFetch<{
        book: { reconciliation: string[]; worker: { heartbeat_at: string | null } };
      }>("worker", { method: "POST" }),
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: false,
  });
  const fresh = Object.values(feed.quotes).filter((q) => q.price != null && !q.stale).length;
  const heartbeat = worker.data?.book.worker.heartbeat_at;
  const rows: [string, string, boolean | null][] = [
    [
      "Quote stream",
      feed.connected ? `${fresh}/5 sample quotes fresh` : "Disconnected",
      feed.connected ? fresh >= 4 : false,
    ],
    [
      "Book reconciliation",
      worker.data
        ? worker.data.book.reconciliation.length
          ? `${worker.data.book.reconciliation.length} issues`
          : "Clean"
        : "Unavailable",
      worker.data ? !worker.data.book.reconciliation.length : null,
    ],
    [
      "Worker heartbeat",
      heartbeat ? `${Math.round((Date.now() - Date.parse(heartbeat)) / 1000)} s ago` : "None",
      heartbeat ? Date.now() - Date.parse(heartbeat) < 30_000 : false,
    ],
    ["Options", "Unavailable", null],
  ];
  return (
    <Card>
      <CardHead
        title="Platform trust"
        meta="Never hidden behind one green light"
        action={
          <Link
            to="/app/$section"
            params={{ section: "data-sources" }}
            className="text-[11px] text-primary-soft"
          >
            Control room
          </Link>
        }
      />
      <ul className="divide-y divide-border">
        {rows.map(([label, value, ok]) => (
          <li key={label} className="flex justify-between gap-3 px-5 py-2.5 text-[12px]">
            <span className="text-muted-foreground">{label}</span>
            <span className={ok == null ? "text-subtle" : ok ? "text-positive" : "text-warning"}>
              {value}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Choose a saved layout mode or customise panels and their order. */
export function DashboardCustomizer() {
  const { workspace, panels, save } = useWorkspacePrefs();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PanelId[]>(panels);
  const [mode, setMode] = useState<WorkspaceMode>(workspace.mode);
  const move = (index: number, delta: number) => {
    const next = [...draft];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item!);
    setDraft(next);
    setMode("CUSTOM");
  };
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setDraft(panels);
          setMode(workspace.mode);
          setOpen(true);
        }}
      >
        <LayoutGrid /> Layout · {MODE_LABELS[workspace.mode]}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Dashboard layout</DialogTitle>
            <DialogDescription>
              Pick a saved layout for how you work, or customise panels and order.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(MODE_LAYOUTS) as (keyof typeof MODE_LAYOUTS)[]).map((m) => (
              <Button
                key={m}
                size="sm"
                variant={mode === m ? "secondary" : "outline"}
                onClick={() => {
                  setMode(m);
                  setDraft(MODE_LAYOUTS[m]);
                }}
              >
                {MODE_LABELS[m]}
              </Button>
            ))}
            <Button
              size="sm"
              variant={mode === "CUSTOM" ? "secondary" : "outline"}
              onClick={() => setMode("CUSTOM")}
            >
              Custom
            </Button>
          </div>
          <ul className="mt-2 space-y-1">
            {draft.map((id, i) => (
              <li
                key={id}
                className="flex items-center justify-between gap-2 border border-border px-3 py-1.5 text-[13px]"
              >
                {DASHBOARD_PANELS.find((p) => p.id === id)?.label}
                <span className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Move ${DASHBOARD_PANELS.find((p) => p.id === id)?.label ?? id} up`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Move ${DASHBOARD_PANELS.find((p) => p.id === id)?.label ?? id} down`}
                    disabled={i === draft.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDraft(draft.filter((p) => p !== id));
                      setMode("CUSTOM");
                    }}
                  >
                    Hide
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          {DASHBOARD_PANELS.some((p) => !draft.includes(p.id)) && (
            <div className="mt-2">
              <p className="text-xs text-subtle">Hidden panels</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {DASHBOARD_PANELS.filter((p) => !draft.includes(p.id)).map((p) => (
                  <Button
                    key={p.id}
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDraft([...draft, p.id]);
                      setMode("CUSTOM");
                    }}
                  >
                    + {p.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <Button
            className="mt-3"
            disabled={save.isPending}
            onClick={() =>
              save.mutate(
                { mode, panels: mode === "CUSTOM" ? draft : [] },
                {
                  onSuccess: () => setOpen(false),
                  onError: () => toast.error("Dashboard layout could not be saved"),
                },
              )
            }
          >
            Save layout
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
