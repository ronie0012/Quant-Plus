import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { Card, CardHead, Pill } from "@/components/app/cards";
import { rippleName, useRippleOrigins } from "@/hooks/use-ripple";
import { EDGE_LABELS, isFactor, propagate, RIPPLE_EDGES } from "@/lib/quant/ripple";

/**
 * "What moves this stock": the mapped drivers of one company, and any of
 * today's news ripples that reach it, with the chain in one line.
 */
export function StockRipplePanel({ symbol }: { symbol: string }) {
  const { origins } = useRippleOrigins();
  const drivers = useMemo(
    () =>
      RIPPLE_EDGES.filter((edge) => edge.to === symbol)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 5),
    [symbol],
  );
  const reaching = useMemo(
    () =>
      origins
        .filter((origin) => origin.origin !== symbol)
        .flatMap((origin) => {
          const impact = propagate(origin.origin, origin.direction).find(
            (i) => i.symbol === symbol,
          );
          return impact ? [{ origin, impact }] : [];
        })
        .slice(0, 3),
    [origins, symbol],
  );

  if (!drivers.length && !reaching.length) return null;

  return (
    <Card delay={260}>
      <CardHead
        title={`What moves ${symbol}`}
        meta="Mapped links and today's ripples"
        action={
          <Link
            to="/app/$section"
            params={{ section: "ripple" }}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-primary-soft hover:text-foreground"
          >
            Ripple map
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        }
      />
      {reaching.length > 0 && (
        <ul className="divide-y divide-border border-b border-border">
          {reaching.map(({ origin, impact }) => (
            <li key={origin.id} className="flex gap-3 px-5 py-3">
              {impact.direction === "UP" ? (
                <ArrowUpRight
                  className="mt-0.5 h-4 w-4 shrink-0 text-positive"
                  aria-hidden="true"
                />
              ) : (
                <ArrowDownRight
                  className="mt-0.5 h-4 w-4 shrink-0 text-negative"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0">
                <p className="text-[12.5px] leading-snug text-foreground">{origin.title}</p>
                <p className="mt-0.5 text-[11px] text-subtle">
                  {impact.path.map(rippleName).join(" → ")} ·{" "}
                  {impact.direction === "UP" ? "may lift" : "may weigh on"} {symbol}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ul className="flex flex-col gap-2.5 px-5 py-4">
        {drivers.map((edge) => (
          <li key={`${edge.from}-${edge.type}`} className="text-[12.5px] leading-snug">
            <span className="flex items-center gap-2">
              <span className="font-medium text-foreground">{rippleName(edge.from)}</span>
              <Pill tone={isFactor(edge.from) ? "neutral" : "primary"}>
                {EDGE_LABELS[edge.type]}
              </Pill>
            </span>
            <span className="mt-0.5 block text-muted-foreground">{edge.why}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
