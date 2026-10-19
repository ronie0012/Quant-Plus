import { useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, ExternalLink, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHead, EmptyState, Pill, Skeleton } from "@/components/app/cards";
import { MetricStrip, PageIntro, Segmented } from "@/components/app/pages/workspace";
import { RippleGraph } from "@/components/app/ripple/RippleGraph";
import { RippleResearchActions } from "@/components/app/ripple/RippleResearchActions";
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

const SOURCES = ["Recent news", "What-if"] as const;
const DIRECTIONS = ["Rises", "Falls"] as const;
const GRAPH_LIMIT = 24;
const WRAP_HEAD =
  "flex-col items-start sm:flex-row sm:items-center [&_h2]:whitespace-normal [&_p]:whitespace-normal";
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
  const [source, setSource] = useState<(typeof SOURCES)[number]>("Recent news");
  const [newsId, setNewsId] = useState<string | null>(null);
  const [whatIf, setWhatIf] = useState<string>("CRUDE");
  const [whatIfDirection, setWhatIfDirection] = useState<(typeof DIRECTIONS)[number]>("Rises");
  const [selected, setSelected] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
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
  const selectCompany = (symbol: string) => {
    setSelected(symbol);
    // On a single column, take the user straight to the explanation they requested.
    if (window.matchMedia("(max-width: 1279px)").matches) {
      requestAnimationFrame(() => {
        detailRef.current?.focus({ preventScroll: true });
        detailRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
      });
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageIntro
        eyebrow="Discover"
        title="Ripple map"
        body="Follow an event through connected NIFTY 50 companies. Understand the possible impact, then research a company before making a decision."
        status="Curated relationships · research only"
      >
        <ol
          aria-label="Ripple research flow"
          className="flex flex-wrap gap-x-6 gap-y-2 text-[12px] text-muted-foreground"
        >
          <li>1. Choose an event</li>
          <li>2. Explore affected companies</li>
          <li>3. Understand & research</li>
        </ol>
      </PageIntro>

      <Card>
        <CardHead
          title="Choose an event"
          className={WRAP_HEAD}
          meta={
            source === "Recent news"
              ? `Last 24 hours · ${news.origins.length} event(s) · ${news.availability}${news.updated_at ? ` · provider updated ${relativeTime(news.updated_at)}` : ""}`
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
        {source === "Recent news" ? (
          <NewsOrigins
            loading={news.loading}
            availability={news.availability}
            onRetry={() => void news.refetch()}
            origins={news.origins}
            activeId={origin?.id ?? null}
            onPick={(id) => pick(() => setNewsId(id))}
            onWhatIf={() => pick(() => setSource("What-if"))}
          />
        ) : (
          <div className="px-5 py-4">
            <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
              Hypothetical scenario — choose an assumption to explore. This is not a detected news
              event.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-[12px] text-subtle">
                <label htmlFor="ripple-scenario-factor">What changes</label>
                <select
                  id="ripple-scenario-factor"
                  value={whatIf}
                  onChange={(event) => pick(() => setWhatIf(event.target.value))}
                  className="h-11 max-w-full rounded-md border border-border-strong bg-background px-2.5 text-[14px] text-foreground"
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
              </div>
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
          </div>
        )}
      </Card>

      {origin && (
        <>
          <section
            aria-label="Selected event interpretation"
            className="dash-rise flex flex-col gap-4 rounded-lg border border-border bg-panel/80 px-5 py-4 md:flex-row md:items-center md:justify-between"
          >
            <div className="min-w-0">
              <p className="label-tech text-subtle">
                {source === "What-if"
                  ? "Scenario assumption"
                  : "Mapped interpretation of the headline"}
              </p>
              <p className="mt-1 text-[18px] leading-tight font-semibold tracking-tight text-primary-soft">
                {originStatement(origin)}
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                {impacts.length} connected companies · possible effects from curated links, not
                confirmed price moves.
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

          <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)]">
            <div className="flex min-w-0 flex-col gap-4" id="affected-companies">
              <ImpactList
                key={origin.id}
                impacts={impacts}
                active={active?.symbol ?? null}
                onSelect={selectCompany}
              />
              <details className="group min-w-0 rounded-lg border border-border bg-panel/60">
                <summary className="cursor-pointer px-5 py-4 text-[13px] font-medium text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                  Explore the visual impact map
                  <span className="mt-1 block text-[12px] font-normal text-subtle">
                    Optional · the company list includes every mapped result
                  </span>
                </summary>
                <div className="border-t border-border px-3 py-4 sm:px-5">
                  <h2 className="text-[14px] font-semibold">How the ripple spreads</h2>
                  <p className="mt-1 mb-3 text-[12px] text-subtle">
                    {impacts.length > GRAPH_LIMIT
                      ? `Strongest ${GRAPH_LIMIT} of ${impacts.length} links shown`
                      : "Select a company to trace its chain"}
                  </p>
                  {impacts.length ? (
                    <RippleGraph
                      origin={origin.origin}
                      originLabel={rippleName(origin.origin)}
                      impacts={shown}
                      selected={active?.symbol ?? null}
                      onSelect={selectCompany}
                    />
                  ) : (
                    <EmptyState
                      title="No mapped connections"
                      hint="This company has no curated links in the map yet."
                    />
                  )}
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-[12px] text-subtle">
                    <Legend className="bg-positive" label="May rise" />
                    <Legend className="bg-negative" label="May fall" />
                    <Legend
                      className="border border-border-strong bg-panel"
                      label="Passes through"
                    />
                    <span>Rings from the centre: 1st, 2nd, 3rd order</span>
                  </div>
                </div>
              </details>
            </div>
            <div
              ref={detailRef}
              tabIndex={-1}
              aria-label="Selected company explanation"
              className="min-w-0 scroll-mt-24 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              {active && (
                <ImpactDetail
                  key={`${origin.id}:${active.symbol}`}
                  origin={origin}
                  impact={active}
                />
              )}
            </div>
          </div>
        </>
      )}

      <details className="rounded-lg border border-border bg-panel/60">
        <summary className="cursor-pointer px-5 py-4 text-[13px] font-medium text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          Validation & saved ripples
          <span className="mt-1 block text-[12px] font-normal text-subtle">
            Optional · lock a snapshot for grading and review the engine’s track record
          </span>
        </summary>
        <div className="space-y-4 border-t border-border p-4 sm:p-5">
          {origin && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-lg text-[13px] leading-relaxed text-muted-foreground">
                Save the current event’s strongest calls for comparison with observed closes after{" "}
                {RIPPLE_HORIZON} sessions. This records research only.
              </p>
              <LockButton
                disabled={!impacts.length || ledger.isLocked(origin) || ledger.locking}
                locked={ledger.isLocked(origin)}
                locking={ledger.locking}
                onLock={() => void ledger.lock(origin, impacts).catch(() => undefined)}
              />
            </div>
          )}
          {ledger.lockError && (
            <p role="alert" className="text-[12px] text-warning">
              Could not lock this ripple. Try again.
            </p>
          )}
          <RippleRecord ledger={ledger} />
        </div>
      </details>
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
  locking,
  onLock,
}: {
  disabled: boolean;
  locked: boolean;
  locking: boolean;
  onLock: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={disabled}
      onClick={onLock}
      className="min-h-11 gap-1.5"
      title="Save the strongest calls now so they can be graded against real prices later"
    >
      {locking ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {locking ? "Saving snapshot…" : locked ? "Locked today" : "Lock for grading"}
    </Button>
  );
}

