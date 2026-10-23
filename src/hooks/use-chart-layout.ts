import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/hooks/use-session";

export type ChartType = "CANDLE" | "LINE" | "AREA";
export const INDICATORS = ["MA20", "EMA50", "BB20", "VWAP", "SUPERTREND", "RSI14", "MACD"] as const;
export type Indicator = (typeof INDICATORS)[number];

type Point = { time: number; price: number };
export type Drawing =
  | { id: string; kind: "trend"; from: Point; to: Point }
  | { id: string; kind: "horizontal"; price: number }
  | { id: string; kind: "fib"; from: Point; to: Point };

type Layout = { chartType: ChartType; indicators: Indicator[] };
const DEFAULT_INDICATORS: Indicator[] = ["MA20"];

const read = <T>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the layout lasts for this view only */
  }
};

/**
 * The signed-in user's chart layout: chart type and indicators apply to every
 * symbol; drawings belong to one symbol. Saved in this browser per account.
 */
export function useChartLayout(symbol: string, defaultChartType: ChartType) {
  const { session } = useSession();
  const owner = session?.user.id ?? "anonymous";
  const layoutKey = `qp:chart-layout:${owner}`;
  const drawingsKey = `qp:chart-drawings:${owner}:${symbol}`;
  const [layout, setLayout] = useState<Layout>({
    chartType: defaultChartType,
    indicators: DEFAULT_INDICATORS,
  });
  const [drawings, setDrawings] = useState<Drawing[]>([]);

  useEffect(() => {
    const saved = read<Partial<Layout>>(layoutKey);
    setLayout({
      chartType: saved?.chartType ?? defaultChartType,
      indicators: (saved?.indicators ?? DEFAULT_INDICATORS).filter((item): item is Indicator =>
        (INDICATORS as readonly string[]).includes(item),
      ),
    });
  }, [layoutKey, defaultChartType]);
  useEffect(() => {
    setDrawings(read<Drawing[]>(drawingsKey) ?? []);
  }, [drawingsKey]);

  const saveLayout = useCallback(
    (next: Partial<Layout>) =>
      setLayout((current) => {
        const value = { ...current, ...next };
        write(layoutKey, value);
        return value;
      }),
    [layoutKey],
  );
  const saveDrawings = useCallback(
    (update: (current: Drawing[]) => Drawing[]) =>
      setDrawings((current) => {
        const value = update(current).slice(-100);
        write(drawingsKey, value);
        return value;
      }),
    [drawingsKey],
  );
  const reset = useCallback(() => {
    saveLayout({ chartType: defaultChartType, indicators: DEFAULT_INDICATORS });
  }, [saveLayout, defaultChartType]);

  return { ...layout, drawings, saveLayout, saveDrawings, reset };
}
