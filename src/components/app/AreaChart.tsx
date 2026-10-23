import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { formatNum } from "@/hooks/use-dashboard-data";
import { cn } from "@/lib/utils";

/** The chart library renders UTC; shifting by IST keeps axis labels in exchange time. */
const IST = 19_800;

type Point = { time: number; close: number };

/**
 * Compact price-trend chart (index overviews, sparklines with axes) on the same
 * engine as the instrument chart, so every chart in the product behaves alike.
 */
export function AreaChart({
  points,
  up,
  intraday,
  label,
  className,
  onHover,
}: {
  points: Point[];
  up: boolean;
  intraday: boolean;
  label: string;
  className?: string;
  onHover?: (index: number | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Area"> | null>(null);
  const [ready, setReady] = useState(false);
  const hover = useRef(onHover);
  hover.current = onHover;

  useEffect(() => {
    let cancelled = false;
    void import("lightweight-charts").then((lib) => {
      const element = container.current;
      if (cancelled || !element) return;
      const instance = lib.createChart(element, {
        autoSize: true,
        layout: {
          background: { type: lib.ColorType.Solid, color: "rgba(0,0,0,0)" },
          textColor: "#8A94A6",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          fontSize: 11,
          attributionLogo: false,
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { color: "rgba(255, 255, 255, 0.035)" },
        },
        crosshair: {
          mode: lib.CrosshairMode.Magnet,
          vertLine: { color: "rgba(241, 243, 247, 0.3)", labelBackgroundColor: "#1B2436" },
          horzLine: { color: "rgba(241, 243, 247, 0.3)", labelBackgroundColor: "#1B2436" },
        },
        rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.04 } },
        timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
        handleScroll: false,
        handleScale: false,
        localization: { priceFormatter: (price: number) => formatNum(price) },
      });
      series.current = instance.addSeries(lib.AreaSeries, { lineWidth: 2 });
      instance.subscribeCrosshairMove((param) => {
        const index = param.logical;
        hover.current?.(index == null || index < 0 ? null : Math.round(index));
      });
      chart.current = instance;
      setReady(true);
    });
    return () => {
      cancelled = true;
      chart.current?.remove();
      chart.current = null;
      series.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !series.current || !chart.current) return;
    const color = up ? "#35D49A" : "#FF5C6C";
    series.current.applyOptions({
      lineColor: color,
      topColor: up ? "rgba(53, 212, 154, 0.22)" : "rgba(255, 92, 108, 0.22)",
      bottomColor: "rgba(0, 0, 0, 0)",
    });
    series.current.setData(
      points.map((point) => ({ time: (point.time + IST) as UTCTimestamp, value: point.close })),
    );
    chart.current.applyOptions({ timeScale: { timeVisible: intraday, secondsVisible: false } });
    chart.current.timeScale().fitContent();
  }, [ready, points, up, intraday]);

  return (
    <div
      ref={container}
      role="img"
      aria-label={label}
      className={cn("relative w-full", className)}
      onMouseLeave={() => onHover?.(null)}
    />
  );
}
