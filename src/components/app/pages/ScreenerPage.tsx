import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, CheckCircle2, CircleAlert, Save, Trash2, XCircle } from "lucide-react";
import { Card, CardHead } from "@/components/app/cards";
import { EmptyModule, MetricStrip, PageIntro } from "@/components/app/pages/workspace";
import { Button } from "@/components/ui/button";
import { nifty50, nifty50Sectors } from "@/data/nifty50";
import { useStockQuotes } from "@/hooks/use-agent-stock";
import { agentFetch } from "@/lib/agent-api";
import {
  evaluateScreenerCandidate,
  type ScreenerFilters,
  type ScreeningStatus,
} from "@/lib/quant/screener";
import { useStockUniverse } from "@/hooks/use-dashboard-data";
import { cn } from "@/lib/utils";

// Bump when factor formulas or filter semantics change; older screens are flagged on load.
const FACTOR_VERSION = "factors-v2 (provider metrics; unknown factors excluded)";
type Saved = { name: string; filters: ScreenerFilters; version?: string; saved_at?: string };
type SortKey = "symbol" | "price" | "change" | "momentum" | "volatility" | "conviction";
const COLUMNS: { label: string; sort?: SortKey; numeric?: boolean }[] = [
  { label: "Symbol", sort: "symbol" },
  { label: "Sector" },
  { label: "Price", sort: "price", numeric: true },
  { label: "Change", sort: "change", numeric: true },
  { label: "Momentum", sort: "momentum", numeric: true },
  { label: "Volatility", sort: "volatility", numeric: true },
  { label: "Verdict", numeric: true },
  { label: "Conviction", sort: "conviction", numeric: true },
  { label: "Screen result" },
];

const initial: ScreenerFilters = {
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

function ScreeningResult({ status, reasons }: { status: ScreeningStatus; reasons: string[] }) {
  const Icon = status === "PASS" ? CheckCircle2 : status === "MISSING" ? CircleAlert : XCircle;
  const tone =
    status === "PASS"
      ? "border-positive/30 bg-positive/10 text-positive"
      : status === "MISSING"
        ? "border-warning/30 bg-warning/10 text-warning"
        : "border-negative/30 bg-negative/10 text-negative";

  return (
    <div title={reasons.join(" ")}>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold",
          tone,
        )}
      >
        <Icon className="h-3 w-3" aria-hidden="true" />
        {status}
      </span>
      <span className="mt-1 block truncate text-[11px] text-subtle">{reasons[0]}</span>
    </div>
  );
}

