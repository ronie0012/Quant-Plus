import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Save, Trash2 } from "lucide-react";
import { Card, CardHead } from "@/components/app/cards";
import { EmptyModule, MetricStrip, PageIntro } from "@/components/app/pages/workspace";
import { Button } from "@/components/ui/button";
import { committeeVerdict, nifty50, nifty50Sectors, stockStats } from "@/data/nifty50";
import { cn } from "@/lib/utils";

type Filters = { sector: string; minMomentum: number; maxVol: number; minConviction: number; verdict: string };
type Saved = { name: string; filters: Filters };
const initial: Filters = { sector: "All", minMomentum: 0, maxVol: 100, minConviction: 0, verdict: "ANY" };
const KEY = "qp-screens";

const presets: Saved[] = [
  { name: "Strong momentum", filters: { ...initial, minMomentum: 70 } },
  { name: "Low volatility", filters: { ...initial, maxVol: 30 } },
  { name: "High conviction buys", filters: { ...initial, verdict: "BUY", minConviction: 60 } },
];

export function ScreenerPage() {
  const [f, setF] = useState<Filters>(initial);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [name, setName] = useState("");
  useEffect(() => { try { setSaved(JSON.parse(localStorage.getItem(KEY) ?? "[]") as Saved[]); } catch { setSaved([]); } }, []);
  const persist = (next: Saved[]) => { setSaved(next); localStorage.setItem(KEY, JSON.stringify(next)); };

  const rows = useMemo(() => nifty50.map((s) => ({ s, st: stockStats(s), v: committeeVerdict(s) })), []);
  const results = rows.filter(({ s, st, v }) =>
    (f.sector === "All" || s.sector === f.sector) && st.momentum >= f.minMomentum && st.volatility <= f.maxVol && v.conviction >= f.minConviction && (f.verdict === "ANY" || v.verdict === f.verdict),
  ).sort((a, b) => b.st.momentum - a.st.momentum);

  const slider = (label: string, key: "minMomentum" | "maxVol" | "minConviction") => (
    <label className="block">
      <span className="flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-subtle"><span>{label}</span><span className="text-foreground">{f[key]}</span></span>
      <input type="range" min={0} max={100} value={f[key]} onChange={(e) => setF({ ...f, [key]: Number(e.target.value) })} className="mt-2 w-full accent-[var(--color-primary)]" />
    </label>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageIntro eyebrow="Screener" title="Find the setups that fit." body="Filter all NIFTY 50 constituents by momentum, volatility and Quant AI conviction. Figures are demonstrative.">
        <MetricStrip items={[{ label: "Universe", value: nifty50.length }, { label: "Matches", value: results.length, tone: "primary" }, { label: "Saved screens", value: saved.length }, { label: "Data", value: "Simulated" }]} />
      </PageIntro>
      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        <Card className="p-5">
          <CardHead title="Filters" />
          <div className="mt-4 space-y-5">
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">Sector</span>
              <select value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })} className="mt-2 h-10 w-full border border-border bg-background px-2 text-sm">
                {nifty50Sectors.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">Quant AI verdict</span>
              <div className="mt-2 grid grid-cols-4 gap-1">
                {["ANY", "BUY", "HOLD", "SELL"].map((v) => <Button key={v} size="sm" variant="outline" onClick={() => setF({ ...f, verdict: v })} className={cn("font-mono text-[10px]", f.verdict === v && "border-primary bg-primary/15 text-primary-soft")}>{v}</Button>)}
              </div>
            </div>
            {slider("Min momentum", "minMomentum")}
            {slider("Max volatility", "maxVol")}
            {slider("Min conviction", "minConviction")}
            <Button variant="ghost" size="sm" onClick={() => setF(initial)}>Reset filters</Button>
            <div className="border-t border-border pt-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">Screens</p>
              <div className="mt-2 flex gap-2">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this screen" className="h-9 min-w-0 flex-1 border border-border bg-background px-2 text-sm" />
                <Button size="sm" disabled={!name.trim()} onClick={() => { persist([...saved.filter((s) => s.name !== name.trim()), { name: name.trim(), filters: f }]); setName(""); }}><Save />Save</Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[...presets, ...saved].map((s) => (
                  <span key={s.name} className="inline-flex items-center border border-border">
                    <button type="button" onClick={() => setF(s.filters)} className="px-2 py-1 text-[11px] hover:text-primary-soft">{s.name}</button>
                    {saved.includes(s) && <button type="button" aria-label={`Delete ${s.name}`} onClick={() => persist(saved.filter((x) => x !== s))} className="px-1.5 text-subtle hover:text-negative"><Trash2 className="h-3 w-3" /></button>}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>
        <Card className="overflow-hidden">
          {results.length === 0 ? <EmptyModule title="No matches" body="Loosen a filter to see more instruments." /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead><tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">
                  {["Symbol", "Sector", "Price", "Change", "Momentum", "Volatility", "Verdict", "Conviction"].map((h) => <th key={h} className="px-4 py-3 font-normal">{h}</th>)}
                </tr></thead>
                <tbody>
                  {results.map(({ s, st, v }, i) => (
                    <tr key={s.symbol} className="dash-rise border-b border-border/60 transition-colors hover:bg-panel/60" style={{ ["--d" as string]: `${Math.min(i, 20) * 25}ms` }}>
                      <td className="px-4 py-3"><Link to="/app/stocks/$symbol" params={{ symbol: s.symbol }} className="font-mono hover:text-primary-soft">{s.symbol}</Link><p className="text-[11px] text-subtle">{s.company}</p></td>
                      <td className="px-4 py-3 text-muted-foreground">{s.sector}</td>
                      <td className="px-4 py-3 font-mono num-tabular">₹{s.price.toLocaleString("en-IN")}</td>
                      <td className={cn("px-4 py-3 font-mono", s.changePct >= 0 ? "text-positive" : "text-negative")}>{s.changePct >= 0 ? "+" : ""}{s.changePct.toFixed(2)}%</td>
                      <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="h-1 w-16 bg-border"><div className="h-full bg-primary" style={{ width: `${st.momentum}%` }} /></div><span className="font-mono text-xs">{st.momentum}</span></div></td>
                      <td className="px-4 py-3 font-mono">{st.volatility}%</td>
                      <td className={cn("px-4 py-3 font-mono text-xs", v.verdict === "BUY" ? "text-positive" : v.verdict === "SELL" ? "text-negative" : "text-muted-foreground")}>{v.verdict}</td>
                      <td className="px-4 py-3 font-mono">{v.conviction}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
