import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { RefreshCw, Search } from "lucide-react";
import { Card, CardHead } from "@/components/app/cards";
import { EmptyModule, MetricStrip, PageIntro, Segmented } from "@/components/app/pages/workspace";
import { Button } from "@/components/ui/button";
import { agentFetch } from "@/lib/agent-api";
import { formatNum } from "@/hooks/use-dashboard-data";
import { atmStrike, maxPain, type ChainRow, type ChainSide } from "@/lib/options";
import { cn } from "@/lib/utils";

type OptionChain = {
  underlying: string;
  spot: number | null;
  source: string;
  as_of: string;
  expiries: { expiry: string; date: string }[];
  rows: ChainRow[];
  call_oi: number | null;
  put_oi: number | null;
  pcr: number | null;
  served_from_cache?: boolean;
  cached_at?: string;
};

const INDICES = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"] as const;
const STRIKE_COUNTS = ["10", "20", "30"] as const;

const compact = (value: number | null | undefined) => {
  if (value == null) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e7) return `${formatNum(value / 1e7)}Cr`;
  if (abs >= 1e5) return `${formatNum(value / 1e5)}L`;
  if (abs >= 1e3) return `${formatNum(value / 1e3, 1)}K`;
  return formatNum(value, 0);
};
const signed = (value: number | null | undefined, digits = 2) =>
  value == null ? "—" : `${value > 0 ? "+" : ""}${formatNum(value, digits)}`;

