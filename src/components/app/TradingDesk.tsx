import {
  TradingDeskContext,
  type Ticket,
  type Side,
  type TradingDeskValue,
} from "./trading-desk-context";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Check, Command, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatINR, useAccount, useWatchlist } from "@/hooks/use-dashboard-data";
import { tradingErrorMessage } from "@/hooks/use-wallet";
import { usePlaceOrder } from "@/hooks/use-orders";
import { useRiskLimits, useTradingPreferences } from "@/hooks/use-trading-product";
import { nifty50, stockBySymbol } from "@/data/nifty50";
import { cn } from "@/lib/utils";
import { useStockQuote } from "@/hooks/use-agent-stock";
import { paperQuoteError } from "@/lib/paper-trading";
import { RiskPreviewPanel } from "@/components/app/risk/RiskPreviewPanel";
import { useTradeGuard } from "@/hooks/use-trade-guard";
import { useUniversalSearch } from "@/hooks/use-universal-search";
import { useWorkspacePrefs } from "@/hooks/use-workspace-prefs";
import { WORKSPACE_ROUTES } from "@/components/app/workspace-routes";

type OrderType = "MARKET" | "LIMIT" | "STOP";

const routes = WORKSPACE_ROUTES;

export function TradingDeskProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const place = usePlaceOrder();
  const { data: watchlist } = useWatchlist();
  const { data: account } = useAccount();
  const [ticketError, setTicketError] = useState<string | null>(null);
  const first = watchlist?.[0];
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const ticketOpen = ticket != null;
  // Dialogs take focus when they open and give it back when they close.
  useEffect(() => {
    if (ticketOpen) {
      returnFocus.current = document.activeElement as HTMLElement | null;
      drawerRef.current?.querySelector<HTMLElement>("button")?.focus();
    } else returnFocus.current?.focus?.();
  }, [ticketOpen]);
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [quantity, setQuantity] = useState(10);
  const [commandOpen, setCommandOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [largeConfirmed, setLargeConfirmed] = useState(false);
  const intentRef = useRef<{ key: string; id: string } | null>(null);
  const { data: limits } = useRiskLimits();
  const { data: preferences } = useTradingPreferences();
  const [triggerPrice, setTriggerPrice] = useState("");
  const feed = useStockQuote(ticket?.symbol ?? "", !!ticket && !confirmed);
  const marketPrice = feed.quote?.symbol === ticket?.symbol ? (feed.quote?.price ?? 0) : 0;
  const quoteError =
    !feed.connected || feed.quote?.symbol !== ticket?.symbol
      ? "Connecting to live market prices…"
      : paperQuoteError(feed.quote);
  const [acknowledged, setAcknowledged] = useState(false);
  const ticketLimit = Number(triggerPrice) || null;
  const guard = useTradeGuard(
    ticket && !confirmed && quantity > 0
      ? {
          symbol: ticket.symbol,
          side: ticket.side,
          quantity,
          order_type: orderType,
          limit_price: orderType === "MARKET" ? null : ticketLimit,
          stop: null,
          target: null,
          holding_days: null,
        }
      : null,
  );
  const ticketWarnings = guard.preview?.violations.filter((v) => v.severity === "WARN") ?? [];
  const ticketGate =
    guard.blocks[0] ??
    (ticketWarnings.length && !acknowledged ? "Confirm you have read the risk warnings." : null);
  const { workspace, save: saveWorkspace } = useWorkspacePrefs();
  const workspaceRef = useRef({ workspace, saveWorkspace });
  workspaceRef.current = { workspace, saveWorkspace };

  const openTicket = (next?: Partial<Ticket>) => {
    setConfirmed(false);
    setAcknowledged(false);
    setTicketError(null);
    setTriggerPrice("");
    setOrderType(preferences?.default_order_type ?? "MARKET");
    setQuantity(preferences?.default_quantity ?? 10);
    setTicket({
      symbol: next?.symbol ?? first?.symbol ?? "RELIANCE",
      price: next?.price ?? 0,
      side: next?.side ?? "BUY",
    });
  };

  const [helpOpen, setHelpOpen] = useState(false);
  const openRef = useRef(openTicket);
  openRef.current = openTicket;

  useEffect(() => {
    const go: Record<string, string> = {
      "1": "dashboard",
      "2": "markets",
      "3": "portfolio",
      "4": "orders",
      "5": "wallet",
      "6": "alerts",
      "7": "screener",
      "8": "risk",
      "9": "basket",
      j: "journal",
      e: "events",
      x: "xray",
      t: "track-record",
      l: "strategy-lab",
      m: "regime",
      p: "replay",
      h: "behavior",
    };
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
        return;
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setTicket(null);
        setHelpOpen(false);
        return;
      }
      const el = event.target as HTMLElement | null;
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        el?.closest("input,textarea,select,[contenteditable=true]")
      )
        return;
      const key = event.key.toLowerCase();
      const stockMatch = window.location.pathname.match(/\/app\/stocks\/([^/]+)/);
      if (key === "b" || key === "s") {
        const sym = stockMatch ? decodeURIComponent(stockMatch[1] ?? "") : undefined;
        openRef.current({ side: key === "b" ? "BUY" : "SELL", ...(sym ? { symbol: sym } : {}) });
      } else if (event.key === "?") setHelpOpen((v) => !v);
      else if (key === "f") {
        const { workspace: current, saveWorkspace: persist } = workspaceRef.current;
        persist.mutate({ focus_mode: !current.focus_mode });
      } else if (key === "v") {
        const { workspace: current, saveWorkspace: persist } = workspaceRef.current;
        persist.mutate({ review_mode: !current.review_mode });
      } else if (event.key === "/") {
        event.preventDefault();
        setCommandOpen(true);
      } else if (go[key] && !event.shiftKey) {
        const section = go[key];
        if (section === "dashboard") void navigate({ to: "/app/dashboard" });
        else void navigate({ to: "/app/$section", params: { section: section ?? "markets" } });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const results = useUniversalSearch(query, commandOpen);
  const shown = results.slice(0, 14);
  const [activeResult, setActiveResult] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => setActiveResult(0), [query, commandOpen]);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-option="${activeResult}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeResult]);
  const choose = (result: (typeof results)[number]) => {
    setCommandOpen(false);
    setQuery("");
    if (result.target.kind === "stock")
      void navigate({ to: "/app/stocks/$symbol", params: { symbol: result.target.symbol } });
    else if (result.target.kind === "url") window.open(result.target.url, "_blank", "noopener");
    else if (result.target.section === "dashboard") void navigate({ to: "/app/dashboard" });
    else void navigate({ to: "/app/$section", params: { section: result.target.section } });
  };

  const limitPrice = Number(triggerPrice) || marketPrice;
  const estimate = (orderType === "MARKET" ? marketPrice : limitPrice) * quantity;
  const walletBalance = Number(account?.wallet_balance ?? 0);

  return (
    <TradingDeskContext.Provider value={{ openTicket, openCommand: () => setCommandOpen(true) }}>
      {children}

      {helpOpen && (
        <div
          className="fixed inset-0 z-[85] grid place-items-center bg-background/80 px-4 backdrop-blur-md"
          onMouseDown={() => setHelpOpen(false)}
        >
          <section
            role="dialog"
            aria-label="Keyboard shortcuts"
            className="dash-rise w-full max-w-md rounded-lg border border-border-strong bg-panel p-5 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg">Keyboard shortcuts</h2>
            <dl className="mt-4 space-y-2 text-sm">
              {[
                ["B / S", "Buy / sell (current stock)"],
                ["⌘K or /", "Universal search: symbols, pages, claims, orders, news, research"],
                [
                  "1–9",
                  "Dashboard, Markets, Portfolio, Orders, Wallet, Alerts, Screener, Risk, Basket",
                ],
                ["J / E / X", "Decision plans, Event radar, Portfolio X-ray"],
                ["T / L / M", "Track record, Strategy lab, Regime map"],
                ["P / H", "Flight simulator, Behavioural risk"],
                ["F", "Toggle focus mode"],
                ["V", "Toggle review mode (blocks entries without a complete plan)"],
                ["?", "Toggle this help"],
                ["Esc", "Close any panel"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="shrink-0 border border-border px-2 py-0.5 font-mono text-[11px]">
                    {k}
                  </dt>
                  <dd className="text-right text-muted-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      )}

      {commandOpen && (
        <div
          className="animate-in fade-in fixed inset-0 z-[80] flex items-start justify-center bg-background/80 px-4 pt-[12vh] backdrop-blur-md duration-200"
          onMouseDown={() => setCommandOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            className="animate-in fade-in zoom-in-95 slide-in-from-top-2 w-full max-w-2xl overflow-hidden rounded-lg border border-border-strong bg-panel shadow-[0_40px_120px_-40px_rgba(0,0,0,0.95)] duration-300"
            onMouseDown={(event) => event.stopPropagation()}
            aria-label="Universal search"
          >
            <div className="flex h-14 items-center gap-3 border-b border-border px-4">
              <Search className="h-4 w-4 text-primary-soft" />
              <input
                autoFocus
                role="combobox"
                aria-expanded="true"
                aria-controls="command-results"
                aria-autocomplete="list"
                aria-activedescendant={shown.length ? `command-option-${activeResult}` : undefined}
                aria-label="Search symbols, pages, claims, orders, news and research"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown")
                    setActiveResult((i) => Math.min(shown.length - 1, i + 1));
                  else if (event.key === "ArrowUp") setActiveResult((i) => Math.max(0, i - 1));
                  else if (event.key === "Home") setActiveResult(0);
                  else if (event.key === "End") setActiveResult(Math.max(0, shown.length - 1));
                  else if (event.key === "Enter" && shown[activeResult])
                    choose(shown[activeResult]);
                  else return;
                  event.preventDefault();
                }}
                placeholder="Search symbols, pages, claims, orders, news and research…"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
              />
              <span className="border border-border px-2 py-1 font-mono text-[11px] text-subtle">
                ESC
              </span>
            </div>
            <div ref={listRef} className="max-h-[420px] overflow-y-auto p-2">
              <p
                aria-live="polite"
                className="px-3 py-2 font-medium text-[11px] tracking-[0.06em] uppercase text-subtle"
              >
                {query.trim() ? `${results.length} results` : "Pages and instruments"}
              </p>
              <div id="command-results" role="listbox" aria-label="Results">
                {shown.length === 0 && (
                  <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                    Nothing matches. Try a symbol such as RELIANCE, or a page name.
                  </p>
                )}
                {shown.map((result, index) => (
                  <div
                    key={`${result.type}-${result.id}`}
                    id={`command-option-${index}`}
                    data-option={index}
                    role="option"
                    aria-selected={index === activeResult}
                    onMouseMove={() => setActiveResult(index)}
                    onClick={() => choose(result)}
                    className={cn(
                      "relative flex w-full cursor-pointer items-center justify-between gap-3 rounded px-3 py-3 text-left transition-colors duration-150",
                      index === activeResult
                        ? "bg-primary/12 text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {index === activeResult && (
                      <span
                        aria-hidden="true"
                        className="absolute top-2 bottom-2 left-0 w-[2px] rounded-full bg-primary"
                      />
                    )}
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="shrink-0 border border-border px-1 font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                          {result.type}
                        </span>
                        <span className="truncate font-mono text-xs">{result.label}</span>
                      </span>
                      <span className="mt-1 block truncate text-[11px] text-subtle">
                        {result.meta}
                      </span>
                    </span>
                    <ArrowRight
                      aria-hidden="true"
                      className={cn(
                        "h-4 w-4 shrink-0 transition-all duration-200",
                        index === activeResult
                          ? "translate-x-0 text-primary-soft"
                          : "-translate-x-1 text-subtle",
                      )}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-border px-4 py-3 font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
              <span>↑ ↓ to move · Enter to open · Esc to close</span>
              <span className="flex items-center gap-1">
                <Command className="h-3 w-3" /> K
              </span>
            </div>
          </section>
        </div>
      )}

      {ticket && (
        <div
          className="animate-in fade-in fixed inset-0 z-[75] bg-background/60 backdrop-blur-sm duration-300"
          onMouseDown={() => setTicket(null)}
        >
          <aside
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            className="animate-in slide-in-from-right absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-border-strong bg-panel shadow-2xl duration-500 [animation-timing-function:var(--ease-out-expo)]"
            onMouseDown={(event) => event.stopPropagation()}
            aria-label="Simulated order ticket"
          >
            <header className="flex h-[68px] items-center justify-between border-b border-border px-5">
              <div>
                <p className="font-medium text-[11px] uppercase tracking-[0.06em] text-primary-soft">
                  Simulated execution
                </p>
                <h2 className="mt-1 text-lg">Order ticket</h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTicket(null)}
                aria-label="Close order ticket"
              >
                <X />
              </Button>
            </header>
            {confirmed ? (
              <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-full border border-positive/30 bg-positive/10 text-positive">
                  <Check className="h-6 w-6" />
                </span>
                <p className="mt-5 font-medium text-[11px] uppercase tracking-[0.06em] text-positive">
                  Simulated order accepted
                </p>
                <h3 className="mt-3 text-2xl">
                  {ticket.side} {quantity} {ticket.symbol}
                </h3>
                <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
                  {orderType === "MARKET"
                    ? `Settled against your wallet — balance is now ${formatINR(walletBalance)}.`
                    : "Resting in your simulated order book until it is filled or cancelled."}
                </p>
                <div className="mt-7 flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setTicket(null);
                      void navigate({ to: "/app/$section", params: { section: "orders" } });
                    }}
                  >
                    View orders
                  </Button>
                  <Button onClick={() => setTicket(null)}>Return to terminal</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col overflow-y-auto p-5">
                <div className="flex items-end justify-between border-b border-border pb-5">
                  <div>
                    <p className="font-mono text-[10px] text-subtle">NSE · EQUITY</p>
                    <p className="mt-1 font-mono text-2xl">{ticket.symbol}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-xl num-tabular">
                      {marketPrice > 0 ? formatINR(marketPrice) : "—"}
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-positive">
                      {feed.quote?.market_session === "closed"
                        ? "LAST TRADED PRICE"
                        : "LIVE MARKET PRICE"}
                    </p>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  {(["BUY", "SELL"] as const).map((side) => (
                    <Button
                      key={side}
                      variant="outline"
                      onClick={() => setTicket({ ...ticket, side })}
                      className={cn(
                        "h-11",
                        ticket.side === side &&
                          (side === "BUY"
                            ? "border-positive/50 bg-positive/10 text-positive"
                            : "border-negative/50 bg-negative/10 text-negative"),
                      )}
                    >
                      {side === "BUY" ? <ArrowDownLeft /> : <ArrowUpRight />}
                      {side}
                    </Button>
                  ))}
                </div>
                <label className="mt-6 font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                  Order type
                </label>
                <div className="mt-2 grid grid-cols-3 gap-1 rounded-md border border-border bg-background/40 p-1">
                  {(["MARKET", "LIMIT", "STOP"] as const).map((type) => (
                    <Button
                      key={type}
                      size="sm"
                      variant="ghost"
                      onClick={() => setOrderType(type)}
                      className={cn(
                        "font-mono text-[11px]",
                        orderType === type && "bg-primary/15 text-primary-soft",
                      )}
                    >
                      {type}
                    </Button>
                  ))}
                </div>
                <label className="mt-6 font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                  Quantity
                </label>
                {orderType !== "MARKET" && (
                  <label className="mt-4 text-xs text-subtle">
                    {orderType === "LIMIT" ? "Limit price" : "Trigger price"}
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={triggerPrice}
                      placeholder={marketPrice.toFixed(2)}
                      onChange={(event) => setTriggerPrice(event.target.value)}
                      className="mt-2 w-full border border-border bg-background/35 p-3 font-mono text-foreground outline-none"
                    />
                  </label>
                )}
                <div className="mt-2 flex items-center border border-border bg-background/35">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                  >
                    −
                  </Button>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
                    className="min-w-0 flex-1 bg-transparent text-center font-mono text-lg outline-none"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setQuantity((value) => value + 1)}
                  >
                    +
                  </Button>
                </div>
                <dl className="mt-6 space-y-3 border-y border-border py-5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Estimated value</dt>
                    <dd className="font-mono num-tabular">{formatINR(estimate)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Product</dt>
                    <dd className="font-mono">DELIVERY</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Validity</dt>
                    <dd className="font-mono">DAY</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Wallet balance</dt>
                    <dd
                      className={cn(
                        "font-mono num-tabular",
                        estimate > walletBalance && ticket.side === "BUY"
                          ? "text-negative"
                          : undefined,
                      )}
                    >
                      {formatINR(walletBalance)}
                    </dd>
                  </div>
                </dl>
                <div className="mt-5">
                  <RiskPreviewPanel
                    compact
                    preview={guard.preview}
                    protection={guard.protection}
                    blocks={guard.blocks}
                    symbol={ticket.symbol}
                  />
                  {ticketWarnings.length > 0 && !guard.blocks.length && (
                    <label className="mt-3 flex cursor-pointer items-start gap-2 text-[11.5px] text-muted-foreground">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={acknowledged}
                        onChange={(event) => setAcknowledged(event.target.checked)}
                      />
                      I have read the warnings. For stops, targets and a linked plan, use the stock
                      page ticket.
                    </label>
                  )}
                </div>
                {ticketError && (
                  <p className="mt-4 border border-negative/40 bg-negative/10 px-3 py-2 text-[11.5px] text-negative">
                    {ticketError}
                  </p>
                )}
                <div className="mt-auto pt-6">
                  <p className="mb-3 text-[11px] leading-relaxed text-subtle">
                    Paper trading with virtual funds. Fyers supplies prices only.
                  </p>
                  {feed.quote?.market_session === "closed" && (
                    <p className="mb-3 text-xs text-warning">
                      Market closed. Live paper fills require an open exchange session.
                    </p>
                  )}
                  {limits &&
                    marketPrice * quantity > limits.confirmation_above &&
                    !largeConfirmed && (
                      <p role="alert" className="mb-3 text-xs text-warning">
                        Estimated value exceeds your confirmation threshold of{" "}
                        {formatINR(limits.confirmation_above)}. Press once more to confirm.
                      </p>
                    )}
                  {quoteError && (
                    <p role="status" className="mb-3 text-xs text-warning">
                      {quoteError}
                    </p>
                  )}
                  {!quoteError && ticketGate && (
                    <p role="status" className="mb-3 text-xs text-warning">
                      {ticketGate}
                    </p>
                  )}
                  <Button
                    disabled={place.isPending || !!quoteError || !!ticketGate}
                    onClick={() => {
                      setTicketError(null);
                      if (
                        limits &&
                        marketPrice * quantity > limits.confirmation_above &&
                        !largeConfirmed
                      ) {
                        setLargeConfirmed(true);
                        return;
                      }
                      setLargeConfirmed(false);
                      const details = {
                        symbol: ticket.symbol,
                        company: stockBySymbol(ticket.symbol)?.company ?? ticket.symbol,
                        side: ticket.side,
                        order_type: orderType,
                        quantity,
                        limit_price: orderType === "MARKET" ? null : Number(limitPrice.toFixed(2)),
                      };
                      // Reuse the intent for an identical retry so a lost response cannot duplicate.
                      const key = JSON.stringify(details);
                      if (intentRef.current?.key !== key)
                        intentRef.current = { key, id: crypto.randomUUID() };
                      void place
                        .mutateAsync({
                          ...details,
                          price: marketPrice,
                          intent_id: intentRef.current.id,
                        })
                        .then(() => {
                          intentRef.current = null;
                          setConfirmed(true);
                        })
                        .catch((error: unknown) => setTicketError(tradingErrorMessage(error)));
                    }}
                    className={cn(
                      "h-12 w-full font-mono text-xs tracking-[0.04em]",
                      ticket.side === "SELL" && "bg-negative text-foreground hover:bg-negative/90",
                    )}
                  >
                    Paper {ticket.side.toLowerCase()}
                  </Button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </TradingDeskContext.Provider>
  );
}
