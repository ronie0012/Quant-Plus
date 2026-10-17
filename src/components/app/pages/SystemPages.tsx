import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import {
  BookMarked,
  CheckCircle2,
  ChevronRight,
  Keyboard,
  LifeBuoy,
  LockKeyhole,
  Search,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardHead, Pill } from "@/components/app/cards";
import { MetricStrip, PageIntro, ProgressBar, Segmented } from "./workspace";
import { useSession, displayNameFrom } from "@/hooks/use-session";
import { cn } from "@/lib/utils";
import { HostedAccountSetup } from "@/components/app/HostedAccountSetup";
import { WorkspaceSettings } from "@/components/app/WorkspaceSettings";
import { paperOrderFetch } from "@/lib/paper-trading";
import { agentFetch } from "@/lib/agent-api";
import { useAccount, useAnalyses } from "@/hooks/use-dashboard-data";
import {
  useSaveTradingPreferences,
  useTradingPreferences,
  type TradingPreferences,
} from "@/hooks/use-trading-product";

const DEFAULT_PREFERENCES: TradingPreferences = {
  density: "COMFORTABLE",
  calm_mode: false,
  default_order_type: "MARKET",
  default_product: "DELIVERY",
  default_quantity: 10,
  chart_type: "CANDLE",
  show_volume: true,
  notifications: { orders: true, alerts: true },
};
const notificationRows: Array<["orders" | "alerts", string, string]> = [
  ["orders", "Order and protection events", "Fills, expiries, rejections and protective exits"],
  ["alerts", "Price alerts", "Triggered price and move alerts, with a sound"],
];

