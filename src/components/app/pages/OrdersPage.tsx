import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ChevronLeft, ChevronRight, FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardHead, EmptyState, Pill, Skeleton, SourceTag } from "@/components/app/cards";
import { MetricStrip, PageIntro, Segmented } from "@/components/app/pages/workspace";
import { formatINR, formatNum, useAccount, useHoldings } from "@/hooks/use-dashboard-data";
import {
  useCancelProtection,
  useOrderAudit,
  useOrdersPage,
  useProtections,
  useUpdateOrder,
  type Order,
  type OrderStatus,
} from "@/hooks/use-orders";
import { tradingErrorMessage } from "@/hooks/use-wallet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  OrderManagementDialog,
  type OrderManagementSelection,
} from "@/components/app/OrderManagementDialog";

const filters = [
  "ALL",
  "OPEN",
  "PARTIALLY_FILLED",
  "FILLED",
  "CANCELLED",
  "EXPIRED",
  "REJECTED",
] as const;
const PAGE_SIZE = 25;

const label = (value: string) => value.replaceAll("_", " ").toLowerCase();

function statusTone(status: OrderStatus) {
  if (status === "FILLED") return "positive" as const;
  if (status === "OPEN" || status === "PARTIALLY_FILLED") return "primary" as const;
  if (status === "REJECTED") return "negative" as const;
  return "neutral" as const;
}

