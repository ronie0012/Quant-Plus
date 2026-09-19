import { useMemo, useState } from "react";
import { BarChart3, CandlestickChart, ChartNoAxesCombined, Crosshair, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/app/cards";
import { formatNum } from "@/hooks/use-dashboard-data";
import type { Nifty50Stock } from "@/data/nifty50";
import { cn } from "@/lib/utils";

type Candle = { open: number; high: number; low: number; close: number; volume: number };
type ChartType = "CANDLE" | "LINE" | "AREA";

function candles(seed: number, count: number, anchor: number): Candle[] {
  let value = anchor * 0.93;
  return Array.from({ length: count }, (_, index) => {
    const wave = Math.sin((seed + index) * 1.73) * 0.006 + Math.cos((seed + index) * 0.41) * 0.004;
    const open = value;
    const close = open * (1 + wave);
    const spread = open * (0.002 + Math.abs(Math.sin(seed * index + 1)) * 0.005);
    value = close;
    return { open, close, high: Math.max(open, close) + spread, low: Math.min(open, close) - spread, volume: 200000 + Math.abs(Math.sin(index * 0.82 + seed)) * 1800000 };
  });
}

export function ProfessionalChart({ stock, replayIndex }: { stock: Nifty50Stock; replayIndex?: number }) {
  const [chartType, setChartType] = useState<ChartType>("CANDLE");
  const [indicator, setIndicator] = useState<"MA20" | "EMA50" | "RSI" | null>("MA20");
  const [hover, setHover] = useState<number | null>(null);
  const all = useMemo(() => candles(stock.seed, 96, stock.price), [stock]);
  const data = all.slice(0, replayIndex == null ? all.length : Math.max(8, replayIndex));
  const width = 1000, height = 360, volumeTop = 286;
  const high = Math.max(...data.map((x) => x.high)), low = Math.min(...data.map((x) => x.low));
  const y = (value: number) => 18 + ((high - value) / Math.max(high - low, 1)) * 244;
  const step = width / data.length;
  const linePath = data.map((c, i) => `${i ? "L" : "M"}${i * step + step / 2},${y(c.close)}`).join(" ");
  const ma = data.map((_, index) => data.slice(Math.max(0, index - 11), index + 1).reduce((sum, c) => sum + c.close, 0) / Math.min(12, index + 1));
  const maPath = ma.map((v, i) => `${i ? "L" : "M"}${i * step + step / 2},${y(v)}`).join(" ");
  const focus = hover == null ? data[data.length - 1] : data[hover];

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-1" role="group" aria-label="Chart type">
          {([['CANDLE', CandlestickChart], ['LINE', ChartNoAxesCombined], ['AREA', BarChart3]] as const).map(([type, Icon]) => (
            <Button key={type} size="icon" variant={chartType === type ? "secondary" : "ghost"} onClick={() => setChartType(type)} title={`${type.toLowerCase()} chart`} aria-label={`${type.toLowerCase()} chart`}><Icon /></Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {(["MA20", "EMA50", "RSI"] as const).map((item) => <Button key={item} size="sm" variant={indicator === item ? "secondary" : "ghost"} onClick={() => setIndicator(indicator === item ? null : item)} className="font-mono text-[9px]">{item}</Button>)}
          <Button size="icon" variant="ghost" onClick={() => { setIndicator("MA20"); setHover(null); }} title="Reset chart" aria-label="Reset chart"><RotateCcw /></Button>
        </div>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-[320px] w-full sm:h-[400px]" role="img" aria-label={`${stock.symbol} demonstrative OHLC chart with volume`} onMouseLeave={() => setHover(null)} onMouseMove={(event) => { const r = event.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(data.length - 1, Math.floor(((event.clientX - r.left) / r.width) * data.length)))); }}>
          <defs><linearGradient id={`chart-area-${stock.symbol}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--color-primary)" stopOpacity=".25"/><stop offset="1" stopColor="var(--color-primary)" stopOpacity="0"/></linearGradient></defs>
          {[.2,.4,.6,.8].map((g) => <line key={g} x1="0" x2={width} y1={g * volumeTop} y2={g * volumeTop} stroke="var(--color-border)" />)}
          {chartType === "CANDLE" ? data.map((c, i) => { const x = i * step + step / 2; const up = c.close >= c.open; return <g key={i}><line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} className={up ? "stroke-positive" : "stroke-negative"}/><rect x={x - Math.max(1.5, step * .28)} width={Math.max(3, step * .56)} y={Math.min(y(c.open), y(c.close))} height={Math.max(1.5, Math.abs(y(c.open)-y(c.close)))} className={up ? "fill-positive" : "fill-negative"}/></g>; }) : <><path d={`${linePath} L${width},${volumeTop} L0,${volumeTop} Z`} fill={chartType === "AREA" ? `url(#chart-area-${stock.symbol})` : "transparent"}/><path d={linePath} fill="none" stroke="var(--color-primary-soft)" strokeWidth="2" className="animate-draw" style={{ ["--draw-length" as string]: "2400" }}/></>}
          {indicator && indicator !== "RSI" && <path d={maPath} fill="none" stroke="var(--color-warning)" strokeWidth="1.4" strokeDasharray="5 5"/>}
          {data.map((c, i) => <rect key={`v-${i}`} x={i * step + 1} y={volumeTop + 8 + (1 - c.volume / 2000000) * 55} width={Math.max(1, step - 2)} height={(c.volume / 2000000) * 55} className={c.close >= c.open ? "fill-positive/35" : "fill-negative/35"}/>)}
          {hover != null && <line x1={hover * step + step / 2} x2={hover * step + step / 2} y1="0" y2={height} stroke="var(--color-border-strong)" strokeDasharray="4 4"/>}
        </svg>
        <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap gap-2 font-mono text-[9px] num-tabular"><Pill>O {formatNum(focus?.open ?? 0)}</Pill><Pill tone="positive">H {formatNum(focus?.high ?? 0)}</Pill><Pill tone="negative">L {formatNum(focus?.low ?? 0)}</Pill><Pill>C {formatNum(focus?.close ?? 0)}</Pill></div>
        <span className="pointer-events-none absolute right-3 bottom-3 flex items-center gap-1 font-mono text-[9px] text-subtle"><Crosshair className="h-3 w-3"/> Hover to inspect · synthetic OHLCV</span>
      </div>
    </div>
  );
}