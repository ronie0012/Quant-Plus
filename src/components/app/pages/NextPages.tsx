import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardHead } from "@/components/app/cards";
import { EmptyModule, MetricStrip, PageIntro } from "@/components/app/pages/workspace";
import { Button } from "@/components/ui/button";
import { formatINR, useAccount, useMarkedHoldings } from "@/hooks/use-dashboard-data";
import { type Order } from "@/hooks/use-orders";
import { useQueryClient } from "@tanstack/react-query";
import { tradingErrorMessage } from "@/hooks/use-wallet";
import { nifty50, stockBySymbol } from "@/data/nifty50";
import { blackScholes, payoffAt, type Leg, type OptionKind } from "@/lib/options";
import { cn } from "@/lib/utils";
import { paperOrderFetch } from "@/lib/paper-trading";

const field = "h-10 border border-border bg-background px-2 text-sm";
const label = "font-medium text-[11px] uppercase tracking-[0.06em] text-subtle";

/* ---------------- Options lab ---------------- */
export function OptionsPage() {
  return (
    <EmptyModule
      title="Options unavailable"
      body="Observed option chains, verified contract rules and validated Greeks are required before this lab can be enabled."
    />
  );
}

type BasketRow = { symbol: string; qty: number; side: "BUY" | "SELL"; intent_id: string };
type LegResult = { intent_id: string; symbol: string; ok: boolean; order?: Order; error?: string };
type Preflight = {
  complete: boolean;
  available_cash_before: number;
  available_cash_after: number | null;
  quote_snapshot_note: string;
  legs: {
    intent_id: string;
    status: string;
    estimate: {
      price: number;
      filled_quantity: number;
      charges: number;
      cash_change: number;
    } | null;
    error: string | null;
  }[];
};

const legBody = (row: BasketRow) => ({
  symbol: row.symbol,
  company: stockBySymbol(row.symbol)?.company ?? row.symbol,
  side: row.side,
  order_type: "MARKET",
  quantity: row.qty,
  intent_id: row.intent_id,
});

