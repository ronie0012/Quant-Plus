import { useMemo, useState } from "react";
import { Eye, FastForward, Play, RotateCcw, Save, StepForward } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHead, EmptyState, Pill, Skeleton } from "@/components/app/cards";
import { MetricStrip, PageIntro, Segmented } from "@/components/app/pages/workspace";
import { ProfessionalChart } from "@/components/app/stocks/ProfessionalChart";
import { nifty50, stockBySymbol } from "@/data/nifty50";
import { useStockNews } from "@/hooks/use-intelligence";
import { useSymbolHistory } from "@/hooks/use-quant-data";
import { useSaveResearchItem } from "@/hooks/use-workspace-prefs";
import { formatINR, formatNum } from "@/hooks/use-dashboard-data";
import { validateCandles } from "@/lib/market-history";
import {
  cancelSimOrder,
  DEFAULT_SIM_CONFIG,
  estimatedSpreadBps,
  logThesis,
  placeSimOrder,
  recordDecision,
  revealDecisions,
  scoreDecisions,
  setStop,
  simSummary,
  startSim,
  stepSim,
  visible,
  visibleNews,
  type SimConfig,
  type SimMode,
  type SimNews,
  type SimState,
} from "@/lib/quant/flight-sim";
import { cn } from "@/lib/utils";

const MODES: { id: SimMode; label: string; question: string }[] = [
  { id: "DECISION", label: "Decision replay", question: "What would you have known?" },
  { id: "EXECUTION", label: "Execution replay", question: "Would the order have filled?" },
  { id: "RISK", label: "Risk replay", question: "What would happen to the portfolio?" },
  {
    id: "NEWS",
    label: "News replay",
    question: "How would the thesis change as information arrived?",
  },
  { id: "BLIND", label: "Blind challenge", question: "Decide first, reveal the outcome later." },
];
const INTERVALS = {
  "Daily (1Y)": { range: "1Y", seconds: 86_400 },
  "15-min (1W)": { range: "1W", seconds: 900 },
  "1-min (1D)": { range: "1D", seconds: 60 },
} as const;
type IntervalKey = keyof typeof INTERVALS;
const BLIND_HORIZON = 5;

/**
 * Market flight simulator: replays the information environment (bars, news
 * at its original availability time, gaps, halts, spreads, latency and
 * partial fills) in a separate replay wallet with its own risk profile.
 */
