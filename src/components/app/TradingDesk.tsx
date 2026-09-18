import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Command,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatINR, useAccount, useWatchlist } from "@/hooks/use-dashboard-data";
import { tradingErrorMessage } from "@/hooks/use-wallet";
import { usePlaceOrder } from "@/hooks/use-orders";
import { nifty50, stockBySymbol } from "@/data/nifty50";
import { cn } from "@/lib/utils";

type Side = "BUY" | "SELL";
type OrderType = "MARKET" | "LIMIT" | "STOP";
type Ticket = { symbol: string; price: number; side: Side };

type TradingDeskValue = {
  openTicket: (ticket?: Partial<Ticket>) => void;
  openCommand: () => void;
};

const TradingDeskContext = createContext<TradingDeskValue | null>(null);

export function useTradingDesk() {
  const value = useContext(TradingDeskContext);
  if (!value) throw new Error("useTradingDesk must be used inside TradingDeskProvider");
  return value;
}

const routes = [
  { label: "Dashboard", section: "dashboard" },
  { label: "Markets", section: "markets" },
  { label: "Portfolio", section: "portfolio" },
  { label: "Watchlist", section: "watchlist" },
  { label: "Research", section: "research" },
  { label: "Quant AI", section: "quant-ai" },
] as const;

export function TradingDeskProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const place = usePlaceOrder();
  const { data: watchlist } = useWatchlist();
  const { data: account } = useAccount();
  const [ticketError, setTicketError] = useState<string | null>(null);
  const first = watchlist?.[0];
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [quantity, setQuantity] = useState(10);
  const [commandOpen, setCommandOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const openTicket = (next?: Partial<Ticket>) => {
    setConfirmed(false);
    setTicketError(null);
    setTicket({
      symbol: next?.symbol ?? first?.symbol ?? "RELIANCE",
      price: next?.price ?? Number(first?.price ?? 0),
      side: next?.side ?? "BUY",
    });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setTicket(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const pages = routes.map(({ label, section }) => ({ label, meta: "Workspace", section }));
    const symbols = nifty50.map((item) => ({
      label: item.symbol,
      meta: item.company,
      section: "stock" as const,
    }));
    return [...pages, ...symbols].filter(
      (item) => !needle || `${item.label} ${item.meta}`.toLowerCase().includes(needle),
    );
  }, [query]);

  const estimate = (ticket?.price ?? 0) * quantity;
  const walletBalance = Number(account?.wallet_balance ?? 0);

  return (
    <TradingDeskContext.Provider value={{ openTicket, openCommand: () => setCommandOpen(true) }}>
      {children}

      {commandOpen && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center bg-background/80 px-4 pt-[12vh] backdrop-blur-md" onMouseDown={() => setCommandOpen(false)}>
          <section className="dash-rise w-full max-w-2xl overflow-hidden rounded-lg border border-border-strong bg-panel shadow-2xl" onMouseDown={(event) => event.stopPropagation()} aria-label="Command palette">
            <div className="flex h-14 items-center gap-3 border-b border-border px-4">
              <Search className="h-4 w-4 text-primary-soft" />
              <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search instruments or jump to a workspace…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle" />
              <span className="border border-border px-2 py-1 font-mono text-[9px] text-subtle">ESC</span>
            </div>
            <div className="max-h-[420px] overflow-y-auto p-2">
              <p className="px-3 py-2 font-mono text-[9px] tracking-[0.18em] uppercase text-subtle">Commands & instruments</p>
              {results.slice(0, 9).map((result) => (
                <Button key={`${result.section}-${result.label}`} variant="ghost" onClick={() => { setCommandOpen(false); setQuery(""); if (result.section === "stock") void navigate({ to: "/app/stocks/$symbol", params: { symbol: result.label } }); else if (result.section === "dashboard") void navigate({ to: "/app/dashboard" }); else void navigate({ to: "/app/$section", params: { section: result.section } }); }} className="h-auto w-full justify-between rounded px-3 py-3 text-left font-normal">
                  <span><span className="block font-mono text-xs">{result.label}</span><span className="mt-1 block text-[11px] text-subtle">{result.meta}</span></span>
                  <ArrowRight className="text-subtle" />
                </Button>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-border px-4 py-3 font-mono text-[9px] uppercase tracking-[0.14em] text-subtle">
              <span>Quick navigation</span><span className="flex items-center gap-1"><Command className="h-3 w-3" /> K</span>
            </div>
          </section>
        </div>
      )}

      {ticket && (
        <div className="fixed inset-0 z-[75] bg-background/60 backdrop-blur-sm" onMouseDown={() => setTicket(null)}>
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-border-strong bg-panel shadow-2xl" onMouseDown={(event) => event.stopPropagation()} aria-label="Simulated order ticket">
            <header className="flex h-[68px] items-center justify-between border-b border-border px-5">
              <div><p className="font-mono text-[9px] uppercase tracking-[0.2em] text-primary-soft">Simulated execution</p><h2 className="mt-1 text-lg">Order ticket</h2></div>
              <Button variant="ghost" size="icon" onClick={() => setTicket(null)} aria-label="Close order ticket"><X /></Button>
            </header>
            {confirmed ? (
              <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-full border border-positive/30 bg-positive/10 text-positive"><Check className="h-6 w-6" /></span>
                <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.2em] text-positive">Simulated order accepted</p>
                <h3 className="mt-3 text-2xl">{ticket.side} {quantity} {ticket.symbol}</h3>
                <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">{orderType === "MARKET" ? `Settled against your wallet — balance is now ${formatINR(walletBalance)}.` : "Resting in your simulated order book until it is filled or cancelled."}</p>
                <div className="mt-7 flex gap-2"><Button variant="outline" onClick={() => { setTicket(null); void navigate({ to: "/app/$section", params: { section: "orders" } }); }}>View orders</Button><Button onClick={() => setTicket(null)}>Return to terminal</Button></div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-end justify-between border-b border-border pb-5">
                  <div><p className="font-mono text-[10px] text-subtle">NSE · EQUITY</p><p className="mt-1 font-mono text-2xl">{ticket.symbol}</p></div>
                  <div className="text-right"><p className="font-mono text-xl num-tabular">₹{ticket.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p><p className="mt-1 font-mono text-[10px] text-positive">DEMONSTRATIVE QUOTE</p></div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  {(["BUY", "SELL"] as const).map((side) => <Button key={side} variant="outline" onClick={() => setTicket({ ...ticket, side })} className={cn("h-11", ticket.side === side && (side === "BUY" ? "border-positive/50 bg-positive/10 text-positive" : "border-negative/50 bg-negative/10 text-negative"))}>{side === "BUY" ? <ArrowDownLeft /> : <ArrowUpRight />}{side}</Button>)}
                </div>
                <label className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">Order type</label>
                <div className="mt-2 grid grid-cols-3 gap-1 rounded-md border border-border bg-background/40 p-1">
                  {(["MARKET", "LIMIT", "STOP"] as const).map((type) => <Button key={type} size="sm" variant="ghost" onClick={() => setOrderType(type)} className={cn("font-mono text-[9px]", orderType === type && "bg-primary/15 text-primary-soft")}>{type}</Button>)}
                </div>
                <label className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">Quantity</label>
                <div className="mt-2 flex items-center border border-border bg-background/35">
                  <Button variant="ghost" size="icon" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</Button>
                  <input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} className="min-w-0 flex-1 bg-transparent text-center font-mono text-lg outline-none" />
                  <Button variant="ghost" size="icon" onClick={() => setQuantity((value) => value + 1)}>+</Button>
                </div>
                <dl className="mt-6 space-y-3 border-y border-border py-5 text-sm">
                  <div className="flex justify-between"><dt className="text-muted-foreground">Estimated value</dt><dd className="font-mono num-tabular">{formatINR(estimate)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Product</dt><dd className="font-mono">DELIVERY</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Validity</dt><dd className="font-mono">DAY</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Wallet balance</dt><dd className={cn("font-mono num-tabular", estimate > walletBalance && ticket.side === "BUY" ? "text-negative" : undefined)}>{formatINR(walletBalance)}</dd></div>
                </dl>
                {ticketError && <p className="mt-4 border border-negative/40 bg-negative/10 px-3 py-2 text-[11.5px] text-negative">{ticketError}</p>}
                <div className="mt-auto pt-6"><p className="mb-3 text-[11px] leading-relaxed text-subtle">Simulation only. No funds or securities will move.</p><Button disabled={place.isPending} onClick={() => { setTicketError(null); void place.mutateAsync({ symbol: ticket.symbol, company: stockBySymbol(ticket.symbol)?.company ?? ticket.symbol, side: ticket.side, order_type: orderType, quantity, price: Number(ticket.price.toFixed(2)), limit_price: orderType === "MARKET" ? null : Number(ticket.price.toFixed(2)) }).then(() => setConfirmed(true)).catch((error: unknown) => setTicketError(tradingErrorMessage(error))); }} className={cn("h-12 w-full font-mono text-xs tracking-[0.16em]", ticket.side === "SELL" && "bg-negative text-foreground hover:bg-negative/90")}>Place {ticket.side.toLowerCase()} order</Button></div>
              </div>
            )}
          </aside>
        </div>
      )}
    </TradingDeskContext.Provider>
  );
}