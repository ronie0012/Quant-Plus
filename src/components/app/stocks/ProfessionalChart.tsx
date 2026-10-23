import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  IChartApi,
  ISeriesApi,
  SeriesMarker,
  SeriesType,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import {
  BarChart3,
  BellPlus,
  CandlestickChart,
  ChartNoAxesCombined,
  ChevronDown,
  Eraser,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  Minus,
  MousePointer2,
  RotateCcw,
  Spline,
  TrendingUp,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatNum } from "@/hooks/use-dashboard-data";
import {
  INDICATORS,
  useChartLayout,
  type ChartType,
  type Drawing,
  type Indicator,
} from "@/hooks/use-chart-layout";
import type { InstrumentMeta } from "@/data/nifty50";
import {
  bollinger,
  ema,
  macd,
  rsi,
  sma,
  supertrend,
  validateCandles,
  vwap,
  type Candle,
} from "@/lib/market-history";
import { cn } from "@/lib/utils";

export type ChartEvent = { time: number; label: string; kind?: string };
export type ChartAlert = { id: string; price: number; above: boolean };
type Note = { time: number; text: string };
type Tool = "cursor" | "trend" | "horizontal" | "fib" | "alert";
const NOTES_KEY = (symbol: string) => `qp:chart-notes:${symbol}`;
const WARMUP: Record<Indicator, number> = {
  MA20: 20,
  EMA50: 50,
  BB20: 20,
  VWAP: 1,
  SUPERTREND: 10,
  RSI14: 15,
  MACD: 34,
};
const INDICATOR_NAMES: Record<Indicator, string> = {
  MA20: "Moving average (20)",
  EMA50: "Exponential MA (50)",
  BB20: "Bollinger Bands (20, 2)",
  VWAP: "VWAP (session)",
  SUPERTREND: "Supertrend (10, 3)",
  RSI14: "RSI (14)",
  MACD: "MACD (12, 26, 9)",
};
const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
/** Bars shown when a symbol first loads; the rest stay one drag away. */
const INITIAL_BARS = 160;
/** The chart library renders UTC; shifting by IST keeps axis labels in exchange time. */
const IST = 19_800;

// Canvas needs concrete colours; these mirror the oklch tokens in styles.css.
const C = {
  up: "#35D49A",
  down: "#FF5C6C",
  upFaded: "rgba(53, 212, 154, 0.45)",
  downFaded: "rgba(255, 92, 108, 0.45)",
  volUp: "rgba(53, 212, 154, 0.28)",
  volDown: "rgba(255, 92, 108, 0.28)",
  text: "#8A94A6",
  grid: "rgba(255, 255, 255, 0.035)",
  border: "rgba(255, 255, 255, 0.08)",
  crosshair: "rgba(241, 243, 247, 0.32)",
  label: "#1B2436",
  primary: "#2E7DFF",
  soft: "#6EA8FF",
  warning: "#F2C94C",
  violet: "#B18CFF",
  band: "rgba(177, 140, 255, 0.55)",
  drawing: "#E8ECF4",
};

type Lib = typeof import("lightweight-charts");

/**
 * OHLCV chart from validated provider bars, rendered with TradingView's
 * lightweight-charts. Indicators show nothing until their warm-up window is
 * complete; the last bar is labelled when it is still updating. Layout
 * (chart type, indicators) and per-symbol drawings are saved for the user.
 */
