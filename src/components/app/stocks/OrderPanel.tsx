import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Check, Loader2 } from "lucide-react";
import { Card, CardHead, Pill } from "@/components/app/cards";
import { Button } from "@/components/ui/button";
import { formatINR, formatNum, useAccount } from "@/hooks/use-dashboard-data";
import { tradingErrorMessage } from "@/hooks/use-wallet";
import {
  netPosition,
  useOrders,
  usePlaceOrder,
  useUpdateOrder,
  type OrderSide,
  type OrderType,
} from "@/hooks/use-orders";
import type { Nifty50Stock } from "@/data/nifty50";
import { cn } from "@/lib/utils";

const orderTypes: OrderType[] = ["MARKET", "LIMIT", "STOP"];

/** Buy / sell ticket plus the account's own order book for one instrument. */
export function OrderPanel({ stock }: { stock: Nifty50Stock }) {
  const [side, setSide] = useState<OrderSide>("BUY");
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [quantity, setQuantity] = useState(10);
  const [triggerPrice, setTriggerPrice] = useState(stock.price.toFixed(2));
  const [stopLoss, setStopLoss] = useState("");
  const [target, setTarget] = useState("");
  const [placedId, setPlacedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: orders } = useOrders(stock.symbol);
  const { data: account } = useAccount();
  const place = usePlaceOrder();
  const update = useUpdateOrder();

  const limitValue = Number(triggerPrice) || stock.price;
  const execPrice = orderType === "MARKET" ? stock.price : limitValue;
  const estimate = execPrice * quantity;
  const walletBalance = Number(account?.wallet_balance ?? 0);
  const position = netPosition(orders, stock.symbol);
  const pnl = position.qty ? (stock.price - position.avgPrice) * position.qty : 0;

  async function submit() {
    setPlacedId(null);
    setError(null);
    try {
      const result = await place.mutateAsync({
        symbol: stock.symbol,
        company: stock.company,
        side,
        order_type: orderType,
        quantity,
        price: Number(execPrice.toFixed(2)),
        limit_price: orderType === "MARKET" ? null : Number(limitValue.toFixed(2)),
        stop_loss: stopLoss ? Number(stopLoss) : null,
        target_price: target ? Number(target) : null,
      });
      setPlacedId(result.id);
    } catch (err) {
      setError(tradingErrorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card glow delay={200}>
        <CardHead
          title="Place order"
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
                  "h-11 font-mono text-[11px] tracking-[0.16em]",
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

          <p className="mt-6 font-mono text-[9px] tracking-[0.16em] uppercase text-subtle">
            Order type
          </p>
          <div className="mt-2 grid grid-cols-3 gap-1 rounded-md border border-border bg-background/40 p-1">
            {orderTypes.map((type) => (
              <Button
                key={type}
                size="sm"
                variant="ghost"
                onClick={() => setOrderType(type)}
                aria-pressed={orderType === type}
                className={cn(
                  "font-mono text-[9px] tracking-[0.12em]",
                  orderType === type && "bg-primary/15 text-primary-soft",
                )}
              >
                {type}
              </Button>
            ))}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="font-mono text-[9px] tracking-[0.16em] uppercase text-subtle">Quantity</p>
              <div className="mt-2 flex items-center border border-border bg-background/35">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Decrease quantity"
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                >
                  −
                </Button>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  aria-label="Quantity"
                  onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
                  className="min-w-0 flex-1 bg-transparent text-center font-mono text-base outline-none"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Increase quantity"
                  onClick={() => setQuantity((value) => value + 1)}
                >
                  +
                </Button>
              </div>
            </div>
            <div>
              <p className="font-mono text-[9px] tracking-[0.16em] uppercase text-subtle">
                {orderType === "MARKET" ? "Market price" : orderType === "LIMIT" ? "Limit price" : "Trigger price"}
              </p>
              <div className="mt-2 flex items-center border border-border bg-background/35 px-3">
                <span className="font-mono text-sm text-subtle">₹</span>
                <input
                  type="number"
                  step="0.05"
                  value={orderType === "MARKET" ? stock.price.toFixed(2) : triggerPrice}
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
            <div className="flex justify-between"><dt className="text-muted-foreground">Estimated charges</dt><dd className="font-mono num-tabular">{formatINR(estimate * 0.00035)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Cash after trade</dt><dd className={cn("font-mono num-tabular", side === "BUY" && walletBalance-estimate < 0 && "text-negative")}>{formatINR(side === "BUY" ? walletBalance-estimate : walletBalance+estimate)}</dd></div>
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
                <dd className={cn("font-mono num-tabular", pnl >= 0 ? "text-positive" : "text-negative")}>
                  {pnl >= 0 ? "+" : ""}
                  {formatINR(pnl)}
                </dd>
              </div>
            )}
          </dl>
          <div className="mt-5 grid grid-cols-2 gap-3"><label className="font-mono text-[9px] uppercase tracking-[.14em] text-subtle">Stop loss<input type="number" value={stopLoss} onChange={e=>setStopLoss(e.target.value)} placeholder="Optional" className="mt-2 w-full border border-border bg-background/35 p-2.5 font-mono text-foreground outline-none"/></label><label className="font-mono text-[9px] uppercase tracking-[.14em] text-subtle">Target<input type="number" value={target} onChange={e=>setTarget(e.target.value)} placeholder="Optional" className="mt-2 w-full border border-border bg-background/35 p-2.5 font-mono text-foreground outline-none"/></label></div>

          {error && (
            <p className="mt-4 border border-negative/40 bg-negative/10 px-3 py-2 text-[11.5px] text-negative">
              {error}
            </p>
          )}
          {placedId && (
            <p className="mt-4 flex items-center gap-2 border border-positive/40 bg-positive/10 px-3 py-2 text-[11.5px] text-positive">
              <Check className="h-3.5 w-3.5" />
              {orderType === "MARKET"
                ? `Filled ${side.toLowerCase()} ${quantity} ${stock.symbol}`
                : `${side} ${quantity} ${stock.symbol} resting in the book`}
            </p>
          )}

          <p className="mt-5 text-[11px] leading-relaxed text-subtle">
            Orders are recorded in your private simulated book. No funds or securities move and no
            broker is connected.
          </p>
          <Button
            onClick={() => void submit()}
            disabled={place.isPending}
            className={cn(
              "mt-4 h-12 w-full font-mono text-[11px] tracking-[0.16em] uppercase",
              side === "SELL" && "bg-negative text-foreground hover:bg-negative/90",
            )}
          >
            {place.isPending && <Loader2 className="animate-spin" />}
            {side === "BUY" ? "Place buy order" : "Place sell order"}
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
                  <span className="mt-1 block font-mono text-[9px] tracking-[0.14em] uppercase text-subtle">
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
                      className="font-mono text-[9px] tracking-[0.14em] uppercase"
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