function NewsOrigins({
  loading,
  availability,
  onRetry,
  origins,
  activeId,
  onPick,
  onWhatIf,
}: {
  loading: boolean;
  availability: ReturnType<typeof useRippleOrigins>["availability"];
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
  if (availability === "unavailable" || availability === "stale")
    return (
      <EmptyState
        title={availability === "stale" ? "News snapshot is stale" : "News is unavailable"}
        hint={
          availability === "stale"
            ? "The provider snapshot is older than 20 minutes or has no usable timestamp. Refresh to detect current events."
            : "The news request failed or the provider reported unavailable. Refresh to retry."
        }
        onRetry={onRetry}
      />
    );
  if (!origins.length)
    return (
      <div className="flex flex-col items-start gap-3 px-5 py-6">
        <p className="text-[13px] text-muted-foreground">
          No dated headline from the last 24 hours has a clear direction for a mapped factor or
          company.
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const chain = explainChain(impact, origin, rippleName);
  // The echo compares the nearest listed stock upstream with the target.
  const upstream = [...impact.path.slice(0, -1)].reverse().find((id) => !isFactor(id)) ?? null;
  const upstreamIndex = upstream ? impact.path.indexOf(upstream) : -1;
  const sign = impact.edges
    .slice(upstreamIndex)
    .reduce((s, edge) => (s * edge.sign) as 1 | -1, 1 as 1 | -1);
  const histories = useHistories(historyOpen && upstream ? [upstream, impact.symbol] : [], "1Y");
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
        className={WRAP_HEAD}
        meta={`Order ${impact.hop} · curated link weight ${Math.round(impact.strength * 100)} / 100`}
        action={
          <Pill tone={impact.direction === "UP" ? "positive" : "negative"}>
            {impact.direction === "UP" ? "May rise" : "May fall"}
          </Pill>
        }
      />
      <div className="flex flex-col gap-4 px-5 py-4">
        <p role="status" className="sr-only">
          Selected {impact.symbol}, {impact.direction === "UP" ? "may rise" : "may fall"}.
          Explanation and research actions follow.
        </p>
        <div>
          <h3 className="text-[14px] font-semibold">Why this company could be affected</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-subtle">
            {origin.kind === "WHAT_IF"
              ? "Starting from your scenario assumption"
              : "Starting from the mapped headline"}{" "}
            · each step is a stated relationship, not proof of causation.
          </p>
        </div>
        <ol aria-label="Impact reasoning chain" className="flex flex-col gap-2.5">
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

        <RippleResearchActions symbol={impact.symbol} />

        {origin.url && (
          <a
            href={origin.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-2 self-start text-[13px] text-primary-soft underline-offset-4 hover:underline"
          >
            Read the source · {origin.source}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}

        <details
          className="rounded-md border border-border bg-background/40 text-[13px] leading-relaxed"
          onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
        >
          <summary className="cursor-pointer px-3.5 py-3 font-medium text-foreground">
            Historical echo · optional validation
          </summary>
          <div className="border-t border-border px-3.5 py-3">
            {!upstream ? (
              <p className="mt-1 text-muted-foreground">
                This chain starts from an economic factor with no connected price series, so there
                is no measured history — only the stated linkage.
              </p>
            ) : histories.loading ? (
              <p className="mt-1 text-muted-foreground">Reading one year of prices…</p>
            ) : histories.failed.length ? (
              <p className="mt-1 text-muted-foreground">
                Price history is unavailable right now, so the echo cannot be measured.
              </p>
            ) : !echo ||
              echo.status === "INSUFFICIENT_HISTORY" ||
              echo.status === "INVALID_INPUT" ? (
              <p className="mt-1 text-muted-foreground">
                Usable, time-ordered price history is insufficient for this pair. The echo is
                unavailable.
              </p>
            ) : echo.agreement == null ? (
              <p className="mt-1 text-muted-foreground">
                Too few aligned, non-overlapping large-move windows for {upstream} to measure (
                {echo.n} found).
              </p>
            ) : (
              <p className="mt-1 text-muted-foreground">
                Across {echo.n} non-overlapping large-move windows for {upstream}, {impact.symbol}{" "}
                moved the expected way from the prior close to the end of {echo.window_days}{" "}
                sessions{" "}
                <span className="font-medium text-foreground">{pct(echo.agreement, 0)}</span> of the
                time (direction-adjusted median return {pct(echo.median_move)}). This is descriptive
                history, not a probability for this event.
              </p>
            )}
            {upstream && !histories.loading && !histories.failed.length && (
              <p className="mt-2 text-[11px] text-subtle">
                {echo && echo.n < 30 ? "Small sample; fewer than 30 aligned windows. " : ""}
                {[upstream, impact.symbol]
                  .map((symbol) => {
                    const history = histories.sources[symbol];
                    return history
                      ? `${symbol}: ${history.source} · as of ${history.as_of}${history.delayed ? " · delayed" : ""}`
                      : `${symbol}: source timestamp unavailable`;
                  })
                  .join("; ")}
              </p>
            )}
          </div>
        </details>

        <details className="border-t border-border pt-1">
          <summary className="cursor-pointer py-3 text-[13px] font-medium text-muted-foreground">
            Need a simpler explanation?
          </summary>
          <div className="pb-3">
            <AiExplain
              context={{ symbol: impact.symbol }}
              facts={[
                `Event: ${origin.title}`,
                `Company: ${impact.symbol} (${rippleName(impact.symbol)})`,
                `Possible effect: it ${impact.direction === "UP" ? "may rise" : "may fall"} (order ${impact.hop}).`,
                `Chain: ${chain.join(" → ")}`,
              ].join("\n")}
            />
          </div>
        </details>
        <a
          href="#affected-companies"
          className="inline-flex min-h-11 items-center self-start text-[12px] text-primary-soft hover:underline xl:hidden"
        >
          Back to affected companies
        </a>
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
  // Keep a selected result visible when the rest of the list is collapsed.
  const selectedOutsidePreview = impacts.findIndex((impact) => impact.symbol === active) >= 8;
  const rows = all
    ? impacts
    : impacts.filter((impact, index) => index < 8 || impact.symbol === active);
  return (
    <Card glow>
      <CardHead
        title="Affected companies"
        meta={`${impacts.length} mapped results · strongest curated links first`}
        className={WRAP_HEAD}
      />
      <p className="px-5 py-3 text-[12px] leading-relaxed text-muted-foreground">
        Select a company to understand its chain. Link weight is not the probability of a price
        move.
      </p>
      {!impacts.length && (
        <EmptyState
          title="No mapped connections"
          hint="This company has no curated links in the map yet. Choose another event or scenario."
        />
      )}
      <ul aria-label="Affected companies" className="divide-y divide-border">
        {rows.map((impact) => (
          <li key={impact.symbol}>
            <button
              type="button"
              onClick={() => onSelect(impact.symbol)}
              aria-label={`Explain ${impact.symbol}, ${impact.direction === "UP" ? "may rise" : "may fall"}, order ${impact.hop}`}
              aria-pressed={impact.symbol === active}
              className={cn(
                "grid min-h-16 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-panel-elevated focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
                impact.symbol === active && "bg-panel-elevated",
              )}
            >
              <DirectionIcon direction={impact.direction} />
              <span className="min-w-0">
                <span className="block break-words text-[13px] font-medium text-foreground">
                  {impact.symbol}
                </span>
                <span className="block text-[12px] text-subtle">{rippleName(impact.symbol)}</span>
                <span className="mt-1 block text-[12px] text-muted-foreground">
                  Order {impact.hop} · {EDGE_LABELS[impact.edges.at(-1)!.type]}
                </span>
              </span>
              <span className="text-right text-[12px]">
                <span
                  className={cn(
                    "block font-medium",
                    impact.direction === "UP" ? "text-positive" : "text-negative",
                  )}
                >
                  {impact.direction === "UP" ? "May rise" : "May fall"}
                </span>
                <span className="mt-1 block text-subtle">
                  Weight {Math.round(impact.strength * 100)}
                </span>
                {impact.symbol === active && (
                  <span className="mt-1 block text-primary-soft">Selected</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {impacts.length > 8 && (
        <div className="border-t border-border">
          {!all && selectedOutsidePreview && (
            <p className="px-5 pt-3 text-[12px] text-subtle">
              Showing the strongest eight links and your selected company.
            </p>
          )}
          <button
            type="button"
            onClick={() => setAll(!all)}
            aria-expanded={all}
            className="min-h-11 w-full px-5 py-3 text-[12px] font-medium text-muted-foreground hover:text-foreground"
          >
            {all ? "Show fewer companies" : `Show all ${impacts.length} companies`}
          </button>
        </div>
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
        className={WRAP_HEAD}
        meta={`Locked calls graded ${RIPPLE_HORIZON} sessions later against observed closes`}
      />
      {ledger.loading ? (
        <p role="status" className="px-5 py-4 text-[13px] text-muted-foreground">
          Reading saved ripples and observed prices…
        </p>
      ) : !ledger.locked.length ? (
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
              <li key={entry.id} className="flex items-start gap-3 px-3.5 py-3 text-[12px]">
                <DirectionIcon direction={entry.origin?.direction ?? "UP"} />
                <span className="min-w-0 flex-1 text-muted-foreground">
                  <span className="block">{entry.origin?.title}</span>
                  <span className="mt-1 block text-subtle">
                    {entry.origin?.kind === "WHAT_IF" ? "Scenario" : "News event"} · saved{" "}
                    {relativeTime(entry.created_at)}
                  </span>
                </span>
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
          Each extra step reduces that path's curated strength. A company reached by two routes
          shows the stronger route. Link strength is a map weight, not a live score or calibrated
          probability.
        </li>
        <li>
          Headlines become events only when they name a mapped factor or company and have a clear
          direction. Only dated headlines from the last 24 hours in a current provider snapshot are
          used. Ambiguous, negated and prospective moves are skipped rather than guessed.
        </li>
        <li>
          The historical echo uses one year of observed daily closes. Economic factors have no
          connected price series here, so their links carry no measured history. Stock echoes use
          matching sessions and non-overlapping response windows; fewer than three leave metrics
          unavailable.
        </li>
        <li>
          A ripple is a possible effect to study and practise with paper money — not a prediction or
          investment advice.
        </li>
      </ul>
    </details>
  );
}