/** Every control here is saved to the workspace book and read by the terminal. */
export function SettingsPage() {
  const { session } = useSession();
  const { data: stored } = useTradingPreferences();
  const save = useSaveTradingPreferences();
  const [draft, setDraft] = useState<TradingPreferences | null>(null);
  const prefs = draft ?? stored ?? DEFAULT_PREFERENCES;
  const dirty = draft != null && JSON.stringify(draft) !== JSON.stringify(stored);
  const update = (patch: Partial<TradingPreferences>) => setDraft({ ...prefs, ...patch });
  async function submit() {
    try {
      // Workspace and behaviour settings save themselves; never resend a stale copy.
      const { behavior: _behavior, workspace: _workspace, ...rest } = prefs;
      await save.mutateAsync(rest);
      setDraft(null);
      toast.success("Settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Settings could not be saved");
    }
  }
  const hosted = session?.mode === "hosted";
  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Workspace preferences"
        title="Settings"
        body="Display, notification and order-ticket defaults. Each setting is saved to your workspace book and applied across the terminal."
        status={dirty ? "Unsaved changes" : "Saved to your workspace"}
        action={
          <Button
            size="sm"
            onClick={() => void submit()}
            disabled={save.isPending || !dirty}
            className="font-medium text-[11px] uppercase tracking-[0.06em]"
          >
            {save.isPending ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </Button>
        }
      />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
        <div className="space-y-5">
          <WorkspaceSettings />
          <Card>
            <CardHead title="Profile" meta={hosted ? "Hosted account" : "Local profile"} />
            <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
              <span className="grid h-14 w-14 place-items-center border border-primary/30 bg-primary/10 text-xl text-primary-soft">
                {displayNameFrom(session).slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base">{displayNameFrom(session)}</p>
                <p className="mt-1 truncate text-[12px] text-subtle">
                  {hosted
                    ? session?.user.email
                    : "Single local profile, reachable only from this computer"}
                </p>
              </div>
              <Pill tone={hosted ? "positive" : "neutral"}>
                {hosted ? "Signed in" : "Loopback only"}
              </Pill>
            </div>
            {!hosted && (
              <label className="block border-t border-border px-5 py-4">
                <span className="text-[13px]">Your name</span>
                <input
                  type="text"
                  autoComplete="name"
                  maxLength={100}
                  value={prefs.display_name ?? ""}
                  onChange={(event) => update({ display_name: event.target.value })}
                  placeholder="Enter your name"
                  className="mt-2 h-10 w-full border border-border bg-background/30 px-3 text-sm outline-none focus:border-primary/50"
                />
                <span className="mt-2 block text-[11px] text-subtle">
                  Used in your greeting and profile. Save changes to apply.
                </span>
              </label>
            )}
          </Card>
          <Card>
            <CardHead title="Notifications" meta="Shown while the terminal is open" />
            <div className="divide-y divide-border">
              {notificationRows.map(([key, title, body]) => (
                <label key={key} className="flex cursor-pointer items-center gap-4 px-5 py-4">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px]">{title}</span>
                    <span className="mt-1 block text-[11px] text-subtle">{body}</span>
                  </span>
                  <Switch
                    checked={prefs.notifications[key] !== false}
                    onCheckedChange={(value) =>
                      update({ notifications: { ...prefs.notifications, [key]: value } })
                    }
                  />
                </label>
              ))}
            </div>
            <p className="border-t border-border px-5 py-3 text-[11px] text-subtle">
              The server keeps executing orders, protections and alerts whether or not notifications
              are shown.
            </p>
          </Card>
          <Card>
            <CardHead title="Display" meta="Density and motion" />
            <div className="divide-y divide-border">
              <label className="flex cursor-pointer items-center gap-4 px-5 py-4">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px]">Compact data rows</span>
                  <span className="mt-1 block text-[11px] text-subtle">
                    Tighter table rows to show more per screen
                  </span>
                </span>
                <Switch
                  checked={prefs.density === "COMPACT"}
                  onCheckedChange={(value) =>
                    update({ density: value ? "COMPACT" : "COMFORTABLE" })
                  }
                />
              </label>
              <label className="flex cursor-pointer items-center gap-4 px-5 py-4">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px]">Calm mode</span>
                  <span className="mt-1 block text-[11px] text-subtle">
                    Stops ambient motion and pulsing indicators (your system reduced-motion setting
                    is always honoured)
                  </span>
                </span>
                <Switch
                  checked={prefs.calm_mode}
                  onCheckedChange={(value) => update({ calm_mode: value })}
                />
              </label>
            </div>
          </Card>
        </div>
        <div className="space-y-5">
          <Card glow>
            <CardHead title="Order ticket defaults" meta="Applied when a ticket opens" />
            <div className="space-y-5 p-5">
              <div>
                <p className="mb-2 font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                  Order type
                </p>
                <Segmented
                  items={["MARKET", "LIMIT", "STOP"] as const}
                  value={prefs.default_order_type}
                  onChange={(value) => update({ default_order_type: value })}
                  label="Default order type"
                />
              </div>
              <label className="block">
                <span className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                  Quantity
                </span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={prefs.default_quantity}
                  onChange={(event) =>
                    update({
                      default_quantity: Math.max(1, Math.floor(Number(event.target.value)) || 1),
                    })
                  }
                  className="mt-2 h-10 w-full border border-border bg-background/30 px-3 font-mono text-sm outline-none focus:border-primary/50"
                />
              </label>
              <p className="text-[11px] text-subtle">
                Product: delivery equity only (the supported paper product).
              </p>
            </div>
          </Card>
          <Card>
            <CardHead title="Chart defaults" meta="Stock page chart" />
            <div className="space-y-5 p-5">
              <Segmented
                items={["CANDLE", "LINE", "AREA"] as const}
                value={prefs.chart_type}
                onChange={(value) => update({ chart_type: value })}
                label="Default chart type"
              />
              <label className="flex cursor-pointer items-center gap-4">
                <span className="min-w-0 flex-1 text-[13px]">Show volume bars</span>
                <Switch
                  checked={prefs.show_volume}
                  onCheckedChange={(value) => update({ show_volume: value })}
                />
              </label>
            </div>
          </Card>
          <Card>
            <CardHead title="Boundaries" meta="What this workspace does" />
            <div className="space-y-4 p-5">
              {[
                [
                  LockKeyhole,
                  hosted ? "Private hosted book" : "Local data",
                  hosted
                    ? "Your book is readable only by you (row-level security); only the server writes it."
                    : "Stored in .local-data on this computer; back it up with the recovery script.",
                ],
                [
                  Shield,
                  "Decision boundary",
                  "Paper trading only: no broker orders and no personalised advice",
                ],
              ].map(([Icon, title, body]) => {
                const Glyph = Icon as LucideIcon;
                return (
                  <div key={String(title)} className="flex gap-3">
                    <Glyph className="mt-0.5 h-4 w-4 text-primary-soft" />
                    <div>
                      <p className="text-[12px]">{String(title)}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-subtle">{String(body)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
      {!hosted && <HostedAccountSetup initialName={prefs.display_name ?? ""} />}
    </div>
  );
}

type Source = {
  name: string;
  type: string;
  status: string;
  coverage: string;
  freshness: string;
  health: number | null;
};
export function DataSourcesPage() {
  const fyers = useQuery({
    queryKey: ["source-health", "fyers"],
    queryFn: async ({ signal }) => (await agentFetch("fyers/status", { signal })).json(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });
  const overview = useQuery({
    queryKey: ["source-health", "market-overview"],
    queryFn: async ({ signal }) => (await agentFetch("market/overview", { signal })).json(),
    staleTime: 30_000,
    retry: false,
  });
  const sentiment = useQuery({
    queryKey: ["source-health", "sentiment"],
    queryFn: async ({ signal }) => (await agentFetch("market/sentiment", { signal })).json(),
    staleTime: 45_000,
    retry: false,
  });
  const { data: account } = useAccount();
  const { data: analyses } = useAnalyses();
  const worker = useQuery({
    queryKey: ["source-health", "paper-worker"],
    queryFn: () =>
      paperOrderFetch<{
        worker: {
          running: boolean;
          last: {
            at: string;
            skipped: boolean;
            reason?: string;
            quote_errors: Record<string, string>;
          } | null;
        };
        book: { reconciliation: string[]; worker: { heartbeat_at: string | null } };
      }>("worker", { method: "POST" }),
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: false,
  });
  const heartbeat = worker.data?.book.worker.heartbeat_at;
  const workerFresh = heartbeat ? Date.now() - Date.parse(heartbeat) < 30_000 : false;
  const overviewItems =
    (overview.data as { instruments?: { value?: number | null }[] } | undefined)?.instruments ?? [];
  const liveCount = overviewItems.filter((item) => item.value != null).length;
  const sources: Source[] = [
    {
      name: "Market instruments",
      type: "Market data",
      status: liveCount ? "Connected" : "Unavailable",
      coverage: `${liveCount}/${overviewItems.length || 4} provider indices`,
      freshness: overview.data?.updated_at ? "Provider snapshot" : "Awaiting response",
      health: overviewItems.length ? Math.round((liveCount / overviewItems.length) * 100) : 0,
    },
    {
      name: "Market intelligence",
      type: "News + sentiment",
      status: sentiment.data ? "Connected" : sentiment.isError ? "Degraded" : "Checking",
      coverage: sentiment.data
        ? `${sentiment.data.data_quality ?? "quality unavailable"} data`
        : "Market sentiment",
      freshness: sentiment.data?.updated_at ? "Provider timestamp" : "Awaiting response",
      health: null,
    },
    {
      name: "Portfolio ledger",
      type: "Private account",
      status: account ? "Connected" : "Unavailable",
      coverage: account ? "Authenticated paper account" : "Account unavailable",
      freshness: account?.updated_at ? "Updated on settlement" : "Awaiting account",
      health: null,
    },
    {
      name: "Paper execution worker",
      type: "Server process",
      status: workerFresh ? "Connected" : worker.isError ? "Degraded" : "Unavailable",
      coverage: worker.data
        ? worker.data.book.reconciliation.length
          ? `Book reconciliation issues: ${worker.data.book.reconciliation.length}`
          : `Book reconciles · ${Object.keys(worker.data.worker.last?.quote_errors ?? {}).length} quote errors last tick`
        : "Resting orders, protections, alerts, expiry",
      freshness: heartbeat
        ? `Heartbeat ${new Date(heartbeat).toLocaleTimeString("en-IN")}`
        : "No heartbeat",
      health: null,
    },
    {
      name: "Committee analyses",
      type: "CodeCraft research",
      status: analyses ? "Connected" : "Unavailable",
      coverage: analyses ? `${analyses.length} stored analyses` : "Research sessions",
      freshness: "On request",
      health: null,
    },
    {
      name: "Broker account",
      type: "Execution",
      status: "Paper only",
      coverage: "No live orders enabled",
      freshness: "Intentional boundary",
      health: null,
    },
    {
      name: "Options surface",
      type: "Derivatives",
      status: "Unavailable",
      coverage: "No live option-chain adapter",
      freshness: "No observed option chain",
      health: null,
    },
  ];
  const [selectedName, setSelectedName] = useState("Market instruments");
  const selected = sources.find((source) => source.name === selectedName) ?? sources[0]!;
  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Data provenance"
        title="Data sources"
        body="Know what is connected, how fresh it is, and which parts of the workspace are unavailable."
        status={
          fyers.data?.authenticated
            ? "Fyers connected · paper only"
            : "Fyers sign-in required · paper only"
        }
      >
        <MetricStrip
          items={[
            {
              label: "Available sources",
              value: sources.filter((s) => s.status === "Connected").length,
              tone: "positive",
            },
            { label: "Private sources", value: account ? 2 : 0, tone: "primary" },
            { label: "External brokers", value: 0, tone: "warning" },
            {
              label: "Overall health",
              value: sources.some((source) => source.status === "Unavailable")
                ? "Degraded"
                : "Operational",
              tone: sources.some((source) => source.status === "Unavailable")
                ? "warning"
                : "positive",
            },
          ]}
        />
      </PageIntro>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <Card>
          <CardHead title="Source registry" meta="Coverage and availability" />
          <div className="divide-y divide-border">
            {sources.map((s, i) => (
              <button
                key={s.name}
                onClick={() => setSelectedName(s.name)}
                className={cn(
                  "dash-rise grid w-full gap-3 px-5 py-4 text-left transition-colors hover:bg-panel-elevated/60 sm:grid-cols-[1.2fr_.7fr_.65fr_24px] sm:items-center",
                  selected.name === s.name && "bg-primary/10",
                )}
                style={{ ["--d" as string]: `${i * 60}ms` }}
              >
                <span>
                  <span className="block text-[13px]">{s.name}</span>
                  <span className="mt-1 block font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                    {s.type}
                  </span>
                </span>
                <Pill
                  tone={
                    s.status === "Connected"
                      ? "positive"
                      : s.status === "Simulated"
                        ? "primary"
                        : "neutral"
                  }
                >
                  {s.status}
                </Pill>
                <span className="font-mono text-[11px] text-subtle">{s.freshness}</span>
                <ChevronRight className="hidden h-3.5 w-3.5 text-subtle sm:block" />
              </button>
            ))}
          </div>
        </Card>
        <Card glow className="h-fit xl:sticky xl:top-[88px]">
          <CardHead title={selected.name} meta="Source inspector" />
          <div className="p-5">
            <div
              className="relative mx-auto grid h-36 w-36 place-items-center rounded-full"
              style={{
                background: `conic-gradient(var(--color-primary) ${(selected.health ?? 0) * 3.6}deg,var(--color-border) 0)`,
              }}
            >
              <div className="grid h-28 w-28 place-items-center rounded-full bg-panel">
                <div className="text-center">
                  <p className="font-mono text-3xl">{selected.health ?? "Unmeasured"}</p>
                  <p className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                    quote coverage
                  </p>
                </div>
              </div>
            </div>
            <dl className="mt-7 space-y-4">
              {[
                ["Status", selected.status],
                ["Coverage", selected.coverage],
                ["Freshness", selected.freshness],
                [
                  "Access",
                  selected.type === "Private account" || selected.type === "AI output"
                    ? "Authenticated"
                    : "Workspace-wide",
                ],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between gap-4 border-b border-border pb-3">
                  <dt className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                    {l}
                  </dt>
                  <dd className="text-right text-[11px]">{v}</dd>
                </div>
              ))}
            </dl>
            {selected.health === 0 && (
              <Button
                variant="outline"
                disabled
                className="mt-5 w-full font-medium text-[11px] uppercase tracking-[0.06em]"
              >
                Integration unavailable
              </Button>
            )}
            <p className="mt-5 text-[10px] leading-relaxed text-subtle">
              Quote coverage counts returned provider values; other source health is unmeasured.
              Paper execution is intentionally isolated from broker order placement; unavailable
              fields are not synthesized.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

const faqs = [
  {
    q: "Are the prices and portfolio values live?",
    a: "Quotes come from the connected provider and are labelled live, closed-session, delayed or unavailable. Holdings are valued at their latest provider mark with its time; a missing quote is shown as unknown, never as zero. Paper fills require a fresh live Fyers quote during an open NSE session.",
  },
  {
    q: "How does paper execution work?",
    a: "The server fetches the quote, checks risk, and settles in whole paise. Buys fill at the observed ask (sells at the bid) when a valid spread exists, otherwise at the last trade. Market orders fill only the observed size; the rest is cancelled. Limit and stop orders reserve cash or shares and are checked by the server worker every few seconds, even with this tab closed. DAY orders expire at the session close.",
  },
  {
    q: "Which charges are deducted?",
    a: "Each fill debits STT, the NSE transaction charge, SEBI fee, stamp duty on buys and GST, from a dated schedule. Brokerage and depository charges are assumed zero and labelled as broker assumptions. The order audit trail lists every item.",
  },
  {
    q: "What does the daily loss limit measure?",
    a: "Start-of-session equity plus the day's deposits and withdrawals, minus current marked equity. Unrealised drops count and deposits cannot hide a loss. When the limit or a pause is active, new buys are blocked while sells of existing holdings stay allowed.",
  },
  {
    q: "Does a committee verdict or Quant AI recommend a trade?",
    a: "No. Research verdicts and opinion scores are educational and uncalibrated; they are not probabilities and do not constitute personalised investment advice. Neither the research agents nor Quant AI can place, change or cancel orders.",
  },
  {
    q: "What does Quant AI use as context?",
    a: "Read-only tools: provider quotes and history-derived facts, news tone, saved research, and your paper account, holdings, risk window, orders and journal. Answers cite evidence IDs, and an evidence check flags any figure that is not in the supplied data.",
  },
  {
    q: "Where are my records kept?",
    a: "In this local build, one local profile is stored in .local-data/workspace.json on this computer and is reachable only from localhost; it is not multi-user authentication. Hosted accounts on InsForge are available only when they are explicitly configured.",
  },
  {
    q: "Which keyboard shortcuts exist?",
    a: "Ctrl/Cmd+K or / opens search, B or S opens a buy or sell ticket (for the current stock on a stock page), 1–9 jump to dashboard, markets, portfolio, orders, wallet, alerts, screener, risk and basket, ? shows shortcuts, and Esc closes dialogs. Arrow keys move the chart crosshair.",
  },
];
const helpCards: Array<[LucideIcon, string, string, string]> = [
  [BookMarked, "Getting started", "Navigate markets, portfolio and research", "paper"],
  [Keyboard, "Keyboard & workflow", "Search quickly and review efficiently", "keyboard"],
  [Shield, "Risk & disclosure", "Understand analytical boundaries", "advice"],
];
export function HelpPage() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => faqs.filter((f) => (f.q + f.a).toLowerCase().includes(query.toLowerCase())),
    [query],
  );
  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Product guidance"
        title="Help centre"
        body="Understand the workspace, its analytical boundaries and the fastest path through common workflows."
        status="Self-service guidance"
      >
        <label className="mt-1 flex max-w-2xl items-center gap-3 rounded-md border border-border bg-background/40 px-4 py-3 focus-within:border-primary/50">
          <Search className="h-4 w-4 text-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search help and common questions"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle"
          />
        </label>
      </PageIntro>
      <div className="grid gap-5 lg:grid-cols-3">
        {helpCards.map(([Icon, title, body, topic], i) => (
          <Card key={String(title)} delay={120 + i * 80}>
            <div className="p-5">
              <span className="grid h-10 w-10 place-items-center border border-border bg-primary/10 text-primary-soft">
                <Icon className="h-4 w-4" />
              </span>
              <h2 className="mt-5 text-base">{title}</h2>
              <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{body}</p>
              <Button
                variant="ghost"
                onClick={() => setQuery(topic)}
                className="mt-5 h-auto p-0 font-medium text-[11px] uppercase tracking-[0.06em] text-primary-soft"
              >
                Show related answers
                <ChevronRight />
              </Button>
            </div>
          </Card>
        ))}
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,.6fr)]">
        <Card>
          <CardHead title="Common questions" meta={`${filtered.length} answers`} />
          <div className="px-5">
            <Accordion type="single" collapsible>
              {filtered.map((f, i) => (
                <AccordionItem key={f.q} value={`q-${i}`} className="border-border">
                  <AccordionTrigger className="text-[13px] hover:no-underline">
                    {f.q}
                  </AccordionTrigger>
                  <AccordionContent className="max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
                    {f.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </Card>
        <div className="space-y-5">
          <Card glow>
            <CardHead title="Workflow shortcuts" meta="Fast paths" />
            <div className="divide-y divide-border">
              {[
                ["/", "Search the terminal"],
                ["Markets", "Inspect regime"],
                ["Committee", "Review disagreement"],
                ["Quant AI", "Ask in plain language"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center gap-3 px-5 py-3">
                  <kbd className="min-w-14 border border-border bg-background/40 px-2 py-1 text-center font-mono text-[11px] text-primary-soft">
                    {k}
                  </kbd>
                  <span className="text-[11px] text-muted-foreground">{v}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHead title="Need more help?" meta="Support" />
            <div className="p-5">
              <LifeBuoy className="h-5 w-5 text-primary-soft" />
              <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
                A direct support channel has not been configured yet. Use the in-product guidance
                while support access is prepared.
              </p>
              <Button
                variant="outline"
                disabled
                className="mt-5 w-full font-medium text-[11px] uppercase tracking-[0.06em]"
              >
                Support coming soon
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
