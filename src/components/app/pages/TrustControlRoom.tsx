import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHead, Pill } from "@/components/app/cards";
import { WhyButton } from "@/components/app/evidence/WhyButton";
import { nifty50 } from "@/data/nifty50";
import { useStockQuotes } from "@/hooks/use-agent-stock";
import { useMarketNews } from "@/hooks/use-intelligence";
import { useAccount } from "@/hooks/use-dashboard-data";
import { useResearchSessions } from "@/hooks/use-quant-data";
import { agentFetch, type Prediction } from "@/lib/agent-api";
import { paperOrderFetch } from "@/lib/paper-trading";
import { workspaceRpc } from "@/lib/workspace-api";
import { workspaceAuthorization } from "@/lib/workspace-session";
import { median } from "@/lib/quant/stats";
import {
  fieldCompleteness,
  freshnessScore,
  trustScore,
  type TrustComponent,
} from "@/lib/quant/trust";
import { cn } from "@/lib/utils";

const SYMBOLS = nifty50.map((s) => s.symbol);

type WorkerStatus = {
  worker: { running: boolean; last: { at: string; quote_errors: Record<string, string> } | null };
  book: { reconciliation: string[]; worker: { heartbeat_at: string | null } };
};

/** Operational trust: live measurements, a decomposable score, and every degraded capability named. */
export function TrustControlRoom() {
  const feed = useStockQuotes(SYMBOLS);
  const news = useMarketNews();
  const research = useResearchSessions();
  const { data: account } = useAccount();
  const reconnects = useRef({ count: 0, last: feed.connected });
  const [reconnectCount, setReconnectCount] = useState(0);
  useEffect(() => {
    if (feed.connected && !reconnects.current.last) {
      reconnects.current.count += 1;
      // The first connection is not a reconnect.
      setReconnectCount(Math.max(0, reconnects.current.count - 1));
    }
    reconnects.current.last = feed.connected;
  }, [feed.connected]);

  const worker = useQuery({
    queryKey: ["source-health", "paper-worker"],
    queryFn: () => paperOrderFetch<WorkerStatus>("worker", { method: "POST" }),
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: false,
  });
  const queue = useQuery({
    queryKey: ["trust", "research-queue"],
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const names = SYMBOLS.join(",");
      const payload = (await (
        await agentFetch(`stocks/predictions?symbols=${encodeURIComponent(names)}`, { signal })
      ).json()) as {
        predictions?: Record<string, Prediction>;
      };
      return Object.values(payload.predictions ?? {});
    },
  });
  const copilot = useQuery({
    queryKey: ["trust", "copilot"],
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const response = await fetch("/api/chat", {
        headers: { Authorization: await workspaceAuthorization("Sign in") },
      });
      if (!response.ok) throw new Error(await response.text());
      return (await response.json()) as {
        configured: boolean;
        model: string;
        daily_limit: number;
        usage: { date: string; requests: number } | null;
        cost_basis: string;
      };
    },
  });
  const backup = useQuery({
    queryKey: ["trust", "backup"],
    staleTime: 300_000,
    retry: false,
    queryFn: () => workspaceRpc<{ count: number; last_backup_at: string | null }>("backup_status"),
  });

  const quotes = Object.values(feed.quotes);
  const priced = quotes.filter((q) => q.price != null && Number.isFinite(q.price));
  const now = feed.now || Date.now();
  const latencies = priced
    .map((q) =>
      q.received_at && q.as_of ? (Date.parse(q.received_at) - Date.parse(q.as_of)) / 1000 : null,
    )
    .filter((v): v is number => v != null && Number.isFinite(v) && v >= 0);
  const latency = median(latencies);
  const fresh = priced.filter((q) => !q.stale).length;
  const completeness = fieldCompleteness(priced as unknown as Record<string, unknown>[], [
    "bid",
    "ask",
    "volume",
    "bid_quantity",
    "ask_quantity",
  ]);
  const fallback = priced.filter((q) => q.source === "yahoo").length;
  const heartbeat = worker.data?.book.worker.heartbeat_at;
  const heartbeatAge = heartbeat ? (Date.now() - Date.parse(heartbeat)) / 1000 : null;
  const reconciliation = worker.data?.book.reconciliation ?? null;
  const latestResearch = research.data?.[0]?.as_of;
  const researchAge = latestResearch ? (Date.now() - Date.parse(latestResearch)) / 1000 : null;
  const running = (queue.data ?? []).filter(
    (p) => p.status === "queued" || p.status === "running",
  ).length;
  const providerStatus = news.data?.provider_status;
  const newsScore =
    providerStatus && providerStatus.queries_total > 0
      ? Math.round((providerStatus.queries_succeeded / providerStatus.queries_total) * 100)
      : news.data
        ? 50
        : null;

  const components: TrustComponent[] = [
    {
      key: "market",
      label: "Market data",
      score: priced.length
        ? Math.round(((fresh / SYMBOLS.length) * 0.7 + ((completeness ?? 0) / 100) * 0.3) * 100)
        : null,
      status: !feed.connected ? "UNAVAILABLE" : fresh < SYMBOLS.length * 0.9 ? "DEGRADED" : "OK",
      detail: `${fresh}/${SYMBOLS.length} fresh quotes · ${completeness ?? "—"}% field completeness`,
      weight: 3,
    },
    {
      key: "accounting",
      label: "Portfolio accounting",
      score: reconciliation == null ? null : reconciliation.length ? 0 : 100,
      status: reconciliation == null ? "UNAVAILABLE" : reconciliation.length ? "DEGRADED" : "OK",
      detail:
        reconciliation == null
          ? "Reconciliation unavailable"
          : reconciliation.length
            ? `${reconciliation.length} reconciliation issues`
            : "Book reconciles",
      weight: 3,
    },
    {
      key: "news",
      label: "News coverage",
      score: newsScore,
      status: newsScore == null ? "UNAVAILABLE" : newsScore < 70 ? "DEGRADED" : "OK",
      detail: providerStatus
        ? `${providerStatus.provider}: ${providerStatus.queries_succeeded}/${providerStatus.queries_total} queries succeeded`
        : "Provider status unavailable",
      weight: 1,
    },
    {
      key: "research",
      label: "Research freshness",
      score: freshnessScore(researchAge, 86_400, 7 * 86_400),
      status: researchAge == null ? "UNAVAILABLE" : researchAge > 3 * 86_400 ? "DEGRADED" : "OK",
      detail: latestResearch
        ? `Latest completed research ${new Date(latestResearch).toLocaleString("en-IN")}`
        : "No completed research",
      weight: 1,
    },
    {
      key: "copilot",
      label: "Copilot evidence",
      score: copilot.data ? (copilot.data.configured ? 100 : 0) : null,
      status: !copilot.data ? "UNAVAILABLE" : copilot.data.configured ? "OK" : "DEGRADED",
      detail: copilot.data
        ? `${copilot.data.configured ? "Configured" : "No API key"} · ${copilot.data.model}`
        : "Status unavailable",
      weight: 1,
    },
    {
      key: "worker",
      label: "Execution worker",
      score: freshnessScore(heartbeatAge, 30, 300),
      status: heartbeatAge == null ? "UNAVAILABLE" : heartbeatAge > 30 ? "DEGRADED" : "OK",
      detail: heartbeat
        ? `Heartbeat ${new Date(heartbeat).toLocaleTimeString("en-IN")}`
        : "No heartbeat",
      weight: 2,
    },
    {
      key: "options",
      label: "Options",
      score: null,
      status: "UNAVAILABLE",
      detail: "No observed option-chain adapter",
      weight: 1,
    },
    {
      key: "corporate",
      label: "Corporate-action adjustments",
      score: null,
      status: "UNAVAILABLE",
      detail: "Upcoming actions are listed; no adjustment feed",
      weight: 1,
    },
    {
      key: "flows",
      label: "FII / DII flows",
      score: null,
      status: "UNAVAILABLE",
      detail: "No institutional-flow source",
      weight: 1,
    },
  ];
  const trust = trustScore(components);

  const operations: [string, string, boolean | null][] = [
    [
      "Feed latency (median provider → server)",
      latency == null ? "—" : `${latency.toFixed(1)} s`,
      latency == null ? null : latency < 5,
    ],
    ["Symbol coverage", `${priced.length}/${SYMBOLS.length}`, priced.length === SYMBOLS.length],
    [
      "Quote freshness",
      `${fresh}/${priced.length} not stale`,
      priced.length ? fresh / priced.length >= 0.9 : null,
    ],
    [
      "Missing fields (bid, ask, sizes, volume)",
      completeness == null ? "—" : `${100 - completeness}% missing`,
      completeness == null ? null : completeness >= 80,
    ],
    ["Stream reconnects this visit", String(reconnectCount), reconnectCount < 3],
    ["Provider fallback (Yahoo instead of Fyers)", `${fallback}/${priced.length}`, fallback === 0],
    ["Provider disagreements", "Not measurable: one active provider per symbol", null],
    [
      "News source",
      providerStatus
        ? `${providerStatus.status} (${providerStatus.queries_succeeded}/${providerStatus.queries_total})`
        : "Unavailable",
      providerStatus
        ? providerStatus.status === "ok" || providerStatus.status === "available"
        : null,
    ],
    [
      "Research queue depth",
      queue.data ? `${running} queued or running` : "Unavailable",
      queue.data ? running < 5 : null,
    ],
    [
      "Copilot model",
      copilot.data
        ? `${copilot.data.model}${copilot.data.configured ? "" : " (not configured)"}`
        : "Unavailable",
      copilot.data?.configured ?? null,
    ],
    [
      "Copilot usage today",
      copilot.data?.usage
        ? `${copilot.data.usage.requests}/${copilot.data.daily_limit} requests (${copilot.data.usage.date})`
        : copilot.data
          ? `0/${copilot.data.daily_limit} requests`
          : "—",
      copilot.data?.usage ? copilot.data.usage.requests < copilot.data.daily_limit * 0.8 : null,
    ],
    ["Token cost basis", copilot.data?.cost_basis ?? "—", null],
    [
      "Worker heartbeat",
      heartbeat ? `${Math.round(heartbeatAge ?? 0)} s ago` : "None",
      heartbeatAge == null ? null : heartbeatAge < 30,
    ],
    [
      "Book reconciliation",
      reconciliation == null
        ? "Unavailable"
        : reconciliation.length
          ? `${reconciliation.length} issues`
          : "Clean",
      reconciliation == null ? null : !reconciliation.length,
    ],
    [
      "Last successful backup",
      backup.data?.last_backup_at
        ? new Date(backup.data.last_backup_at).toLocaleString("en-IN")
        : backup.isError
          ? "Not available in this mode"
          : "No backup found",
      backup.data?.last_backup_at
        ? Date.now() - Date.parse(backup.data.last_backup_at) < 7 * 86_400_000
        : false,
    ],
    [
      "Account record",
      account ? `Updated ${new Date(account.updated_at).toLocaleString("en-IN")}` : "Unavailable",
      account ? true : null,
    ],
  ];

  return (
    <div className="flex flex-col gap-5">
      <Card glow>
        <CardHead
          title="Platform Trust Score"
          meta="Decomposable · unavailable capabilities are never averaged away"
          action={
            <span className="flex items-center gap-2">
              <Pill
                tone={
                  trust.label === "TRUSTED"
                    ? "positive"
                    : trust.label === "PARTIAL"
                      ? "warning"
                      : "negative"
                }
              >
                {trust.label}
              </Pill>
              <WhyButton
                claim={{
                  id: "trust:overall",
                  label: "Platform Trust Score",
                  value: trust.overall == null ? "—" : `${trust.overall}%`,
                  statement: trust.summary,
                  observation: {
                    provider: "Live quote stream, worker, news, research and copilot status",
                    as_of: new Date(now).toISOString(),
                  },
                  calculation: {
                    formula:
                      "Weighted mean of measured components only (market data 3, accounting 3, worker 2, news 1, research 1, copilot 1); unavailable components listed separately",
                    inputs: trust.available.map((c) => ({ name: c.label, value: `${c.score}%` })),
                  },
                  page: "data-sources",
                }}
              />
            </span>
          }
        />
        <div className="grid gap-5 p-5 lg:grid-cols-[220px_1fr]">
          <div>
            <p className="font-mono text-5xl num-tabular text-primary-soft">
              {trust.overall == null ? "—" : `${trust.overall}%`}
            </p>
            <p className="mt-2 text-[11.5px] text-subtle">{trust.summary}</p>
          </div>
          <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {components.map((c) => (
              <li
                key={c.key}
                className="flex items-center justify-between gap-3 border-b border-border/60 py-1 text-[12.5px]"
                title={c.detail}
              >
                <span>
                  {c.label}
                  <span className="block text-[10.5px] text-subtle">{c.detail}</span>
                </span>
                <span
                  className={cn(
                    "font-mono",
                    c.status === "UNAVAILABLE"
                      ? "text-subtle"
                      : c.status === "DEGRADED"
                        ? "text-warning"
                        : "text-positive",
                  )}
                >
                  {c.status === "UNAVAILABLE" ? "unavailable" : `${c.score}%`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Card>
      <Card>
        <CardHead title="Operational measurements" meta="Measured in this browser session" />
        <ul className="grid gap-px bg-border sm:grid-cols-2">
          {operations.map(([label, value, ok]) => (
            <li
              key={label}
              className="flex items-center justify-between gap-3 bg-panel px-5 py-2.5 text-[12.5px]"
            >
              <span className="text-muted-foreground">{label}</span>
              <span
                className={cn(
                  "text-right font-mono text-[11.5px]",
                  ok == null ? "text-subtle" : ok ? "text-foreground" : "text-warning",
                )}
              >
                {value}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHead title="Currently degraded capabilities" />
        <ul className="space-y-1 p-5 text-[12.5px]">
          {[...trust.unavailable, ...components.filter((c) => c.status === "DEGRADED")].map((c) => (
            <li
              key={c.key}
              className={c.status === "DEGRADED" ? "text-warning" : "text-muted-foreground"}
            >
              {c.label}: {c.detail}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
