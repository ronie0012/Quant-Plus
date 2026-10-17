import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteRows, insertRow, selectRows, updateRows, upsertRow } from "@/lib/workspace-api";
import { DEFAULT_BEHAVIOR_POLICY, type BehaviorPolicy } from "@/lib/quant/behavior";
import {
  useTradingPreferences,
  type WorkspaceMode,
  type WorkspacePreferences,
} from "@/hooks/use-trading-product";

export const DEFAULT_WORKSPACE: Required<WorkspacePreferences> = {
  mode: "TRADER",
  panels: [],
  focus_mode: false,
  review_mode: false,
  low_bandwidth: false,
  attention_budget_per_hour: 12,
  push_notifications: false,
  max_sector_pct: 35,
};

/** Dashboard panels available for layouts, in default order. */
export const DASHBOARD_PANELS = [
  { id: "hero", label: "Greeting and market state" },
  { id: "onboarding", label: "Onboarding checklist" },
  { id: "funds", label: "Funds" },
  { id: "market", label: "Market overview" },
  { id: "sentiment", label: "Market sentiment" },
  { id: "sectors", label: "Sector sentiment" },
  { id: "news", label: "News" },
  { id: "watchlist", label: "Watchlist" },
  { id: "analyses", label: "Committee analyses" },
  { id: "calendar", label: "Calendar" },
  { id: "portfolio", label: "Portfolio snapshot" },
  { id: "trust", label: "Platform trust" },
  { id: "plans", label: "Open decision plans" },
  { id: "events", label: "Event radar" },
  { id: "regime", label: "Market regime" },
] as const;

export type PanelId = (typeof DASHBOARD_PANELS)[number]["id"];

/** Saved layouts for each workspace mode. */
export const MODE_LAYOUTS: Record<Exclude<WorkspaceMode, "CUSTOM">, PanelId[]> = {
  LEARNER: ["hero", "onboarding", "funds", "market", "plans", "news", "watchlist", "calendar"],
  TRADER: [
    "hero",
    "onboarding",
    "funds",
    "market",
    "sentiment",
    "plans",
    "watchlist",
    "events",
    "news",
    "portfolio",
  ],
  RESEARCHER: ["hero", "regime", "market", "sectors", "analyses", "news", "events", "trust"],
  PORTFOLIO_MANAGER: [
    "hero",
    "funds",
    "portfolio",
    "regime",
    "events",
    "sectors",
    "trust",
    "plans",
  ],
};

export const MODE_LABELS: Record<WorkspaceMode, string> = {
  LEARNER: "Learner",
  TRADER: "Trader",
  RESEARCHER: "Researcher",
  PORTFOLIO_MANAGER: "Portfolio manager",
  CUSTOM: "Custom",
};

export function useWorkspacePrefs() {
  const preferences = useTradingPreferences();
  const client = useQueryClient();
  const workspace: Required<WorkspacePreferences> = {
    ...DEFAULT_WORKSPACE,
    ...(preferences.data?.workspace ?? {}),
  };
  const save = useMutation({
    mutationFn: async (patch: WorkspacePreferences) => {
      await upsertRow("trading_preferences", { workspace: { ...workspace, ...patch } });
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ["trading-preferences"] }),
  });
  const panels: PanelId[] =
    workspace.mode === "CUSTOM" && workspace.panels.length
      ? (workspace.panels.filter((p) => DASHBOARD_PANELS.some((d) => d.id === p)) as PanelId[])
      : MODE_LAYOUTS[workspace.mode === "CUSTOM" ? "TRADER" : workspace.mode];
  return { workspace, panels, save, loading: preferences.isLoading };
}

export function useBehaviorPolicy() {
  const preferences = useTradingPreferences();
  const client = useQueryClient();
  const policy: BehaviorPolicy = {
    ...DEFAULT_BEHAVIOR_POLICY,
    ...(preferences.data?.behavior ?? {}),
  };
  const save = useMutation({
    mutationFn: async (patch: Partial<BehaviorPolicy>) => {
      await upsertRow("trading_preferences", { behavior: { ...policy, ...patch } });
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ["trading-preferences"] }),
  });
  return { policy, save, loading: preferences.isLoading };
}

export type ResearchKind = "MEMO" | "COMMENT" | "STRATEGY" | "BUNDLE" | "REPLAY_RESULT";
export type ResearchStatus =
  "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "ARCHIVED" | "SHADOW";

export type ResearchItem = {
  id: string;
  kind: ResearchKind;
  title: string;
  ref: string | null;
  status: ResearchStatus;
  body: Record<string, unknown>;
  version: number;
  history: {
    version: number;
    title: string;
    status: ResearchStatus;
    body: Record<string, unknown>;
    updated_at: string;
  }[];
  created_at: string;
  updated_at: string;
};

export function useResearchItems(kind?: ResearchKind) {
  return useQuery({
    queryKey: ["research-items", kind ?? "all"],
    staleTime: 15_000,
    queryFn: () =>
      selectRows<ResearchItem>("research_items", {
        filters: kind ? [["kind", kind]] : [],
        order: { field: "updated_at", ascending: false },
      }),
  });
}

export function useSaveResearchItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (item: {
      id?: string;
      kind?: ResearchKind;
      title?: string;
      ref?: string | null;
      status?: ResearchStatus;
      body?: Record<string, unknown>;
    }) => {
      const { id, ...values } = item;
      if (id) {
        await updateRows("research_items", values, [["id", id]]);
        return null;
      }
      return insertRow<ResearchItem>("research_items", values);
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ["research-items"] }),
  });
}

export function useDeleteResearchItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRows("research_items", [["id", id]]),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["research-items"] }),
  });
}