/** Observed FYERS option chain: calls and puts paired by strike, display only. */
export function OptionsPage() {
  const [underlying, setUnderlying] = useState<string>("NIFTY");
  const [stockInput, setStockInput] = useState("");
  const [expiry, setExpiry] = useState("");
  const [strikes, setStrikes] = useState<(typeof STRIKE_COUNTS)[number]>("10");
  const chain = useQuery<OptionChain, Error>({
    queryKey: ["option-chain", underlying, expiry, strikes],
    queryFn: async ({ signal }) =>
      (
        await agentFetch(
          `market/${encodeURIComponent(underlying)}/option-chain?strikes=${strikes}${expiry ? `&expiry=${expiry}` : ""}`,
          { signal },
        )
      ).json(),
    refetchInterval: 15_000,
    retry: 1,
  });
  const data = chain.data;
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const atm = atmStrike(rows, data?.spot ?? null);
  const pain = maxPain(rows);
  const maxOi = Math.max(1, ...rows.flatMap((row) => [row.call?.oi ?? 0, row.put?.oi ?? 0]));
  const atmRef = useRef<HTMLTableRowElement>(null);
  const centred = useRef("");
  useEffect(() => {
    const key = `${underlying}|${expiry}|${strikes}`;
    if (atm == null || centred.current === key) return;
    centred.current = key;
    atmRef.current?.scrollIntoView({ block: "center", behavior: "auto" });
  }, [atm, underlying, expiry, strikes]);

  const chooseStock = (event: FormEvent) => {
    event.preventDefault();
    const symbol = stockInput.trim().toUpperCase().replace(/\.NS$/, "");
    if (!/^[A-Z0-9][A-Z0-9&-]{0,29}$/.test(symbol)) return;
    setUnderlying(symbol);
    setExpiry("");
  };
  const selectedExpiry = expiry || data?.expiries[0]?.expiry || "";

  return (
    <div className="flex flex-col gap-4">
      <PageIntro
        eyebrow="Derivatives"
        title="Option chain"
        body="Observed FYERS option prices and open interest by strike. Display only: option orders are not part of the paper book."
        status={
          data ? (data.served_from_cache ? "Last known chain" : "FYERS · live") : "Market data"
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Underlying index"
          className="flex gap-0.5 rounded-md border border-border bg-background/50 p-0.5"
        >
          {INDICES.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={underlying === name}
              onClick={() => {
                setUnderlying(name);
                setExpiry("");
              }}
              className="h-8 rounded px-3 font-mono text-[12px] text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-panel-elevated aria-pressed:text-foreground"
            >
              {name}
            </button>
          ))}
        </div>
        <form onSubmit={chooseStock} className="flex items-center gap-1" role="search">
          <label htmlFor="option-stock" className="sr-only">
            F&amp;O stock symbol
          </label>
          <input
            id="option-stock"
            value={stockInput}
            onChange={(event) => setStockInput(event.target.value)}
            placeholder="F&O stock, e.g. RELIANCE"
            className="h-9 w-48 rounded-md border border-border bg-background px-2 text-[13px]"
          />
          <Button type="submit" size="sm" variant="outline" aria-label="Load stock option chain">
            <Search />
          </Button>
        </form>
        <label className="ml-auto flex items-center gap-2 text-[12px] text-subtle">
          Expiry
          <select
            value={selectedExpiry}
            onChange={(event) => setExpiry(event.target.value)}
            disabled={!data?.expiries.length}
            className="h-9 rounded-md border border-border bg-background px-2 text-[13px] text-foreground"
          >
            {(data?.expiries ?? []).map((item) => (
              <option key={item.expiry} value={item.expiry}>
                {item.date}
              </option>
            ))}
            {!data?.expiries.length && <option value="">—</option>}
          </select>
        </label>
        <Segmented
          items={STRIKE_COUNTS}
          value={strikes}
          onChange={setStrikes}
          label="Strikes either side"
        />
      </div>

      {chain.isError && !data ? (
        <Card>
          <EmptyModule
            title="Options unavailable"
            body={`${chain.error.message}. Index and stock option chains appear here once FYERS market data is connected.`}
          />
          <div className="flex justify-center gap-2 pb-6">
            <Button size="sm" variant="outline" onClick={() => void chain.refetch()}>
              <RefreshCw /> Retry
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <Link to="/app/$section" params={{ section: "settings" }}>
                Connect FYERS
              </Link>
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <MetricStrip
            items={[
              {
                label: `${underlying} spot`,
                value: data?.spot != null ? formatNum(data.spot) : "—",
              },
              {
                label: "Put-call ratio",
                value: data?.pcr != null ? formatNum(data.pcr) : "—",
                ...(data?.pcr != null
                  ? { tone: data.pcr >= 1 ? ("positive" as const) : ("negative" as const) }
                  : {}),
              },
              { label: "Max pain", value: pain != null ? formatNum(pain, 0) : "—" },
              { label: "Call OI", value: compact(data?.call_oi) },
              { label: "Put OI", value: compact(data?.put_oi) },
            ]}
          />
          <Card className="overflow-hidden">
            <CardHead
              title={`${underlying} option chain`}
              meta={
                data
                  ? `${data.served_from_cache ? "Last known · provider offline · " : ""}As of ${new Date(data.cached_at ?? data.as_of).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · refreshes every 15s`
                  : "Loading…"
              }
            />
            <div
              className="max-h-[calc(100dvh-20rem)] overflow-auto"
              tabIndex={0}
              role="region"
              aria-label="Option chain table"
            >
              <table className="w-full min-w-[980px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-border">
                    <th colSpan={5} className="py-1.5 text-center text-positive">
                      CALLS
                    </th>
                    <th className="py-1.5 text-center">STRIKE</th>
                    <th colSpan={5} className="py-1.5 text-center text-negative">
                      PUTS
                    </th>
                  </tr>
                  <tr className="border-b border-border text-right">
                    {["OI", "Chg OI", "Volume", "Chg %", "LTP"].map((h) => (
                      <th key={`c-${h}`} className="px-3 py-1.5 font-medium">
                        {h}
                      </th>
                    ))}
                    <th className="px-3 py-1.5 text-center font-medium">Price</th>
                    {["LTP", "Chg %", "Volume", "Chg OI", "OI"].map((h) => (
                      <th key={`p-${h}`} className="px-3 py-1.5 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chain.isPending &&
                    Array.from({ length: 10 }, (_, i) => (
                      <tr key={i} className="border-b border-border/60">
                        <td colSpan={11} className="px-3 py-2">
                          <div className="shimmer h-4 rounded" />
                        </td>
                      </tr>
                    ))}
                  {rows.map((row) => {
                    const spot = data?.spot ?? null;
                    const callItm = spot != null && row.strike < spot;
                    const putItm = spot != null && row.strike > spot;
                    return (
                      <tr
                        key={row.strike}
                        ref={row.strike === atm ? atmRef : undefined}
                        className={cn(
                          "border-b border-border/60 text-right font-mono num-tabular",
                          row.strike === atm &&
                            "outline outline-1 -outline-offset-1 outline-primary/60",
                        )}
                      >
                        <ChainCells side={row.call} itm={callItm} maxOi={maxOi} mirror={false} />
                        <td className="bg-panel-elevated/60 px-3 py-1.5 text-center font-semibold text-foreground">
                          {formatNum(row.strike, row.strike % 1 ? 2 : 0)}
                          {row.strike === pain && (
                            <span
                              className="ml-1 text-[10px] font-normal text-warning"
                              title="Max pain"
                            >
                              MP
                            </span>
                          )}
                        </td>
                        <ChainCells side={row.put} itm={putItm} maxOi={maxOi} mirror />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="text-[11px] text-subtle">
            Shaded cells are in the money. OI bars are relative to the largest open interest shown.
            PCR and max pain use observed open interest only; no implied volatility or Greeks are
            estimated.
          </p>
        </>
      )}
    </div>
  );
}

function ChainCells({
  side,
  itm,
  maxOi,
  mirror,
}: {
  side: ChainSide | null;
  itm: boolean;
  maxOi: number;
  mirror: boolean;
}) {
  const shade = itm ? "bg-warning/[0.06]" : "";
  const tone = (value: number | null | undefined) =>
    value == null ? "text-subtle" : value > 0 ? "text-positive" : value < 0 ? "text-negative" : "";
  const oi = (
    <td key="oi" className={cn("relative px-3 py-1.5", shade)}>
      {side?.oi != null && (
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-y-1 rounded-sm",
            mirror ? "left-0 bg-negative/15" : "right-0 bg-positive/15",
          )}
          style={{ width: `${(side.oi / maxOi) * 100}%` }}
        />
      )}
      <span className="relative">{compact(side?.oi)}</span>
    </td>
  );
  const cells = [
    oi,
    <td key="oich" className={cn("px-3 py-1.5", shade, tone(side?.oi_change))}>
      {side?.oi_change == null ? "—" : `${side.oi_change > 0 ? "+" : ""}${compact(side.oi_change)}`}
    </td>,
    <td key="vol" className={cn("px-3 py-1.5 text-muted-foreground", shade)}>
      {compact(side?.volume)}
    </td>,
    <td key="chg" className={cn("px-3 py-1.5", shade, tone(side?.change_pct))}>
      {side?.change_pct == null ? "—" : `${signed(side.change_pct)}%`}
    </td>,
    <td key="ltp" className={cn("px-3 py-1.5 font-semibold text-foreground", shade)}>
      {side?.ltp != null ? formatNum(side.ltp) : "—"}
    </td>,
  ];
  return <>{mirror ? cells.reverse() : cells}</>;
}
