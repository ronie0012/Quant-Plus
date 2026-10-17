import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  BellRing,
  BookText,
  Brain,
  Gauge,
  Pause,
  Play,
  Plus,
  Save,
  ShieldAlert,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardHead, EmptyState, Pill, Skeleton, SourceTag } from "@/components/app/cards";
import { MetricStrip, PageIntro, ProgressBar, Segmented } from "./workspace";
import { nifty50, stockBySymbol } from "@/data/nifty50";
import { formatINR, useAccount, useMarkedHoldings } from "@/hooks/use-dashboard-data";
import {
  useCreateAlert,
  useDeleteAlert,
  useJournal,
  useAlertDeliveries,
  usePriceAlerts,
  useRiskLimits,
  useRiskStatus,
  useSaveJournalEntry,
  useSaveRiskLimits,
  useUpdateAlert,
} from "@/hooks/use-trading-product";
import { cn } from "@/lib/utils";
import { useOrders } from "@/hooks/use-orders";
import { useStockQuote } from "@/hooks/use-agent-stock";

export function RiskPage() {
  const { data: holdings } = useMarkedHoldings();
  const { data: account } = useAccount();
  const { data: stored, isLoading } = useRiskLimits();
  const save = useSaveRiskLimits();
  const status = useRiskStatus();
  const [shock, setShock] = useState(-10);
  const [draft, setDraft] = useState(stored);
  const limits = draft ??
    stored ?? {
      daily_loss_limit: 50000,
      max_order_value: 1000000,
      max_position_pct: 25,
      confirmation_above: 500000,
      trading_paused: false,
    };
  const value = (holdings ?? []).reduce((sum, h) => sum + h.quantity * h.last_price, 0);
  const largest = Math.max(0, ...(holdings ?? []).map((h) => h.quantity * h.last_price));
  const concentration = value ? (largest / value) * 100 : 0;
  const stressLoss = (value * Math.abs(shock)) / 100;
  const limitFields: Array<
    [string, "max_order_value" | "confirmation_above" | "daily_loss_limit" | "max_position_pct"]
  > = [
    ["Maximum position (% of marked equity)", "max_position_pct"],
    ["Maximum order value", "max_order_value"],
    ["Confirm orders above", "confirmation_above"],
    ["Daily loss limit", "daily_loss_limit"],
  ];
  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Risk command centre"
        title="Know the downside first."
        body="Set hard guardrails, stress the portfolio and see where concentration can amplify losses."
        action={<SourceTag label="Private account model" />}
      >
        <MetricStrip
          items={[
            { label: "Portfolio at risk", value: formatINR(value) },
            {
              label: "Largest position",
              value: `${concentration.toFixed(1)}%`,
              tone: concentration > limits.max_position_pct ? "negative" : "positive",
            },
            { label: `${shock}% scenario`, value: `−${formatINR(stressLoss)}`, tone: "negative" },
            {
              label: "New exposure",
              value: status.data?.blocked
                ? status.data.blocked_reason === "TRADING_PAUSED"
                  ? "Paused"
                  : "Loss limit hit"
                : status.data
                  ? "Allowed"
                  : "—",
              tone: status.data?.blocked ? "warning" : "positive",
            },
          ]}
        />
      </PageIntro>
      <Card>
        <CardHead
          title="Today's loss guard"
          meta={status.data ? `Session ${status.data.session_date}` : "Server-enforced"}
        />
        {status.isLoading ? (
          <Skeleton className="m-5 h-24" />
        ) : status.isError || !status.data ? (
          <EmptyState
            title="Risk status unavailable"
            hint="The server could not compute the loss window."
            onRetry={() => void status.refetch()}
          />
        ) : (
          <div className="grid gap-px bg-border sm:grid-cols-4">
            {[
              ["Day P&L (marked)", formatINR(status.data.day_pnl), status.data.day_pnl >= 0],
              [
                "Loss used",
                `${formatINR(status.data.day_loss)} of ${formatINR(status.data.daily_loss_limit)}`,
                status.data.day_loss < status.data.daily_loss_limit,
              ],
              [
                "Start-of-day equity",
                `${formatINR(status.data.anchor_equity)} (${status.data.anchor_source.replaceAll("_", " ").toLowerCase()})`,
                true,
              ],
              ["Cash flows today", formatINR(status.data.cash_flows), true],
            ].map(([title, value, good]) => (
              <div key={String(title)} className="bg-panel p-4">
                <p className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                  {title}
                </p>
                <p className={cn("mt-2 font-mono text-sm", good ? "" : "text-negative")}>{value}</p>
              </div>
            ))}
            <p className="bg-panel p-4 text-[11px] leading-relaxed text-subtle sm:col-span-4">
              {status.data.blocked
                ? `New exposure is blocked (${status.data.blocked_reason === "TRADING_PAUSED" ? "trading paused" : "daily loss limit reached"}). Validated sells of existing holdings remain allowed.`
                : "Buys are checked against this marked loss window before acceptance and again at fill. Sells that reduce holdings are always allowed."}{" "}
              {status.data.stale_marks.length
                ? `Stale marks: ${status.data.stale_marks.join(", ")}. `
                : ""}
              {status.data.valuation_policy}
            </p>
          </div>
        )}
      </Card>
      <div className="grid items-start gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <Card glow>
          <CardHead title="Scenario laboratory" meta="Deterministic stress test" />
          <div className="p-5">
            <div className="grid gap-3 sm:grid-cols-5">
              {[-5, -10, -15, -20, -30].map((x) => (
                <Button
                  key={x}
                  variant={shock === x ? "default" : "outline"}
                  onClick={() => setShock(x)}
                >
                  {x}%
                </Button>
              ))}
            </div>
            <div className="mt-8">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Estimated portfolio impact</span>
                <span className="font-mono text-negative">−{formatINR(stressLoss)}</span>
              </div>
              <div className="mt-3">
                <ProgressBar value={Math.abs(shock) * 2.5} tone="negative" />
              </div>
            </div>
            <div className="mt-8 grid gap-px bg-border sm:grid-cols-3">
              {[
                ["Cash resilience", account?.wallet_balance ?? 0],
                ["Post-shock value", Math.max(0, value - stressLoss)],
                ["Capital buffer", Math.max(0, (account?.wallet_balance ?? 0) - stressLoss)],
              ].map(([l, v]) => (
                <div key={String(l)} className="bg-panel p-4">
                  <p className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                    {l}
                  </p>
                  <p className="mt-2 font-mono text-lg">{formatINR(Number(v))}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card>
          <CardHead title="Trading guardrails" meta="Enforced before execution" />
          {isLoading ? (
            <Skeleton className="m-5 h-48" />
          ) : (
            <div className="space-y-5 p-5">
              {limitFields.map(([label, key]) => (
                <label key={key} className="block">
                  <span className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                    {label}
                  </span>
                  <div className="mt-2 flex border border-border bg-background/30 px-3">
                    <span className="py-2.5 text-subtle">
                      {key === "max_position_pct" ? "%" : "₹"}
                    </span>
                    <input
                      type="number"
                      min="0"
                      max={key === "max_position_pct" ? 100 : undefined}
                      value={limits[key]}
                      onChange={(e) => setDraft({ ...limits, [key]: Number(e.target.value) })}
                      className="min-w-0 flex-1 bg-transparent px-2 font-mono outline-none"
                    />
                  </div>
                </label>
              ))}
              <label className="flex items-center justify-between border-t border-border pt-4">
                <span>
                  <span className="block text-sm">Pause new exposure</span>
                  <span className="mt-1 block text-[11px] text-subtle">
                    Blocks buys; validated sells that reduce holdings remain allowed
                  </span>
                </span>
                <Switch
                  checked={limits.trading_paused}
                  onCheckedChange={(v) => setDraft({ ...limits, trading_paused: v })}
                />
              </label>
              <Button
                className="w-full"
                disabled={save.isPending}
                onClick={() =>
                  void save
                    .mutateAsync(limits)
                    .then(() => toast.success("Risk limits saved"))
                    .catch((error: unknown) =>
                      toast.error(
                        error instanceof Error && error.message.includes("RISK_LIMITS_INVALID")
                          ? "Risk limits are invalid: values must be non-negative and position size at most 100%."
                          : "Risk limits could not be saved",
                      ),
                    )
                }
              >
                <ShieldAlert />
                Save guardrails
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export function AlertsPage() {
  const { data, isLoading } = usePriceAlerts();
  const create = useCreateAlert();
  const update = useUpdateAlert();
  const remove = useDeleteAlert();
  const deliveries = useAlertDeliveries();
  const [symbol, setSymbol] = useState("RELIANCE"),
    [type, setType] = useState<"PRICE_ABOVE" | "PRICE_BELOW" | "MOVE_PERCENT">("PRICE_ABOVE"),
    [threshold, setThreshold] = useState("3000");
  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Intelligent alerts"
        title="Attention, on your terms."
        body="Price and day-move triggers checked by the local server worker against fresh live quotes, even with the terminal closed. Each alert fires once until you re-arm it."
        action={<SourceTag label="Server-evaluated" />}
      >
        <MetricStrip
          items={[
            { label: "Total", value: data?.length ?? 0 },
            {
              label: "Active",
              value: data?.filter((x) => x.enabled).length ?? 0,
              tone: "positive",
            },
            {
              label: "Triggered",
              value: data?.filter((x) => x.triggered_at).length ?? 0,
              tone: "warning",
            },
            { label: "Coverage", value: new Set(data?.map((x) => x.symbol)).size },
          ]}
        />
      </PageIntro>
      <div className="grid items-start gap-5 xl:grid-cols-[.7fr_1.3fr]">
        <Card glow>
          <CardHead title="New alert" meta="Saved to your account" />
          <div className="space-y-5 p-5">
            <label className="block font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
              Instrument
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="mt-2 w-full border border-border bg-background p-3 text-foreground outline-none"
              >
                {nifty50.map((s) => (
                  <option key={s.symbol}>{s.symbol}</option>
                ))}
              </select>
            </label>
            <Segmented
              label="Alert condition"
              items={["PRICE_ABOVE", "PRICE_BELOW", "MOVE_PERCENT"] as const}
              value={type}
              onChange={setType}
            />
            <label className="block font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
              {type === "MOVE_PERCENT" ? "Absolute day move (%)" : "Price (₹)"}
              <input
                min={0}
                step={type === "MOVE_PERCENT" ? 0.1 : 0.05}
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="mt-2 w-full border border-border bg-background p-3 font-mono text-foreground outline-none"
              />
            </label>
            <Button
              className="w-full"
              disabled={create.isPending || !(Number(threshold) > 0)}
              onClick={() =>
                void create
                  .mutateAsync({
                    symbol,
                    alert_type: type,
                    threshold: Number(threshold),
                    note: "",
                    enabled: true,
                  })
                  .then(() => toast.success("Alert created"))
                  .catch((error: unknown) =>
                    toast.error(
                      error instanceof Error && error.message.includes("INVALID")
                        ? "Enter a positive threshold for a supported instrument."
                        : "Alert could not be created",
                    ),
                  )
              }
            >
              <Plus />
              Create alert
            </Button>
          </div>
        </Card>
        <Card>
          <CardHead title="Alert registry" meta="Evaluated by the server worker" />
          {isLoading ? (
            <Skeleton className="m-5 h-48" />
          ) : data?.length ? (
            <ul className="divide-y divide-border">
              {data.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 p-4">
                  <span className="grid h-9 w-9 place-items-center border border-border bg-primary/10">
                    <BellRing className="h-4 w-4 text-primary-soft" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-xs">{a.symbol}</span>
                    <span className="mt-1 block text-[11px] text-subtle">
                      {a.alert_type.replaceAll("_", " ").toLowerCase()}{" "}
                      {a.alert_type === "MOVE_PERCENT" ? `${a.threshold}%` : `₹${a.threshold}`}
                      {a.triggered_at &&
                        ` · triggered ${new Date(a.triggered_at).toLocaleString("en-IN")}`}
                    </span>
                  </span>
                  <Pill tone={a.triggered_at ? "warning" : a.enabled ? "positive" : "neutral"}>
                    {a.triggered_at ? "TRIGGERED" : a.enabled ? "ACTIVE" : "PAUSED"}
                  </Pill>
                  {a.triggered_at && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        update.mutate(
                          { id: a.id, triggered_at: null, enabled: true },
                          { onSuccess: () => toast.success(`${a.symbol} alert re-armed`) },
                        )
                      }
                    >
                      Re-arm
                    </Button>
                  )}
                  <Switch
                    checked={a.enabled}
                    onCheckedChange={(enabled) => void update.mutate({ id: a.id, enabled })}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Delete ${a.symbol} alert`}
                    onClick={() => void remove.mutate(a.id)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No alerts yet" hint="Create a price or movement trigger to begin." />
          )}
        </Card>
      </div>
      <Card>
        <CardHead title="Delivery history" meta="Every trigger with its evidence" />
        {deliveries.data?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[12px]">
              <thead>
                <tr className="border-b border-border font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                  <th className="px-5 py-2.5 font-normal">When</th>
                  <th className="px-5 py-2.5 font-normal">Alert</th>
                  <th className="px-5 py-2.5 text-right font-normal">Observed</th>
                  <th className="px-5 py-2.5 text-right font-normal">Quote time</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.data.map((d) => (
                  <tr key={d.id} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-2.5 font-mono text-[11px]">
                      {new Date(d.triggered_at).toLocaleString("en-IN")}
                    </td>
                    <td className="px-5 py-2.5">
                      {d.symbol} · {d.alert_type.replaceAll("_", " ").toLowerCase()} {d.threshold}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono">
                      ₹{d.price.toLocaleString("en-IN")}
                      {d.change_pct != null && ` (${d.change_pct.toFixed(2)}%)`}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono text-[11px] text-subtle">
                      {new Date(d.quote_provider_time).toLocaleTimeString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-6 text-[12px] text-muted-foreground">No alert has triggered yet.</p>
        )}
      </Card>
    </div>
  );
}

const OUTCOMES = ["OPEN", "WIN", "LOSS", "FLAT", "CANCELLED"] as const;
const lines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

export function JournalPage() {
  const { data, isLoading } = useJournal();
  const save = useSaveJournalEntry();
  const [selected, setSelected] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("RELIANCE");
  const [form, setForm] = useState({
    thesis: "",
    evidence: "",
    risks: "",
    invalidation: "",
    planned_exit: "",
    reflection: "",
    outcome: "OPEN" as (typeof OUTCOMES)[number],
    order_id: "",
  });
  const active = data?.find((x) => x.id === selected);
  const orders = useOrders(symbol);
  const feed = useStockQuote(symbol, !active);
  const quote = feed.quote?.symbol === symbol ? feed.quote : null;
  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));
  function reset() {
    setSelected(null);
    setSymbol("RELIANCE");
    setForm({
      thesis: "",
      evidence: "",
      risks: "",
      invalidation: "",
      planned_exit: "",
      reflection: "",
      outcome: "OPEN",
      order_id: "",
    });
  }
  const fields: Array<[keyof typeof form, string, string]> = [
    ["thesis", "Thesis", "What must be true for this trade to work?"],
    ["evidence", "Evidence (one per line)", "What you observed, with its source"],
    ["risks", "Risks (one per line)", "What could make the thesis wrong?"],
    ["invalidation", "Invalidation condition", "The observable condition that ends the thesis"],
    ["planned_exit", "Planned exit", "Target, stop and time limit you intend to respect"],
  ];
  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Decision journal"
        title="Remember the why."
        body="Capture thesis, evidence, risks, invalidation and exit plan before outcome bias takes over. New entries record the market price at the moment you wrote them; that snapshot cannot be edited later."
        action={
          <Button size="sm" onClick={reset}>
            <Plus />
            New entry
          </Button>
        }
      >
        <MetricStrip
          items={[
            { label: "Entries", value: data?.length ?? 0 },
            {
              label: "Open theses",
              value: data?.filter((x) => x.outcome === "OPEN").length ?? 0,
              tone: "primary",
            },
            {
              label: "Reviewed",
              value: data?.filter((x) => x.reflection).length ?? 0,
              tone: "positive",
            },
            {
              label: "Linked to orders",
              value: data?.filter((x) => x.order_id).length ?? 0,
            },
          ]}
        />
      </PageIntro>
      <div className="grid items-start gap-5 xl:grid-cols-[.8fr_1.2fr]">
        <Card>
          <CardHead title="Journal timeline" meta="Newest first" />
          {isLoading ? (
            <Skeleton className="m-5 h-44" />
          ) : data?.length ? (
            <ul className="divide-y divide-border">
              {data.map((entry) => (
                <li key={entry.id}>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSelected(entry.id);
                      setSymbol(entry.symbol);
                      setForm({
                        thesis: entry.thesis,
                        evidence: (entry.evidence ?? []).join("\n"),
                        risks: (entry.risks ?? []).join("\n"),
                        invalidation: entry.invalidation,
                        planned_exit: entry.planned_exit,
                        reflection: entry.reflection,
                        outcome: entry.outcome,
                        order_id: entry.order_id ?? "",
                      });
                    }}
                    className={cn(
                      "h-auto w-full justify-start rounded-none p-4 text-left",
                      selected === entry.id && "bg-primary/10",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="font-mono text-xs">{entry.symbol}</span>
                      <span className="mt-1 block truncate text-[11px] text-subtle">
                        {entry.thesis || "Untitled thesis"}
                      </span>
                      <span className="mt-1 block font-mono text-[11px] text-subtle">
                        Written {new Date(entry.created_at).toLocaleString("en-IN")}
                        {entry.order_id ? " · linked order" : ""}
                      </span>
                    </span>
                    <Pill>{entry.outcome}</Pill>
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No journal entries"
              hint="Record a thesis before your next simulated trade."
            />
          )}
        </Card>
        <Card glow>
          <CardHead
            title={active ? `Edit ${active.symbol} thesis` : "Document a decision"}
            meta={
              active
                ? `Written ${new Date(active.created_at).toLocaleString("en-IN")}`
                : "Pre-trade reasoning"
            }
          />
          <div className="grid gap-5 p-5">
            <label className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
              Instrument
              <select
                value={symbol}
                disabled={Boolean(active)}
                onChange={(e) => {
                  setSymbol(e.target.value);
                  set({ order_id: "" });
                }}
                className="mt-2 w-full border border-border bg-background p-3 text-foreground outline-none disabled:opacity-70"
              >
                {nifty50.map((s) => (
                  <option key={s.symbol}>{s.symbol}</option>
                ))}
              </select>
            </label>
            <p className="text-[11px] text-subtle">
              {active
                ? active.decision_snapshot
                  ? `Decision-time quote: ₹${active.decision_snapshot.price} (${active.decision_snapshot.source}, ${new Date(active.decision_snapshot.as_of).toLocaleString("en-IN")})`
                  : "No decision-time quote was available when this entry was written."
                : quote?.price
                  ? `Will record ₹${quote.price} (${quote.source ?? "provider"}, ${quote.as_of ? new Date(quote.as_of).toLocaleString("en-IN") : "time unknown"}) as the decision-time quote.`
                  : "No current quote; the entry will be saved without a decision-time price."}
            </p>
            {fields.map(([key, label, placeholder]) => (
              <label
                key={key}
                className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle"
              >
                {label}
                <textarea
                  value={form[key]}
                  onChange={(e) => set({ [key]: e.target.value } as Partial<typeof form>)}
                  placeholder={placeholder}
                  className="mt-2 min-h-20 w-full resize-y border border-border bg-background p-3 font-sans text-[13px] normal-case tracking-normal text-foreground outline-none placeholder:text-subtle"
                />
              </label>
            ))}
            <label className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
              Linked order
              <select
                value={form.order_id}
                onChange={(e) => set({ order_id: e.target.value })}
                className="mt-2 w-full border border-border bg-background p-3 font-sans text-[12px] normal-case tracking-normal text-foreground outline-none"
              >
                <option value="">Not linked</option>
                {(orders.data ?? []).map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.side} {order.quantity} · {order.order_type} ·{" "}
                    {order.status.toLowerCase()} ·{" "}
                    {new Date(order.created_at).toLocaleString("en-IN")}
                  </option>
                ))}
              </select>
            </label>
            {active && (
              <>
                <label className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                  Reflection
                  <textarea
                    value={form.reflection}
                    onChange={(e) => set({ reflection: e.target.value })}
                    placeholder="What happened, and what would you do differently in the process?"
                    className="mt-2 min-h-20 w-full resize-y border border-border bg-background p-3 font-sans text-[13px] normal-case tracking-normal text-foreground outline-none placeholder:text-subtle"
                  />
                </label>
                <Segmented
                  items={OUTCOMES}
                  value={form.outcome}
                  onChange={(outcome) => set({ outcome })}
                  label="Outcome"
                />
              </>
            )}
            <Button
              disabled={!form.thesis.trim() || save.isPending}
              onClick={() => {
                const entry = {
                  symbol,
                  thesis: form.thesis,
                  evidence: lines(form.evidence),
                  risks: lines(form.risks),
                  invalidation: form.invalidation,
                  planned_exit: form.planned_exit,
                  order_id: form.order_id || null,
                  ...(active
                    ? { id: active.id, reflection: form.reflection, outcome: form.outcome }
                    : {
                        decision_snapshot:
                          quote?.price && quote.as_of
                            ? {
                                price: quote.price,
                                source: String(quote.source ?? "provider"),
                                as_of: new Date(quote.as_of).toISOString(),
                                ...(quote.market_session
                                  ? { market_session: quote.market_session }
                                  : {}),
                              }
                            : null,
                      }),
                };
                void save
                  .mutateAsync(entry)
                  .then(() => {
                    toast.success("Journal entry saved");
                    reset();
                  })
                  .catch(() => toast.error("Entry could not be saved"));
              }}
            >
              <Save />
              Save entry
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
