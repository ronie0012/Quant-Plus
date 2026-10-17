import { Card, CardHead, Pill } from "@/components/app/cards";
import { formatNum } from "@/hooks/use-dashboard-data";
import type { MarketQuote } from "@/lib/agent-api";

export function StockMarketData({ quote, stale }: { quote: MarketQuote | null; stale: boolean }) {
  const depth = quote?.depth ?? [];
  const depthStale =
    stale || !quote?.depth_as_of || Date.now() - Date.parse(quote.depth_as_of) > 60_000;
  const price = (value?: number | null) =>
    value != null && value > 0 ? `₹${formatNum(value)}` : "—";
  const quantity = (value?: number | null) => (value != null ? formatNum(value, 0) : "—");
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHead
          title="Market depth"
          meta={
            depth.length
              ? `Fyers · ${depth.length} levels · received ${new Date(quote!.depth_as_of!).toLocaleTimeString("en-IN")}`
              : "Five-level order book"
          }
          action={
            depth.length ? (
              <Pill tone={depthStale ? "warning" : "positive"}>
                {depthStale ? "Last snapshot" : "Live"}
              </Pill>
            ) : undefined
          }
        />
        {depth.length ? (
          <table className="w-full border-collapse font-mono text-xs">
            <thead>
              <tr className="border-b border-border text-subtle">
                <th className="p-3 text-right">Bid qty</th>
                <th className="p-3 text-right">Bid</th>
                <th className="p-3 text-right">Ask</th>
                <th className="p-3 text-right">Ask qty</th>
              </tr>
            </thead>
            <tbody>
              {depth.map((row, i) => (
                <tr key={i} className="border-b border-border/60">
                  <td className="p-3 text-right" title={`${quantity(row.bid_orders)} bid orders`}>
                    {quantity(row.bid_quantity)}
                  </td>
                  <td className="p-3 text-right text-positive">{price(row.bid)}</td>
                  <td className="p-3 text-right text-negative">{price(row.ask)}</td>
                  <td className="p-3 text-right" title={`${quantity(row.ask_orders)} ask orders`}>
                    {quantity(row.ask_quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-5 text-sm text-muted-foreground">
            {quote?.fallback_reason ?? "Waiting for the Fyers order book."} Yahoo fallback does not
            provide five-level depth.
          </p>
        )}
      </Card>
      <Card>
        <CardHead
          title="Market data"
          meta={
            quote?.source === "fyers"
              ? "Fyers feed"
              : "Yahoo fallback · Fyers fields appear when connected"
          }
        />
        <dl className="grid grid-cols-2 gap-px bg-border">
          {[
            ["Previous close", price(quote?.previous_close)],
            ["Average traded price", price(quote?.average_price)],
            ["Best bid", price(quote?.bid)],
            ["Best ask", price(quote?.ask)],
            ["Bid quantity", quantity(quote?.bid_quantity)],
            ["Ask quantity", quantity(quote?.ask_quantity)],
            ["Last trade quantity", quantity(quote?.last_quantity)],
            ["Traded volume", quantity(quote?.volume)],
            ["Total buy quantity", quantity(quote?.total_buy_quantity)],
            ["Total sell quantity", quantity(quote?.total_sell_quantity)],
            ["Lower circuit", price(quote?.lower_circuit)],
            ["Upper circuit", price(quote?.upper_circuit)],
            ["Open interest", quantity(quote?.open_interest)],
          ].map(([label, value]) => (
            <div key={label} className="bg-panel/80 p-3">
              <dt className="text-xs text-subtle">{label}</dt>
              <dd className="mt-1 font-mono text-xs">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
