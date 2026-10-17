import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Save, Trash2 } from "lucide-react";
import { Card, CardHead } from "@/components/app/cards";
import { EmptyModule, MetricStrip, PageIntro } from "@/components/app/pages/workspace";
import { Button } from "@/components/ui/button";
import { nifty50, nifty50Sectors } from "@/data/nifty50";
import { useStockQuotes } from "@/hooks/use-agent-stock";
import { agentFetch } from "@/lib/agent-api";
import { useStockUniverse } from "@/hooks/use-dashboard-data";
import { cn } from "@/lib/utils";

type Filters = {
  sector: string;
  minMomentum: number;
  maxVol: number;
  minConviction: number;
  verdict: string;
};
// Bump when factor formulas or filter semantics change; older screens are flagged on load.
const FACTOR_VERSION = "factors-v2 (provider metrics; unknown factors excluded)";
type Saved = { name: string; filters: Filters; version?: string; saved_at?: string };
const initial: Filters = {
  sector: "All",
  minMomentum: 0,
  maxVol: 100,
  minConviction: 0,
  verdict: "ANY",
};
const KEY = "qp-screens";

const presets: Saved[] = [
  { name: "Strong momentum", filters: { ...initial, minMomentum: 70 } },
  { name: "Low volatility", filters: { ...initial, maxVol: 30 } },
  { name: "Strong-opinion buys", filters: { ...initial, verdict: "BUY", minConviction: 60 } },
];

