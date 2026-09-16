import { AnimatedNumber } from "@/components/site/AnimatedNumber";
import { instruments } from "@/data/market";
import { formatQuote, useLiveQuotes } from "@/hooks/use-live";
import { cn } from "@/lib/utils";

/** Continuously scrolling tape of the demonstrative dataset. */
export function MarketTicker() {
  const quotes = useLiveQuotes(instruments, { interval: 2400 });
  const row = instruments.map((inst, i) => ({ inst, quote: quotes[i] }));

  return (
    <div
      className="relative w-full overflow-hidden border-y border-border bg-surface py-3"
      aria-label="Sample market tape"
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-linear-to-r from-surface to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-linear-to-l from-surface to-transparent" />
      <div className="marquee-track flex w-max items-center gap-10 px-6">
        {[0, 1].map((pass) => (
          <div key={pass} className="flex items-center gap-10" aria-hidden={pass === 1}>
            {row.map(({ inst, quote }) => {
              const change = quote?.change ?? inst.change;
              const last = quote?.last ?? Number(inst.last.replace(/,/g, ""));
              return (
                <span key={`${pass}-${inst.symbol}`} className="flex items-center gap-3 font-mono text-[11px]">
                  <span className="tracking-[0.16em] uppercase text-muted-foreground">
                    {inst.symbol}
                  </span>
                  <span className="num-tabular text-foreground">{formatQuote(last)}</span>
                  <AnimatedNumber
                    value={change}
                    signed
                    suffix="%"
                    className={cn(change >= 0 ? "text-positive" : "text-negative")}
                  />
                  <span aria-hidden="true" className="h-3 w-px bg-border-strong" />
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
