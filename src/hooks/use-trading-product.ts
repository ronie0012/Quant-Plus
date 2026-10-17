import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteRows,
  insertRow,
  selectOne,
  selectRows,
  updateRows,
  upsertRow,
  workspaceRpc,
} from "@/lib/workspace-api";
import type { DecisionPlanBody } from "@/lib/quant/decision-plan";
import type { BehaviorPolicy } from "@/lib/quant/behavior";

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
  decision_snapshot?: {
    price: number;
    source: string;
    as_of: string;
    market_session?: string;
  } | null;
  /** The Decision Plan: snapshot, evidence, risk plan, order link and revisions. */
  plan?: (DecisionPlanBody & { invalidated_at?: string | null }) | null;
  created_at: string;
  updated_at: string;
};

export type WorkspaceMode = "LEARNER" | "TRADER" | "RESEARCHER" | "PORTFOLIO_MANAGER" | "CUSTOM";

export type WorkspacePreferences = {
  mode?: WorkspaceMode;
  panels?: string[];
  focus_mode?: boolean;
  review_mode?: boolean;
  low_bandwidth?: boolean;
  attention_budget_per_hour?: number;
  push_notifications?: boolean;
  max_sector_pct?: number;
};

export type TradingPreferences = {
  display_name?: string;
  density: "COMFORTABLE" | "COMPACT";
  calm_mode: boolean;
  default_order_type: "MARKET" | "LIMIT" | "STOP";
  default_product: string;
  default_quantity: number;
  chart_type: "CANDLE" | "LINE" | "AREA";
  show_volume: boolean;
  notifications: Record<string, boolean>;
  behavior?: BehaviorPolicy;
  workspace?: WorkspacePreferences;
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
  notifications: { orders: true, alerts: true },
};

export function usePriceAlerts() {
  return useQuery({
    queryKey: ["price-alerts"],
    queryFn: async (): Promise<PriceAlert[]> => {
      return selectRows<PriceAlert>("price_alerts", {
        order: { field: "created_at", ascending: false },
      });
    },
  });
}

export function useCreateAlert() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (alert: Omit<PriceAlert, "id" | "triggered_at" | "created_at">) => {
      return insertRow<PriceAlert>("price_alerts", alert);
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ["price-alerts"] }),
  });
}

export function useUpdateAlert() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...values
    }: {
      id: string;
      enabled?: boolean;
      threshold?: number | null;
      triggered_at?: null;
    }) => {
      // Re-arming clears the one-shot trigger; the server evaluates it again.
      await updateRows("price_alerts", values, [["id", id]]);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["price-alerts"] });
      void client.invalidateQueries({ queryKey: ["alert-events"] });
    },
  });
}

export function useDeleteAlert() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await deleteRows("price_alerts", [["id", id]]);
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ["price-alerts"] }),
  });
}

export function useJournal() {
  return useQuery({
    queryKey: ["trade-journal"],
    queryFn: async (): Promise<JournalEntry[]> => {
      return selectRows<JournalEntry>("trade_journal", {
        order: { field: "created_at", ascending: false },
      });
    },
  });
}

export function useSaveJournalEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (entry: {
      id?: string;
      symbol: string;
      thesis: string;
      evidence?: string[];
      risks?: string[];
      invalidation?: string;
      planned_exit?: string;
      reflection?: string;
      outcome?: JournalEntry["outcome"];
      order_id?: string | null;
      decision_snapshot?: JournalEntry["decision_snapshot"];
      plan?: JournalEntry["plan"];
    }) => {
      const { id, ...values } = entry;
      if (id) await updateRows("trade_journal", values, [["id", id]]);
      else await insertRow("trade_journal", values);
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ["trade-journal"] }),
  });
}

export function useDeleteJournalEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await deleteRows("trade_journal", [["id", id]]);
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ["trade-journal"] }),
  });
}

export function useTradingPreferences(enabled = true) {
  return useQuery({
    queryKey: ["trading-preferences"],
    enabled,
    queryFn: async (): Promise<TradingPreferences> => {
      const data = await selectOne<Partial<TradingPreferences>>("trading_preferences");
      return data
        ? ({
            ...defaults,
            ...data,
            notifications: { ...defaults.notifications, ...(data.notifications ?? {}) },
          } as TradingPreferences)
        : defaults;
    },
  });
}

export function useSaveTradingPreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (values: TradingPreferences) => {
      await upsertRow("trading_preferences", values);
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ["trading-preferences"] }),
  });
}

export function useRiskLimits() {
  return useQuery({
    queryKey: ["risk-limits"],
    queryFn: async (): Promise<RiskLimits> => {
      const data = await selectOne<RiskLimits>("risk_limits");
      return (
        data ?? {
          daily_loss_limit: 50000,
          max_order_value: 1000000,
          max_position_pct: 25,
          confirmation_above: 500000,
          trading_paused: false,
        }
      );
    },
  });
}

export function useSaveRiskLimits() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (values: RiskLimits) => {
      const {
        daily_loss_limit,
        max_order_value,
        max_position_pct,
        confirmation_above,
        trading_paused,
      } = values;
      await upsertRow("risk_limits", {
        daily_loss_limit,
        max_order_value,
        max_position_pct,
        confirmation_above,
        trading_paused,
      });
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["risk-limits"] });
      void client.invalidateQueries({ queryKey: ["risk-status"] });
    },
  });
}

export type RiskStatus = {
  session_date: string;
  anchor_equity: number;
  anchor_source: string;
  anchored_at: string;
  cash_flows: number;
  marked_equity: number;
  day_loss: number;
  day_pnl: number;
  daily_loss_limit: number;
  blocked: boolean;
  blocked_reason: "TRADING_PAUSED" | "DAILY_LOSS_LIMIT" | null;
  stale_marks: string[];
  valuation_policy: string;
  reserved_cash: number;
  available_cash: number;
};

/** Server-computed day loss, valuation freshness and enforcement state. */
export function useRiskStatus() {
  return useQuery({
    queryKey: ["risk-status"],
    staleTime: 10_000,
    refetchInterval: 30_000,
    queryFn: () => workspaceRpc<RiskStatus>("risk_status"),
  });
}

export type AlertDelivery = {
  id: string;
  alert_id: string;
  symbol: string;
  alert_type: string;
  threshold: number;
  price: number;
  change_pct: number | null;
  quote_provider_time: string;
  triggered_at: string;
};

export function useAlertDeliveries() {
  return useQuery({
    queryKey: ["alert-events"],
    staleTime: 15_000,
    queryFn: () =>
      selectRows<AlertDelivery>("alert_events", {
        order: { field: "triggered_at", ascending: false },
        limit: 50,
      }),
  });
}