export function ScreenerPage() {
  const [f, setF] = useState<Filters>(initial);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [name, setName] = useState("");
  const [loadedNote, setLoadedNote] = useState<string | null>(null);
  useEffect(() => {
    try {
      setSaved(JSON.parse(localStorage.getItem(KEY) ?? "[]") as Saved[]);
    } catch {
      setSaved([]);
    }
  }, []);
  const persist = (next: Saved[]) => {
    setSaved(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  const universe = useStockUniverse();
  const symbols = universe.data?.map((item) => item.symbol) ?? nifty50.map((item) => item.symbol);
  const feed = useStockQuotes(symbols);
  const predictions = useQuery<{
    predictions: Record<
      string,
      { decision?: { action?: string }; thesis?: { conviction?: number } }
    >;
  }>({
    queryKey: ["screener-predictions", symbols.join(",")],
    enabled: symbols.length > 0,
    staleTime: 30_000,
    retry: false,
    queryFn: async ({ signal }) =>
      (
        await agentFetch(`stocks/predictions?symbols=${encodeURIComponent(symbols.join(","))}`, {
          signal,
        })
      ).json(),
  });
  const factors = useQuery<{
    metrics: Record<string, { momentum: number | null; volatility: number | null }>;
  }>({
    queryKey: ["screener-factors", symbols.join(",")],
    enabled: symbols.length > 0,
    staleTime: 300_000,
    retry: false,
    queryFn: async ({ signal }) =>
      (
        await agentFetch(`terminal/metrics?symbols=${encodeURIComponent(symbols.join(","))}`, {
          signal,
        })
      ).json(),
  });
  const rows = useMemo(
    () =>
      symbols.map((symbol) => {
        const reference = nifty50.find((item) => item.symbol === symbol);
        const catalog = universe.data?.find((item) => item.symbol === symbol);
        const quote = feed.quotes[symbol];
        const change = quote?.change_pct ?? null;
        const prediction = predictions.data?.predictions?.[symbol];
        return {
          s: {
            symbol,
            company: catalog?.company ?? reference?.company ?? symbol,
            sector: catalog?.sector ?? reference?.sector ?? "NSE equity",
            price: quote?.price ?? null,
            changePct: change,
          },
          st: {
            momentum: factors.data?.metrics?.[symbol]?.momentum ?? null,
            volatility: factors.data?.metrics?.[symbol]?.volatility ?? null,
          },
          v: {
            verdict: prediction?.decision?.action?.toUpperCase() ?? "UNAVAILABLE",
            conviction:
              prediction?.thesis?.conviction == null
                ? null
                : Math.round(prediction.thesis.conviction * 100),
          },
        };
      }),
    [feed.quotes, predictions.data, factors.data, symbols, universe.data],
  );
  const results = rows
    .filter(
      ({ s, st, v }) =>
        (f.sector === "All" || s.sector === f.sector) &&
        (f.minMomentum === 0 || (st.momentum != null && st.momentum >= f.minMomentum)) &&
        (f.maxVol === 100 || (st.volatility != null && st.volatility <= f.maxVol)) &&
        (f.minConviction === 0 || (v.conviction != null && v.conviction >= f.minConviction)) &&
        (f.verdict === "ANY" || v.verdict === f.verdict),
    )
    .sort((a, b) => (b.st.momentum ?? -1) - (a.st.momentum ?? -1));

  const slider = (label: string, key: "minMomentum" | "maxVol" | "minConviction") => (
    <label className="block">
      <span className="flex justify-between font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
        <span>{label}</span>
        <span className="text-foreground">{f[key]}</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={f[key]}
        onChange={(e) => setF({ ...f, [key]: Number(e.target.value) })}
        className="mt-2 w-full accent-[var(--color-primary)]"
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Screener"
        title="Find the setups that fit."
        body="Filter the official NIFTY 50 universe by provider-backed movement and completed Quant AI research. Missing factors remain unavailable."
      >
        <MetricStrip
          items={[
            { label: "Universe", value: symbols.length },
            { label: "Matches", value: results.length, tone: "primary" },
            { label: "Saved screens", value: saved.length },
            { label: "Data", value: feed.connected ? "Provider quotes" : "Awaiting quotes" },
          ]}
        />
      </PageIntro>
      <div className="grid items-start gap-5 xl:grid-cols-[320px_1fr]">
        <Card>
          <CardHead title="Filters" />
          <div className="space-y-5 p-5">
            <label className="block">
              <span className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                Sector
              </span>
              <select
                value={f.sector}
                onChange={(e) => setF({ ...f, sector: e.target.value })}
                className="mt-2 h-10 w-full border border-border bg-background px-2 text-sm"
              >
                {nifty50Sectors.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <div>
              <span className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                Quant AI verdict
              </span>
              <div className="mt-2 grid grid-cols-4 gap-1">
                {["ANY", "BUY", "HOLD", "SELL"].map((v) => (
                  <Button
                    key={v}
                    size="sm"
                    variant="outline"
                    onClick={() => setF({ ...f, verdict: v })}
                    className={cn(
                      "font-mono text-[10px]",
                      f.verdict === v && "border-primary bg-primary/15 text-primary-soft",
                    )}
                  >
                    {v}
                  </Button>
                ))}
              </div>
            </div>
            {slider("Min momentum", "minMomentum")}
            {slider("Max volatility", "maxVol")}
            {slider("Min agent opinion (uncalibrated)", "minConviction")}
            <Button variant="ghost" size="sm" onClick={() => setF(initial)}>
              Reset filters
            </Button>
            <div className="border-t border-border pt-4">
              <p className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                Screens
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name this screen"
                  className="h-9 min-w-0 flex-1 border border-border bg-background px-2 text-sm"
                />
                <Button
                  size="sm"
                  disabled={!name.trim()}
                  onClick={() => {
                    persist([
                      ...saved.filter((s) => s.name !== name.trim()),
                      {
                        name: name.trim(),
                        filters: f,
                        version: FACTOR_VERSION,
                        saved_at: new Date().toISOString(),
                      },
                    ]);
                    setName("");
                  }}
                >
                  <Save />
                  Save
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[...presets, ...saved].map((s) => (
                  <span key={s.name} className="inline-flex items-center border border-border">
                    <button
                      type="button"
                      onClick={() => {
                        setF({ ...initial, ...s.filters });
                        setLoadedNote(
                          saved.includes(s) && s.version !== FACTOR_VERSION
                            ? `"${s.name}" was saved under ${s.version ?? "an earlier factor version"}; results may differ from when it was saved.`
                            : null,
                        );
                      }}
                      className="px-2 py-1 text-[11px] hover:text-primary-soft"
                    >
                      {s.name}
                    </button>
                    {saved.includes(s) && (
                      <button
                        type="button"
                        aria-label={`Delete ${s.name}`}
                        onClick={() => persist(saved.filter((x) => x !== s))}
                        className="px-1.5 text-subtle hover:text-negative"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
              {loadedNote && <p className="mt-2 text-[11px] text-warning">{loadedNote}</p>}
              <p className="mt-2 text-[10px] text-subtle">
                Screens are saved in this browser with their factor version.
              </p>
            </div>
          </div>
        </Card>
        <Card className="overflow-hidden">
          {results.length === 0 ? (
            <EmptyModule title="No matches" body="Loosen a filter to see more instruments." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                    {[
                      "Symbol",
                      "Sector",
                      "Price",
                      "Change",
                      "Momentum",
                      "Volatility",
                      "Verdict",
                      "Conviction",
                    ].map((h) => (
                      <th key={h} className="px-4 py-3 font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map(({ s, st, v }, i) => (
                    <tr
                      key={s.symbol}
                      className="dash-rise border-b border-border/60 transition-colors hover:bg-panel/60"
                      style={{ ["--d" as string]: `${Math.min(i, 20) * 25}ms` }}
                    >
                      <td className="px-4 py-3">
                        <Link
                          to="/app/stocks/$symbol"
                          params={{ symbol: s.symbol }}
                          className="font-semibold hover:text-primary-soft"
                        >
                          {s.symbol}
                        </Link>
                        <p className="max-w-[200px] truncate text-[12px] text-subtle">
                          {s.company}
                        </p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {s.sector}
                      </td>
                      <td className="px-4 py-3 font-mono num-tabular">
                        {s.price == null ? "—" : `₹${s.price.toLocaleString("en-IN")}`}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 font-mono",
                          (s.changePct ?? 0) >= 0 ? "text-positive" : "text-negative",
                        )}
                      >
                        {s.changePct == null
                          ? "—"
                          : `${s.changePct >= 0 ? "+" : ""}${s.changePct.toFixed(2)}%`}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1 w-16 bg-border">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${st.momentum ?? 0}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs">{st.momentum ?? "—"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {st.volatility == null ? "—" : `${st.volatility}%`}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 font-mono text-xs",
                          v.verdict === "BUY"
                            ? "text-positive"
                            : v.verdict === "SELL"
                              ? "text-negative"
                              : "text-muted-foreground",
                        )}
                      >
                        {v.verdict}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {v.conviction == null ? "—" : `${v.conviction}/100`}
                      </td>
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