export function FlightSimulatorPage() {
  const [mode, setMode] = useState<SimMode>("DECISION");
  const [symbol, setSymbol] = useState("RELIANCE");
  const [interval, setIntervalKey] = useState<IntervalKey>("Daily (1Y)");
  const [config, setConfig] = useState<SimConfig>(DEFAULT_SIM_CONFIG);
  const [state, setState] = useState<SimState | null>(null);
  const [quantity, setQuantity] = useState(10);
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT">("MARKET");
  const [limit, setLimit] = useState("");
  const [thesis, setThesis] = useState("");
  const [stopInput, setStopInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const spec = INTERVALS[interval];
  const history = useSymbolHistory(symbol, spec.range);
  const news = useStockNews(symbol);
  const save = useSaveResearchItem();
  const bars = useMemo(() => validateCandles(history.data?.candles).candles, [history.data]);
  const simNews: SimNews[] = useMemo(
    () =>
      (news.data?.articles ?? []).map((a) => ({
        id: a.id,
        title: a.title,
        source: a.source,
        available_at: Math.floor(Date.parse(a.published_at) / 1000),
        sentiment: a.sentiment,
        url: a.url,
      })),
    [news.data],
  );
  const warmup = Math.min(60, Math.floor(bars.length / 3));
  const enough = bars.length > warmup + 15;
  const summary = state ? simSummary(state, bars) : null;
  const shown = state ? visible(bars, state) : [];
  const seenNews = state ? visibleNews(simNews, bars, state) : [];
  const bar = state ? bars[state.cursor] : null;
  const blind = mode === "BLIND";

  const act = (fn: (s: SimState) => SimState) => {
    if (!state) return;
    try {
      setError(null);
      setState(fn(state));
    } catch (err) {
      setError(err instanceof Error ? err.message.replaceAll("_", " ").toLowerCase() : "Rejected");
    }
  };
  const begin = () => {
    const latest = bars.length - 10;
    // A random start keeps the period that follows unknown.
    const start = warmup + Math.floor(Math.random() * Math.max(1, latest - warmup));
    setState(startSim(bars, start, { ...config, bar_seconds: spec.seconds }));
    setError(null);
  };
  const decisions = state ? scoreDecisions(state.decisions) : null;

  async function saveResult() {
    if (!state || !summary) return;
    try {
      await save.mutateAsync({
        kind: "REPLAY_RESULT",
        title: `${MODES.find((m) => m.id === mode)!.label}: ${symbol} ${interval}`,
        ref: symbol,
        body: {
          mode,
          symbol,
          interval,
          config,
          start: bars[state.start]!.time,
          end: bars[state.cursor]!.time,
          summary,
          decisions: state.decisions,
          thesis_log: state.thesis_log,
          fills: state.fills,
          markers: state.markers,
        },
      });
      toast.success("Replay result saved to the research network");
    } catch {
      toast.error("Result could not be saved");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Replay"
        title="Replay"
        body={`${MODES.find((m) => m.id === mode)!.question} Replay the whole information environment: provider bars at daily or intraday resolution, news released only at its original time, gaps and halts, spread and liquidity, order latency and partial fills. Future information is hidden by construction. The replay wallet and risk profile are separate from your paper book.`}
        status="Separate replay wallet"
      >
        <MetricStrip
          items={[
            { label: "Replay equity", value: summary ? formatINR(summary.equity) : "—" },
            {
              label: "Your return",
              value: summary ? `${formatNum(summary.return_pct)}%` : "—",
              ...(summary
                ? { tone: summary.return_pct >= 0 ? ("positive" as const) : ("negative" as const) }
                : {}),
              note: summary ? `Buy & hold ${formatNum(summary.buy_and_hold_pct)}%` : "",
            },
            {
              label: "Max drawdown",
              value: summary ? `${formatNum(summary.max_drawdown_pct)}%` : "—",
              note: summary ? `Exposure ${summary.exposure_pct}%` : "",
            },
            {
              label: blind ? "Blind hit rate" : "Bars played",
              value: blind
                ? decisions?.hit_rate == null
                  ? "—"
                  : `${Math.round(decisions.hit_rate * 100)}%`
                : (summary?.bars_elapsed ?? 0),
              note:
                blind && decisions ? `${decisions.scored} revealed · ${decisions.holds} holds` : "",
            },
          ]}
        />
      </PageIntro>

      <Card>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div className="w-full">
            <Segmented
              items={MODES.map((m) => m.label)}
              value={MODES.find((m) => m.id === mode)!.label}
              onChange={(label) => setMode(MODES.find((m) => m.label === label)!.id)}
              label="Replay mode"
            />
          </div>
          <label className="text-xs text-subtle">
            Instrument
            <select
              value={symbol}
              disabled={!!state}
              onChange={(e) => setSymbol(e.target.value)}
              className="mt-1 block h-9 border border-border bg-background px-2 text-sm text-foreground"
            >
              {nifty50.map((s) => (
                <option key={s.symbol}>{s.symbol}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-subtle">
            Bars (where licensed)
            <select
              value={interval}
              disabled={!!state}
              onChange={(e) => setIntervalKey(e.target.value as IntervalKey)}
              className="mt-1 block h-9 border border-border bg-background px-2 text-sm text-foreground"
            >
              {Object.keys(INTERVALS).map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          {(
            [
              ["Latency (bars)", "latency_bars", 0, 5, 1],
              ["Participation (%)", "participation", 1, 50, 100],
              ["Max position (%)", "max_position_pct", 5, 100, 1],
            ] as const
          ).map(([label, key, min, max, scale]) => (
            <label key={key} className="text-xs text-subtle">
              {label}
              <input
                type="number"
                min={min}
                max={max}
                disabled={!!state}
                value={Math.round(config[key] * scale)}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    [key]: Math.min(max, Math.max(min, Number(e.target.value) || min)) / scale,
                  })
                }
                className="mt-1 block h-9 w-28 border border-border bg-background px-2 font-mono text-sm text-foreground"
              />
            </label>
          ))}
          <label className="text-xs text-subtle">
            Auto stop (%)
            <input
              type="number"
              min={0}
              max={50}
              disabled={!!state}
              value={config.stop_pct ?? ""}
              placeholder="Off"
              onChange={(e) =>
                setConfig({
                  ...config,
                  stop_pct: Number(e.target.value) > 0 ? Number(e.target.value) : null,
                })
              }
              className="mt-1 block h-9 w-24 border border-border bg-background px-2 font-mono text-sm text-foreground"
            />
          </label>
          {state ? (
            <Button variant="outline" onClick={() => setState(null)}>
              <RotateCcw /> New session
            </Button>
          ) : (
            <Button onClick={begin} disabled={!enough}>
              <Play /> Start {MODES.find((m) => m.id === mode)!.label.toLowerCase()}
            </Button>
          )}
          {state && (
            <Button variant="outline" onClick={() => void saveResult()} disabled={save.isPending}>
              <Save /> Save result
            </Button>
          )}
        </div>
      </Card>

      {history.isLoading ? (
        <Skeleton className="h-96" />
      ) : !enough ? (
        <Card>
          <EmptyState
            title="Not enough history"
            hint={`The provider returned ${bars.length} valid bars for ${symbol} at this resolution.`}
          />
        </Card>
      ) : !state ? (
        <Card>
          <EmptyState
            title="Start a session"
            hint="A random historical starting point is chosen; you see only bars and news available up to the cursor."
          />
        </Card>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,.7fr)]">
          <div className="flex flex-col gap-5">
            <Card>
              <CardHead
                title={`${symbol} · bar ${state.cursor - state.start + 1}`}
                meta={
                  bar
                    ? `As of ${new Date(bar.time * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · est. spread ${estimatedSpreadBps(bar).toFixed(1)} bps`
                    : ""
                }
                action={
                  <span className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        act((s) =>
                          blind
                            ? revealDecisions(stepSim(s, bars, 1), bars, BLIND_HORIZON)
                            : stepSim(s, bars, 1),
                        )
                      }
                      disabled={summary?.finished}
                    >
                      <StepForward /> 1
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        act((s) =>
                          blind
                            ? revealDecisions(stepSim(s, bars, 5), bars, BLIND_HORIZON)
                            : stepSim(s, bars, 5),
                        )
                      }
                      disabled={summary?.finished}
                    >
                      <FastForward /> 5
                    </Button>
                  </span>
                }
              />
              <ProfessionalChart
                stock={stockBySymbol(symbol) ?? { symbol, company: symbol, sector: "" }}
                marketCandles={shown}
                marketSource={`${history.data?.source ?? "provider"} replay`}
                replayIndex={shown.length}
              />
              <div className="flex flex-wrap gap-1.5 border-t border-border px-4 py-2">
                {state.markers.slice(-8).map((m) => (
                  <Pill
                    key={`${m.at}-${m.kind}`}
                    tone={
                      m.kind === "STOP" || m.kind === "CORPORATE_ACTION?"
                        ? "warning"
                        : m.kind === "HALT"
                          ? "negative"
                          : "neutral"
                    }
                  >
                    {new Date(m.at * 1000).toLocaleDateString("en-IN")} {m.kind}
                  </Pill>
                ))}
                {!state.markers.length && (
                  <span className="text-[11px] text-subtle">
                    No gaps, halts or corporate-action suspicions so far.
                  </span>
                )}
              </div>
            </Card>
            {(mode === "NEWS" || mode === "DECISION") && (
              <Card>
                <CardHead
                  title="Information available now"
                  meta={`${seenNews.length} articles released by this bar · ${simNews.length - seenNews.length} hidden in the future`}
                />
                <ul className="max-h-72 divide-y divide-border overflow-y-auto">
                  {seenNews.map((n) => (
                    <li key={n.id} className="px-5 py-2.5 text-[12.5px]">
                      <Pill
                        tone={
                          n.sentiment === "positive"
                            ? "positive"
                            : n.sentiment === "negative"
                              ? "negative"
                              : "neutral"
                        }
                      >
                        {n.sentiment}
                      </Pill>{" "}
                      {n.title}
                      <span className="block font-mono text-[11px] text-subtle">
                        {n.source} · available{" "}
                        {new Date(n.available_at * 1000).toLocaleString("en-IN")}
                      </span>
                    </li>
                  ))}
                  {!seenNews.length && (
                    <li className="px-5 py-4 text-[12px] text-muted-foreground">
                      No provider news was available at this point. The news provider returns recent
                      articles only, so older periods are often silent.
                    </li>
                  )}
                </ul>
              </Card>
            )}
            {(mode === "RISK" || mode === "EXECUTION") && (
              <Card>
                <CardHead
                  title="Fills"
                  meta={`${summary?.partial_fills ?? 0} partial · spread paid ${formatINR(summary?.spread_paid ?? 0)} · charges ${summary?.charges_unknown ? "partly unknown" : formatINR(summary?.charges_paid ?? 0)}`}
                />
                <ul className="divide-y divide-border">
                  {state.fills.map((f, i) => (
                    <li
                      key={`${f.order_id}-${i}`}
                      className="flex justify-between gap-3 px-5 py-2 font-mono text-[11.5px]"
                    >
                      <span>
                        {f.side} {f.quantity} @ ₹{f.price}
                        {f.partial ? " · partial" : ""}
                        {f.gap_through_stop ? " · gapped through stop" : ""}
                      </span>
                      <span className="text-subtle">
                        {new Date(f.at * 1000).toLocaleDateString("en-IN")}
                      </span>
                    </li>
                  ))}
                  {!state.fills.length && (
                    <li className="px-5 py-4 text-[12px] text-muted-foreground">No fills yet.</li>
                  )}
                </ul>
              </Card>
            )}
          </div>

          <div className="flex flex-col gap-5">
            {blind ? (
              <Card glow>
                <CardHead
                  title="Decide first"
                  meta={`Outcome revealed after ${BLIND_HORIZON} bars`}
                />
                <div className="space-y-3 p-5">
                  <textarea
                    aria-label="Reason"
                    value={thesis}
                    onChange={(e) => setThesis(e.target.value)}
                    placeholder="Your reason, written before you see what happens"
                    className="min-h-20 w-full border border-border bg-background p-2.5 text-[13px]"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    {(["BUY", "HOLD", "SELL"] as const).map((action) => (
                      <Button
                        key={action}
                        variant="outline"
                        disabled={
                          summary?.finished ||
                          state.decisions.some((d) => d.cursor === state.cursor)
                        }
                        onClick={() => {
                          act((s) => recordDecision(s, bars, action, thesis.trim()));
                          setThesis("");
                        }}
                      >
                        {action}
                      </Button>
                    ))}
                  </div>
                  <ul className="space-y-1.5 text-[12px]">
                    {[...state.decisions].reverse().map((d) => (
                      <li
                        key={d.at}
                        className="flex items-center justify-between gap-2 border-b border-border/60 pb-1"
                      >
                        <span>
                          <span className="font-mono">
                            {new Date(d.at * 1000).toLocaleDateString("en-IN")}
                          </span>{" "}
                          {d.action}
                          {d.thesis && (
                            <span className="block text-[10.5px] text-subtle">{d.thesis}</span>
                          )}
                        </span>
                        {d.revealed_return == null ? (
                          <Pill>
                            <Eye className="mr-1 h-3 w-3" /> hidden
                          </Pill>
                        ) : (
                          <span
                            className={cn(
                              "font-mono",
                              d.revealed_return >= 0 ? "text-positive" : "text-negative",
                            )}
                          >
                            {(d.revealed_return * 100).toFixed(2)}%
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            ) : (
              <Card glow>
                <CardHead
                  title="Replay order"
                  meta={`Latency ${config.latency_bars} bar(s) · participation cap ${Math.round(config.participation * 100)}% of bar volume`}
                />
                <div className="space-y-3 p-5">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-subtle">
                      Quantity
                      <input
                        type="number"
                        min={1}
                        value={quantity}
                        onChange={(e) =>
                          setQuantity(Math.max(1, Math.floor(Number(e.target.value)) || 1))
                        }
                        className="mt-1 h-9 w-full border border-border bg-background px-2 font-mono text-sm text-foreground"
                      />
                    </label>
                    <label className="text-xs text-subtle">
                      Type
                      <select
                        value={orderType}
                        onChange={(e) => setOrderType(e.target.value as "MARKET" | "LIMIT")}
                        className="mt-1 h-9 w-full border border-border bg-background px-2 text-sm text-foreground"
                      >
                        <option>MARKET</option>
                        <option>LIMIT</option>
                      </select>
                    </label>
                  </div>
                  {orderType === "LIMIT" && (
                    <input
                      aria-label="Limit price"
                      type="number"
                      value={limit}
                      onChange={(e) => setLimit(e.target.value)}
                      placeholder={bar ? String(bar.close) : "Limit"}
                      className="h-9 w-full border border-border bg-background px-2 font-mono text-sm"
                    />
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {(["BUY", "SELL"] as const).map((side) => (
                      <Button
                        key={side}
                        variant="outline"
                        disabled={summary?.finished}
                        onClick={() =>
                          act((s) =>
                            placeSimOrder(s, bars, {
                              side,
                              type: orderType,
                              quantity,
                              limit: orderType === "LIMIT" ? Number(limit) : null,
                            }),
                          )
                        }
                      >
                        {side}
                      </Button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      aria-label="Stop price"
                      type="number"
                      value={stopInput}
                      onChange={(e) => setStopInput(e.target.value)}
                      placeholder={state.stop ? `Stop ₹${state.stop}` : "Stop price"}
                      className="h-9 min-w-0 flex-1 border border-border bg-background px-2 font-mono text-sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => act((s) => setStop(s, stopInput ? Number(stopInput) : null))}
                    >
                      Set stop
                    </Button>
                  </div>
                  {error && <p className="text-[11.5px] text-negative">{error}</p>}
                  <ul className="space-y-1 text-[11.5px]">
                    {state.orders
                      .slice(-6)
                      .reverse()
                      .map((o) => (
                        <li key={o.id} className="flex items-center justify-between gap-2">
                          <span className="font-mono">
                            {o.side} {o.quantity} {o.type}
                            {o.limit ? ` @ ₹${o.limit}` : ""} · {o.status.toLowerCase()}
                            {o.reason && (
                              <span className="block font-sans text-[10.5px] text-subtle">
                                {o.reason}
                              </span>
                            )}
                          </span>
                          {(o.status === "PENDING" || o.status === "PARTIAL") && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => act((s) => cancelSimOrder(s, o.id))}
                            >
                              Cancel
                            </Button>
                          )}
                        </li>
                      ))}
                  </ul>
                </div>
              </Card>
            )}
            {(mode === "NEWS" || mode === "DECISION") && !blind && (
              <Card>
                <CardHead title="Thesis log" meta="Revise as information arrives" />
                <div className="space-y-2 p-5">
                  <textarea
                    aria-label="Thesis"
                    value={thesis}
                    onChange={(e) => setThesis(e.target.value)}
                    placeholder="Your thesis at this point"
                    className="min-h-16 w-full border border-border bg-background p-2.5 text-[13px]"
                  />
                  <Button
                    size="sm"
                    disabled={thesis.trim().length < 3}
                    onClick={() => {
                      act((s) => logThesis(s, bars, thesis.trim(), seenNews.length));
                      setThesis("");
                    }}
                  >
                    Record thesis now
                  </Button>
                  <ol className="space-y-1.5 text-[12px]">
                    {[...state.thesis_log].reverse().map((t) => (
                      <li key={t.at} className="border-l border-primary/50 pl-2">
                        <span className="font-mono text-[10px] text-subtle">
                          {new Date(t.at * 1000).toLocaleDateString("en-IN")} · {t.news_seen}{" "}
                          articles known
                        </span>
                        <span className="block">{t.text}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </Card>
            )}
            {mode === "RISK" && (
              <Card>
                <CardHead title="Replay portfolio" meta="Equity path of the replay wallet" />
                <EquityPath points={state.equity_curve.map((p) => p.equity)} />
                <dl className="space-y-1 px-5 pb-5 text-[12px]">
                  <div className="flex justify-between">
                    <dt className="text-subtle">Position</dt>
                    <dd className="font-mono">{state.quantity} shares</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-subtle">Cash</dt>
                    <dd className="font-mono">{formatINR(state.cash_paise / 100)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-subtle">Active stop</dt>
                    <dd className="font-mono">{state.stop ? `₹${state.stop}` : "None"}</dd>
                  </div>
                </dl>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EquityPath({ points }: { points: number[] }) {
  if (points.length < 2)
    return (
      <p className="p-5 text-[12px] text-muted-foreground">
        Advance the replay to draw the equity path.
      </p>
    );
  const min = Math.min(...points);
  const max = Math.max(...points);
  const d = points
    .map(
      (p, i) =>
        `${i ? "L" : "M"}${(i / (points.length - 1)) * 300},${90 - ((p - min) / Math.max(1e-9, max - min)) * 80}`,
    )
    .join(" ");
  return (
    <svg
      viewBox="0 0 300 100"
      className="h-28 w-full px-5"
      preserveAspectRatio="none"
      role="img"
      aria-label="Replay equity path"
    >
      <path
        d={d}
        fill="none"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        className={points.at(-1)! >= points[0]! ? "stroke-positive" : "stroke-negative"}
      />
    </svg>
  );
}
