import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHead, EmptyState, Pill, Skeleton, SourceTag } from "@/components/app/cards";
import { MetricStrip, PageIntro, Segmented } from "@/components/app/pages/workspace";
import { formatINR, formatNum } from "@/hooks/use-dashboard-data";
import { orderStats, useOrders, useUpdateOrder, type Order } from "@/hooks/use-orders";
import { cn } from "@/lib/utils";

const filters = ["ALL", "OPEN", "FILLED", "CANCELLED"] as const;

function positionsFrom(orders: Order[]) {
  const map = new Map<string, { symbol: string; company: string; qty: number; cost: number; bought: number }>();
  for (const order of orders) {
    if (order.status !== "FILLED") continue;
    const entry =
      map.get(order.symbol) ??
      { symbol: order.symbol, company: order.company, qty: 0, cost: 0, bought: 0 };
    entry.qty += order.side === "BUY" ? order.quantity : -order.quantity;
    if (order.side === "BUY") {
      entry.cost += Number(order.price) * order.quantity;
      entry.bought += order.quantity;
    }
    map.set(order.symbol, entry);
  }
  return [...map.values()].filter((entry) => entry.qty !== 0);
}

/** Order management: every simulated order the account has placed, plus net positions. */
export function OrdersPage() {
  const { data, isLoading, isError, refetch } = useOrders();
  const update = useUpdateOrder();
  const [filter, setFilter] = useState<(typeof filters)[number]>("ALL");

  const stats = orderStats(data);
  const positions = useMemo(() => positionsFrom(data ?? []), [data]);
  const rows = (data ?? []).filter((order) => filter === "ALL" || order.status === filter);

  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Dealing desk · order management"
        title="Orders"
        body="Every order you place is recorded in your own private simulated book — track status, cancel resting orders and review net positions."
        action={<SourceTag label="Simulated execution" />}
      >
        <MetricStrip
          items={[
            { label: "Total orders", value: stats.total },
            { label: "Open", value: stats.open, tone: "primary" },
            { label: "Filled", value: stats.filled, tone: "positive" },
            { label: "Filled turnover", value: formatINR(stats.turnover) },
          ]}
        />
      </PageIntro>

      {isLoading ? (
        <Card className="p-5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-5 h-40 w-full" />
        </Card>
      ) : isError ? (
        <Card>
          <EmptyState
            title="Order book unavailable"
            hint="Your orders could not be loaded right now."
            onRetry={() => void refetch()}
          />
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.9fr)_minmax(300px,.8fr)]">
          <Card delay={180}>
            <CardHead
              title="Order blotter"
              meta={`${rows.length} orders`}
              action={
                <Segmented items={filters} value={filter} onChange={setFilter} label="Order status" />
              }
            />
            {rows.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-background/30 font-mono text-[9px] tracking-[0.16em] uppercase text-subtle">
                      <th scope="col" className="px-4 py-2.5 text-left font-normal">Instrument</th>
                      <th scope="col" className="px-4 py-2.5 text-left font-normal">Side · type</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-normal">Qty</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-normal">Price</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-normal">Value</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-normal">Status</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-normal" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((order, index) => (
                      <tr
                        key={order.id}
                        className="dash-rise border-b border-border/70 transition-colors last:border-0 hover:bg-panel-elevated"
                        style={{ ["--d" as string]: `${Math.min(index, 12) * 30}ms` }}
                      >
                        <td className="px-4 py-3">
                          <Link to="/app/stocks/$symbol" params={{ symbol: order.symbol }}>
                            <span className="block font-mono text-[11.5px]">{order.symbol}</span>
                            <span className="mt-0.5 block text-[11px] text-subtle">
                              {new Date(order.created_at).toLocaleString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-2">
                            <Pill tone={order.side === "BUY" ? "positive" : "negative"}>
                              {order.side}
                            </Pill>
                            <span className="font-mono text-[10px] text-subtle">
                              {order.order_type}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[12px] num-tabular">
                          {order.quantity}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[12px] num-tabular">
                          ₹{formatNum(Number(order.price))}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[12px] num-tabular">
                          {formatINR(Number(order.price) * order.quantity)}
                        </td>
                        <td className="px-4 py-3 text-right">
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
                        </td>
                        <td className="px-4 py-3 text-right">
                          {order.status === "OPEN" ? (
                            <span className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => update.mutate({ id: order.id, status: "FILLED" })}
                                className="font-mono text-[9px] tracking-[0.14em] uppercase"
                              >
                                Fill
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => update.mutate({ id: order.id, status: "CANCELLED" })}
                                className="font-mono text-[9px] tracking-[0.14em] uppercase text-subtle"
                              >
                                Cancel
                              </Button>
                            </span>
                          ) : (
                            <span className="font-mono text-[9px] text-subtle">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-5 py-10 text-[13px] text-muted-foreground">
                No orders yet. Open any NIFTY 50 constituent from the markets desk to place your first
                simulated order.
              </p>
            )}
          </Card>

          <Card delay={260}>
            <CardHead title="Net positions" meta={`${positions.length} instruments`} />
            {positions.length ? (
              <ul className="divide-y divide-border">
                {positions.map((position) => {
                  const avg = position.bought ? position.cost / position.bought : 0;
                  return (
                    <li key={position.symbol} className="px-4 py-3.5">
                      <Link
                        to="/app/stocks/$symbol"
                        params={{ symbol: position.symbol }}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="min-w-0">
                          <span className="block font-mono text-[11.5px]">{position.symbol}</span>
                          <span className="mt-0.5 block truncate text-[11px] text-subtle">
                            {position.company || "NSE equity"}
                          </span>
                        </span>
                        <span className="text-right font-mono text-[11px] num-tabular">
                          <span className={cn("block", position.qty > 0 ? "text-positive" : "text-negative")}>
                            {position.qty > 0 ? "+" : ""}
                            {position.qty} qty
                          </span>
                          <span className="mt-0.5 block text-subtle">₹{formatNum(avg)} avg</span>
                        </span>
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-subtle" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-5 py-8 text-[12.5px] text-muted-foreground">
                Filled orders build net positions here.
              </p>
            )}
            <p className="border-t border-border px-5 py-4 text-[11px] leading-relaxed text-subtle">
              Simulation only. No broker is connected and no funds or securities move.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
