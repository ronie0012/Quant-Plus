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
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Sign in to place an order.");
      const immediate = order.order_type === "MARKET";
      const { data, error } = await supabase
        .from("orders")
        .insert({
          user_id: userId,
          symbol: order.symbol,
          company: order.company ?? "",
          side: order.side,
          order_type: order.order_type,
          quantity: order.quantity,
          price: order.price,
          limit_price: order.limit_price ?? null,
          status: immediate ? "FILLED" : "OPEN",
          filled_at: immediate ? new Date().toISOString() : null,
        })
        .select(SELECT)
        .single();
      if (error) throw error;
      return data as unknown as Order;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["orders"] }),
  });
}

export function useUpdateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) => {
      const { error } = await supabase
        .from("orders")
        .update({
          status,
          filled_at: status === "FILLED" ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["orders"] }),
  });
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