/** Order management: the complete paginated ledger, server protections and holdings. */
export function OrdersPage() {
  const [filter, setFilter] = useState<(typeof filters)[number]>("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [management, setManagement] = useState<OrderManagementSelection | null>(null);
  const orders = useOrdersPage(page, PAGE_SIZE, { status: filter, search });
  const openOrders = useOrdersPage(0, 1, { status: "OPEN" });
  const allOrders = useOrdersPage(0, 1);
  const update = useUpdateOrder();
  const holdings = useHoldings();
  const account = useAccount();
  const protections = useProtections();
  const cancelProtection = useCancelProtection();
  const positions = holdings.data ?? [];
  const rows = orders.data?.rows ?? [];
  const total = orders.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const active = (protections.data ?? []).filter((p) => p.status === "ACTIVE");

  async function act(id: string, status: "FILLED" | "CANCELLED") {
    try {
      await update.mutateAsync({ id, status });
      toast.success(status === "FILLED" ? "Fill condition met; order settled" : "Order cancelled");
    } catch (error) {
      toast.error(tradingErrorMessage(error));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Dealing desk · order management"
        title="Orders"
        body="Every order in your simulated book. Resting orders, protections and DAY expiry are evaluated by the local server worker, even with this tab closed."
        action={<SourceTag label="Simulated execution" />}
      >
        <MetricStrip
          items={[
            { label: "Orders recorded", value: allOrders.data?.total ?? "—" },
            { label: "Open", value: openOrders.data?.total ?? "—", tone: "primary" },
            {
              label: "Active protections",
              value: protections.data ? active.length : "—",
              tone: "positive",
            },
            {
              label: "Reserved cash",
              value:
                account.data?.reserved_cash != null ? formatINR(account.data.reserved_cash) : "—",
            },
          ]}
        />
      </PageIntro>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.9fr)_minmax(300px,.8fr)]">
        <Card delay={180}>
          <CardHead
            title="Order ledger"
            meta={`${total} matching · page ${page + 1} of ${pages}`}
            action={
              <Segmented
                items={filters}
                value={filter}
                onChange={(next) => {
                  setFilter(next);
                  setPage(0);
                }}
                label="Order status"
              />
            }
          />
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <label htmlFor="order-search" className="sr-only">
              Search by symbol
            </label>
            <Input
              id="order-search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(0);
              }}
              placeholder="Search symbol"
              className="h-8 max-w-[220px] font-mono text-[11px]"
            />
          </div>
          {orders.isLoading ? (
            <div className="p-5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-5 h-40 w-full" />
            </div>
          ) : orders.isError ? (
            <EmptyState
              title="Order ledger unavailable"
              hint="Your orders could not be loaded right now."
              onRetry={() => void orders.refetch()}
            />
          ) : rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse">
                <caption className="sr-only">Paper orders, newest first</caption>
                <thead>
                  <tr className="border-b border-border bg-background/30 font-medium text-[11px] tracking-[0.06em] uppercase text-subtle">
                    <th scope="col" className="px-4 py-2.5 text-left font-normal">
                      Instrument
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-left font-normal">
                      Side · type
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-normal">
                      Filled / qty
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-normal">
                      Price
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-normal">
                      Charges
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-normal">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-normal">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((order) => (
                    <OrderRow
                      key={order.id}
                      order={order}
                      onAct={act}
                      onAudit={() => setAuditId(order.id)}
                      onAmend={() => setManagement({ kind: "amend", order })}
                      busy={update.isPending}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-10 text-[13px] text-muted-foreground">
              {total === 0 && filter === "ALL" && !search
                ? "No orders yet. Open any instrument from the markets desk to place your first simulated order."
                : "No orders match these filters."}
            </p>
          )}
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <Button
              size="sm"
              variant="ghost"
              disabled={page === 0}
              onClick={() => setPage((value) => Math.max(0, value - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Newer
            </Button>
            <span className="font-mono text-[10px] text-subtle">
              {total
                ? `${page * PAGE_SIZE + 1}–${Math.min(total, (page + 1) * PAGE_SIZE)} of ${total}`
                : "0 of 0"}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={page + 1 >= pages}
              onClick={() => setPage((value) => value + 1)}
              aria-label="Next page"
            >
              Older <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card delay={220}>
            <CardHead title="Server protections" meta={`${active.length} active`} />
            {active.length ? (
              <ul className="divide-y divide-border">
                {active.map((protection) => (
                  <li key={protection.id} className="px-4 py-3 text-[11px]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[11.5px]">{protection.symbol}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle"
                        disabled={cancelProtection.isPending}
                        onClick={async () => {
                          try {
                            await cancelProtection.mutateAsync(protection.id);
                            toast.success(`Protection for ${protection.symbol} cancelled`);
                          } catch (error) {
                            toast.error(tradingErrorMessage(error));
                          }
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                    <p className="mt-1 font-mono text-subtle">
                      {protection.remaining_quantity} qty
                      {protection.stop_loss != null &&
                        ` · stop ₹${formatNum(protection.stop_loss)}`}
                      {protection.target_price != null &&
                        ` · target ₹${formatNum(protection.target_price)}`}
                      {protection.trailing_stop != null &&
                        ` · trail ₹${formatNum(protection.trailing_stop)} from peak ₹${formatNum(protection.peak_price)}`}
                    </p>
                    {protection.last_error && (
                      <p className="mt-1 text-negative">
                        Last attempt: {label(protection.last_error)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-[12px] text-muted-foreground">
                Buy orders with a stop, target or trailing stop create server-side protections here.
              </p>
            )}
          </Card>

          <Card delay={260}>
            <CardHead title="Holdings" meta={`${positions.length} instruments`} />
            {positions.length ? (
              <ul className="divide-y divide-border">
                {positions.map((position) => (
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
                        <span className="block text-positive">{position.quantity} qty</span>
                        <span className="mt-0.5 block text-subtle">
                          {position.settled_quantity == null
                            ? "Settlement unverified"
                            : `${position.settled_quantity} settled · ${position.unsettled_quantity ?? 0} unsettled`}
                        </span>
                        <span className="mt-0.5 block text-subtle">
                          ₹{formatNum(position.avg_price)} avg cost
                        </span>
                        {position.available_quantity != null &&
                          position.available_quantity !== position.quantity && (
                            <span className="mt-0.5 block text-warning">
                              {position.available_quantity} free · rest reserved
                            </span>
                          )}
                      </span>
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-subtle" />
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-2 text-xs"
                      disabled={(position.available_quantity ?? position.quantity) <= 0}
                      onClick={() => setManagement({ kind: "oco", holding: position })}
                    >
                      Create OCO exit
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-8 text-[12.5px] text-muted-foreground">
                Filled buy orders build holdings here.
              </p>
            )}
            <p className="border-t border-border px-5 py-4 text-[11px] leading-relaxed text-subtle">
              Holdings are the authoritative book, independent of how many orders are listed.
              Simulation only: no broker is connected and no funds or securities move.
            </p>
          </Card>
        </div>
      </div>
      <OrderAuditDialog id={auditId} onClose={() => setAuditId(null)} />
      {management && (
        <OrderManagementDialog selection={management} onClose={() => setManagement(null)} />
      )}
    </div>
  );
}

function OrderRow({
  order,
  onAct,
  onAudit,
  onAmend,
  busy,
}: {
  order: Order;
  onAct: (id: string, status: "FILLED" | "CANCELLED") => void;
  onAudit: () => void;
  onAmend: () => void;
  busy: boolean;
}) {
  const resting = order.status === "OPEN" || order.status === "PARTIALLY_FILLED";
  const shownPrice = order.filled_quantity
    ? (order.avg_fill_price ?? order.price)
    : order.limit_price;
  return (
    <tr className="border-b border-border/70 transition-colors last:border-0 hover:bg-panel-elevated">
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
            {order.execution_mode === "LAST_SESSION_PRACTICE" && " · practice"}
          </span>
        </Link>
      </td>
      <td className="px-4 py-3">
        <span className="flex items-center gap-2">
          <Pill tone={order.side === "BUY" ? "positive" : "negative"}>{order.side}</Pill>
          <span className="font-mono text-[10px] text-subtle">
            {order.order_type}
            {order.parent_order_id && " · protection exit"}
            {order.oco_group_id && " · OCO"}
          </span>
        </span>
      </td>
      <td className="px-4 py-3 text-right font-mono text-[12px] num-tabular">
        {order.filled_quantity} / {order.quantity}
      </td>
      <td className="px-4 py-3 text-right font-mono text-[12px] num-tabular">
        {shownPrice == null ? "—" : `₹${formatNum(shownPrice)}`}
        {!order.filled_quantity && order.limit_price != null && (
          <span className="block text-[11px] text-subtle">
            {order.order_type === "STOP" ? "trigger" : "limit"}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right font-mono text-[12px] num-tabular">
        {order.filled_quantity ? (
          formatINR(order.charges ?? order.estimated_charges)
        ) : (
          <span className="text-subtle">est. {formatINR(order.estimated_charges)}</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <Pill tone={statusTone(order.status)}>{label(order.status)}</Pill>
        {order.status_reason && (
          <span className="mt-1 block font-mono text-[11px] text-subtle">
            {label(order.status_reason)}
          </span>
        )}
        {resting && order.expires_at && (
          <span className="mt-1 block font-mono text-[11px] text-subtle">
            expires{" "}
            {new Date(order.expires_at).toLocaleString("en-IN", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <span className="flex justify-end gap-1">
          {resting && (
            <>
              {order.order_type !== "MARKET" && !order.oco_group_id && order.version != null && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={onAmend}
                  className="font-medium text-[11px] uppercase"
                >
                  Amend
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onAct(order.id, "FILLED")}
                className="font-medium text-[11px] tracking-[0.06em] uppercase"
                title="Check the live quote now; the server worker also checks every few seconds"
              >
                Check fill
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => onAct(order.id, "CANCELLED")}
                className="font-medium text-[11px] tracking-[0.06em] uppercase text-subtle"
              >
                Cancel
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={onAudit}
            aria-label={`Audit trail for ${order.symbol} order`}
          >
            <FileSearch className="h-3.5 w-3.5" />
          </Button>
        </span>
      </td>
    </tr>
  );
}

function OrderAuditDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const audit = useOrderAudit(id);
  const data = audit.data;
  return (
    <Dialog open={Boolean(id)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Execution audit</DialogTitle>
          <DialogDescription>
            Intent, quote evidence, reservations, fills, itemised charges and ledger effects for
            this paper order. Export it to reproduce or dispute a fill.
          </DialogDescription>
        </DialogHeader>
        {audit.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : audit.isError || !data ? (
          <p className="text-[12px] text-negative">The audit trail could not be loaded.</p>
        ) : (
          <div className="flex flex-col gap-4 text-[12px]">
            <section>
              <h3 className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                Intent
              </h3>
              <p className="mt-1 font-mono">
                {data.order.side} {data.order.quantity} {data.order.symbol} ·{" "}
                {data.order.order_type} · {label(data.order.status)} · intent {data.order.intent_id}
              </p>
            </section>
            <section>
              <h3 className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                Fills
              </h3>
              {data.fills.length ? (
                <ul className="mt-1 space-y-2">
                  {data.fills.map((fill) => (
                    <li key={fill.id} className="border border-border p-2">
                      <p className="font-mono">
                        {fill.quantity} @ ₹{formatNum(fill.price)} ({label(fill.method)}; last ₹
                        {formatNum(fill.reference_price)})
                        {fill.liquidity_limited && " · liquidity limited"}
                      </p>
                      <p className="text-subtle">
                        Quote {String(fill.quote["source"] ?? "")} at{" "}
                        {String(fill.quote["as_of"] ?? "unknown time")} · filled{" "}
                        {new Date(fill.created_at).toLocaleString("en-IN")}
                      </p>
                      {fill.charges ? (
                        <p className="text-subtle">
                          Charges ₹{formatNum(fill.charges.total)} ({fill.charges.schedule}):{" "}
                          {fill.charges.items
                            .map((item) => `${item.code} ₹${formatNum(item.amount)}`)
                            .join(", ")}
                        </p>
                      ) : (
                        <p className="text-subtle">
                          Migrated v1 fill; charges were estimated but not debited.
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-subtle">No fills.</p>
              )}
            </section>
            <section>
              <h3 className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                Ledger effects
              </h3>
              <ul className="mt-1 font-mono">
                {data.ledger.map((entry) => (
                  <li key={entry.id}>
                    {entry.kind} {entry.amount >= 0 ? "+" : ""}
                    {formatINR(entry.amount)} → balance {formatINR(entry.balance_after)}
                  </li>
                ))}
                {!data.ledger.length && <li className="text-subtle">No cash movement.</li>}
              </ul>
            </section>
            <section>
              <h3 className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                Event trail
              </h3>
              <ol className="mt-1 space-y-1 font-mono text-[11px]">
                {data.events.map((event) => (
                  <li key={event.seq}>
                    #{event.seq} {new Date(event.at).toLocaleTimeString("en-IN")} ·{" "}
                    {label(event.type)}
                  </li>
                ))}
              </ol>
            </section>
            <Button
              variant="outline"
              size="sm"
              className={cn("self-start font-medium text-[11px] uppercase tracking-[0.06em]")}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
                  toast.success("Audit JSON copied to the clipboard");
                } catch {
                  toast.error("Clipboard access was denied");
                }
              }}
            >
              Copy audit JSON
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
