import { useMemo, useState } from "react";
import { FastForward, Play, RotateCcw, StepForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHead, EmptyState, Pill, Skeleton } from "@/components/app/cards";
import { MetricStrip, PageIntro } from "@/components/app/pages/workspace";
import { ProfessionalChart } from "@/components/app/stocks/ProfessionalChart";
import { nifty50 } from "@/data/nifty50";
import { useMarketHistory } from "@/hooks/use-agent-stock";
import { formatINR, formatNum } from "@/hooks/use-dashboard-data";
import { validateCandles } from "@/lib/market-history";
import {
  queueOrder,
  replaySummary,
  startReplay,
  step,
  visibleBars,
  type ReplayState,
} from "@/lib/replay";

const WARMUP_BARS = 60;

/**
 * Practise decisions on recorded daily bars from the provider. Only bars up to
 * the replay cursor are shown; orders fill at the next bar's open in an
 * isolated replay account that is never written to the paper book.
 */
export function ReplayPage() {
  const [symbol, setSymbol] = useState("RELIANCE");
  const [quantity, setQuantity] = useState(10);
  const [state, setState] = useState<ReplayState | null>(null);
  const history = useMarketHistory(symbol, "1Y");
  const candles = useMemo(() => validateCandles(history.data?.candles).candles, [history.data]);
  const enough = candles.length > WARMUP_BARS + 10;
  const summary = state ? replaySummary(state, candles) : null;
  const begin = () => {
    // A random start keeps the player from knowing which period follows.
    const latest = candles.length - 10;
    const start = WARMUP_BARS + Math.floor(Math.random() * Math.max(1, latest - WARMUP_BARS));
    setState(startReplay(candles, start));
  };
  const act = (fn: () => ReplayState) => {
    try {
      setState(fn());
    } catch (error) {
      setState((current) =>
        current
          ? { ...current, rejected: error instanceof Error ? error.message : "Rejected" }
          : current,
      );
    }
  };
  const bar = state ? candles[state.cursor] : null;
  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Market replay"
        title="Replay"
        body="Step through a randomly chosen stretch of real daily history. You only see bars up to the current one; an order you place fills at the next bar's open. The replay account is separate from your paper book and resets when you leave."
        status="Recorded provider history"
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
            },
            {
              label: "Buy and hold",
              value: summary ? `${formatNum(summary.buy_and_hold_pct)}%` : "—",
              note: "Same period, from the start bar's close",
            },
            { label: "Bars played", value: summary?.bars_elapsed ?? 0 },
          ]}
        />
      </PageIntro>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,.6fr)]">
        <Card>
          <CardHead
            title={state ? `${symbol} · bar ${state.cursor - state.start + 1}` : `${symbol} replay`}
            meta={
              bar
                ? `As of ${new Date(bar.time * 1000).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })} · ${history.data?.source ?? "provider"} daily bars`
                : "Choose an instrument and start"
            }
          />
          {history.isLoading ? (
            <Skeleton className="m-5 h-72" />
          ) : !enough ? (
            <EmptyState
              title="Replay needs recorded history"
              hint={
                history.error?.message ??
                "The market-data provider returned too little daily history for this instrument."
              }
              onRetry={() => void history.refetch()}
            />
          ) : state ? (
            <ProfessionalChart
              stock={{ symbol, company: symbol, sector: "" }}
              marketCandles={visibleBars(candles, state).slice(-120)}
              marketSource={`${history.data?.source ?? "provider"} daily · replay`}
              intervalSeconds={86400}
              replayIndex={120}
            />
          ) : (
            <div className="p-8 text-sm text-muted-foreground">
              Press start to load a hidden starting point with {WARMUP_BARS} bars of context.
            </div>
          )}
        </Card>
        <Card glow>
          <CardHead title="Replay ticket" meta="Fills at the next bar's open" />
          <div className="space-y-4 p-5">
            <label className="block font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
              Instrument
              <select
                value={symbol}
                disabled={state != null}
                onChange={(event) => setSymbol(event.target.value)}
                className="mt-2 w-full border border-border bg-background p-3 text-foreground outline-none disabled:opacity-70"
              >
                {nifty50.map((item) => (
                  <option key={item.symbol}>{item.symbol}</option>
                ))}
              </select>
            </label>
            {!state ? (
              <Button className="w-full" disabled={!enough} onClick={begin}>
                <Play /> Start replay
              </Button>
            ) : (
              <>
                <label className="block font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                  Quantity
                  <input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(event) =>
                      setQuantity(Math.max(1, Math.floor(Number(event.target.value)) || 1))
                    }
                    className="mt-2 w-full border border-border bg-background p-3 font-mono text-foreground outline-none"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    disabled={summary?.finished}
                    onClick={() => act(() => queueOrder(state, candles, "BUY", quantity))}
                  >
                    Buy at next open
                  </Button>
                  <Button
                    variant="outline"
                    disabled={summary?.finished || state.quantity === 0}
                    onClick={() =>
                      act(() =>
                        queueOrder(state, candles, "SELL", Math.min(quantity, state.quantity)),
                      )
                    }
                  >
                    Sell at next open
                  </Button>
                </div>
                {state.pending && (
                  <Pill tone="primary">
                    Pending {state.pending.side.toLowerCase()} {state.pending.quantity}
                  </Pill>
                )}
                {state.rejected && <p className="text-[12px] text-negative">{state.rejected}</p>}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    disabled={summary?.finished}
                    onClick={() => setState(step(state, candles, 1))}
                  >
                    <StepForward /> Next bar
                  </Button>
                  <Button
                    variant="outline"
                    disabled={summary?.finished}
                    onClick={() => setState(step(state, candles, 5))}
                  >
                    <FastForward /> 5 bars
                  </Button>
                </div>
                <dl className="space-y-1.5 font-mono text-[11px] num-tabular">
                  <div className="flex justify-between">
                    <dt className="text-subtle">Cash</dt>
                    <dd>{formatINR(state.cash_paise / 100, { exact: true })}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-subtle">Shares</dt>
                    <dd>{state.quantity}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-subtle">Trades</dt>
                    <dd>{state.trades.length}</dd>
                  </div>
                </dl>
                {summary?.charges_unknown && (
                  <p className="text-[11px] text-warning">
                    Some fills predate the verified charge schedule; their charges are unknown and
                    were not deducted.
                  </p>
                )}
                {summary?.finished && (
                  <p className="text-[12px] text-muted-foreground">
                    Replay complete: your result {formatNum(summary.return_pct)}% versus buy and
                    hold {formatNum(summary.buy_and_hold_pct)}%.
                  </p>
                )}
                <Button variant="ghost" className="w-full" onClick={() => setState(null)}>
                  <RotateCcw /> Reset replay
                </Button>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
