import { useState } from "react";
import { Check, Search } from "lucide-react";
import { nifty50 } from "@/data/nifty50";
import { useAddWatchlistItem } from "@/hooks/use-dashboard-data";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Adding a stock is an explicit choice, never a random next catalog item. */
export function WatchlistPicker({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: string[];
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const add = useAddWatchlistItem();
  const choices = nifty50.filter(
    (stock) =>
      !existing.includes(stock.symbol) &&
      `${stock.symbol} ${stock.company}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const stock = nifty50.find((item) => item.symbol === selected && !existing.includes(item.symbol));
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!add.isPending) onOpenChange(value);
      }}
    >
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg rounded-lg">
        <DialogHeader>
          <DialogTitle>Add to your watchlist</DialogTitle>
          <DialogDescription>
            Choose a company to follow. This does not create an order.
          </DialogDescription>
        </DialogHeader>
        <label className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-panel px-3">
          <Search aria-hidden="true" className="h-4 w-4 text-subtle" />
          <span className="sr-only">Find a company to watch</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Symbol or company name"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
          />
        </label>
        <div
          className="max-h-[min(40dvh,320px)] space-y-1 overflow-y-auto"
          role="group"
          aria-label="Available watchlist companies"
        >
          {choices.map((item) => (
            <button
              key={item.symbol}
              type="button"
              aria-pressed={selected === item.symbol}
              onClick={() => setSelected(item.symbol)}
              className={cn(
                "flex min-h-12 w-full items-center gap-3 rounded-md border p-3 text-left transition-colors",
                selected === item.symbol
                  ? "border-primary/50 bg-primary/10"
                  : "border-transparent hover:bg-panel",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{item.symbol}</span>
                <span className="block truncate text-xs text-muted-foreground">{item.company}</span>
              </span>
              {selected === item.symbol && (
                <Check className="h-4 w-4 text-primary-soft" aria-hidden="true" />
              )}
            </button>
          ))}
          {!choices.length && (
            <p className="p-3 text-sm text-muted-foreground">
              {existing.length >= nifty50.length
                ? "Every supported company is already on your watchlist."
                : "No matching company. Try another symbol or name."}
            </p>
          )}
        </div>
        {add.isError && (
          <p role="alert" className="text-sm text-negative">
            Could not add this company. Your choice is preserved; please retry.
          </p>
        )}
        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline" disabled={add.isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            disabled={!stock || add.isPending}
            onClick={async () => {
              if (!stock) return;
              try {
                await add.mutateAsync({ symbol: stock.symbol, company: stock.company });
                onOpenChange(false);
              } catch {
                /* inline recovery */
              }
            }}
          >
            {add.isPending ? "Adding…" : stock ? `Add ${stock.symbol}` : "Choose a company"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