export function ScreenerPage() {
  const [f, setF] = useState<ScreenerFilters>(initial);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [name, setName] = useState("");
  const [loadedNote, setLoadedNote] = useState<string | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: "momentum",
    desc: true,
  });
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
  const screenedRows = rows.map((row) => ({
    ...row,
    screening: evaluateScreenerCandidate(
      {
        sector: row.s.sector,
        momentum: row.st.momentum,
        volatility: row.st.volatility,
        verdict: row.v.verdict,
        conviction: row.v.conviction,
      },
      f,
    ),
  }));
  const sortedRows = screenedRows.sort((a, b) => {
    if (sort.key === "symbol") return (sort.desc ? -1 : 1) * a.s.symbol.localeCompare(b.s.symbol);
    const value = (row: (typeof rows)[number]) =>
      ({
        price: row.s.price,
        change: row.s.changePct,
        momentum: row.st.momentum,
        volatility: row.st.volatility,
        conviction: row.v.conviction,
      })[sort.key as Exclude<SortKey, "symbol">];
    // Missing values always sort last, whichever the direction.
    const x = value(a);
    const y = value(b);
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
    return sort.desc ? y - x : x - y;
  });
  const results = sortedRows.filter((row) => row.screening.status === "PASS");
  const excluded = sortedRows.filter((row) => row.screening.status !== "PASS");
  const missingCount = sortedRows.filter((row) => row.screening.status === "MISSING").length;
  const visibleRows = showExcluded ? sortedRows : results;

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
        title="Screener"
        body="Filter the official NIFTY 50 universe by provider-backed movement and completed Quant AI research. Missing factors remain unavailable."
      >
        <MetricStrip
          items={[
            { label: "Universe", value: symbols.length },
            { label: "Matches", value: results.length, tone: "primary" },
            {
              label: "Needs data",
              value: missingCount,
              tone: missingCount > 0 ? "warning" : "positive",
              note: "Excluded because an active rule cannot be checked",
            },
            { label: "Saved screens", value: saved.length },
            { label: "Data", value: feed.connected ? "Provider quotes" : "Awaiting quotes" },
          ]}
        />
      </PageIntro>
      <div className="grid items-start gap-4 xl:grid-cols-[280px_1fr]">
        <Card>
          <CardHead title="Filters" />
          <div className="space-y-4 p-4">
            <label className="block">
              <span className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                Sector
              </span>
              <select
                value={f.sector}
                onChange={(e) => setF({ ...f, sector: e.target.value })}
                className="mt-2 h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
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
                  className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm"
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
                  <span
                    key={s.name}
                    className="inline-flex items-center rounded border border-border"
                  >
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
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <p className="font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                {showExcluded ? "All candidates" : "Passing candidates"}
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {showExcluded
                  ? "Each row explains the first-class screen outcome and any missing inputs."
                  : "Use Explain exclusions to audit candidates that did not pass."}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              aria-pressed={showExcluded}
              onClick={() => setShowExcluded((current) => !current)}
              disabled={excluded.length === 0}
            >
              {showExcluded ? "Show matches" : `Explain exclusions (${excluded.length})`}
            </Button>
          </div>
          {visibleRows.length === 0 ? (
            <EmptyModule title="No matches" body="Loosen a filter to see more instruments." />
          ) : (
            <div className="max-h-[calc(100dvh-13rem)] overflow-auto">
              <table className="w-full min-w-[1060px] text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left">
                    {COLUMNS.map((column) => {
                      const active = column.sort != null && sort.key === column.sort;
                      return (
                        <th
                          key={column.label}
                          aria-sort={active ? (sort.desc ? "descending" : "ascending") : undefined}
                          className={cn(
                            "px-3 py-2 font-medium whitespace-nowrap",
                            column.numeric && "text-right",
                          )}
                        >
                          {column.sort ? (
                            <button
                              type="button"
                              onClick={() =>
                                setSort((current) => ({
                                  key: column.sort!,
                                  desc: current.key === column.sort ? !current.desc : true,
                                }))
                              }
                              className={cn(
                                "inline-flex items-center gap-1 uppercase hover:text-foreground",
                                active && "text-foreground",
                              )}
                            >
                              {column.label}
                              {active &&
                                (sort.desc ? (
                                  <ArrowDown className="h-3 w-3" aria-hidden="true" />
                                ) : (
                                  <ArrowUp className="h-3 w-3" aria-hidden="true" />
                                ))}
                            </button>
                          ) : (
                            <span className="uppercase">{column.label}</span>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(({ s, st, v, screening }) => (
                    <tr key={s.symbol} className="border-b border-border/60">
                      <td className="max-w-[260px] px-3 py-1.5">
                        <Link
                          to="/app/stocks/$symbol"
                          params={{ symbol: s.symbol }}
                          className="flex min-w-0 items-baseline gap-2 hover:text-primary-soft"
                        >
                          <span className="font-semibold">{s.symbol}</span>
                          <span className="truncate text-[12px] text-subtle">{s.company}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-[12px] text-muted-foreground">
                        {s.sector}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right font-mono num-tabular",
                          s.price == null && "text-subtle",
                        )}
                      >
                        {s.price == null
                          ? "—"
                          : s.price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right font-mono num-tabular",
                          s.changePct == null
                            ? "text-subtle"
                            : s.changePct >= 0
                              ? "text-positive"
                              : "text-negative",
                        )}
                      >
                        {s.changePct == null
                          ? "—"
                          : `${s.changePct >= 0 ? "+" : ""}${s.changePct.toFixed(2)}%`}
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center justify-end gap-2">
                          {st.momentum != null && (
                            <div className="h-1 w-14 overflow-hidden rounded-full bg-border">
                              <div
                                className="h-full bg-primary"
                                style={{ width: `${st.momentum}%` }}
                              />
                            </div>
                          )}
                          <span
                            className={cn(
                              "w-7 text-right font-mono text-xs",
                              st.momentum == null && "text-subtle",
                            )}
                          >
                            {st.momentum ?? "—"}
                          </span>
                        </div>
                      </td>
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right font-mono num-tabular",
                          st.volatility == null && "text-subtle",
                        )}
                      >
                        {st.volatility == null ? "—" : `${st.volatility}%`}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {v.verdict === "UNAVAILABLE" ? (
                          <span className="text-subtle" title="No completed research">
                            —
                          </span>
                        ) : (
                          <span
                            className={cn(
                              "inline-flex rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold",
                              v.verdict === "BUY"
                                ? "bg-positive/12 text-positive"
                                : v.verdict === "SELL"
                                  ? "bg-negative/12 text-negative"
                                  : "bg-foreground/[0.06] text-muted-foreground",
                            )}
                          >
                            {v.verdict}
                          </span>
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right font-mono num-tabular",
                          v.conviction == null && "text-subtle",
                        )}
                      >
                        {v.conviction == null ? "—" : `${v.conviction}/100`}
                      </td>
                      <td className="max-w-[280px] px-3 py-1.5">
                        <ScreeningResult status={screening.status} reasons={screening.reasons} />
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
