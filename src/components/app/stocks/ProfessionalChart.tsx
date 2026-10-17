import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CandlestickChart,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  MessageSquarePlus,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/app/cards";
import { formatNum } from "@/hooks/use-dashboard-data";
import type { InstrumentMeta } from "@/data/nifty50";
import { ema, rsi, sma, validateCandles, type Candle } from "@/lib/market-history";
import { cn } from "@/lib/utils";

type ChartType = "CANDLE" | "LINE" | "AREA";
export type ChartEvent = { time: number; label: string; kind?: string };
type Note = { time: number; text: string };
const NOTES_KEY = (symbol: string) => `qp:chart-notes:${symbol}`;
type Indicator = "MA20" | "EMA50" | "RSI14";
const WARMUP: Record<Indicator, number> = { MA20: 20, EMA50: 50, RSI14: 15 };

/**
 * OHLCV chart from validated provider bars. Indicators show nothing until their
 * warm-up window is complete; the last bar is labelled when it is still updating.
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
}) {
  const [chartType, setChartType] = useState<ChartType>(defaultChartType);
  const [indicators, setIndicators] = useState<Set<Indicator>>(() => new Set(["MA20"]));
  const [hover, setHover] = useState<number | null>(null);
  const [hoverY, setHoverY] = useState<number | null>(null);
  // Zoom: number of bars shown (null = all); pan: bars hidden after the window.
  const [span, setSpan] = useState<number | null>(null);
  const [endOffset, setEndOffset] = useState(0);
  const [annotating, setAnnotating] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
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
  if (!all.length)
    return (
      <div className="p-8 text-sm text-muted-foreground" role="status">
        Market price history unavailable.
      </div>
    );
  const full = all.slice(0, replayIndex == null ? all.length : Math.max(8, replayIndex));
  const visibleCount = span == null ? full.length : Math.min(full.length, Math.max(20, span));
  const endIndex = Math.min(
    full.length - 1,
    Math.max(visibleCount - 1, full.length - 1 - endOffset),
  );
  const startIndex = endIndex - visibleCount + 1;
  const data = full.slice(startIndex, endIndex + 1);
  const closes = data.map((bar) => bar.close);
  // Indicators are computed on the full series so warm-up is unaffected by zoom.
  const fullCloses = full.map((bar) => bar.close);
  const series = {
    MA20: sma(fullCloses, 20).slice(startIndex, endIndex + 1),
    EMA50: ema(fullCloses, 50).slice(startIndex, endIndex + 1),
    RSI14: rsi(fullCloses, 14).slice(startIndex, endIndex + 1),
  };
  const zoom = (factor: number) => {
    setSpan(Math.min(full.length, Math.max(20, Math.round(visibleCount * factor))));
    setHover(null);
  };
  const pan = (bars: number) => {
    setEndOffset((offset) =>
      Math.min(Math.max(0, full.length - visibleCount), Math.max(0, offset + bars)),
    );
    setHover(null);
  };
  const barAt = (time: number) => {
    // Events before the visible window are not pinned to its first bar.
    if (!data.length || time < data[0]!.time - (intervalSeconds ?? 86_400)) return null;
    const i = data.findIndex((bar) => bar.time >= time);
    return i < 0 ? null : i;
  };
  const showRsi = indicators.has("RSI14");
  const width = 1000;
  const priceBottom = 262;
  const volumeTop = 286;
  const rsiTop = 372;
  const height = showRsi ? 452 : 368;
  const maxVolume = Math.max(1, ...data.map((c) => c.volume));
  const high = Math.max(...data.map((x) => x.high));
  const low = Math.min(...data.map((x) => x.low));
  const y = (value: number) =>
    18 + ((high - value) / Math.max(high - low, 1e-9)) * (priceBottom - 18);
  const step = width / data.length;
  const x = (index: number) => index * step + step / 2;
  const path = (values: (number | null)[], scale: (v: number) => number) => {
    let d = "";
    let drawing = false;
    values.forEach((value, index) => {
      if (value == null) {
        drawing = false;
        return;
      }
      d += `${drawing ? "L" : "M"}${x(index)},${scale(value)}`;
      drawing = true;
    });
    return d;
  };
  const linePath = path(closes, y);
  const rsiY = (value: number) => rsiTop + ((100 - value) / 100) * 70;
  const index = hover ?? data.length - 1;
  const focus = data[index]!;
  const lastBar = data[data.length - 1]!;
  const updating =
    intervalSeconds != null &&
    replayIndex == null &&
    Date.now() / 1000 < lastBar.time + intervalSeconds;
  const formatTime = (time: number) =>
    new Date(time * 1000).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      ...(intervalSeconds != null && intervalSeconds < 86_400
        ? { hour: "2-digit", minute: "2-digit" }
        : {}),
    });
  const ticks = [0, Math.floor((data.length - 1) / 2), data.length - 1].filter(
    (value, position, list) => list.indexOf(value) === position,
  );
  const toggle = (item: Indicator) =>
    setIndicators((current) => {
      const next = new Set(current);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-1" role="group" aria-label="Chart type">
          {(
            [
              ["CANDLE", CandlestickChart],
              ["LINE", ChartNoAxesCombined],
              ["AREA", BarChart3],
            ] as const
          ).map(([type, Icon]) => (
            <Button
              key={type}
              size="icon"
              variant={chartType === type ? "secondary" : "ghost"}
              onClick={() => setChartType(type)}
              title={`${type.toLowerCase()} chart`}
              aria-label={`${type.toLowerCase()} chart`}
              aria-pressed={chartType === type}
            >
              <Icon />
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Indicators">
          {(["MA20", "EMA50", "RSI14"] as const).map((item) => (
            <Button
              key={item}
              size="sm"
              variant={indicators.has(item) ? "secondary" : "ghost"}
              onClick={() => toggle(item)}
              aria-pressed={indicators.has(item)}
              title={
                full.length < WARMUP[item]
                  ? `${item} needs ${WARMUP[item]} bars; ${full.length} available`
                  : `${item} from ${full.length} validated bars`
              }
              className="font-mono text-[11px]"
            >
              {item}
            </Button>
          ))}
          <Button
            size="icon"
            variant="ghost"
            onClick={() => zoom(0.6)}
            title="Zoom in (+)"
            aria-label="Zoom in"
          >
            <ZoomIn />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => zoom(1 / 0.6)}
            title="Zoom out (−)"
            aria-label="Zoom out"
          >
            <ZoomOut />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => pan(Math.ceil(visibleCount / 4))}
            title="Pan back (Shift+←)"
            aria-label="Pan back"
          >
            <ChevronLeft />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => pan(-Math.ceil(visibleCount / 4))}
            title="Pan forward (Shift+→)"
            aria-label="Pan forward"
          >
            <ChevronRight />
          </Button>
          <Button
            size="icon"
            variant={annotating ? "secondary" : "ghost"}
            onClick={() => setAnnotating((v) => !v)}
            aria-pressed={annotating}
            title="Annotate: click a bar to add a note"
            aria-label="Annotate"
          >
            <MessageSquarePlus />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              setIndicators(new Set(["MA20"]));
              setChartType(defaultChartType);
              setHover(null);
              setSpan(null);
              setEndOffset(0);
            }}
            title="Reset chart"
            aria-label="Reset chart"
          >
            <RotateCcw />
          </Button>
        </div>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className={cn("w-full", showRsi ? "h-[380px] sm:h-[470px]" : "h-[320px] sm:h-[400px]")}
          role="img"
          tabIndex={0}
          aria-label={`${stock.symbol} OHLC chart with volume. Use left and right arrow keys to inspect bars.`}
          onMouseLeave={() => {
            setHover(null);
            setHoverY(null);
          }}
          onClick={() => {
            if (!annotating || hover == null) return;
            const text = window.prompt(`Note for ${formatTime(data[hover]!.time)}`)?.trim();
            if (text) saveNotes([...notes, { time: data[hover]!.time, text: text.slice(0, 280) }]);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" && event.shiftKey) pan(Math.ceil(visibleCount / 4));
            else if (event.key === "ArrowRight" && event.shiftKey)
              pan(-Math.ceil(visibleCount / 4));
            else if (event.key === "+" || event.key === "=") zoom(0.6);
            else if (event.key === "-" || event.key === "_") zoom(1 / 0.6);
            else if (event.key === "ArrowLeft") setHover(Math.max(0, index - 1));
            else if (event.key === "ArrowRight") setHover(Math.min(data.length - 1, index + 1));
            else if (event.key === "Home") setHover(0);
            else if (event.key === "End") setHover(data.length - 1);
            else if (event.key === "Escape") setHover(null);
            else return;
            event.preventDefault();
          }}
          onMouseMove={(event) => {
            const r = event.currentTarget.getBoundingClientRect();
            setHoverY(((event.clientY - r.top) / r.height) * height);
            setHover(
              Math.max(
                0,
                Math.min(
                  data.length - 1,
                  Math.floor(((event.clientX - r.left) / r.width) * data.length),
                ),
              ),
            );
          }}
        >
          <defs>
            <linearGradient id={`chart-area-${stock.symbol}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--color-primary)" stopOpacity=".25" />
              <stop offset="1" stopColor="var(--color-primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((g) => (
            <line
              key={g}
              x1="0"
              x2={width}
              y1={18 + g * (priceBottom - 18)}
              y2={18 + g * (priceBottom - 18)}
              stroke="var(--color-border)"
            />
          ))}
          {chartType === "CANDLE" ? (
            data.map((c, i) => {
              const up = c.close >= c.open;
              return (
                <g key={c.time} opacity={updating && i === data.length - 1 ? 0.55 : 1}>
                  <line
                    x1={x(i)}
                    x2={x(i)}
                    y1={y(c.high)}
                    y2={y(c.low)}
                    className={up ? "stroke-positive" : "stroke-negative"}
                  />
                  <rect
                    x={x(i) - Math.max(1.5, step * 0.28)}
                    width={Math.max(3, step * 0.56)}
                    y={Math.min(y(c.open), y(c.close))}
                    height={Math.max(1.5, Math.abs(y(c.open) - y(c.close)))}
                    className={up ? "fill-positive" : "fill-negative"}
                  />
                </g>
              );
            })
          ) : (
            <>
              <path
                d={`${linePath} L${x(data.length - 1)},${priceBottom} L${x(0)},${priceBottom} Z`}
                fill={chartType === "AREA" ? `url(#chart-area-${stock.symbol})` : "transparent"}
              />
              <path d={linePath} fill="none" stroke="var(--color-primary-soft)" strokeWidth="2" />
            </>
          )}
          {indicators.has("MA20") && (
            <path
              d={path(series.MA20, y)}
              fill="none"
              stroke="var(--color-warning)"
              strokeWidth="1.4"
              strokeDasharray="5 5"
            />
          )}
          {indicators.has("EMA50") && (
            <path
              d={path(series.EMA50, y)}
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth="1.4"
              strokeDasharray="2 4"
            />
          )}
          {showVolume &&
            data.map((c, i) => (
              <rect
                key={`v-${c.time}`}
                x={i * step + 1}
                y={volumeTop + 8 + (1 - c.volume / maxVolume) * 55}
                width={Math.max(1, step - 2)}
                height={(c.volume / maxVolume) * 55}
                className={c.close >= c.open ? "fill-positive/35" : "fill-negative/35"}
              />
            ))}
          {showRsi && (
            <g>
              {[30, 70].map((level) => (
                <line
                  key={level}
                  x1="0"
                  x2={width}
                  y1={rsiY(level)}
                  y2={rsiY(level)}
                  stroke="var(--color-border-strong)"
                  strokeDasharray="3 5"
                />
              ))}
              <path
                d={path(series.RSI14, rsiY)}
                fill="none"
                stroke="var(--color-primary-soft)"
                strokeWidth="1.4"
              />
            </g>
          )}
          {events.map((event) => {
            const at = barAt(event.time);
            if (at == null) return null;
            return (
              <g key={`${event.time}-${event.label}`}>
                <line
                  x1={x(at)}
                  x2={x(at)}
                  y1="18"
                  y2={priceBottom}
                  stroke="var(--color-warning)"
                  strokeOpacity=".55"
                  strokeDasharray="2 4"
                />
                <rect
                  x={x(at) - 4}
                  y={priceBottom - 10}
                  width="8"
                  height="8"
                  className="fill-warning"
                >
                  <title>{`${event.kind ? `${event.kind}: ` : ""}${event.label}`}</title>
                </rect>
              </g>
            );
          })}
          {notes.map((note, i) => {
            const at = barAt(note.time);
            if (at == null || data[at]!.time !== note.time) return null;
            return (
              <g key={`${note.time}-${i}`}>
                <path d={`M${x(at)},10 l5,5 l-5,5 l-5,-5 Z`} className="fill-primary">
                  <title>{note.text}</title>
                </path>
              </g>
            );
          })}
          {hover != null && (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1="0"
              y2={height}
              stroke="var(--color-border-strong)"
              strokeDasharray="4 4"
            />
          )}
          {hoverY != null && hoverY >= 18 && hoverY <= priceBottom && (
            <g>
              <line
                x1="0"
                x2={width}
                y1={hoverY}
                y2={hoverY}
                stroke="var(--color-border-strong)"
                strokeDasharray="4 4"
              />
              <rect
                x={width - 74}
                y={hoverY - 9}
                width="74"
                height="18"
                className="fill-panel-elevated"
              />
              <text
                x={width - 6}
                y={hoverY + 4}
                textAnchor="end"
                className="fill-foreground font-mono text-[11px]"
              >
                {formatNum(high - ((hoverY - 18) / (priceBottom - 18)) * (high - low))}
              </text>
            </g>
          )}
        </svg>
        <div
          className="pointer-events-none absolute top-3 left-3 flex flex-wrap gap-2 font-mono text-[11px] num-tabular"
          aria-live="polite"
        >
          <Pill>{formatTime(focus.time)}</Pill>
          <Pill>O {formatNum(focus.open)}</Pill>
          <Pill tone="positive">H {formatNum(focus.high)}</Pill>
          <Pill tone="negative">L {formatNum(focus.low)}</Pill>
          <Pill>C {formatNum(focus.close)}</Pill>
          {indicators.has("MA20") && (
            <Pill>
              MA20 {series.MA20[index] == null ? "warming up" : formatNum(series.MA20[index]!)}
            </Pill>
          )}
          {indicators.has("EMA50") && (
            <Pill>
              EMA50 {series.EMA50[index] == null ? "warming up" : formatNum(series.EMA50[index]!)}
            </Pill>
          )}
          {showRsi && (
            <Pill>
              RSI14{" "}
              {series.RSI14[index] == null ? "warming up" : formatNum(series.RSI14[index]!, 1)}
            </Pill>
          )}
          {updating && index === data.length - 1 && <Pill tone="warning">Bar still forming</Pill>}
        </div>
        <div className="pointer-events-none flex justify-between px-2 pb-1 font-mono text-[11px] text-subtle">
          {ticks.map((tick) => (
            <span key={tick}>{formatTime(data[tick]!.time)}</span>
          ))}
        </div>
        <span className="pointer-events-none absolute right-3 bottom-6 flex items-center gap-1 font-mono text-[11px] text-subtle">
          <Crosshair className="h-3 w-3" /> Hover or use arrow keys · {marketSource}
          {issues.length ? ` · ${issues.length} invalid bars excluded` : ""}
          {visibleCount < full.length ? ` · showing ${visibleCount} of ${full.length} bars` : ""}
        </span>
      </div>
      {notes.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 border-t border-border px-4 py-2 text-[11px]">
          {notes.map((note, i) => (
            <li
              key={`${note.time}-${i}`}
              className="flex items-center gap-1 border border-border px-1.5 py-0.5"
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
