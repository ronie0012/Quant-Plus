import * as React from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Card, CardHead, EmptyState, Pill, SourceTag } from "@/components/app/cards";
import { MetricStrip, PageIntro } from "./workspace";
import { Button } from "@/components/ui/button";
import { formatNum, relativeTime } from "@/hooks/use-dashboard-data";
import { useMarketSentiment, useSectorSentiment } from "@/hooks/use-intelligence";
import {
  type MarketStructure,
  type StructureLabel,
  useMarketStructureBoard,
} from "@/lib/market-structure";
import { nifty50 } from "@/data/nifty50";
import { cn } from "@/lib/utils";

export type MarketPulseView = "liquidity" | "xray";

const tones: Record<StructureLabel, "positive" | "negative" | "warning" | "neutral"> = {
  bullish: "positive",
  bearish: "negative",
  choppy: "warning",
  unavailable: "neutral",
};

const labels: Record<StructureLabel, string> = {
  bullish: "Bullish",
  bearish: "Bearish",
  choppy: "Choppy",
  unavailable: "Unavailable",
};

const textTones: Record<StructureLabel, string> = {
  bullish: "text-positive",
  bearish: "text-negative",
  choppy: "text-warning",
  unavailable: "text-subtle",
};

export function MarketPulsePage({
  view,
  onView,
}: {
  view: MarketPulseView;
  onView: (view: MarketPulseView) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Discover · Market Pulse"
        title="Market structure"
        body="Use sourced market observations to inspect active zones, liquidity proxies and sector participation. Structure scores are ranking aids, not forecast probabilities."
        action={<SourceTag label="Provider dependent" />}
      />
      <p className="-mt-2 text-[11px] text-subtle">
        NIFTY 50 cash-equity scope · refreshed near minute cadence
      </p>
      {view === "liquidity" ? (
        <LiquidityBoard />
      ) : (
        <MarketXray onOpenLiquidity={() => onView("liquidity")} />
      )}
    </div>
  );
}