export function ProfessionalChart({
  stock,
  replayIndex,
  marketCandles,
  marketSource = "Market data",
  intervalSeconds,
  defaultChartType = "CANDLE",
  showVolume = true,
  events = [],
  alerts = [],
  onCreateAlert,
  toolbarStart,
}: {
  stock: InstrumentMeta;
  replayIndex?: number;
  marketCandles?: Candle[] | undefined;
  marketSource?: string;
  intervalSeconds?: number;
  defaultChartType?: ChartType;
  showVolume?: boolean;
  /** Event overlays (corporate events, plan decisions) drawn at their bar. */
  events?: ChartEvent[];
  /** Active price alerts drawn as levels on the price scale. */
  alerts?: ChartAlert[];
  /** Enables the alert tool: a click on the chart creates an alert at that price. */
  onCreateAlert?: (price: number, above: boolean) => void;
  /** Controls placed at the start of the toolbar, such as the range selector. */
  toolbarStart?: ReactNode;
}) {
  const layout = useChartLayout(stock.symbol, defaultChartType);
  const { chartType, drawings } = layout;
  const indicators = useMemo(() => new Set(layout.indicators), [layout.indicators]);
  const [hover, setHover] = useState<number | null>(null);
  const [annotating, setAnnotating] = useState(false);
  const [tool, setTool] = useState<Tool>("cursor");
  const [pending, setPending] = useState<{ time: number; price: number } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [lib, setLib] = useState<Lib | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const main = useRef<ISeriesApi<SeriesType> | null>(null);
  const viewKey = useRef<string | null>(null);
  const barCount = useRef(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(NOTES_KEY(stock.symbol));
      setNotes(raw ? (JSON.parse(raw) as Note[]) : []);
    } catch {
      setNotes([]);
    }
  }, [stock.symbol]);
  const saveNotes = (next: Note[]) => {
    setNotes(next);
    try {
      localStorage.setItem(NOTES_KEY(stock.symbol), JSON.stringify(next));
    } catch {
      /* storage unavailable: notes last for this view only */
    }
  };

  const { candles: all, issues } = useMemo(() => validateCandles(marketCandles), [marketCandles]);
  const full = useMemo(
    () => all.slice(0, replayIndex == null ? all.length : Math.max(8, replayIndex)),
    [all, replayIndex],
  );
  const intraday = intervalSeconds != null && intervalSeconds < 86_400;
  // Indicators are computed on the full series so warm-up is unaffected by zoom.
  const series = useMemo(() => {
    const closes = full.map((bar) => bar.close);
    return {
      MA20: sma(closes, 20),
      EMA50: ema(closes, 50),
      BB20: bollinger(closes, 20, 2),
      VWAP: vwap(full, intraday),
      SUPERTREND: supertrend(full, 10, 3),
      RSI14: rsi(closes, 14),
      MACD: macd(closes),
    };
  }, [full, intraday]);
  const lastBar = full[full.length - 1];
  const updating =
    lastBar != null &&
    intervalSeconds != null &&
    replayIndex == null &&
    Date.now() / 1000 < lastBar.time + intervalSeconds;

  /** First bar at or after `time`, ignoring events before the loaded history. */
  const barAt = (time: number) => {
    if (!full.length || time < full[0]!.time - (intervalSeconds ?? 86_400)) return null;
    const i = full.findIndex((bar) => bar.time >= time);
    return i < 0 ? null : i;
  };

  const addDrawing = (drawing: Drawing) => layout.saveDrawings((current) => [...current, drawing]);
  // Latest values for chart callbacks registered once.
  const live = useRef({
    annotating,
    notes,
    full,
    saveNotes,
    tool,
    pending,
    onCreateAlert,
    addDrawing,
  });
  live.current = { annotating, notes, full, saveNotes, tool, pending, onCreateAlert, addDrawing };

  const hasData = full.length > 0;
  useEffect(() => {
    let cancelled = false;
    void import("lightweight-charts").then((module) => {
      if (!cancelled) setLib(module);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Create the chart once the library and container exist.
  useEffect(() => {
    const element = container.current;
    if (!lib || !element || !hasData) return;
    const instance = lib.createChart(element, {
      autoSize: true,
      layout: {
        background: { type: lib.ColorType.Solid, color: "rgba(0,0,0,0)" },
        textColor: C.text,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        fontSize: 11,
        panes: { separatorColor: C.border, separatorHoverColor: "rgba(110,168,255,0.18)" },
      },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      crosshair: {
        mode: lib.CrosshairMode.Normal,
        vertLine: {
          color: C.crosshair,
          style: lib.LineStyle.Dashed,
          labelBackgroundColor: C.label,
        },
        horzLine: {
          color: C.crosshair,
          style: lib.LineStyle.Dashed,
          labelBackgroundColor: C.label,
        },
      },
      rightPriceScale: { borderColor: C.border },
      timeScale: {
        borderColor: C.border,
        rightOffset: 6,
        barSpacing: 7,
        minBarSpacing: 1.5,
      },
      localization: { priceFormatter: (price: number) => formatNum(price) },
    });
    chart.current = instance;
    instance.subscribeCrosshairMove((param) => {
      const index = param.logical;
      const count = live.current.full.length;
      setHover(index == null || index < 0 || index >= count ? null : Math.round(index));
    });
    return () => {
      instance.remove();
      chart.current = null;
      main.current = null;
      viewKey.current = null;
    };
  }, [lib, hasData]);

  useEffect(() => {
    chart.current?.applyOptions({
      timeScale: { timeVisible: intraday, secondsVisible: false },
      handleScroll: tool === "cursor",
      handleScale: tool === "cursor",
    });
  }, [intraday, lib, hasData, tool]);

  // Series are rebuilt when inputs change; the visible window is preserved.
  useEffect(() => {
    const instance = chart.current;
    if (!lib || !instance || !full.length) return;
    const ts = instance.timeScale();
    const previousRange = ts.getVisibleLogicalRange();
    for (const pane of instance.panes()) for (const s of pane.getSeries()) instance.removeSeries(s);
    for (let i = instance.panes().length - 1; i > 0; i--) instance.removePane(i);

    const t = (time: number) => (time + IST) as UTCTimestamp;
    const lastIndex = full.length - 1;
    const priceFormat = { type: "price" as const, precision: 2, minMove: 0.05 };
    let priceSeries: ISeriesApi<SeriesType>;
    if (chartType === "CANDLE") {
      const candles = instance.addSeries(lib.CandlestickSeries, {
        upColor: C.up,
        downColor: C.down,
        borderUpColor: C.up,
        borderDownColor: C.down,
        wickUpColor: C.up,
        wickDownColor: C.down,
        priceFormat,
      });
      candles.setData(
        full.map((bar, i) => {
          const point = {
            time: t(bar.time),
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
          };
          if (!(updating && i === lastIndex)) return point;
          const faded = bar.close >= bar.open ? C.upFaded : C.downFaded;
          return { ...point, color: faded, wickColor: faded, borderColor: faded };
        }),
      );
      priceSeries = candles;
    } else if (chartType === "AREA") {
      const area = instance.addSeries(lib.AreaSeries, {
        lineColor: C.soft,
        topColor: "rgba(46, 125, 255, 0.28)",
        bottomColor: "rgba(46, 125, 255, 0)",
        lineWidth: 2,
        priceFormat,
      });
      area.setData(full.map((bar) => ({ time: t(bar.time), value: bar.close })));
      priceSeries = area;
    } else {
      const line = instance.addSeries(lib.LineSeries, { color: C.soft, lineWidth: 2, priceFormat });
      line.setData(full.map((bar) => ({ time: t(bar.time), value: bar.close })));
      priceSeries = line;
    }
    priceSeries.priceScale().applyOptions({
      scaleMargins: showVolume ? { top: 0.08, bottom: 0.24 } : { top: 0.08, bottom: 0.06 },
    });
    main.current = priceSeries;

    if (showVolume) {
      const volume = instance.addSeries(lib.HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "",
        lastValueVisible: false,
        priceLineVisible: false,
      });
      volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volume.setData(
        full.map((bar) => ({
          time: t(bar.time),
          value: bar.volume,
          color: bar.close >= bar.open ? C.volUp : C.volDown,
        })),
      );
    }

    const points = (values: (number | null)[]) =>
      full.flatMap((bar, i) =>
        values[i] == null ? [] : [{ time: t(bar.time), value: values[i]! }],
      );
    const overlay = (
      values: (number | null)[],
      color: string,
      pane = 0,
      options: { lineWidth?: 1 | 2; dashed?: boolean } = {},
    ) => {
      const line = instance.addSeries(
        lib.LineSeries,
        {
          color,
          lineWidth: options.lineWidth ?? 1,
          lineStyle: options.dashed ? lib.LineStyle.Dashed : lib.LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        },
        pane,
      );
      line.setData(points(values));
      return line;
    };
    let pane = 1;
    if (indicators.has("MA20")) overlay(series.MA20, C.warning);
    if (indicators.has("EMA50")) overlay(series.EMA50, C.primary);
    if (indicators.has("BB20")) {
      overlay(series.BB20.upper, C.band);
      overlay(series.BB20.middle, C.band, 0, { dashed: true });
      overlay(series.BB20.lower, C.band);
    }
    if (indicators.has("VWAP") && intraday) overlay(series.VWAP, C.violet, 0, { lineWidth: 2 });
    if (indicators.has("SUPERTREND")) {
      const trend = instance.addSeries(lib.LineSeries, {
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      trend.setData(
        full.flatMap((bar, i) => {
          const value = series.SUPERTREND.value[i];
          if (value == null) return [];
          return [
            {
              time: t(bar.time),
              value,
              color: series.SUPERTREND.direction[i] === 1 ? C.up : C.down,
            },
          ];
        }),
      );
    }
    if (indicators.has("RSI14")) {
      const rsiLine = overlay(series.RSI14, C.soft, pane);
      rsiLine.applyOptions({ lastValueVisible: true });
      for (const level of [30, 70])
        rsiLine.createPriceLine({
          price: level,
          color: "rgba(255,255,255,0.18)",
          lineWidth: 1,
          lineStyle: lib.LineStyle.Dashed,
          axisLabelVisible: false,
        });
      pane += 1;
    }
    if (indicators.has("MACD")) {
      const histogram = instance.addSeries(
        lib.HistogramSeries,
        { priceLineVisible: false, lastValueVisible: false },
        pane,
      );
      histogram.setData(
        full.flatMap((bar, i) => {
          const value = series.MACD.histogram[i];
          if (value == null) return [];
          return [{ time: t(bar.time), value, color: value >= 0 ? C.volUp : C.volDown }];
        }),
      );
      overlay(series.MACD.line, C.soft, pane).applyOptions({ lastValueVisible: true });
      overlay(series.MACD.signal, C.warning, pane);
    }

    // Indicator panels share the lower quarter of the chart; prices keep the rest.
    instance.panes().forEach((item, i) => item.setStretchFactor(i === 0 ? 3 : 1));

    // Drawings and alert levels.
    for (const drawing of drawings) {
      if (drawing.kind === "horizontal") {
        priceSeries.createPriceLine({
          price: drawing.price,
          color: C.drawing,
          lineWidth: 1,
          lineStyle: lib.LineStyle.Solid,
          axisLabelVisible: true,
          title: "",
        });
      } else if (drawing.kind === "trend") {
        const segment = instance.addSeries(lib.LineSeries, {
          color: C.drawing,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          autoscaleInfoProvider: () => null,
        });
        segment.setData([
          { time: t(drawing.from.time), value: drawing.from.price },
          { time: t(drawing.to.time), value: drawing.to.price },
        ]);
      } else {
        const span = drawing.to.price - drawing.from.price;
        for (const level of FIB_LEVELS)
          priceSeries.createPriceLine({
            price: drawing.to.price - span * level,
            color: level === 0.618 || level === 0.5 ? C.warning : "rgba(232, 236, 244, 0.45)",
            lineWidth: 1,
            lineStyle: lib.LineStyle.Dotted,
            axisLabelVisible: false,
            title: `${(level * 100).toFixed(1)}%`,
          });
      }
    }
    for (const alert of alerts)
      priceSeries.createPriceLine({
        price: alert.price,
        color: C.warning,
        lineWidth: 1,
        lineStyle: lib.LineStyle.LargeDashed,
        axisLabelVisible: true,
        title: alert.above ? "Alert ↑" : "Alert ↓",
      });

    const pinned: SeriesMarker<Time>[] = [];
    for (const event of events) {
      const at = barAt(event.time);
      if (at == null) continue;
      pinned.push({
        time: t(full[at]!.time),
        position: "belowBar",
        shape: "circle",
        color: C.warning,
        size: 0.8,
      });
    }
    for (const note of notes) {
      const at = barAt(note.time);
      if (at == null || full[at]!.time !== note.time) continue;
      pinned.push({
        time: t(note.time),
        position: "aboveBar",
        shape: "arrowDown",
        color: C.primary,
        text: note.text.length > 18 ? `${note.text.slice(0, 17)}…` : note.text,
      });
    }
    pinned.sort((a, b) => (a.time as number) - (b.time as number));
    lib.createSeriesMarkers(priceSeries, pinned);

    const key = `${stock.symbol}|${intervalSeconds ?? ""}`;
    if (viewKey.current !== key || !previousRange) {
      ts.setVisibleLogicalRange({
        from: Math.max(-2, full.length - INITIAL_BARS),
        to: full.length + 4,
      });
    } else {
      // Follow new bars when the right edge was in view (live updates, replay).
      const grown = full.length - barCount.current;
      const following = previousRange.to >= barCount.current - 2;
      ts.setVisibleLogicalRange(
        following && grown > 0
          ? { from: previousRange.from + grown, to: previousRange.to + grown }
          : previousRange,
      );
    }
    viewKey.current = key;
    barCount.current = full.length;
    // barAt reads `full` and `intervalSeconds`, which are dependencies already.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    lib,
    hasData,
    full,
    chartType,
    indicators,
    showVolume,
    events,
    notes,
    series,
    updating,
    stock.symbol,
    intervalSeconds,
    intraday,
    drawings,
    alerts,
  ]);

  /**
   * Chart clicks come from DOM events rather than the library's click callback,
   * which folds a quick second click into a double-click and would drop the
   * second point of a trend line.
   */
  const handlePoint = (x: number, y: number) => {
    const state = live.current;
    const instance = chart.current;
    if (!instance || !main.current) return;
    const priceHeight = instance.panes()[0]?.getHeight() ?? Infinity;
    const logical = instance.timeScale().coordinateToLogical(x);
    if (logical == null) return;
    const index = Math.max(0, Math.min(state.full.length - 1, Math.round(logical)));
    const bar = state.full[index];
    if (!bar) return;
    const price = y <= priceHeight ? main.current.coordinateToPrice(y) : null;
    if (state.tool !== "cursor") {
      if (price == null || !Number.isFinite(price) || price <= 0) return;
      const point = { time: bar.time, price };
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      if (state.tool === "horizontal") {
        state.addDrawing({ id, kind: "horizontal", price });
        setTool("cursor");
      } else if (state.tool === "alert") {
        state.onCreateAlert?.(price, price >= state.full[state.full.length - 1]!.close);
        setTool("cursor");
      } else if (!state.pending) {
        setPending(point);
      } else {
        const kind = state.tool;
        if (point.time !== state.pending.time) {
          const [from, to] =
            point.time > state.pending.time ? [state.pending, point] : [point, state.pending];
          state.addDrawing({ id, kind, from, to });
        }
        setPending(null);
        setTool("cursor");
      }
      return;
    }
    if (!state.annotating) return;
    const when = new Date(bar.time * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const text = window.prompt(`Note for ${when}`)?.trim();
    if (text) state.saveNotes([...state.notes, { time: bar.time, text: text.slice(0, 280) }]);
  };

  const range = () => chart.current?.timeScale().getVisibleLogicalRange() ?? null;
  const zoom = (factor: number) => {
    const current = range();
    if (!current) return;
    const span = Math.min(full.length + 10, Math.max(20, (current.to - current.from) * factor));
    chart.current!.timeScale().setVisibleLogicalRange({ from: current.to - span, to: current.to });
  };
  const pan = (bars: number) => {
    const current = range();
    if (!current) return;
    chart.current!.timeScale().setVisibleLogicalRange({
      from: current.from - bars,
      to: current.to - bars,
    });
  };
  const inspect = (i: number) => {
    const bar = full[i];
    if (!bar || !main.current || !chart.current) return;
    chart.current.setCrosshairPosition(bar.close, (bar.time + IST) as UTCTimestamp, main.current);
    setHover(i);
  };
  const reset = () => {
    layout.reset();
    setHover(null);
    setTool("cursor");
    setPending(null);
    chart.current?.clearCrosshairPosition();
    viewKey.current = null;
    chart.current?.timeScale().setVisibleLogicalRange({
      from: Math.max(-2, full.length - INITIAL_BARS),
      to: full.length + 4,
    });
  };
  const toggle = (item: Indicator) => {
    const next = new Set(indicators);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    layout.saveLayout({ indicators: INDICATORS.filter((name) => next.has(name)) });
  };
  const choose = (next: Tool) => {
    setPending(null);
    setAnnotating(false);
    setTool((current) => (current === next ? "cursor" : next));
  };

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (live.current.tool !== "cursor" || live.current.pending) {
        setTool("cursor");
        setPending(null);
      } else setExpanded(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  if (!hasData)
    return (
      <div className="p-8 text-sm text-muted-foreground" role="status">
        Market price history unavailable.
      </div>
    );

  const index = hover ?? full.length - 1;
  const focus = full[index]!;
  const previous = full[index - 1];
  const move = previous ? focus.close - previous.close : focus.close - focus.open;
  const movePct = (move / (previous?.close ?? focus.open)) * 100;
  const tone = move >= 0 ? "text-positive" : "text-negative";
  const formatTime = (time: number) =>
    new Date(time * 1000).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: intraday ? undefined : "2-digit",
      ...(intraday ? { hour: "2-digit", minute: "2-digit" } : {}),
    });
  const focusEvents = events.filter((event) => barAt(event.time) === index);
  const value = (values: (number | null)[], digits = 2) =>
    values[index] == null ? "warming up" : formatNum(values[index]!, digits);
  const button =
    "flex h-8 min-w-8 items-center justify-center rounded px-1.5 text-subtle transition-colors hover:bg-panel-elevated hover:text-foreground aria-pressed:bg-primary/15 aria-pressed:text-primary-soft [&_svg]:h-4 [&_svg]:w-4";
  const divider = <span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-border sm:block" />;
  const hint =
    tool === "trend" || tool === "fib"
      ? pending
        ? "Click the second point · Esc cancels"
        : `${tool === "trend" ? "Trend line" : "Fibonacci"}: click the first point`
      : tool === "horizontal"
        ? "Horizontal line: click a price"
        : tool === "alert"
          ? "Price alert: click a price level"
          : null;

  return (
    <div className={cn("flex min-w-0 flex-col", expanded && "fixed inset-0 z-50 bg-background")}>
      <div className="flex min-h-11 flex-wrap items-center gap-1 border-b border-border px-2 py-1">
        {toolbarStart}
        {toolbarStart && divider}
        <div className="flex items-center gap-0.5" role="group" aria-label="Chart type">
          {(
            [
              ["CANDLE", CandlestickChart],
              ["LINE", ChartNoAxesCombined],
              ["AREA", BarChart3],
            ] as const
          ).map(([type, Icon]) => (
            <button
              key={type}
              type="button"
              onClick={() => layout.saveLayout({ chartType: type })}
              title={`${type.toLowerCase()} chart`}
              aria-label={`${type.toLowerCase()} chart`}
              aria-pressed={chartType === type}
              className={button}
            >
              <Icon />
            </button>
          ))}
        </div>
        {divider}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(button, "gap-1 px-2 text-[12px] font-medium")}
              aria-label="Indicators"
            >
              <span className="font-serif italic">fx</span> Indicators
              {indicators.size > 0 && (
                <span className="rounded bg-primary/15 px-1 text-[11px] text-primary-soft">
                  {indicators.size}
                </span>
              )}
              <ChevronDown className="!h-3 !w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel>On price</DropdownMenuLabel>
            {(["MA20", "EMA50", "BB20", "VWAP", "SUPERTREND"] as const).map((item) => (
              <IndicatorItem
                key={item}
                item={item}
                checked={indicators.has(item)}
                onToggle={toggle}
                note={
                  item === "VWAP" && !intraday
                    ? "Intraday intervals only"
                    : full.length < WARMUP[item]
                      ? `Needs ${WARMUP[item]} bars`
                      : undefined
                }
              />
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Separate panel</DropdownMenuLabel>
            {(["RSI14", "MACD"] as const).map((item) => (
              <IndicatorItem
                key={item}
                item={item}
                checked={indicators.has(item)}
                onToggle={toggle}
                note={full.length < WARMUP[item] ? `Needs ${WARMUP[item]} bars` : undefined}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {divider}
        <div
          className="hidden items-center gap-0.5 sm:flex"
          role="group"
          aria-label="Drawing tools"
        >
          {(
            [
              ["cursor", MousePointer2, "Cursor"],
              ["trend", TrendingUp, "Trend line"],
              ["horizontal", Minus, "Horizontal line"],
              ["fib", Spline, "Fibonacci retracement"],
              ...(onCreateAlert ? ([["alert", BellPlus, "Add price alert"]] as const) : []),
            ] as const
          ).map(([name, Icon, label]) => (
            <button
              key={name}
              type="button"
              onClick={() => choose(name)}
              aria-pressed={tool === name}
              title={label}
              aria-label={label}
              className={button}
            >
              <Icon />
            </button>
          ))}
          <button
            type="button"
            onClick={() => layout.saveDrawings((current) => current.slice(0, -1))}
            disabled={!drawings.length}
            title="Undo last drawing"
            aria-label="Undo last drawing"
            className={cn(button, "disabled:opacity-40")}
          >
            <Undo2 />
          </button>
          <button
            type="button"
            onClick={() => layout.saveDrawings(() => [])}
            disabled={!drawings.length}
            title="Remove all drawings"
            aria-label="Remove all drawings"
            className={cn(button, "disabled:opacity-40")}
          >
            <Eraser />
          </button>
        </div>
        <div className="ml-auto hidden items-center gap-0.5 sm:flex">
          <button
            type="button"
            onClick={() => zoom(0.6)}
            title="Zoom in (+)"
            aria-label="Zoom in"
            className={button}
          >
            <ZoomIn />
          </button>
          <button
            type="button"
            onClick={() => zoom(1 / 0.6)}
            title="Zoom out (−)"
            aria-label="Zoom out"
            className={button}
          >
            <ZoomOut />
          </button>
          <button
            type="button"
            onClick={() => {
              setTool("cursor");
              setPending(null);
              setAnnotating((v) => !v);
            }}
            aria-pressed={annotating}
            title="Annotate: click a bar to add a note"
            aria-label="Annotate"
            className={button}
          >
            <MessageSquarePlus />
          </button>
          <button
            type="button"
            onClick={reset}
            title="Reset chart"
            aria-label="Reset chart"
            className={button}
          >
            <RotateCcw />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-pressed={expanded}
            title={expanded ? "Exit full screen (Esc)" : "Full screen"}
            aria-label={expanded ? "Exit full screen" : "Full screen"}
            className={button}
          >
            {expanded ? <Minimize2 /> : <Maximize2 />}
          </button>
        </div>
      </div>
      <div
        className={cn(
          "relative min-w-0",
          expanded ? "flex-1" : "h-[380px] sm:h-[480px] xl:h-[clamp(480px,60vh,680px)]",
          (annotating || tool !== "cursor") && "cursor-crosshair",
        )}
      >
        <div
          ref={container}
          role="img"
          tabIndex={0}
          aria-label={`${stock.symbol} OHLC chart with volume. Drag to pan, scroll to zoom, arrow keys inspect bars.`}
          className="absolute inset-0 outline-none focus-visible:ring-1 focus-visible:ring-primary/60"
          onMouseLeave={() => setHover(null)}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            handlePoint(event.clientX - rect.left, event.clientY - rect.top);
          }}
          onKeyDown={(event) => {
            const visible = range();
            const quarter = visible ? Math.ceil((visible.to - visible.from) / 4) : 20;
            if (event.key === "ArrowLeft" && event.shiftKey) pan(quarter);
            else if (event.key === "ArrowRight" && event.shiftKey) pan(-quarter);
            else if (event.key === "+" || event.key === "=") zoom(0.6);
            else if (event.key === "-" || event.key === "_") zoom(1 / 0.6);
            else if (event.key === "ArrowLeft") inspect(Math.max(0, index - 1));
            else if (event.key === "ArrowRight") inspect(Math.min(full.length - 1, index + 1));
            else if (event.key === "Home") inspect(0);
            else if (event.key === "End") inspect(full.length - 1);
            else if (event.key === "Escape") {
              chart.current?.clearCrosshairPosition();
              setHover(null);
            } else return;
            event.preventDefault();
          }}
        />
        <div
          className="pointer-events-none absolute top-2 left-3 z-10 flex max-w-[calc(100%-5rem)] flex-col gap-0.5 font-mono text-[11px] num-tabular sm:text-[12px]"
          aria-live="polite"
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="font-semibold text-foreground">{stock.symbol}</span>
            <span className="hidden text-subtle sm:inline">{formatTime(focus.time)}</span>
            <span className="text-subtle">
              O <span className={tone}>{formatNum(focus.open)}</span>
            </span>
            <span className="text-subtle">
              H <span className={tone}>{formatNum(focus.high)}</span>
            </span>
            <span className="text-subtle">
              L <span className={tone}>{formatNum(focus.low)}</span>
            </span>
            <span className="text-subtle">
              C <span className={tone}>{formatNum(focus.close)}</span>
            </span>
            <span className={tone}>
              {move >= 0 ? "+" : ""}
              {formatNum(move)} ({move >= 0 ? "+" : ""}
              {formatNum(movePct)}%)
            </span>
            {updating && index === full.length - 1 && (
              <span className="text-warning">Bar still forming</span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 text-[11px]">
            {showVolume && (
              <span className="text-subtle">
                Vol <span className="text-muted-foreground">{formatVolume(focus.volume)}</span>
              </span>
            )}
            {indicators.has("MA20") && (
              <span style={{ color: C.warning }}>MA20 {value(series.MA20)}</span>
            )}
            {indicators.has("EMA50") && (
              <span style={{ color: C.primary }}>EMA50 {value(series.EMA50)}</span>
            )}
            {indicators.has("BB20") && (
              <span style={{ color: C.violet }}>
                BB {value(series.BB20.upper)} / {value(series.BB20.lower)}
              </span>
            )}
            {indicators.has("VWAP") && (
              <span style={{ color: C.violet }}>
                VWAP {intraday ? value(series.VWAP) : "intraday only"}
              </span>
            )}
            {indicators.has("SUPERTREND") && (
              <span
                style={{
                  color: series.SUPERTREND.direction[index] === -1 ? C.down : C.up,
                }}
              >
                ST {value(series.SUPERTREND.value)}
              </span>
            )}
            {indicators.has("RSI14") && (
              <span style={{ color: C.soft }}>RSI14 {value(series.RSI14, 1)}</span>
            )}
            {indicators.has("MACD") && (
              <span style={{ color: C.soft }}>
                MACD {value(series.MACD.line)} · {value(series.MACD.signal)}
              </span>
            )}
          </div>
          {focusEvents.map((event) => (
            <span key={`${event.time}-${event.label}`} className="text-[11px] text-warning">
              {event.kind ? `${event.kind}: ` : ""}
              {event.label}
            </span>
          ))}
        </div>
        {hint && (
          <div
            role="status"
            className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-md border border-border-strong bg-panel-elevated/95 px-3 py-1.5 text-[12px] text-foreground shadow-lg"
          >
            {hint}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-1.5 text-[11px] text-subtle">
        <span>
          {marketSource}
          {issues.length ? ` · ${issues.length} invalid bars excluded` : ""}
        </span>
        <span>
          {drawings.length ? `${drawings.length} drawings · ` : ""}
          {full.length} bars · IST
        </span>
      </div>
      {notes.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 border-t border-border px-3 py-2 text-[11px]">
          {notes.map((note, i) => (
            <li
              key={`${note.time}-${i}`}
              className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5"
            >
              <span className="font-mono text-subtle">{formatTime(note.time)}</span> {note.text}
              <button
                type="button"
                aria-label="Delete note"
                className="text-subtle hover:text-negative"
                onClick={() => saveNotes(notes.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IndicatorItem({
  item,
  checked,
  onToggle,
  note,
}: {
  item: Indicator;
  checked: boolean;
  onToggle: (item: Indicator) => void;
  note?: string | undefined;
}) {
  return (
    <DropdownMenuCheckboxItem
      checked={checked}
      onCheckedChange={() => onToggle(item)}
      onSelect={(event) => event.preventDefault()}
    >
      <span className="flex flex-col">
        <span>{INDICATOR_NAMES[item]}</span>
        {note && <span className="text-[11px] text-subtle">{note}</span>}
      </span>
    </DropdownMenuCheckboxItem>
  );
}

function formatVolume(value: number) {
  if (value >= 1e7) return `${formatNum(value / 1e7)}Cr`;
  if (value >= 1e5) return `${formatNum(value / 1e5)}L`;
  if (value >= 1e3) return `${formatNum(value / 1e3)}K`;
  return String(value);
}
