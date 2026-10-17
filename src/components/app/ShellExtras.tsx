import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CloudOff, Crosshair, ShieldCheck } from "lucide-react";
import { useAccount, useAnalyses, useMarkedHoldings, formatINR } from "@/hooks/use-dashboard-data";
import { useJournal } from "@/hooks/use-trading-product";
import { useWorkspacePrefs } from "@/hooks/use-workspace-prefs";
import { cn } from "@/lib/utils";

const SNAPSHOT_KEY = "qp:offline-snapshot:v1";

type Snapshot = {
  saved_at: string;
  verified: boolean;
  cash: number | null;
  holdings: { symbol: string; quantity: number; price: number; marked_at: string | null }[];
  plans: { symbol: string; thesis: string; outcome: string }[];
  research: { symbol: string; verdict: string; created_at: string }[];
};

/** Registers the shell service worker in production builds only. */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* registration is best-effort */
    });
  }, []);
  return null;
}

/** Applies low-bandwidth query defaults: no refetch on focus or reconnect bursts. */
export function BandwidthPolicy() {
  const client = useQueryClient();
  const { workspace } = useWorkspacePrefs();
  useEffect(() => {
    const queries = client.getDefaultOptions().queries ?? {};
    client.setDefaultOptions({
      ...client.getDefaultOptions(),
      queries: {
        ...queries,
        refetchOnWindowFocus: !workspace.low_bandwidth,
        refetchOnReconnect: !workspace.low_bandwidth,
      },
    });
  }, [client, workspace.low_bandwidth]);
  return null;
}

/**
 * Saves the last verified portfolio and research state while online and shows
 * it, clearly dated, when the browser is offline.
 */
export function OfflineSnapshot() {
  const { data: holdings } = useMarkedHoldings();
  const { data: account } = useAccount();
  const { data: journal } = useJournal();
  const { data: analyses } = useAnalyses();
  const [online, setOnline] = useState(true);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => {
      setOnline(false);
      setOpen(true);
      try {
        const raw = localStorage.getItem(SNAPSHOT_KEY);
        setSnapshot(raw ? (JSON.parse(raw) as Snapshot) : null);
      } catch {
        setSnapshot(null);
      }
    };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    if (!navigator.onLine) off();
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (!online || !holdings || !account) return;
    // "Verified" means every holding is marked by a fresh provider quote.
    const verified = holdings.every((h) => !h.quote_stale && !h.quote_missing);
    const next: Snapshot = {
      saved_at: new Date().toISOString(),
      verified,
      cash: Number(account.available_cash ?? account.wallet_balance ?? 0),
      holdings: holdings.map((h) => ({
        symbol: h.symbol,
        quantity: h.quantity,
        price: Number(h.last_price),
        marked_at: h.quote_as_of ?? h.marked_at ?? null,
      })),
      plans: (journal ?? [])
        .slice(0, 10)
        .map((e) => ({ symbol: e.symbol, thesis: e.thesis.slice(0, 160), outcome: e.outcome })),
      research: (analyses ?? [])
        .slice(0, 10)
        .map((a) => ({ symbol: a.symbol, verdict: a.verdict, created_at: a.created_at })),
    };
    try {
      const previous = localStorage.getItem(SNAPSHOT_KEY);
      const prior = previous ? (JSON.parse(previous) as Snapshot) : null;
      // Never replace a verified snapshot with an unverified one.
      if (verified || !prior?.verified) localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }, [online, holdings, account, journal, analyses]);

  if (online) return null;
  return (
    <aside
      role="status"
      className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-2xl rounded-lg border border-warning/50 bg-panel p-4 shadow-2xl"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left text-[13px] text-warning"
      >
        <CloudOff className="h-4 w-4" /> Offline. Showing the last{" "}
        {snapshot?.verified ? "verified" : "saved"} state
        {snapshot
          ? ` from ${new Date(snapshot.saved_at).toLocaleString("en-IN")}`
          : ": none saved yet"}
        .
      </button>
      {open && snapshot && (
        <div className="mt-3 grid max-h-64 gap-3 overflow-y-auto text-[12px] sm:grid-cols-2">
          <div>
            <p className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
              Portfolio
            </p>
            <p className="mt-1">Cash {snapshot.cash == null ? "—" : formatINR(snapshot.cash)}</p>
            <ul className="mt-1 space-y-0.5 font-mono text-[11px]">
              {snapshot.holdings.map((h) => (
                <li key={h.symbol}>
                  {h.symbol} {h.quantity} @ ₹{h.price}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
              Plans and research
            </p>
            <ul className="mt-1 space-y-0.5 text-[11px]">
              {snapshot.plans.map((p, i) => (
                <li key={`${p.symbol}-${i}`}>
                  {p.symbol} · {p.outcome} · {p.thesis}
                </li>
              ))}
              {snapshot.research.map((r, i) => (
                <li key={`${r.symbol}-r-${i}`}>
                  {r.symbol} committee {r.verdict} (
                  {new Date(r.created_at).toLocaleDateString("en-IN")})
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[10.5px] text-subtle sm:col-span-2">
            Read-only. Trading and new data resume when the connection returns.
          </p>
        </div>
      )}
    </aside>
  );
}

/** Focus and review mode toggles for the top bar. */
export function ModeToggles() {
  const { workspace, save } = useWorkspacePrefs();
  const toggles = [
    {
      key: "focus_mode" as const,
      label: "Focus",
      icon: Crosshair,
      on: workspace.focus_mode,
      title: "Focus mode hides non-essential panels (F)",
    },
    {
      key: "review_mode" as const,
      label: "Review",
      icon: ShieldCheck,
      on: workspace.review_mode,
      title: "Review mode blocks new entries until a decision plan is complete (V)",
    },
  ];
  return (
    <span className="hidden items-center gap-1 md:flex">
      {toggles.map(({ key, label, icon: Icon, on, title }) => (
        <button
          key={key}
          type="button"
          title={title}
          aria-pressed={on}
          onClick={() => save.mutate({ [key]: !on })}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors",
            on
              ? "border-primary/60 bg-primary/10 text-primary-soft"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
        </button>
      ))}
    </span>
  );
}
