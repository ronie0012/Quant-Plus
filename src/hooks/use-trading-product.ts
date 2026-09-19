import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PriceAlert = {
  id: string;
  symbol: string;
  alert_type: "PRICE_ABOVE" | "PRICE_BELOW" | "MOVE_PERCENT" | "VOLUME" | "NEWS";
  threshold: number | null;
  note: string;
  enabled: boolean;
  triggered_at: string | null;
  created_at: string;
};

export type JournalEntry = {
  id: string;
  order_id: string | null;
  symbol: string;
  thesis: string;
  evidence: string[];
  risks: string[];
  invalidation: string;
  planned_exit: string;
  reflection: string;
  outcome: "OPEN" | "WIN" | "LOSS" | "FLAT" | "CANCELLED";
  created_at: string;
  updated_at: string;
};

export type TradingPreferences = {
  density: "COMFORTABLE" | "COMPACT";
  calm_mode: boolean;
  default_order_type: "MARKET" | "LIMIT" | "STOP";
  default_product: string;
  default_quantity: number;
  chart_type: "CANDLE" | "LINE" | "AREA";
  show_volume: boolean;
  notifications: Record<string, boolean>;
};

export type RiskLimits = {
  daily_loss_limit: number;
  max_order_value: number;
  max_position_pct: number;
  confirmation_above: number;
  trading_paused: boolean;
};

const defaults: TradingPreferences = {
  density: "COMFORTABLE",
  calm_mode: false,
  default_order_type: "MARKET",
  default_product: "DELIVERY",
  default_quantity: 10,
  chart_type: "CANDLE",
  show_volume: true,
  notifications: { orders: true, alerts: true, news: false },
};

export function usePriceAlerts() {
  return useQuery({
    queryKey: ["price-alerts"],
    queryFn: async (): Promise<PriceAlert[]> => {
      const { data, error } = await supabase.from("price_alerts").select("id,symbol,alert_type,threshold,note,enabled,triggered_at,created_at").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PriceAlert[];
    },
  });
}

export function useCreateAlert() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (alert: Omit<PriceAlert, "id" | "triggered_at" | "created_at">) => {
      const { data, error } = await supabase.from("price_alerts").insert(alert).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ["price-alerts"] }),
  });
}

export function useUpdateAlert() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...values }: { id: string; enabled?: boolean; threshold?: number | null }) => {
      const { error } = await supabase.from("price_alerts").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ["price-alerts"] }),
  });
}

export function useDeleteAlert() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("price_alerts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ["price-alerts"] }),
  });
}

export function useJournal() {
  return useQuery({
    queryKey: ["trade-journal"],
    queryFn: async (): Promise<JournalEntry[]> => {
      const { data, error } = await supabase.from("trade_journal").select("id,order_id,symbol,thesis,evidence,risks,invalidation,planned_exit,reflection,outcome,created_at,updated_at").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as JournalEntry[];
    },
  });
}

export function useSaveJournalEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (entry: { id?: string; symbol: string; thesis: string; evidence?: string[]; risks?: string[]; invalidation?: string; planned_exit?: string; reflection?: string; outcome?: JournalEntry["outcome"]; order_id?: string | null }) => {
      const { id, ...values } = entry;
      const query = entry.id
        ? supabase.from("trade_journal").update(values).eq("id", id ?? "")
        : supabase.from("trade_journal").insert(values);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ["trade-journal"] }),
  });
}

export function useTradingPreferences() {
  return useQuery({
    queryKey: ["trading-preferences"],
    queryFn: async (): Promise<TradingPreferences> => {
      const { data, error } = await supabase.from("trading_preferences").select("density,calm_mode,default_order_type,default_product,default_quantity,chart_type,show_volume,notifications").maybeSingle();
      if (error) throw error;
      return data ? ({ ...data, notifications: (data.notifications ?? {}) as Record<string, boolean> } as TradingPreferences) : defaults;
    },
  });
}

export function useSaveTradingPreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (values: TradingPreferences) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Sign in to save preferences.");
      const { error } = await supabase.from("trading_preferences").upsert({ user_id: userId, ...values });
      if (error) throw error;
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ["trading-preferences"] }),
  });
}

export function useRiskLimits() {
  return useQuery({
    queryKey: ["risk-limits"],
    queryFn: async (): Promise<RiskLimits> => {
      const { data, error } = await supabase.from("risk_limits").select("daily_loss_limit,max_order_value,max_position_pct,confirmation_above,trading_paused").maybeSingle();
      if (error) throw error;
      return (data as RiskLimits | null) ?? { daily_loss_limit: 50000, max_order_value: 1000000, max_position_pct: 25, confirmation_above: 500000, trading_paused: false };
    },
  });
}

export function useSaveRiskLimits() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (values: RiskLimits) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Sign in to save risk limits.");
      const { error } = await supabase.from("risk_limits").upsert({ user_id: userId, ...values });
      if (error) throw error;
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ["risk-limits"] }),
  });
}