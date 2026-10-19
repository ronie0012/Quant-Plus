import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAddWatchlistItem, useWatchlist } from "@/hooks/use-dashboard-data";
import { rippleName } from "@/hooks/use-ripple";

export function RippleWatchlistButton({ symbol }: { symbol: string }) {
  const watchlist = useWatchlist();
  const save = useAddWatchlistItem();
  const saved = watchlist.data?.some((item) => item.symbol === symbol);

  return (
    <div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-11 gap-2"
        disabled={watchlist.isLoading || save.isPending || saved}
        onClick={() => save.mutate({ symbol, company: rippleName(symbol) })}
      >
        {save.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : saved ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Star className="h-4 w-4" aria-hidden="true" />
        )}
        {save.isPending ? "Saving…" : saved ? "In watchlist" : "Add to watchlist"}
      </Button>
      {saved && (
        <span role="status" className="sr-only">
          {symbol} is in your watchlist
        </span>
      )}
      {save.error && (
        <p role="alert" className="mt-2 max-w-xs text-[12px] text-warning">
          Could not save {symbol}. Try again.
        </p>
      )}
    </div>
  );
}

export function RippleResearchActions({ symbol }: { symbol: string }) {
  return (
    <div className="space-y-3 border-t border-border pt-4">
      <h3 className="text-[14px] font-semibold">Continue your research</h3>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        Check price action and evidence, save the company to follow, or write a decision plan with a
        counter-case and risk boundary.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" className="min-h-11 gap-2">
          <Link to="/app/stocks/$symbol" params={{ symbol }}>
            Research {symbol}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
        <RippleWatchlistButton key={symbol} symbol={symbol} />
        <Button asChild size="sm" variant="ghost" className="min-h-11">
          <Link to="/app/$section" params={{ section: "journal" }} search={{ symbol } as never}>
            Create decision plan
          </Link>
        </Button>
      </div>
      <p className="text-[12px] text-subtle">
        These actions do not place an order. Watching or deciding not to trade is a valid outcome.
      </p>
    </div>
  );
}
