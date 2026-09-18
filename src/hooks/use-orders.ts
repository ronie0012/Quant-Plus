import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT" | "STOP";
export type OrderStatus = "OPEN" | "FILLED" | "CANCELLED" | "REJECTED";

export type Order = {
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
};

export type NewOrder = {
  symbol: string;
  company?: string;
  side: OrderSide;
  order_type: OrderType;
  quantity: number;
  price: number;
  limit_price?: number | null;
};

const SELECT = "id,symbol,company,side,order_type,quantity,limit_price,price,status,filled_at,created_at";

export function useOrders(symbol?: string) {
  return useQuery({
    queryKey: ["orders", symbol ?? "all"],
    staleTime: 15_000,
    queryFn: async (): Promise<Order[]> => {
      let query = supabase.from("orders").select(SELECT).order("created_at", { ascending: false });
      if (symbol) query = query.eq("symbol", symbol);
      const { data, error } = await query.limit(60);
      if (error) throw error;
      return (data ?? []) as unknown as Order[];
    },
  });
}

/**
 * Places an order in the account's own simulated book. Market orders fill
 * immediately at the demonstrative quote; limit and stop orders stay open
 * until cancelled.
 */
export function usePlaceOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (order: NewOrder): Promise<Order> => {
      const { data, error } = await supabase.rpc("place_simulated_order", {
        p_symbol: order.symbol,
        p_company: order.company ?? order.symbol,
        p_side: order.side,
        p_type: order.order_type,
        p_qty: order.quantity,
        p_price: order.price,
        ...(order.limit_price == null ? {} : { p_limit: order.limit_price }),
      });
      if (error) throw new Error(error.message);
      return data as unknown as Order;
    },
    onSuccess: () => invalidateTrading(queryClient),
  });
}

/** Fills a resting order (settling cash and holdings) or cancels it. */
export function useUpdateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) => {
      const fn = status === "FILLED" ? "fill_open_order" : "cancel_open_order";
      const { error } = await supabase.rpc(fn, { p_order_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => invalidateTrading(queryClient),
  });
}

function invalidateTrading(queryClient: ReturnType<typeof useQueryClient>) {
  for (const key of [["orders"], ["account"], ["holdings"], ["wallet-transactions"]]) {
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

export function netPosition(orders: Order[] | undefined, symbol: string) {
  const filled = (orders ?? []).filter((o) => o.symbol === symbol && o.status === "FILLED");
  const qty = filled.reduce((acc, o) => acc + (o.side === "BUY" ? o.quantity : -o.quantity), 0);
  const bought = filled.filter((o) => o.side === "BUY");
  const cost = bought.reduce((acc, o) => acc + o.price * o.quantity, 0);
  const boughtQty = bought.reduce((acc, o) => acc + o.quantity, 0);
  return { qty, avgPrice: boughtQty ? cost / boughtQty : 0 };
}