export function BasketPage() {
  const client = useQueryClient();
  const { data: account } = useAccount();
  const [rows, setRows] = useState<BasketRow[]>(() => [
    { symbol: "RELIANCE", qty: 5, side: "BUY", intent_id: crypto.randomUUID() },
    { symbol: "HDFCBANK", qty: 10, side: "BUY", intent_id: crypto.randomUUID() },
  ]);
  const [results, setResults] = useState<Record<string, LegResult>>({});
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [running, setRunning] = useState<null | "preflight" | "execute">(null);
  // Editing a leg gives it a new intent; unchanged legs keep theirs across retries.
  const update = (i: number, patch: Partial<BasketRow>) => {
    setPreflight(null);
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch, intent_id: crypto.randomUUID() } : r)));
  };
  const pending = rows.filter((row) => !results[row.intent_id]?.ok);

  const check = async () => {
    setRunning("preflight");
    try {
      setPreflight(
        await paperOrderFetch<Preflight>("baskets/preflight", {
          method: "POST",
          body: JSON.stringify({ legs: rows.map(legBody) }),
        }),
      );
    } catch (error) {
      toast.error(tradingErrorMessage(error));
    } finally {
      setRunning(null);
    }
  };

  const execute = async () => {
    setRunning("execute");
    try {
      // Every leg is resent: settled legs replay their original result, failed ones retry.
      const response = await paperOrderFetch<{ results: LegResult[] }>("baskets", {
        method: "POST",
        body: JSON.stringify({ legs: rows.map(legBody) }),
      });
      setResults(Object.fromEntries(response.results.map((result) => [result.intent_id, result])));
      const ok = response.results.filter((result) => result.ok).length;
      if (ok === rows.length) toast.success(`Basket complete — ${ok} legs settled (simulated).`);
      else
        toast.warning(`${ok} of ${rows.length} legs settled. Failed legs can be retried safely.`);
      for (const key of [
        ["orders"],
        ["account"],
        ["holdings"],
        ["wallet-transactions"],
        ["risk-status"],
      ])
        void client.invalidateQueries({ queryKey: key });
    } catch (error) {
      toast.error(tradingErrorMessage(error));
    } finally {
      setRunning(null);
      setPreflight(null);
    }
  };

  const legStatus = (row: BasketRow) => {
    const result = results[row.intent_id];
    if (result?.ok)
      return result.order?.status === "FILLED"
        ? `Filled ${result.order.filled_quantity} @ ₹${result.order.price}`
        : `${(result.order?.status ?? "accepted").toLowerCase()} (${result.order?.filled_quantity ?? 0} filled)`;
    if (result) return tradingErrorMessage(result.error);
    const check = preflight?.legs.find((leg) => leg.intent_id === row.intent_id);
    if (!check) return "Not checked";
    if (check.status === "UNKNOWN") return `Estimate unknown: ${check.error ?? "no quote"}`;
    if (check.status === "WOULD_REJECT") return `Would reject: ${tradingErrorMessage(check.error)}`;
    if (check.status === "ALREADY_SUBMITTED") return "Already submitted";
    return check.estimate
      ? `Would ${check.status === "WOULD_FILL" ? "fill" : "rest"} ≈ ${formatINR(Math.abs(check.estimate.cash_change))} incl. ₹${check.estimate.charges} charges`
      : check.status;
  };

  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Basket orders"
        title="Many orders. One click."
        body="Legs execute independently, in order, on the server. Check the basket first for current estimates; retrying resends unchanged legs with their original intent IDs, so settled legs never repeat."
      >
        <MetricStrip
          items={[
            { label: "Legs", value: rows.length },
            {
              label: "Cash after (estimate)",
              value: preflight
                ? preflight.available_cash_after == null
                  ? "Unknown — missing quotes"
                  : formatINR(preflight.available_cash_after)
                : "Check basket",
              tone: "primary",
            },
            {
              label: "Available cash",
              value: formatINR(Number(account?.available_cash ?? account?.wallet_balance ?? 0)),
            },
            { label: "Policy", value: "Independent legs" },
          ]}
        />
      </PageIntro>
      <Card className="p-5">
        <CardHead
          title="Basket"
          action={
            <Button
              size="sm"
              variant="outline"
              disabled={running != null || rows.length >= 20}
              onClick={() => {
                setPreflight(null);
                setRows([
                  ...rows,
                  { symbol: "TCS", qty: 1, side: "BUY", intent_id: crypto.randomUUID() },
                ]);
              }}
            >
              <Plus /> Add stock
            </Button>
          }
        />
        <div className="mt-4 space-y-2">
          {rows.map((r, i) => (
            <div
              key={r.intent_id}
              className="grid grid-cols-[1fr_auto] items-center gap-2 border border-border p-2 sm:grid-cols-[1.4fr_120px_90px_1.4fr_auto]"
            >
              <select
                disabled={running != null || results[r.intent_id]?.ok}
                value={r.symbol}
                onChange={(e) => update(i, { symbol: e.target.value })}
                className={field}
                aria-label={`Leg ${i + 1} stock`}
              >
                {nifty50.map((n) => (
                  <option key={n.symbol}>{n.symbol}</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-1" role="group" aria-label={`Leg ${i + 1} side`}>
                {(["BUY", "SELL"] as const).map((sd) => (
                  <Button
                    disabled={running != null || results[r.intent_id]?.ok}
                    key={sd}
                    size="sm"
                    variant="outline"
                    aria-pressed={r.side === sd}
                    onClick={() => update(i, { side: sd })}
                    className={cn(
                      "font-mono text-[10px]",
                      r.side === sd &&
                        (sd === "BUY"
                          ? "border-positive/50 text-positive"
                          : "border-negative/50 text-negative"),
                    )}
                  >
                    {sd}
                  </Button>
                ))}
              </div>
              <input
                disabled={running != null || results[r.intent_id]?.ok}
                type="number"
                min={1}
                value={r.qty}
                onChange={(e) =>
                  update(i, { qty: Math.max(1, Math.floor(Number(e.target.value)) || 1) })
                }
                className={cn(field, "font-mono")}
                aria-label={`Leg ${i + 1} quantity`}
              />
              <span
                className={cn(
                  "font-mono text-[11px]",
                  results[r.intent_id]?.ok
                    ? "text-positive"
                    : results[r.intent_id]
                      ? "text-negative"
                      : "text-muted-foreground",
                )}
                role="status"
              >
                {legStatus(r)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove leg ${i + 1}`}
                disabled={running != null}
                onClick={() => {
                  setPreflight(null);
                  setRows(rows.filter((_, j) => j !== i));
                }}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          {rows.length === 0 && (
            <EmptyModule title="Empty basket" body="Add stocks to build your basket." />
          )}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-xs text-subtle">
            {preflight?.quote_snapshot_note ?? "Simulation only. No funds or securities will move."}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={running != null || rows.length === 0}
              onClick={() => void check()}
              className="font-mono text-xs tracking-[0.04em]"
            >
              {running === "preflight" ? "Checking…" : "Check basket"}
            </Button>
            <Button
              disabled={running != null || rows.length === 0 || pending.length === 0}
              onClick={() => void execute()}
              className="font-mono text-xs tracking-[0.04em]"
            >
              {running === "execute"
                ? "Executing…"
                : Object.keys(results).length && pending.length
                  ? `Retry ${pending.length} failed`
                  : "Execute basket"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ---------------- Portfolio X-ray ---------------- */
export function XrayPage() {
  const { data: holdings, isLoading, feed } = useMarkedHoldings();
  const rows = (holdings ?? [])
    .map((h) => {
      const s = stockBySymbol(h.symbol);
      const observed = feed.quotes[h.symbol]?.change_pct;
      const change = observed == null || !Number.isFinite(observed) ? null : observed / 100;
      const value = h.quantity * Number(h.last_price || 0);
      // A missing provider change is unknown, never a zero contribution.
      const today = change == null || change === -1 ? null : value - value / (1 + change);
      const unreal = value - h.quantity * Number(h.avg_price);
      return { h, value, today, unreal, sector: s?.sector ?? h.sector ?? "Other" };
    })
    .sort((a, b) => Math.abs(b.today ?? 0) - Math.abs(a.today ?? 0));
  const total = rows.reduce((s, r) => s + r.value, 0);
  const known = rows.filter((r): r is typeof r & { today: number } => r.today != null);
  const move = known.reduce((s, r) => s + r.today, 0);
  const maxAbs = Math.max(...known.map((r) => Math.abs(r.today)), 1);
  const top = known[0];

  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Portfolio X-ray"
        title="Why did my portfolio move today?"
        body="Each holding's contribution to today's change, based on provider marks and current-session changes."
      >
        <MetricStrip
          items={[
            { label: "Value", value: formatINR(total) },
            {
              label: "Today",
              value: known.length ? formatINR(move) : "Unknown",
              tone: move >= 0 ? "positive" : "negative",
            },
            { label: "Holdings", value: rows.length },
            { label: "Change coverage", value: `${known.length}/${rows.length} quoted` },
          ]}
        />
      </PageIntro>
      <Card className="p-5">
        <CardHead title="Contribution to today's move" />
        {isLoading ? (
          <p className="mt-4 text-sm text-subtle">Loading holdings…</p>
        ) : rows.length === 0 ? (
          <div className="mt-4">
            <EmptyModule
              title="No holdings yet"
              body="Buy a stock to see what drives your portfolio."
            />
            <Link
              to="/app/$section"
              params={{ section: "markets" }}
              className="mt-3 inline-block text-sm text-primary-soft underline"
            >
              Browse markets
            </Link>
          </div>
        ) : (
          <>
            {top && (
              <p className="mt-3 text-sm text-muted-foreground">
                <span className="text-foreground">{top.h.symbol}</span> was the biggest driver,
                contributing {formatINR(top.today)} (
                {move ? Math.round((top.today / move) * 100) : 0}% of the day's move).
              </p>
            )}
            <ul className="mt-5 space-y-3">
              {rows.map((r) => (
                <li
                  key={r.h.id}
                  className="grid grid-cols-[90px_1fr_110px] items-center gap-3 font-mono text-xs"
                >
                  <Link
                    to="/app/stocks/$symbol"
                    params={{ symbol: r.h.symbol }}
                    className="hover:text-primary-soft"
                  >
                    {r.h.symbol}
                  </Link>
                  <div className="relative h-5 bg-background/50">
                    <span className="absolute inset-y-0 left-1/2 w-px bg-border-strong" />
                    <span
                      className={cn(
                        "grow-bar absolute inset-y-0.5",
                        (r.today ?? 0) >= 0
                          ? "left-1/2 bg-positive/70"
                          : "right-1/2 bg-negative/70",
                      )}
                      style={{ width: `${(Math.abs(r.today ?? 0) / maxAbs) * 50}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      "text-right",
                      r.today == null
                        ? "text-subtle"
                        : r.today >= 0
                          ? "text-positive"
                          : "text-negative",
                    )}
                  >
                    {r.today == null ? "No quote" : formatINR(r.today)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-[11px] text-subtle">
              Unrealised P&L across holdings:{" "}
              <span
                className={
                  rows.reduce((s, r) => s + r.unreal, 0) >= 0 ? "text-positive" : "text-negative"
                }
              >
                {formatINR(rows.reduce((s, r) => s + r.unreal, 0))}
              </span>
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
