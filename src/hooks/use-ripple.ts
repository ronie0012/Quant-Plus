/**
 * Ripple Engine data: news-driven origins, the locked-call ledger and its
 * matured track record. Propagation itself is pure (src/lib/quant/ripple.ts).
 */
import { useMemo } from "react";
import { nifty50, stockBySymbol } from "@/data/nifty50";
import { useMarketNews } from "@/hooks/use-intelligence";
import { useHistories } from "@/hooks/use-quant-data";
import { useResearchItems, useSaveResearchItem } from "@/hooks/use-workspace-prefs";
import {
  detectOrigins,
  factorById,
  rippleCalls,
  type RippleCall,
  type RippleImpact,
  type RippleOrigin,
} from "@/lib/quant/ripple";
import { matureForecasts, trackStats, type Forecast } from "@/lib/quant/track-record";

export const RIPPLE_HORIZON = 3;
export const RIPPLE_MODEL = "ripple-curated-v1";

const UNIVERSE = new Set(nifty50.map((stock) => stock.symbol));

/** Display name for a stock symbol or factor id. */
export function rippleName(id: string) {
  return factorById(id)?.label ?? stockBySymbol(id)?.company ?? id;
}

/** Ripple origins detected in the latest market news. */
export function useRippleOrigins() {
  const news = useMarketNews();
  const origins = useMemo(
    () => detectOrigins(news.data?.articles ?? [], UNIVERSE),
    [news.data?.articles],
  );
  return {
    origins,
    loading: news.isLoading,
    error: news.error,
    articles: news.data?.articles.length ?? 0,
    refetch: news.refetch,
  };
}

type LockedBody = { origin: RippleOrigin; calls: RippleCall[] };

/** Locked ripple calls and their record at RIPPLE_HORIZON sessions. */
export function useRippleLedger() {
  const items = useResearchItems("RIPPLE_CALL");
  const save = useSaveResearchItem();
  const locked = useMemo(
    () =>
      (items.data ?? []).map((item) => ({
        id: item.id,
        created_at: item.created_at,
        ...(item.body as LockedBody),
      })),
    [items.data],
  );
  const forecasts: Forecast[] = useMemo(
    () =>
      locked.flatMap((entry) =>
        (entry.calls ?? []).map((call, i) => ({
          id: `${entry.id}:${i}`,
          symbol: call.symbol,
          as_of: call.as_of,
          role: `Order ${call.hop}`,
          model_version: RIPPLE_MODEL,
          direction: call.direction,
          probability: null,
          sector: stockBySymbol(call.symbol)?.sector ?? "Unknown",
          liquidity: "HIGH" as const,
          coverage: "PARTIAL" as const,
        })),
      ),
    [locked],
  );
  const symbols = useMemo(
    () => [...new Set(forecasts.map((f) => f.symbol))].slice(0, 50),
    [forecasts],
  );
  const histories = useHistories(symbols, "1Y");
  const result = useMemo(() => {
    const matured = matureForecasts(forecasts, histories.bars, RIPPLE_HORIZON, () => "ALL", 0);
    return { ...matured, stats: trackStats(matured.matured) };
  }, [forecasts, histories.bars]);

  const lock = (origin: RippleOrigin, impacts: RippleImpact[]) =>
    save.mutateAsync({
      kind: "RIPPLE_CALL",
      title: origin.title.slice(0, 300),
      ref: origin.origin,
      status: "SHADOW",
      body: { origin, calls: rippleCalls(impacts, new Date().toISOString()) },
    });

  const isLocked = (origin: RippleOrigin) =>
    locked.some(
      (entry) =>
        entry.origin?.id === origin.id &&
        // A what-if or headline can be locked again on a later day.
        entry.created_at.slice(0, 10) === new Date().toISOString().slice(0, 10),
    );

  return {
    locked,
    result,
    loading: items.isLoading || histories.loading,
    lock,
    locking: save.isPending,
    lockError: save.error,
    isLocked,
  };
}
