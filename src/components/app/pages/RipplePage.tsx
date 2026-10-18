import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowRight, ArrowUpRight, ExternalLink, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHead, EmptyState, Pill, Skeleton } from "@/components/app/cards";
import { MetricStrip, PageIntro, ProgressBar, Segmented } from "@/components/app/pages/workspace";
import { RippleGraph } from "@/components/app/ripple/RippleGraph";
import { AiExplain } from "@/components/app/AiExplain";
import { nifty50 } from "@/data/nifty50";
import { relativeTime } from "@/hooks/use-dashboard-data";
import { useHistories } from "@/hooks/use-quant-data";
import { RIPPLE_HORIZON, rippleName, useRippleLedger, useRippleOrigins } from "@/hooks/use-ripple";
import {
  EDGE_LABELS,
  explainChain,
  factorById,
  FACTORS,
  historicalEcho,
  isFactor,
  propagate,
  whatIfOrigin,
  type RippleImpact,
  type RippleOrigin,
} from "@/lib/quant/ripple";
import { cn } from "@/lib/utils";

const SOURCES = ["Today's news", "What-if"] as const;
const DIRECTIONS = ["Rises", "Falls"] as const;
const GRAPH_LIMIT = 24;
const pct = (v: number | null | undefined, digits = 1) =>
  v == null ? "—" : `${(v * 100).toFixed(digits)}%`;

function originStatement(origin: RippleOrigin) {
  const factor = factorById(origin.origin);
  if (factor) return origin.direction === "UP" ? factor.up : factor.down;
  return `${rippleName(origin.origin)} ${origin.direction === "UP" ? "rises" : "falls"}`;
}

/**
 * Ripple map: one event, every connected NIFTY 50 company, the chain of
 * reasoning for each, the historical echo where both ends are listed, and a
 * ledger that grades locked ripples against what prices actually did.
 */
