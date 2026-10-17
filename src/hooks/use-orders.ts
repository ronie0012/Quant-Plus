import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { selectOne, selectPage, selectRows, workspaceRpc } from "@/lib/workspace-api";
import { paperOrderFetch } from "@/lib/paper-trading";

export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT" | "STOP";
export type OrderStatus =
  "OPEN" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED" | "REJECTED" | "EXPIRED";

export type Order = {
  intent_id?: string;
  execution_mode?: "LIVE" | "LAST_SESSION_PRACTICE";
  quote_snapshot?: Record<string, unknown>;
  status_reason?: string | null;
  avg_fill_price?: number | null;
  charges?: number;
  expires_at?: string | null;
  updated_at?: string;
  parent_order_id?: string | null;
  protection_id?: string | null;
  oco_group_id?: string | null;
  version?: number;
  id: string;
  symbol: string;
  company: string;
  side: OrderSide;
  order_type: OrderType;
  quantity: number;
  limit_price: number | null;
  price: number;
  status: OrderStatus;
  filled_at: string | null;
  created_at: string;
  product: string;
  validity: string;
  filled_quantity: number;
  estimated_charges: number;
  stop_loss: number | null;
  target_price: number | null;
  trailing_stop: number | null;
};

export type NewOrder = {
  intent_id?: string;
  /** LAST_SESSION_PRACTICE settles in the separate practice book at the last-session price. */
  execution_mode?: "LIVE" | "LAST_SESSION_PRACTICE";
  symbol: string;
  company?: string;
  side: OrderSide;
  order_type: OrderType;
  quantity: number;
  price: number;
  limit_price?: number | null;
  product?: string;
  validity?: string;
  stop_loss?: number | null;
  target_price?: number | null;
  trailing_stop?: number | null;
};

export function useOrder(id: string | null | undefined) {
  return useQuery({
    queryKey: ["order", id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Order | null> => {
      return selectOne<Order>("orders", [["id", id!]]);
    },
  });
}

export function useOrders(symbol?: string) {
  return useQuery({
    queryKey: ["orders", symbol ?? "all"],
    staleTime: 15_000,
    queryFn: async (): Promise<Order[]> => {
      return selectRows<Order>("orders", {
        filters: symbol ? [["symbol", symbol]] : [],
        order: { field: "created_at", ascending: false },
        limit: 60,
      });
    },
  });
}

export type OrderFilters = { status?: OrderStatus | "ALL"; search?: string };

/** Complete, paginated order ledger; positions never derive from this list. */
export function useOrdersPage(page: number, pageSize: number, filters: OrderFilters = {}) {
  return useQuery({
    queryKey: ["orders", "page", page, pageSize, filters.status ?? "ALL", filters.search ?? ""],
    staleTime: 15_000,
    queryFn: () =>
      selectPage<Order>("orders", {
        filters: [
          ...(filters.status && filters.status !== "ALL"
            ? [["status", filters.status] as [string, unknown]]
            : []),
          ...(filters.search?.trim()
            ? [
                ["symbol", filters.search.trim().toUpperCase(), "ilike"] as [
                  string,
                  unknown,
                  "ilike",
                ],
              ]
            : []),
        ],
        order: { field: "created_at", ascending: false },
        limit: pageSize,
        offset: page * pageSize,
      }),
  });
}

export type OrderAudit = {
  order: Order;
  fills: Array<{
    id: string;
    quantity: number;
    price: number;
    reference_price: number;
    method: string;
    liquidity_limited: boolean;
    charges: {
      schedule: string;
      total: number;
      items: { code: string; label: string; category: string; amount: number; basis: string }[];
    } | null;
    charges_debited: boolean;
    quote: Record<string, unknown>;
    created_at: string;
  }>;
  ledger: Array<{
    id: string;
    kind: string;
    amount: number;
    balance_after: number;
    note: string;
    created_at: string;
  }>;
  reservations: Array<{
    id: string;
    kind: string;
    amount: number;
    status: string;
    created_at: string;
  }>;
  protection: Protection[];
  events: Array<{ seq: number; type: string; at: string; data: Record<string, unknown> }>;
};

export function useOrderAudit(id: string | null) {
  return useQuery({
    queryKey: ["order-audit", id],
    enabled: Boolean(id),
    queryFn: () => workspaceRpc<OrderAudit>("order_audit", { p_order_id: id }),
  });
}

export type Protection = {
  id: string;
  parent_order_id: string;
  symbol: string;
  company: string;
  quantity: number;
  remaining_quantity: number;
  stop_loss: number | null;
  target_price: number | null;
  trailing_stop: number | null;
  peak_price: number;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  exits: string[];
  last_error: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
};

export function useProtections() {
  return useQuery({
    queryKey: ["protections"],
    staleTime: 10_000,
    queryFn: () =>
      selectRows<Protection>("protections", { order: { field: "created_at", ascending: false } }),
  });
}

export function useCancelProtection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      paperOrderFetch<Protection>(`protections/${id}/cancel`, { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["protections"] }),
  });
}

