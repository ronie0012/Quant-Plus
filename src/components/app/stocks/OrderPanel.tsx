import { useEffect, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Check, Loader2 } from "lucide-react";
import { Card, CardHead, Pill } from "@/components/app/cards";
import { Button } from "@/components/ui/button";
import { formatINR, formatNum, useAccount, useHoldings } from "@/hooks/use-dashboard-data";
import { tradingErrorMessage } from "@/hooks/use-wallet";
import {
  useJournal,
  useRiskLimits,
  useSaveJournalEntry,
  useTradingPreferences,
} from "@/hooks/use-trading-product";
import { Link } from "@tanstack/react-router";
import { RiskPreviewPanel } from "@/components/app/risk/RiskPreviewPanel";
import { useTradeGuard } from "@/hooks/use-trade-guard";
import { planReadiness } from "@/lib/quant/decision-plan";
import {
  useOrders,
  usePlaceOrder,
  useUpdateOrder,
  type OrderSide,
  type OrderType,
} from "@/hooks/use-orders";
import type { Nifty50Stock } from "@/data/nifty50";
import { cn } from "@/lib/utils";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useSession } from "@/hooks/use-session";

const orderTypes: OrderType[] = ["MARKET", "LIMIT", "STOP"];

/** Buy / sell ticket plus the account's own order book for one instrument. */
export function OrderPanel({
  stock,
  quoteError = null,
  marketClosed = false,
  practiceQuoteError = null,
}: {
  stock: Nifty50Stock;
  quoteError?: string | null;
  marketClosed?: boolean;
  practiceQuoteError?: string | null;
}) {
  const [side, setSide] = useState<OrderSide>("BUY");
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [quantity, setQuantity] = useState(10);
  const [triggerPrice, setTriggerPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [target, setTarget] = useState("");
  const [placed, setPlaced] = useState<{ id: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [holdingDays, setHoldingDays] = useState("");
  const [planId, setPlanId] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [whyDifferent, setWhyDifferent] = useState("");
  const online = useOnlineStatus();
  const { session } = useSession();
  // One intent per distinct ticket: a retry after a lost response replays, never duplicates.
  const intent = useRef<{ key: string; id: string } | null>(null);
  const { data: limits } = useRiskLimits();
  const { data: preferences } = useTradingPreferences();
  // Closed-session practice: explicit, market-only, settled in the separate practice book.
  const [practice, setPractice] = useState(false);
  const practiceEnabled = session?.mode === "local";
  const practising = practiceEnabled && practice && marketClosed;
  const activeQuoteError = practising ? practiceQuoteError : quoteError;
  // Apply the saved ticket defaults once they load, unless the user already changed them.
  const touched = useRef(false);
  useEffect(() => {
    if (!preferences || touched.current) return;
    setOrderType(preferences.default_order_type);
    setQuantity(preferences.default_quantity);
  }, [preferences]);

  const { data: orders } = useOrders(stock.symbol);
  const { data: account } = useAccount();
  const { data: holdings } = useHoldings();
  const place = usePlaceOrder();
  const update = useUpdateOrder();
  const { data: journal } = useJournal();
  const saveJournal = useSaveJournalEntry();
  // Plans for this instrument that have not yet produced an order.
  const openPlans = (journal ?? []).filter(
    (entry) =>
      entry.symbol === stock.symbol && !entry.order_id && entry.plan?.decision !== "NO_TRADE",
  );

  const limitValue = Number(triggerPrice);
  const execPrice = orderType === "MARKET" ? stock.price : limitValue;
  const estimate = (execPrice ?? 0) * quantity;
  const walletBalance = Number(account?.wallet_balance ?? 0);
  const holding = holdings?.find((item) => item.symbol === stock.symbol);
  const position = {
    qty: Number(holding?.quantity ?? 0),
    avgPrice: Number(holding?.avg_price ?? 0),
  };
  const validQuantity = Number.isSafeInteger(quantity) && quantity > 0;
  const validPrice = execPrice != null && Number.isFinite(execPrice) && execPrice > 0;
  // Unrealised P&L needs an observed price; without one it is unknown, not zero.
  const pnl =
    position.qty && stock.price != null ? (stock.price - position.avgPrice) * position.qty : null;

  const needsConfirmation = limits != null && estimate > limits.confirmation_above;
  const guard = useTradeGuard(
    validQuantity && validPrice
      ? {
          symbol: stock.symbol,
          side,
          quantity,
          order_type: orderType,
          limit_price: orderType === "MARKET" ? null : limitValue,
          stop: stopLoss ? Number(stopLoss) : null,
          target: target ? Number(target) : null,
          holding_days: holdingDays ? Math.max(1, Math.floor(Number(holdingDays))) : null,
          plan_id: planId || null,
        }
      : null,
  );
  const warnings = guard.preview?.violations.filter((v) => v.severity === "WARN") ?? [];
  const needsWhy = side === "BUY" && (guard.protection?.prompts.length ?? 0) > 0;
  const gateMessage = guard.blocks.length
    ? guard.blocks[0]
    : !online
      ? "Offline mode is read-only. Reconnect before placing or practising a paper order."
      : warnings.length && !acknowledged
        ? "Read the risk warnings and confirm you understand them."
        : needsWhy && whyDifferent.trim().length < 15
          ? "Explain why this trade is different (at least 15 characters)."
          : null;

  async function submit() {
    setPlaced(null);
    setError(null);
    if (needsConfirmation && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    const details = {
      practice: practising,
      symbol: stock.symbol,
      company: stock.company,
      side,
      order_type: orderType,
      quantity,
      limit_price: orderType === "MARKET" ? null : Number(limitValue.toFixed(2)),
      stop_loss: stopLoss ? Number(stopLoss) : null,
      target_price: target ? Number(target) : null,
    };
    const key = JSON.stringify(details);
    if (intent.current?.key !== key) intent.current = { key, id: crypto.randomUUID() };
    try {
      const result = await place.mutateAsync({
        ...details,
        price: Number((execPrice ?? 0).toFixed(2)),
        intent_id: intent.current.id,
        ...(practising ? { execution_mode: "LAST_SESSION_PRACTICE" as const } : {}),
      });
      intent.current = null;
      const linked = openPlans.find((entry) => entry.id === planId);
      if (linked) {
        const preview = guard.preview;
        await saveJournal
          .mutateAsync({
            id: linked.id,
            symbol: linked.symbol,
            thesis: linked.thesis,
            order_id: result.id,
            ...(linked.plan
              ? {
                  plan: {
                    ...linked.plan,
                    behavior_note: whyDifferent.trim() || linked.plan.behavior_note,
                    // The compiled preview is frozen the first time a plan produces an order.
                    risk_preview:
                      linked.plan.risk_preview ??
                      (preview
                        ? {
                            planned_loss: preview.planned_loss,
                            gap_loss: preview.gap_loss,
                            fees: preview.fees,
                            slippage: preview.expected_slippage,
                            sector: stock.sector,
                            sector_exposure_after_pct: preview.sector_pct_after,
                            daily_budget_used_pct: preview.daily_budget_used_pct,
                            violations: preview.violations.map((v) => v.message).slice(0, 50),
                            narrative: preview.narrative,
                            compiled_at: new Date().toISOString(),
                          }
                        : null),
                  },
                }
              : {}),
          })
          .catch(() => setError("Order placed, but linking it to the decision plan failed."));
      }
      setAcknowledged(false);
      setWhyDifferent("");
      const filled = result.filled_quantity ?? 0;
      setPlaced({
        id: result.id,
        message:
          result.status === "FILLED"
            ? `Filled ${side.toLowerCase()} ${filled} ${stock.symbol} at ₹${formatNum(result.price)}`
            : filled > 0
              ? `Filled ${filled} of ${quantity} ${stock.symbol}; ${result.status === "CANCELLED" ? "remainder cancelled for lack of observed liquidity" : "remainder resting"}`
              : `${side} ${quantity} ${stock.symbol} resting until ${result.expires_at ? new Date(result.expires_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "session close"}`,
      });
    } catch (err) {
      setError(tradingErrorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card glow delay={200}>
        <CardHead
          title="Paper trade"
          meta={`${stock.symbol} · NSE equity · simulated book`}
          action={<Pill tone={side === "BUY" ? "positive" : "negative"}>{side}</Pill>}
        />
        <div className="p-5">
          <div className="grid grid-cols-2 gap-2">
            {(["BUY", "SELL"] as const).map((option) => (
              <Button
                key={option}
                variant="outline"
                onClick={() => setSide(option)}
                aria-pressed={side === option}
                className={cn(
                  "h-11 font-mono text-[11px] tracking-[0.04em]",
                  side === option &&
                    (option === "BUY"
                      ? "border-positive/50 bg-positive/10 text-positive"
                      : "border-negative/50 bg-negative/10 text-negative"),
                )}
              >
                {option === "BUY" ? <ArrowDownLeft /> : <ArrowUpRight />}
                {option}
              </Button>
            ))}
          </div>

          <p className="mt-3 text-[11px] text-primary-soft">
            Paper protections and alerts are evaluated by the server-side worker. They continue
            after this tab closes; the terminal only displays the resulting event.
          </p>
          <p className="mt-6 font-medium text-[11px] tracking-[0.06em] uppercase text-subtle">
            Order type
          </p>
          <div className="mt-2 grid grid-cols-3 gap-1 rounded-md border border-border bg-background/40 p-1">
            {orderTypes.map((type) => (
              <Button
                key={type}
                size="sm"
                variant="ghost"
                disabled={practising && type !== "MARKET"}
                onClick={() => {
                  touched.current = true;
                  setOrderType(type);
                }}
                aria-pressed={orderType === type}
                className={cn(
                  "font-mono text-[11px] tracking-[0.04em]",
                  orderType === type && "bg-primary/15 text-primary-soft",
                )}
              >
                {type}
              </Button>
            ))}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="font-medium text-[11px] tracking-[0.06em] uppercase text-subtle">
                Quantity
              </p>
              <div className="mt-2 flex items-center border border-border bg-background/35">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Decrease quantity"
                  onClick={() => {
                    touched.current = true;
                    setQuantity((value) => Math.max(1, value - 1));
                  }}
                >
                  −
                </Button>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  aria-label="Quantity"
                  onChange={(event) => {
                    touched.current = true;
                    setQuantity(Math.max(1, Math.floor(Number(event.target.value)) || 1));
                  }}
                  className="min-w-0 flex-1 bg-transparent text-center font-mono text-base outline-none"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Increase quantity"
                  onClick={() => {
                    touched.current = true;
                    setQuantity((value) => value + 1);
                  }}
                >
                  +
                </Button>
              </div>
            </div>
            <div>
              <p className="font-medium text-[11px] tracking-[0.06em] uppercase text-subtle">
                {orderType === "MARKET"
                  ? "Market price"
                  : orderType === "LIMIT"
                    ? "Limit price"
                    : "Trigger price"}
              </p>
              <div className="mt-2 flex items-center border border-border bg-background/35 px-3">
                <span className="font-mono text-sm text-subtle">₹</span>
                <input
                  type="number"
                  step="0.05"
                  value={orderType === "MARKET" ? (stock.price?.toFixed(2) ?? "") : triggerPrice}
                  disabled={orderType === "MARKET"}
                  aria-label="Order price"
                  onChange={(event) => setTriggerPrice(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent py-2.5 text-right font-mono text-base outline-none disabled:text-subtle"
                />
              </div>
            </div>
          </div>

          <dl className="mt-6 space-y-3 border-y border-border py-5 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Estimated value</dt>
              <dd className="font-mono num-tabular">{formatINR(estimate)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Estimated charges</dt>
              <dd className="font-mono num-tabular">
                {guard.preview ? formatINR(guard.preview.fees) : "Compiling…"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Cash after trade</dt>
              <dd
                className={cn(
                  "font-mono num-tabular",
                  side === "BUY" && walletBalance - estimate < 0 && "text-negative",
                )}
              >
                {formatINR(side === "BUY" ? walletBalance - estimate : walletBalance + estimate)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Wallet balance</dt>
              <dd
                className={cn(
                  "font-mono num-tabular",
                  side === "BUY" && estimate > walletBalance && "text-negative",
                )}
              >
                {formatINR(walletBalance)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Product · validity</dt>
              <dd className="font-mono text-[12px]">DELIVERY · DAY</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Net position</dt>
              <dd className="font-mono num-tabular">
                {position.qty} qty
                {position.qty ? ` @ ₹${formatNum(position.avgPrice)}` : ""}
              </dd>
            </div>
            {position.qty !== 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Unrealised P&amp;L</dt>
                <dd
                  className={cn(
                    "font-mono num-tabular",
                    pnl == null ? "text-subtle" : pnl >= 0 ? "text-positive" : "text-negative",
                  )}
                >
                  {pnl == null ? "No current quote" : `${pnl >= 0 ? "+" : ""}${formatINR(pnl)}`}
                </dd>
              </div>
            )}
          </dl>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <label className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
              Stop loss
              <input
                type="number"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="Optional"
                className="mt-2 w-full border border-border bg-background/35 p-2.5 font-mono text-foreground outline-none"
              />
            </label>
            <label className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
              Target
              <input
                type="number"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="Optional"
                className="mt-2 w-full border border-border bg-background/35 p-2.5 font-mono text-foreground outline-none"
              />
            </label>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
              Holding period (sessions)
              <input
                type="number"
                min="1"
                value={holdingDays}
                onChange={(e) => setHoldingDays(e.target.value)}
                placeholder="Optional"
                className="mt-2 w-full border border-border bg-background/35 p-2.5 font-mono text-foreground outline-none"
              />
            </label>
            <label className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
              Decision plan
              <select
                value={planId}
                onChange={(e) => {
                  setPlanId(e.target.value);
                  const plan = openPlans.find((entry) => entry.id === e.target.value)?.plan;
                  if (plan) {
                    if (plan.stop != null) setStopLoss(String(plan.stop));
                    if (plan.target != null) setTarget(String(plan.target));
                    if (plan.quantity != null) setQuantity(plan.quantity);
                    if (plan.holding_period_days != null)
                      setHoldingDays(String(plan.holding_period_days));
                    setSide(plan.side);
                  }
                }}
                className="mt-2 w-full border border-border bg-background p-2.5 font-sans text-[12px] normal-case tracking-normal text-foreground outline-none"
              >
                <option value="">No plan linked</option>
                {openPlans.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {planReadiness(entry).score}% ready · {entry.thesis.slice(0, 40) || "Untitled"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Link
            to="/app/$section"
            params={{ section: "journal" }}
            search={{ symbol: stock.symbol }}
            className="mt-2 inline-block text-[11px] text-primary-soft underline"
          >
            Write a decision plan for {stock.symbol}
          </Link>

          <div className="mt-5">
            <p className="mb-2 font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
              Execution preview
            </p>
            <RiskPreviewPanel
              preview={guard.preview}
              protection={guard.protection}
              blocks={guard.blocks}
              symbol={stock.symbol}
            />
            {warnings.length > 0 && !guard.blocks.length && (
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-[11.5px] text-muted-foreground">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
                I have read the {warnings.length} warning{warnings.length === 1 ? "" : "s"} and
                understand what this trade risks.
              </label>
            )}
            {needsWhy && (
              <label className="mt-3 block font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                Why is this trade different from the pattern above?
                <textarea
                  value={whyDifferent}
                  onChange={(event) => setWhyDifferent(event.target.value)}
                  className="mt-2 min-h-16 w-full border border-border bg-background p-2.5 font-sans text-[12.5px] normal-case tracking-normal text-foreground outline-none"
                />
              </label>
            )}
          </div>

          {error && (
            <p className="mt-4 border border-negative/40 bg-negative/10 px-3 py-2 text-[11.5px] text-negative">
              {error}
            </p>
          )}
          {placed && (
            <p className="mt-4 flex items-center gap-2 border border-positive/40 bg-positive/10 px-3 py-2 text-[11.5px] text-positive">
              <Check className="h-3.5 w-3.5" />
              {placed.message}
            </p>
          )}
          {confirming && (
            <p
              role="alert"
              className="mt-4 border border-warning/40 bg-warning/10 px-3 py-2 text-[11.5px] text-warning"
            >
              This order's estimated value {formatINR(estimate)} exceeds your confirmation threshold
              of {formatINR(limits?.confirmation_above ?? 0)}. Press confirm to submit it.
            </p>
          )}

          <p className="mt-5 text-[11px] leading-relaxed text-subtle">
            Paper orders use virtual funds and actual Fyers market prices. Fyers supplies market
            data only; orders stay in your private paper book.
          </p>
          {marketClosed && (
            <div className="mt-3 space-y-2 text-[11px]">
              <p className="text-warning">
                Market closed. Ordinary paper fills require an open exchange session.
              </p>
              {practiceEnabled && (
                <label className="flex cursor-pointer items-start gap-2 text-muted-foreground">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={practice}
                    onChange={(event) => {
                      setPractice(event.target.checked);
                      if (event.target.checked) setOrderType("MARKET");
                    }}
                  />
                  <span>
                    Practise at the last-session price. Settles in the separate practice account
                    (Wallet → Practice account), never in your main paper book.
                  </span>
                </label>
              )}
            </div>
          )}
          {activeQuoteError && (
            <p role="status" className="mt-3 text-[11px] text-warning">
              {activeQuoteError}
            </p>
          )}
          {!practising && gateMessage && !activeQuoteError && (
            <p role="status" className="mt-3 text-[11px] text-warning">
              {gateMessage}
            </p>
          )}
          <Button
            onClick={() => void submit()}
            disabled={
              !online ||
              place.isPending ||
              !!activeQuoteError ||
              !validQuantity ||
              !validPrice ||
              (!practising && !!gateMessage)
            }
            className={cn(
              "mt-4 h-12 w-full font-medium text-[11px] tracking-[0.06em] uppercase",
              side === "SELL" && "bg-negative text-foreground hover:bg-negative/90",
            )}
          >
            {place.isPending && <Loader2 className="animate-spin" />}
            {confirming
              ? `Confirm ${side.toLowerCase()} · ${formatINR(estimate)}`
              : side === "BUY"
                ? "Paper trade · buy"
                : "Paper trade · sell"}
          </Button>
        </div>
      </Card>

      <Card delay={280}>
        <CardHead title="Order book" meta={`${orders?.length ?? 0} orders for ${stock.symbol}`} />
        {orders?.length ? (
          <ul className="divide-y divide-border">
            {orders.slice(0, 8).map((order) => (
              <li key={order.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <Pill tone={order.side === "BUY" ? "positive" : "negative"}>{order.side}</Pill>
                    <span className="font-mono text-[11px]">
                      {order.quantity} @ ₹{formatNum(Number(order.price))}
                    </span>
                  </span>
                  <span className="mt-1 block font-medium text-[11px] tracking-[0.06em] uppercase text-subtle">
                    {order.order_type} ·{" "}
                    {new Date(order.created_at).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Pill
                    tone={
                      order.status === "FILLED"
                        ? "positive"
                        : order.status === "OPEN"
                          ? "primary"
                          : "neutral"
                    }
                  >
                    {order.status}
                  </Pill>
                  {order.status === "OPEN" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        void update
                          .mutateAsync({ id: order.id, status: "CANCELLED" })
                          .catch((err: unknown) => setError(tradingErrorMessage(err)));
                      }}
                      className="font-medium text-[11px] tracking-[0.06em] uppercase"
                    >
                      Cancel
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-8 text-[12.5px] text-muted-foreground">
            No orders yet for this instrument. A placed order appears here immediately.
          </p>
        )}
      </Card>
    </div>
  );
}
