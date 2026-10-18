import { Pause, Play } from "lucide-react";
import { useState } from "react";

const PHRASES = [
  "Local paper trading",
  "Provider market data with source and freshness",
  "Research with visible uncertainty",
  "Decision plans before orders",
  "Pre-trade risk in rupees",
  "Evidence you can trace",
  "Calibrated track records",
  "No invented statistics",
];

/** Product principles as a slow marquee; a static list for reduced motion and screen readers. */
export function MarketTicker() {
  const [paused, setPaused] = useState(false);
  const row = (hidden: boolean) => (
    <ul
      aria-hidden={hidden || undefined}
      className="flex shrink-0 items-center motion-reduce:shrink motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:gap-y-2"
    >
      {PHRASES.map((phrase) => (
        <li key={phrase} className="flex items-center gap-6 px-6 whitespace-nowrap">
          <span className="font-mono text-[11px] tracking-[0.18em] uppercase text-muted-foreground">
            {phrase}
          </span>
          <span aria-hidden="true" className="h-1 w-1 rotate-45 bg-primary" />
        </li>
      ))}
    </ul>
  );
  return (
    <div
      className={`marquee relative overflow-hidden border-y border-border bg-surface py-4 ${paused ? "marquee-paused" : ""}`}
      aria-label="Quant Plus principles"
      role="region"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-surface to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-surface to-transparent"
      />
      <div className="marquee-track flex w-max motion-reduce:w-auto motion-reduce:flex-wrap">
        {row(false)}
        <div className="motion-reduce:hidden">{row(true)}</div>
      </div>
      <button
        type="button"
        aria-label={paused ? "Resume moving principles" : "Pause moving principles"}
        aria-pressed={paused}
        onClick={() => setPaused((value) => !value)}
        className="absolute top-1/2 right-3 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center border border-border-strong bg-surface/95 text-muted-foreground backdrop-blur-sm transition-colors duration-200 hover:border-primary hover:text-foreground focus-visible:outline-none sm:right-5"
      >
        {paused ? (
          <Play aria-hidden="true" className="h-3.5 w-3.5" />
        ) : (
          <Pause aria-hidden="true" className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}