/**
 * Places an order in the account's own simulated book. Market orders fill
 * at the latest Fyers market-data quote. Limit and stop orders stay open
 * until their price condition is met and a paper fill is requested.
 */
export function usePlaceOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (order: NewOrder): Promise<Order> => {
      if (!Number.isSafeInteger(order.quantity) || order.quantity <= 0)
        throw new Error("INVALID_QUANTITY");
      if (
        order.order_type !== "MARKET" &&
        (!Number.isFinite(order.limit_price) || (order.limit_price ?? 0) <= 0)
      )
        throw new Error("Enter a positive limit or trigger price.");
      for (const value of [order.stop_loss, order.target_price, order.trailing_stop]) {
        if (value != null && (!Number.isFinite(value) || value <= 0))
          throw new Error("Protection prices must be positive numbers.");
      }
      const entry = order.order_type === "MARKET" ? null : order.limit_price!;
      if (
        order.stop_loss != null &&
        entry != null &&
        (order.side === "BUY" ? order.stop_loss >= entry : order.stop_loss <= entry)
      )
        throw new Error("Stop loss must be below a buy entry or above a sell entry.");
      if (
        order.target_price != null &&
        entry != null &&
        (order.side === "BUY" ? order.target_price <= entry : order.target_price >= entry)
      )
        throw new Error("Target must be above a buy entry or below a sell entry.");
      return paperOrderFetch<Order>("orders", {
        method: "POST",
        body: JSON.stringify({
          symbol: order.symbol,
          company: order.company ?? order.symbol,
          side: order.side,
          order_type: order.order_type,
          quantity: order.quantity,
          limit_price: order.limit_price,
          product: order.product ?? "DELIVERY",
          validity: order.validity ?? "DAY",
          stop_loss: order.stop_loss,
          target_price: order.target_price,
          trailing_stop: order.trailing_stop,
          intent_id: (order.intent_id ??= crypto.randomUUID()),
          ...(order.execution_mode === "LAST_SESSION_PRACTICE"
            ? { execution_mode: "LAST_SESSION_PRACTICE" }
            : {}),
        }),
      });
    },
    onSuccess: () => {
      invalidateTrading(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["practice"] });
    },
  });
}

/** Fills a resting order (settling cash and holdings) or cancels it. */
export function useUpdateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) => {
      if (status !== "FILLED" && status !== "CANCELLED") throw new Error("Invalid order action");
      if (status === "FILLED") {
        await paperOrderFetch<Order>(`orders/${id}/fill`, {
          method: "POST",
        });
        return;
      }
      await paperOrderFetch<Order>(`orders/${id}/cancel`, { method: "POST" });
    },
    onSuccess: () => invalidateTrading(queryClient),
  });
}

export function useManageOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body: Record<string, unknown> }) =>
      paperOrderFetch(path, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      invalidateTrading(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["order-audit"] });
    },
    onError: () => invalidateTrading(queryClient),
  });
}

function invalidateTrading(queryClient: ReturnType<typeof useQueryClient>) {
  for (const key of [
    ["orders"],
    ["account"],
    ["holdings"],
    ["wallet-transactions"],
    ["protections"],
    ["risk-status"],
  ]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

export function orderStats(orders: Order[] | undefined) {
  const list = orders ?? [];
  const open = list.filter((o) => o.status === "OPEN");
  const filled = list.filter((o) => o.status === "FILLED");
  const turnover = filled.reduce((acc, o) => acc + o.price * o.quantity, 0);
  return { total: list.length, open: open.length, filled: filled.length, turnover };
}