function LiquidityBoard() {
  const board = useMarketStructureBoard();
  const [filter, setFilter] = React.useState<StructureLabel | "all">("all");
  const [showUnavailable, setShowUnavailable] = React.useState(false);

  if (board.isLoading)
    return (
      <Card className="p-5">
        <span role="status" className="sr-only">
          Loading liquidity board…
        </span>
        <div className="h-5 w-48 animate-pulse rounded bg-border" />
        <div className="mt-5 h-64 animate-pulse rounded bg-border/50" />
      </Card>
    );

  if (board.isError || !board.data)
    return (
      <Card>
        <EmptyState
          title="Liquidity board unavailable"
          hint={
            board.error instanceof Error
              ? board.error.message
              : "Provider structure data could not be loaded."
          }
          onRetry={() => void board.refetch()}
        />
      </Card>
    );

  const allRows = board.data.rows;
  const rows = allRows.filter(
    (row) =>
      (filter === "all" || row.classification.label === filter) &&
      (showUnavailable || filter === "unavailable" || row.classification.label !== "unavailable"),
  );
  const counts = countLabels(allRows);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHead
          title="Observed structure"
          meta={`${board.data.observed}/${board.data.requested} symbols returned structure data`}
          action={
            <Button variant="ghost" size="sm" onClick={() => void board.refetch()}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          }
        />
        <div className="grid gap-px border-t border-border bg-border sm:grid-cols-4">
          {(["bullish", "bearish", "choppy", "unavailable"] as const).map((label) => (
            <button
              type="button"
              key={label}
              onClick={() => setFilter((current) => (current === label ? "all" : label))}
              aria-pressed={filter === label}
              className={cn(
                "bg-panel/80 p-4 text-left transition-colors hover:bg-panel-elevated",
                filter === label && "bg-primary/10",
              )}
            >
              <span className="block text-[11px] uppercase tracking-[0.06em] text-subtle">
                {labels[label]}
              </span>
              <span className={cn("mt-1 block font-mono text-xl", textTones[label])}>
                {counts[label]}
              </span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
          <p className="text-[11px] text-subtle">
            Order-block candidates and liquidity proxies use completed candles, not observed
            institutional positions. A ranking score is not a probability.
          </p>
          <button
            type="button"
            onClick={() => setShowUnavailable((current) => !current)}
            aria-pressed={showUnavailable}
            className="text-[11px] text-primary-soft hover:text-foreground"
          >
            {showUnavailable ? "Hide unavailable" : "Show unavailable"}
          </button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHead
          title="Liquidity board"
          meta={`${observationTime(board.data.updated_at)} · ${board.data.universe}`}
          action={<SourceTag label="Structure data" />}
        />
        {rows.length === 0 ? (
          <EmptyState
            title="No matching structures"
            hint="Try another structure category or wait for provider data."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.06em] text-subtle">
                  <th className="px-4 py-3">Symbol</th>
                  <th className="px-4 py-3">Structure</th>
                  <th className="px-4 py-3">Active zone</th>
                  <th className="px-4 py-3">Liquidity</th>
                  <th className="px-4 py-3">Depth</th>
                  <th className="px-4 py-3">Quality</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <LiquidityRow key={row.symbol} row={row} index={index} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function LiquidityRow({ row, index }: { row: MarketStructure; index: number }) {
  const stock = nifty50.find((item) => item.symbol === row.symbol);
  const zone = row.order_blocks.find((item) => item.status === "active");
  const proxy = row.price_liquidity_proxies.at(-1);
  const sweep = row.liquidity_sweeps.at(-1);
  const label = row.classification.label;
  return (
    <tr className="border-b border-border/70 last:border-0 hover:bg-panel-elevated">
      <td className="px-4 py-3">
        <Link
          to="/app/stocks/$symbol"
          params={{ symbol: row.symbol }}
          className="block hover:text-primary-soft"
        >
          <span className="font-mono font-semibold">
            {String(index + 1).padStart(2, "0")} · {row.symbol}
          </span>
          <span className="mt-0.5 block max-w-[180px] truncate text-[11px] text-subtle">
            {stock?.company ?? row.industry ?? "NSE equity"}
          </span>
        </Link>
      </td>
      <td className="px-4 py-3">
        <Pill tone={tones[label]}>{labels[label]}</Pill>
        <span className="mt-1 block font-mono text-[10px] text-subtle">
          {row.rank.score == null ? "—" : `${row.rank.score}/100 attention`}
        </span>
      </td>
      <td className="px-4 py-3 font-mono">
        {zone ? (
          <span>
            {formatNum(zone.lower)}–{formatNum(zone.upper)}
            <span className="ml-1 text-[10px] text-subtle">{zone.direction}</span>
          </span>
        ) : (
          <span className="text-subtle">No active zone</span>
        )}
      </td>
      <td className="px-4 py-3">
        {sweep ? (
          <span className={sweep.direction === "bullish" ? "text-positive" : "text-negative"}>
            {sweep.direction} sweep · {formatNum(sweep.liquidity_level)}
          </span>
        ) : proxy ? (
          <span>
            {proxy.kind.replace("equal_", "equal ")} · {formatNum(proxy.level)}
          </span>
        ) : (
          <span className="text-subtle">No proxy</span>
        )}
      </td>
      <td className="px-4 py-3 font-mono">
        {row.depth_imbalance ? (
          <span
            className={
              row.depth_imbalance.bias === "bullish"
                ? "text-positive"
                : row.depth_imbalance.bias === "bearish"
                  ? "text-negative"
                  : "text-subtle"
            }
          >
            {row.depth_imbalance.imbalance >= 0 ? "+" : ""}
            {(row.depth_imbalance.imbalance * 100).toFixed(1)}%
          </span>
        ) : (
          <span className="text-subtle">Unavailable</span>
        )}
      </td>
      <td className="px-4 py-3">
        <Pill
          tone={
            row.quality === "GOOD"
              ? "positive"
              : row.quality === "UNAVAILABLE"
                ? "neutral"
                : "warning"
          }
        >
          {row.quality}
        </Pill>
        <span className="mt-1 block text-[10px] text-subtle">
          {row.history.source?.toUpperCase() ?? "Source unavailable"}
          {row.history.delayed === true
            ? " · Delayed"
            : row.history.delayed === null
              ? " · Delay unknown"
              : ""}
        </span>
        <span className="block text-[10px] text-subtle">
          {row.data_cutoff
            ? `Completed ${relativeTime(row.data_cutoff)}`
            : "Completed candle time unavailable"}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          to="/app/stocks/$symbol"
          params={{ symbol: row.symbol }}
          className="inline-flex items-center gap-1 text-[11px] text-primary-soft hover:text-foreground"
        >
          Chart <ArrowUpRight className="h-3 w-3" />
        </Link>
      </td>
    </tr>
  );
}

function MarketXray({ onOpenLiquidity }: { onOpenLiquidity: () => void }) {
  const board = useMarketStructureBoard();
  const market = useMarketSentiment();
  const sectors = useSectorSentiment();
  const counts = board.data ? countLabels(board.data.rows) : null;
  const hasClassified = counts != null && counts.bullish + counts.bearish + counts.choppy > 0;
  const structureNote = board.isLoading
    ? "Loading structure…"
    : board.isError
      ? board.data
        ? "Stale · refresh failed"
        : "Unavailable · load failed"
      : !hasClassified
        ? "Unavailable · no classified observations"
        : `${board.data!.observed}/${board.data!.requested} observed · ${observationTime(board.data!.updated_at)}`;
  const marketAvailable = validScore(market.data?.score) && market.data?.label !== "UNAVAILABLE";
  const marketNote = market.isLoading
    ? "Loading market…"
    : market.isError
      ? market.data
        ? "Stale · refresh failed"
        : "Unavailable · load failed"
      : !marketAvailable
        ? "Unavailable"
        : `${market.data!.score}/100 descriptive index · ${market.data!.data_quality}${market.data!.score_basis === "LAST_AVAILABLE_SESSION" ? " · last available session" : ""}`;
  const breadth = market.data?.components?.["market_breadth"];
  const breadthAvailable =
    breadth?.available === true && Number.isInteger(breadth.advancing) && breadth.advancing! >= 0;
  const sectorRows = Object.entries(sectors.data?.sectors ?? {}).sort(
    ([, a], [, b]) =>
      (b.available && validScore(b.score) ? b.score : -1) -
      (a.available && validScore(a.score) ? a.score : -1),
  );
  const observedSectors = sectorRows.filter(
    ([, sector]) => sector.available && validScore(sector.score),
  ).length;
  const sectorNote = sectors.isLoading
    ? "Loading sectors…"
    : sectors.isError
      ? sectors.data
        ? "Stale · refresh failed"
        : "Unavailable · load failed"
      : `${observedSectors}/${sectorRows.length} sector observations · ${observationTime(sectors.data?.updated_at)}`;
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHead
          title="Market X-Ray"
          meta="Observed context, structure and participation"
          action={
            <Button size="sm" variant="outline" onClick={onOpenLiquidity}>
              Open liquidity board <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          }
        />
        <MetricStrip
          items={[
            {
              label: "Market state",
              value: marketAvailable ? market.data!.label : "—",
              note: marketNote,
              tone:
                marketAvailable && market.data?.label === "BULLISH"
                  ? "positive"
                  : marketAvailable && market.data?.label === "BEARISH"
                    ? "negative"
                    : "primary",
            },
            {
              label: "Advancing",
              value: breadthAvailable ? breadth!.advancing : "—",
              note:
                market.isLoading || market.isError
                  ? marketNote
                  : !breadthAvailable
                    ? "Breadth unavailable"
                    : breadth?.coverage == null || !Number.isFinite(breadth.coverage)
                      ? "Coverage unavailable"
                      : `${Math.round(breadth.coverage * 100)}% coverage`,
            },
            {
              label: "Bullish structures",
              value: hasClassified ? counts!.bullish : "—",
              note: structureNote,
              tone: "positive",
            },
            {
              label: "Bearish structures",
              value: hasClassified ? counts!.bearish : "—",
              note: structureNote,
              tone: "negative",
            },
          ]}
        />
        {market.isError && (
          <QueryFailure
            name="Market context"
            error={market.error}
            cached={Boolean(market.data)}
            onRetry={() => void market.refetch()}
          />
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <Card>
          <CardHead title="Leading and lagging sectors" meta={sectorNote} />
          {sectors.isError && (
            <QueryFailure
              name="Sectors"
              error={sectors.error}
              cached={Boolean(sectors.data)}
              onRetry={() => void sectors.refetch()}
            />
          )}
          {sectors.isLoading ? (
            <p role="status" className="px-4 py-6 text-sm text-subtle">
              Loading sector observations…
            </p>
          ) : sectorRows.length === 0 ? (
            <EmptyState
              title="Sector view unavailable"
              hint="Sector observations are not available from the provider."
            />
          ) : (
            <div className="divide-y divide-border">
              {sectorRows.map(([name, sector]) => {
                const available = sector.available && validScore(sector.score);
                return (
                  <div key={name} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-20 font-mono text-[11px] text-subtle">{name}</span>
                    <div className="h-1.5 min-w-0 flex-1 rounded-full bg-border">
                      {available && (
                        <span
                          className={cn(
                            "block h-full rounded-full",
                            sector.score! >= 60
                              ? "bg-positive"
                              : sector.score! <= 40
                                ? "bg-negative"
                                : "bg-primary",
                          )}
                          style={{ width: `${sector.score}%` }}
                        />
                      )}
                    </div>
                    <span className="w-10 text-right font-mono text-xs">
                      {available ? sector.score : "—"}
                    </span>
                    <span className="w-20 text-right text-[10px] uppercase text-subtle">
                      {!available
                        ? "Unavailable"
                        : sectors.isError
                          ? "Stale"
                          : (sector.trend ?? "—")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        <Card>
          <CardHead title="Structure mix" meta={structureNote} />
          {board.isError && (
            <QueryFailure
              name="Structure"
              error={board.error}
              cached={Boolean(board.data)}
              onRetry={() => void board.refetch()}
            />
          )}
          <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4 lg:grid-cols-2">
            {(["bullish", "bearish", "choppy", "unavailable"] as const).map((label) => (
              <div key={label} className="bg-panel/80 p-4">
                <span className="block text-[10px] uppercase tracking-[0.06em] text-subtle">
                  {labels[label]}
                </span>
                <span className={cn("mt-2 block font-mono text-2xl", textTones[label])}>
                  {counts &&
                  board.data!.rows.length > 0 &&
                  (hasClassified || label === "unavailable")
                    ? counts[label]
                    : "—"}
                </span>
              </div>
            ))}
          </div>
          <p className="border-t border-border px-4 py-3 text-[11px] leading-relaxed text-subtle">
            Sector sentiment and market structure are separate observations. A bullish market
            condition does not confirm a trade, and missing inputs remain unavailable.
          </p>
        </Card>
      </div>
    </div>
  );
}

function validScore(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function observationTime(value: string | null | undefined) {
  return value && Number.isFinite(Date.parse(value))
    ? `Updated ${relativeTime(value)}`
    : "Provider timestamp unavailable";
}

function QueryFailure({
  name,
  error,
  cached,
  onRetry,
}: {
  name: string;
  error: unknown;
  cached: boolean;
  onRetry: () => void;
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-[11px] text-warning"
    >
      <span>
        {name} {cached ? "refresh failed; cached observations are stale." : "unavailable."}
        {error instanceof Error ? ` ${error.message}` : ""}
      </span>
      <Button size="sm" variant="ghost" onClick={onRetry}>
        Retry {name.toLowerCase()}
      </Button>
    </div>
  );
}

function countLabels(rows: MarketStructure[]) {
  return rows.reduce<Record<StructureLabel, number>>(
    (counts, row) => {
      counts[row.classification.label] += 1;
      return counts;
    },
    { bullish: 0, bearish: 0, choppy: 0, unavailable: 0 },
  );
}
