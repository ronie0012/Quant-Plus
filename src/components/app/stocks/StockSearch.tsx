import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { agentFetch } from "@/lib/agent-api";
import { Button } from "@/components/ui/button";
import { usePredictionPreload } from "@/hooks/use-agent-stock";

type Match = { symbol: string; company: string; sector: string };

/** Catalog matches plus direct lookup for NSE symbols outside the catalog. */
export function StockSearch() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input]);
  const search = useQuery<{ stocks: Match[] }, Error>({
    queryKey: ["stock-search", query],
    queryFn: async ({ signal }) =>
      (await agentFetch(`stocks/search?q=${encodeURIComponent(query)}`, { signal })).json(),
    enabled: query.length >= 2,
    staleTime: 300_000,
    retry: false,
  });
  const symbol = input.trim().toUpperCase().replace(/\.NS$/, "");
  usePredictionPreload(search.data?.stocks.slice(0, 5).map((stock) => stock.symbol) ?? []);
  const valid = /^[A-Z0-9][A-Z0-9&-]{0,29}$/.test(symbol);
  return (
    <div className="rounded-lg border border-border bg-panel/80 p-4">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) void navigate({ to: "/app/stocks/$symbol", params: { symbol } });
        }}
      >
        <label className="flex min-w-0 flex-1 items-center gap-2 border border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-subtle" />
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Find any NSE stock by company or symbol"
            aria-label="Find any NSE stock"
            className="w-full bg-transparent py-3 text-sm outline-none"
          />
        </label>
        <Button type="submit" variant="outline" disabled={!valid}>
          Open symbol
        </Button>
      </form>
      <p className="mt-2 text-xs text-subtle">
        Search companies in the catalog, or enter any supported NSE symbol directly.
      </p>
      {query.length >= 2 && (
        <div className="mt-3 space-y-1">
          {search.isPending && <p className="text-xs text-muted-foreground">Searching stocks…</p>}
          {search.error && <p className="text-xs text-negative">{search.error.message}</p>}
          {search.data?.stocks.map((stock) => (
            <Link
              key={stock.symbol}
              to="/app/stocks/$symbol"
              params={{ symbol: stock.symbol }}
              className="flex items-center justify-between gap-4 rounded px-3 py-2 text-sm hover:bg-panel-elevated"
            >
              <span className="font-mono text-primary-soft">{stock.symbol}</span>
              <span className="truncate text-muted-foreground">{stock.company}</span>
            </Link>
          ))}
          {search.data?.stocks.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No catalog match. You can still open a valid NSE symbol directly.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
