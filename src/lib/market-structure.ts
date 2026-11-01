import { useQuery } from "@tanstack/react-query";
import { agentFetch } from "@/lib/agent-api";
import {
  normalizeBoard,
  normalizeRow,
  type MarketStructure,
  type MarketStructureBoard,
} from "./market-structure-schema";

export type {
  StructureLabel,
  StructureQuality,
  StructureZone,
  LiquidityProxy,
  LiquiditySweep,
  DepthImbalance,
  StructureRank,
  MarketStructure,
  MarketStructureBoard,
} from "./market-structure-schema";

export function useMarketStructureBoard(range: "1D" | "1W" | "1M" = "1D") {
  return useQuery({
    queryKey: ["market-structure-board", range],
    staleTime: 45_000,
    refetchInterval: 60_000,
    retry: false,
    queryFn: async ({ signal }): Promise<MarketStructureBoard> => {
      const response = await agentFetch(`terminal/structure-board?range=${range}`, { signal });
      return normalizeBoard(await response.json());
    },
  });
}

export function useMarketStructure(
  symbol: string,
  range: "1D" | "1W" | "1M" = "1D",
  enabled = true,
) {
  return useQuery({
    queryKey: ["market-structure", symbol, range],
    enabled: enabled && Boolean(symbol),
    staleTime: 45_000,
    refetchInterval: 60_000,
    retry: false,
    queryFn: async ({ signal }): Promise<MarketStructure> => {
      const response = await agentFetch(
        `terminal/structure/${encodeURIComponent(symbol)}?range=${range}`,
        { signal },
      );
      return normalizeRow(await response.json());
    },
  });
}

export function activeZones(structure: MarketStructure | undefined) {
  return (structure?.order_blocks ?? []).filter((zone) => zone.status === "active");
}

export function recentLiquidity(structure: MarketStructure | undefined) {
  return (structure?.price_liquidity_proxies ?? []).slice(-4);
}
