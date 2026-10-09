import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardHead } from "@/components/app/cards";
import { EmptyModule, MetricStrip, PageIntro } from "@/components/app/pages/workspace";
import { Button } from "@/components/ui/button";
import { formatINR, useAccount, useHoldings } from "@/hooks/use-dashboard-data";
import { usePlaceOrder } from "@/hooks/use-orders";
import { tradingErrorMessage } from "@/hooks/use-wallet";
import { nifty50, stockBySymbol } from "@/data/nifty50";
import { simulatedPrice } from "@/lib/sim-price";
import { blackScholes, payoffAt, type Leg, type OptionKind } from "@/lib/options";
import { cn } from "@/lib/utils";

const field = "h-10 border border-border bg-background px-2 text-sm";
const label = "font-mono text-[10px] uppercase tracking-[0.14em] text-subtle";

/* ---------------- Options lab ---------------- */
export function OptionsPage() {
  const [symbol, setSymbol] = useState("RELIANCE");
  const [days, setDays] = useState(14);
  const [legs, setLegs] = useState<Leg[]>([]);
  const stock = stockBySymbol(symbol)!;
  const spot = stock.price;
  const iv = 0.16 + (stock.seed % 10) / 100;
  const step = spot > 2000 ? 50 : spot > 500 ? 20 : 5;
  const lotSize = Math.max(25, Math.round(500000 / spot / 25) * 25);
  const atm = Math.round(spot / step) * step;
  const strikes = Array.from({ length: 11 }, (_, i) => atm + (i - 5) * step);
  const t = days / 365;

  const add = (kind: OptionKind, strike: number, side: "BUY" | "SELL") => {
    const premium = Number(blackScholes(kind, spot, strike, t, iv).price.toFixed(2));
    setLegs((l) => [...l, { kind, strike, side, lots: 1, premium }]);
  };
  const preset = (name: string) => {
    const p = (k: OptionKind, s: number) => Number(blackScholes(k, spot, s, t, iv).price.toFixed(2));
    const map: Record<string, Leg[]> = {
      "Long straddle": [{ kind: "CE", strike: atm, side: "BUY", lots: 1, premium: p("CE", atm) }, { kind: "PE", strike: atm, side: "BUY", lots: 1, premium: p("PE", atm) }],
      "Bull call spread": [{ kind: "CE", strike: atm, side: "BUY", lots: 1, premium: p("CE", atm) }, { kind: "CE", strike: atm + 2 * step, side: "SELL", lots: 1, premium: p("CE", atm + 2 * step) }],
      "Iron condor": [
        { kind: "PE", strike: atm - 3 * step, side: "BUY", lots: 1, premium: p("PE", atm - 3 * step) },
        { kind: "PE", strike: atm - step, side: "SELL", lots: 1, premium: p("PE", atm - step) },
        { kind: "CE", strike: atm + step, side: "SELL", lots: 1, premium: p("CE", atm + step) },
        { kind: "CE", strike: atm + 3 * step, side: "BUY", lots: 1, premium: p("CE", atm + 3 * step) },
      ],
    };
    setLegs(map[name] ?? []);
  };

  const curve = useMemo(() => {
    const lo = spot * 0.85, hi = spot * 1.15;
    return Array.from({ length: 61 }, (_, i) => { const x = lo + ((hi - lo) * i) / 60; return { x, y: payoffAt(legs, x, lotSize) }; });
  }, [legs, spot, lotSize]);
  const maxP = Math.max(...curve.map((c) => c.y)), minP = Math.min(...curve.map((c) => c.y));
  const net = legs.reduce((s, l) => s + l.premium * l.lots * lotSize * (l.side === "BUY" ? -1 : 1), 0);
  const greeks = legs.reduce((g, l) => { const b = blackScholes(l.kind, spot, l.strike, t, iv); const m = (l.side === "BUY" ? 1 : -1) * l.lots * lotSize; return { delta: g.delta + b.delta * m, theta: g.theta + b.theta * m, vega: g.vega + b.vega * m }; }, { delta: 0, theta: 0, vega: 0 });
  const range = Math.max(Math.abs(maxP), Math.abs(minP), 1);
  const W = 600, H = 220, py = (y: number) => H / 2 - (y / range) * (H / 2 - 10);
  const path = curve.map((c, i) => `${i ? "L" : "M"}${(i / 60) * W},${py(c.y)}`).join(" ");

  return (
    <div className="flex flex-col gap-5">
      <PageIntro eyebrow="Options lab" title="Build strategies. See the payoff." body="Simulated option chain priced with Black-Scholes on demonstrative spot and volatility. Analysis only — no option orders are executed.">
        <MetricStrip items={[{ label: "Spot", value: `₹${spot.toLocaleString("en-IN")}` }, { label: "IV", value: `${(iv * 100).toFixed(1)}%` }, { label: "Lot size", value: lotSize }, { label: "Data", value: "Simulated" }]} />
      </PageIntro>
      <Card className="flex flex-wrap items-end gap-4 p-4">
        <label className="flex flex-col gap-2"><span className={label}>Underlying</span><select value={symbol} onChange={(e) => { setSymbol(e.target.value); setLegs([]); }} className={field}>{nifty50.map((s) => <option key={s.symbol}>{s.symbol}</option>)}</select></label>
        <label className="flex flex-col gap-2"><span className={label}>Days to expiry · {days}</span><input type="range" min={1} max={60} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-48 accent-[var(--color-primary)]" /></label>
        <div className="flex flex-wrap gap-2">{["Long straddle", "Bull call spread", "Iron condor"].map((n) => <Button key={n} size="sm" variant="outline" onClick={() => preset(n)}>{n}</Button>)}</div>
      </Card>
      <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
        <Card className="overflow-x-auto p-0">
          <div className="p-4"><CardHead title="Option chain" meta="Click Buy / Sell to add a leg" /></div>
          <table className="w-full min-w-[560px] font-mono text-[11px] num-tabular">
            <thead className="text-subtle"><tr className="border-y border-border"><th className="p-2">Call Δ</th><th>Call ₹</th><th></th><th className="text-foreground">Strike</th><th></th><th>Put ₹</th><th>Put Δ</th></tr></thead>
            <tbody>{strikes.map((k) => { const c = blackScholes("CE", spot, k, t, iv), p = blackScholes("PE", spot, k, t, iv); return (
              <tr key={k} className={cn("border-b border-border/60 text-center hover:bg-primary/5", k === atm && "bg-primary/10")}>
                <td className="p-2 text-subtle">{c.delta.toFixed(2)}</td><td className={k < spot ? "text-positive" : ""}>{c.price.toFixed(2)}</td>
                <td><span className="inline-flex gap-1"><button onClick={() => add("CE", k, "BUY")} className="px-1.5 text-positive hover:underline">B</button><button onClick={() => add("CE", k, "SELL")} className="px-1.5 text-negative hover:underline">S</button></span></td>
                <td className="font-semibold text-foreground">{k}</td>
                <td><span className="inline-flex gap-1"><button onClick={() => add("PE", k, "BUY")} className="px-1.5 text-positive hover:underline">B</button><button onClick={() => add("PE", k, "SELL")} className="px-1.5 text-negative hover:underline">S</button></span></td>
                <td className={k > spot ? "text-positive" : ""}>{p.price.toFixed(2)}</td><td className="text-subtle">{p.delta.toFixed(2)}</td>
              </tr>); })}</tbody>
          </table>
        </Card>
        <Card className="p-5">
          <CardHead title="Payoff at expiry" meta={`${legs.length} leg${legs.length === 1 ? "" : "s"}`} />
          {legs.length === 0 ? <EmptyModule title="No legs yet" body="Add legs from the chain or pick a preset strategy." /> : (<>
            <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" role="img" aria-label="Strategy payoff diagram">
              <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="var(--color-border-strong)" strokeDasharray="4 4" />
              <line x1={W / 2} x2={W / 2} y1={0} y2={H} stroke="var(--color-primary)" strokeOpacity={0.4} />
              <path d={path} fill="none" stroke="var(--color-primary-soft)" strokeWidth={2} />
            </svg>
            <dl className="mt-4 grid grid-cols-2 gap-3 font-mono text-xs sm:grid-cols-3">
              {[["Max profit*", formatINR(maxP)], ["Max loss*", formatINR(minP)], [net >= 0 ? "Net credit" : "Net debit", formatINR(Math.abs(net))], ["Delta", greeks.delta.toFixed(1)], ["Theta/day", formatINR(greeks.theta)], ["Vega/1%", formatINR(greeks.vega)]].map(([k, v]) => <div key={k} className="border border-border p-2"><dt className="text-[9px] uppercase text-subtle">{k}</dt><dd className="mt-1">{v}</dd></div>)}
            </dl>
            <p className="mt-2 text-[10px] text-subtle">*Within ±15% of spot.</p>
            <ul className="mt-4 space-y-2">{legs.map((l, i) => <li key={i} className="flex items-center justify-between border border-border px-3 py-2 font-mono text-[11px]"><span className={l.side === "BUY" ? "text-positive" : "text-negative"}>{l.side} {l.lots}× {l.strike} {l.kind}</span><span className="flex items-center gap-3">@ ₹{l.premium}<button aria-label="Remove leg" onClick={() => setLegs(legs.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5 text-subtle" /></button></span></li>)}</ul>
          </>)}
        </Card>
      </div>
    </div>
  );
}

/* ---------------- Basket orders ---------------- */
export function BasketPage() {
  const place = usePlaceOrder();
  const { data: account } = useAccount();
  const [rows, setRows] = useState<{ symbol: string; qty: number; side: "BUY" | "SELL" }[]>([{ symbol: "RELIANCE", qty: 5, side: "BUY" }, { symbol: "HDFCBANK", qty: 10, side: "BUY" }]);
  const [running, setRunning] = useState(false);
  const total = rows.reduce((s, r) => s + (stockBySymbol(r.symbol)?.price ?? 0) * r.qty * (r.side === "BUY" ? 1 : -1), 0);
  const wallet = Number(account?.wallet_balance ?? 0);
  const update = (i: number, patch: Partial<(typeof rows)[number]>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const execute = async () => {
    setRunning(true);
    let ok = 0;
    for (const r of rows) {
      const s = stockBySymbol(r.symbol)!;
      try { await place.mutateAsync({ symbol: r.symbol, company: s.company, side: r.side, order_type: "MARKET", quantity: r.qty, price: simulatedPrice(r.symbol) }); ok++; }
      catch (e) { toast.error(`${r.symbol}: ${tradingErrorMessage(e)}`); }
    }
    setRunning(false);
    if (ok) toast.success(`Basket executed — ${ok} of ${rows.length} orders filled (simulated).`);
  };

  return (
    <div className="flex flex-col gap-5">
      <PageIntro eyebrow="Basket orders" title="Many orders. One click." body="Build a basket of NIFTY 50 market orders and execute it against your simulated wallet in one step.">
        <MetricStrip items={[{ label: "Legs", value: rows.length }, { label: "Net cash", value: formatINR(total), tone: "primary" }, { label: "Wallet", value: formatINR(wallet) }, { label: "Execution", value: "Simulated" }]} />
      </PageIntro>
      <Card className="p-5">
        <CardHead title="Basket" action={<Button size="sm" variant="outline" onClick={() => setRows([...rows, { symbol: "TCS", qty: 1, side: "BUY" }])}><Plus /> Add stock</Button>} />
        <div className="mt-4 space-y-2">
          {rows.map((r, i) => { const s = stockBySymbol(r.symbol); return (
            <div key={i} className="grid grid-cols-[1fr_auto] items-center gap-2 border border-border p-2 sm:grid-cols-[1.4fr_120px_90px_1fr_auto]">
              <select value={r.symbol} onChange={(e) => update(i, { symbol: e.target.value })} className={field} aria-label="Stock">{nifty50.map((n) => <option key={n.symbol}>{n.symbol}</option>)}</select>
              <div className="grid grid-cols-2 gap-1">{(["BUY", "SELL"] as const).map((sd) => <Button key={sd} size="sm" variant="outline" onClick={() => update(i, { side: sd })} className={cn("font-mono text-[10px]", r.side === sd && (sd === "BUY" ? "border-positive/50 text-positive" : "border-negative/50 text-negative"))}>{sd}</Button>)}</div>
              <input type="number" min={1} value={r.qty} onChange={(e) => update(i, { qty: Math.max(1, Number(e.target.value) || 1) })} className={cn(field, "font-mono")} aria-label="Quantity" />
              <span className="font-mono text-xs text-muted-foreground">{formatINR((s?.price ?? 0) * r.qty)}</span>
              <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 /></Button>
            </div>); })}
          {rows.length === 0 && <EmptyModule title="Empty basket" body="Add stocks to build your basket." />}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className={cn("text-xs", total > wallet ? "text-negative" : "text-subtle")}>{total > wallet ? "Basket exceeds wallet balance — some buys will be rejected." : "Simulation only. No funds or securities will move."}</p>
          <Button disabled={running || rows.length === 0} onClick={() => void execute()} className="font-mono text-xs tracking-[0.14em]">{running ? "Executing…" : "Execute basket"}</Button>
        </div>
      </Card>
    </div>
  );
}

/* ---------------- Portfolio X-ray ---------------- */
export function XrayPage() {
  const { data: holdings, isLoading } = useHoldings();
  const rows = (holdings ?? []).map((h) => {
    const s = stockBySymbol(h.symbol);
    const change = (s?.changePct ?? 0) / 100;
    const value = h.quantity * Number(h.last_price || s?.price || h.avg_price);
    const today = value - value / (1 + change);
    const unreal = value - h.quantity * Number(h.avg_price);
    return { h, value, today, unreal, sector: s?.sector ?? h.sector ?? "Other" };
  }).sort((a, b) => Math.abs(b.today) - Math.abs(a.today));
  const total = rows.reduce((s, r) => s + r.value, 0);
  const move = rows.reduce((s, r) => s + r.today, 0);
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.today)), 1);
  const top = rows[0];

  return (
    <div className="flex flex-col gap-5">
      <PageIntro eyebrow="Portfolio X-ray" title="Why did my portfolio move today?" body="Each holding's contribution to today's change, based on demonstrative session moves.">
        <MetricStrip items={[{ label: "Value", value: formatINR(total) }, { label: "Today", value: formatINR(move), tone: move >= 0 ? "positive" : "negative" }, { label: "Holdings", value: rows.length }, { label: "Data", value: "Simulated" }]} />
      </PageIntro>
      <Card className="p-5">
        <CardHead title="Contribution to today's move" />
        {isLoading ? <p className="mt-4 text-sm text-subtle">Loading holdings…</p> : rows.length === 0 ? (
          <div className="mt-4"><EmptyModule title="No holdings yet" body="Buy a stock to see what drives your portfolio." /><Link to="/app/markets" className="mt-3 inline-block text-sm text-primary-soft underline">Browse markets</Link></div>
        ) : (<>
          {top && <p className="mt-3 text-sm text-muted-foreground"><span className="text-foreground">{top.h.symbol}</span> was the biggest driver, contributing {formatINR(top.today)} ({move ? Math.round((top.today / move) * 100) : 0}% of the day's move).</p>}
          <ul className="mt-5 space-y-3">{rows.map((r) => (
            <li key={r.h.id} className="grid grid-cols-[90px_1fr_110px] items-center gap-3 font-mono text-xs">
              <Link to="/app/stocks/$symbol" params={{ symbol: r.h.symbol }} className="hover:text-primary-soft">{r.h.symbol}</Link>
              <div className="relative h-5 bg-background/50"><span className="absolute inset-y-0 left-1/2 w-px bg-border-strong" /><span className={cn("grow-bar absolute inset-y-0.5", r.today >= 0 ? "left-1/2 bg-positive/70" : "right-1/2 bg-negative/70")} style={{ width: `${(Math.abs(r.today) / maxAbs) * 50}%` }} /></div>
              <span className={cn("text-right", r.today >= 0 ? "text-positive" : "text-negative")}>{formatINR(r.today)}</span>
            </li>))}</ul>
          <p className="mt-5 text-[11px] text-subtle">Unrealised P&L across holdings: <span className={rows.reduce((s, r) => s + r.unreal, 0) >= 0 ? "text-positive" : "text-negative"}>{formatINR(rows.reduce((s, r) => s + r.unreal, 0))}</span></p>
        </>)}
      </Card>
    </div>
  );
}