export function RipplePage() {
  const [source, setSource] = useState<(typeof SOURCES)[number]>("Today's news");
  const [newsId, setNewsId] = useState<string | null>(null);
  const [whatIf, setWhatIf] = useState<string>("CRUDE");
  const [whatIfDirection, setWhatIfDirection] = useState<(typeof DIRECTIONS)[number]>("Rises");
  const [selected, setSelected] = useState<string | null>(null);
  const news = useRippleOrigins();
  const ledger = useRippleLedger();

  const origin: RippleOrigin | null = useMemo(() => {
    if (source === "What-if") {
      const direction = whatIfDirection === "Rises" ? "UP" : "DOWN";
      const factor = factorById(whatIf);
      const label = factor
        ? direction === "UP"
          ? factor.up
          : factor.down
        : `${rippleName(whatIf)} ${direction === "UP" ? "rises sharply" : "falls sharply"}`;
      return whatIfOrigin(whatIf, direction, label);
    }
    return news.origins.find((o) => o.id === newsId) ?? news.origins[0] ?? null;
  }, [source, whatIf, whatIfDirection, newsId, news.origins]);

  const impacts = useMemo(
    () => (origin ? propagate(origin.origin, origin.direction) : []),
    [origin],
  );
  const shown = impacts.slice(0, GRAPH_LIMIT);
  const active = impacts.find((i) => i.symbol === selected) ?? impacts[0] ?? null;
  const byHop = [1, 2, 3].map((hop) => impacts.filter((i) => i.hop === hop).length);

  const pick = (next: () => void) => {
    next();
    setSelected(null);
  };

  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Discover"
        title="Ripple map"
        body="News rarely moves only the company it names. Pick an event and see which NIFTY 50 companies it can reach — first, second and third order — with the reasoning for each."
        status="Curated map · paper practice"
      />

      <Card>
        <CardHead
          title="Choose an event"
          meta={
            source === "Today's news"
              ? `${news.origins.length} ripple event(s) found in ${news.articles} headline(s)`
              : "Explore a scenario without waiting for the news"
          }
          action={
            <Segmented
              items={SOURCES}
              value={source}
              onChange={(v) => pick(() => setSource(v))}
              label="Event source"
            />
          }
        />
        {source === "Today's news" ? (
          <NewsOrigins
            loading={news.loading}
            failed={Boolean(news.error)}
            onRetry={() => void news.refetch()}
            origins={news.origins}
            activeId={origin?.id ?? null}
            onPick={(id) => pick(() => setNewsId(id))}
            onWhatIf={() => pick(() => setSource("What-if"))}
          />
        ) : (
          <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
            <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-[12px] text-subtle">
              What changes
              <select
                value={whatIf}
                onChange={(event) => pick(() => setWhatIf(event.target.value))}
                className="h-9 rounded-md border border-border-strong bg-background px-2.5 text-[13px] text-foreground"
              >
                <optgroup label="Economy and commodities">
                  {FACTORS.map((factor) => (
                    <option key={factor.id} value={factor.id}>
                      {factor.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="A NIFTY 50 company">
                  {nifty50.map((stock) => (
                    <option key={stock.symbol} value={stock.symbol}>
                      {stock.company}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            <div className="flex flex-col gap-1.5 text-[12px] text-subtle">
              Direction
              <Segmented
                items={DIRECTIONS}
                value={whatIfDirection}
                onChange={(v) => pick(() => setWhatIfDirection(v))}
                label="Scenario direction"
              />
            </div>
          </div>
        )}
      </Card>

      {origin && (
        <>
          <section className="dash-rise flex flex-col gap-4 rounded-lg border border-border bg-panel/80 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="label-tech text-subtle">Event</p>
              <p className="mt-1 text-[18px] leading-tight font-semibold tracking-tight text-primary-soft">
                {originStatement(origin)}
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-2 md:w-[24rem]">
              {["1st order", "2nd order", "3rd order"].map((label, i) => (
                <div key={label} className="rounded-md bg-background/40 px-3 py-2">
                  <dt className="text-[11px] text-subtle">{label}</dt>
                  <dd className="mt-0.5 text-[18px] font-semibold num-tabular">{byHop[i]}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <Card glow className="xl:sticky xl:top-20 xl:self-start">
              <CardHead
                title="How the ripple spreads"
                meta={
                  impacts.length > GRAPH_LIMIT
                    ? `Strongest ${GRAPH_LIMIT} of ${impacts.length} links shown`
                    : "Select a company to trace its chain"
                }
                action={
                  <LockButton
                    disabled={!impacts.length || ledger.isLocked(origin) || ledger.locking}
                    locked={ledger.isLocked(origin)}
                    onLock={() => void ledger.lock(origin, impacts)}
                  />
                }
              />
              <div className="px-3 py-4 sm:px-5">
                {impacts.length ? (
                  <RippleGraph
                    origin={origin.origin}
                    originLabel={rippleName(origin.origin)}
                    impacts={shown}
                    selected={active?.symbol ?? null}
                    onSelect={setSelected}
                  />
                ) : (
                  <EmptyState
                    title="No mapped connections"
                    hint="This company has no curated links in the map yet."
                  />
                )}
                <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-[11px] text-subtle">
                  <Legend className="bg-positive" label="May rise" />
                  <Legend className="bg-negative" label="May fall" />
                  <Legend className="border border-border-strong bg-panel" label="Passes through" />
                  <span>Rings from the centre: 1st, 2nd, 3rd order</span>
                </div>
              </div>
              {ledger.lockError && (
                <p
                  role="alert"
                  className="border-t border-border px-5 py-2.5 text-[12px] text-warning"
                >
                  Could not lock this ripple. Try again.
                </p>
              )}
            </Card>

            <div className="flex min-w-0 flex-col gap-5">
              {active && <ImpactDetail origin={origin} impact={active} />}
              <ImpactList
                impacts={impacts}
                active={active?.symbol ?? null}
                onSelect={setSelected}
              />
            </div>
          </div>
        </>
      )}

      <RippleRecord ledger={ledger} />
      <Method />
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={cn("h-2.5 w-2.5 rounded-full", className)} />
      {label}
    </span>
  );
}

function LockButton({
  disabled,
  locked,
  onLock,
}: {
  disabled: boolean;
  locked: boolean;
  onLock: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={disabled}
      onClick={onLock}
      className="h-8 gap-1.5"
      title="Save the strongest calls now so they can be graded against real prices later"
    >
      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
      {locked ? "Locked today" : "Lock for grading"}
    </Button>
  );
}

function NewsOrigins({
  loading,
  failed,
  onRetry,
  origins,
  activeId,
  onPick,
  onWhatIf,
}: {
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  origins: RippleOrigin[];
  activeId: string | null;
  onPick: (id: string) => void;
  onWhatIf: () => void;
}) {
  if (loading)
    return (
      <div className="flex flex-col gap-2 px-5 py-4">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    );
  if (failed)
    return (
      <EmptyState
        title="News is unavailable"
        hint="The news provider did not respond."
        onRetry={onRetry}
      />
    );
  if (!origins.length)
    return (
      <div className="flex flex-col items-start gap-3 px-5 py-6">
        <p className="text-[13px] text-muted-foreground">
          None of today's headlines has a clear direction for a mapped factor or company.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={onWhatIf} className="h-8">
          Try a what-if scenario
        </Button>
      </div>
    );
  return (
    <ul className="divide-y divide-border">
      {origins.slice(0, 6).map((origin) => {
        const on = origin.id === activeId;
        return (
          <li key={origin.id}>
            <button
              type="button"
              onClick={() => onPick(origin.id)}
              aria-pressed={on}
              className={cn(
                "flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-panel-elevated",
                on && "bg-panel-elevated",
              )}
            >
              <DirectionIcon direction={origin.direction} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] leading-snug text-foreground">
                  {origin.title}
                </span>
                <span className="mt-0.5 block text-[11px] text-subtle">
                  {rippleName(origin.origin)} · {origin.source}
                  {origin.published_at ? ` · ${relativeTime(origin.published_at)}` : ""}
                </span>
              </span>
              {on && <Pill tone="primary">Showing</Pill>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function DirectionIcon({ direction }: { direction: "UP" | "DOWN" }) {
  return direction === "UP" ? (
    <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-positive" aria-label="Rising" />
  ) : (
    <ArrowDownRight className="mt-0.5 h-4 w-4 shrink-0 text-negative" aria-label="Falling" />
  );
}

function ImpactDetail({ origin, impact }: { origin: RippleOrigin; impact: RippleImpact }) {
  const chain = explainChain(impact, origin, rippleName);
  // The echo compares the nearest listed stock upstream with the target.
  const upstream = [...impact.path.slice(0, -1)].reverse().find((id) => !isFactor(id)) ?? null;
  const upstreamIndex = upstream ? impact.path.indexOf(upstream) : -1;
  const sign = impact.edges
    .slice(upstreamIndex)
    .reduce((s, edge) => (s * edge.sign) as 1 | -1, 1 as 1 | -1);
  const histories = useHistories(upstream ? [upstream, impact.symbol] : [], "1Y");
  const echo =
    upstream && histories.bars[upstream] && histories.bars[impact.symbol]
      ? historicalEcho(
          histories.bars[upstream]!,
          histories.bars[impact.symbol]!,
          sign,
          RIPPLE_HORIZON,
        )
      : null;

  return (
    <Card>
      <CardHead
        title={`${impact.symbol} · ${rippleName(impact.symbol)}`}
        meta={`Order ${impact.hop} · link strength ${Math.round(impact.strength * 100)} / 100`}
        action={
          <Pill tone={impact.direction === "UP" ? "positive" : "negative"}>
            {impact.direction === "UP" ? "May rise" : "May fall"}
          </Pill>
        }
      />
      <div className="flex flex-col gap-4 px-5 py-4">
        <ol className="flex flex-col gap-2.5">
          {chain.map((step, i) => (
            <li key={step} className="flex gap-3 text-[13px] leading-snug">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-border-strong text-[10px] text-subtle">
                {i + 1}
              </span>
              <span className="min-w-0">
                {i > 0 && (
                  <span className="mr-1.5 text-[11px] font-medium text-primary-soft">
                    {EDGE_LABELS[impact.edges[i - 1]!.type]}
                  </span>
                )}
                <span className="text-muted-foreground">{step}</span>
              </span>
            </li>
          ))}
        </ol>

        <div className="rounded-md border border-border bg-background/40 px-3.5 py-3 text-[12px] leading-relaxed">
          <p className="font-medium text-foreground">Historical echo</p>
          {!upstream ? (
            <p className="mt-1 text-muted-foreground">
              This chain starts from an economic factor with no connected price series, so there is
              no measured history — only the stated linkage.
            </p>
          ) : histories.loading ? (
            <p className="mt-1 text-muted-foreground">Reading one year of prices…</p>
          ) : histories.failed.length ? (
            <p className="mt-1 text-muted-foreground">
              Price history is unavailable right now, so the echo cannot be measured.
            </p>
          ) : !echo || echo.agreement == null ? (
            <p className="mt-1 text-muted-foreground">
              Too few large {upstream} moves in the last year to measure ({echo?.n ?? 0} found).
            </p>
          ) : (
            <p className="mt-1 text-muted-foreground">
              On the {echo.n} days {upstream} made a large move in the past year, {impact.symbol}{" "}
              moved the expected way within {echo.window_days} sessions{" "}
              <span className="font-medium text-foreground">{pct(echo.agreement, 0)}</span> of the
              time (median {pct(echo.median_move)}). A coin flip would be about 50%.
            </p>
          )}
        </div>

        <AiExplain
          context={{ symbol: impact.symbol }}
          facts={[
            `Event: ${origin.title}`,
            `Company: ${impact.symbol} (${rippleName(impact.symbol)})`,
            `Possible effect: it ${impact.direction === "UP" ? "may rise" : "may fall"} (order ${impact.hop}).`,
            `Chain: ${chain.join(" → ")}`,
          ].join("\n")}
        />

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button asChild size="sm" className="h-8 gap-1.5">
            <Link to="/app/stocks/$symbol" params={{ symbol: impact.symbol }}>
              Practise with paper money
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
          {origin.url && (
            <Button asChild size="sm" variant="ghost" className="h-8 gap-1.5">
              <a href={origin.url} target="_blank" rel="noreferrer">
                Read the source
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function ImpactList({
  impacts,
  active,
  onSelect,
}: {
  impacts: RippleImpact[];
  active: string | null;
  onSelect: (symbol: string) => void;
}) {
  const [all, setAll] = useState(false);
  const rows = all ? impacts : impacts.slice(0, 8);
  if (!impacts.length) return null;
  return (
    <Card>
      <CardHead title="Who is affected" meta="Strongest links first" />
      <ul className="divide-y divide-border">
        {rows.map((impact) => (
          <li key={impact.symbol}>
            <button
              type="button"
              onClick={() => onSelect(impact.symbol)}
              aria-pressed={impact.symbol === active}
              className={cn(
                "grid w-full grid-cols-[auto_minmax(0,1fr)_5rem] items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-panel-elevated",
                impact.symbol === active && "bg-panel-elevated",
              )}
            >
              <DirectionIcon direction={impact.direction} />
              <span className="min-w-0">
                <span className="block truncate text-[13px] text-foreground">{impact.symbol}</span>
                <span className="block truncate text-[11px] text-subtle">
                  Order {impact.hop} · {EDGE_LABELS[impact.edges.at(-1)!.type]}
                </span>
              </span>
              <ProgressBar
                value={impact.strength * 100}
                tone={impact.direction === "UP" ? "positive" : "negative"}
              />
            </button>
          </li>
        ))}
      </ul>
      {impacts.length > 8 && (
        <button
          type="button"
          onClick={() => setAll(!all)}
          className="w-full border-t border-border px-5 py-2.5 text-[12px] font-medium text-muted-foreground hover:text-foreground"
        >
          {all ? "Show fewer" : `Show all ${impacts.length}`}
        </button>
      )}
    </Card>
  );
}

function RippleRecord({ ledger }: { ledger: ReturnType<typeof useRippleLedger> }) {
  const { stats, matured, pending, unpriced } = ledger.result;
  const calls = ledger.locked.reduce((t, entry) => t + (entry.calls?.length ?? 0), 0);
  return (
    <Card>
      <CardHead
        title="Ripple Engine track record"
        meta={`Locked calls graded ${RIPPLE_HORIZON} sessions later against observed closes`}
      />
      {!ledger.locked.length ? (
        <EmptyState
          title="Nothing locked yet"
          hint="Lock a ripple to save its strongest calls. They are graded automatically once prices are in, so the engine's record is always visible — including its misses."
        />
      ) : (
        <div className="flex flex-col gap-4 px-5 py-4">
          <MetricStrip
            items={[
              { label: "Locked calls", value: calls, note: `${ledger.locked.length} event(s)` },
              {
                label: "Graded",
                value: stats.scored,
                note: `${pending + unpriced} waiting for prices`,
              },
              {
                label: "Right direction",
                value: pct(stats.accuracy, 0),
                ...(stats.beats_baseline ? { tone: "positive" as const } : {}),
              },
              {
                label: "Always-up baseline",
                value: pct(stats.baseline_accuracy, 0),
                note:
                  stats.beats_baseline == null
                    ? "Needs graded calls"
                    : stats.beats_baseline
                      ? "Engine is ahead"
                      : "Engine is not ahead yet",
              },
            ]}
          />
          {matured.length < 30 && (
            <p className="text-[12px] text-subtle">
              Fewer than 30 graded calls: treat any percentage here as an early reading, not a
              measured skill.
            </p>
          )}
          <ul className="divide-y divide-border rounded-md border border-border">
            {ledger.locked.slice(0, 5).map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-3.5 py-2.5 text-[12px]">
                <DirectionIcon direction={entry.origin?.direction ?? "UP"} />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {entry.origin?.title}
                </span>
                <span className="shrink-0 text-subtle">{relativeTime(entry.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Method() {
  return (
    <details className="rounded-lg border border-border bg-panel/60 px-5 py-4 text-[13px] text-muted-foreground">
      <summary className="cursor-pointer font-medium text-foreground">
        How the Ripple map works
      </summary>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-relaxed">
        <li>
          The map links NIFTY 50 companies to each other and to {FACTORS.length} economic factors
          through stated relationships: input costs, revenue drivers, currency exposure, funding
          costs, suppliers, groups and peers. It is curated by hand and not yet extracted from
          filings.
        </li>
        <li>
          Each extra step loses strength, so a third-order link never outranks a direct one. A
          company reached by two routes shows the stronger route.
        </li>
        <li>
          Headlines become events only when they name a mapped factor or company and have a clear
          direction. Ambiguous headlines are skipped rather than guessed.
        </li>
        <li>
          The historical echo uses one year of observed daily closes. Economic factors have no
          connected price series here, so their links carry no measured history.
        </li>
        <li>
          A ripple is a possible effect to study and practise with paper money — not a prediction or
          investment advice.
        </li>
      </ul>
    </details>
  );
}
