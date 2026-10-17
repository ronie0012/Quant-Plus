import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Card, CardHead, EmptyState, Pill, Skeleton } from "@/components/app/cards";
import { MetricStrip, PageIntro, Segmented } from "@/components/app/pages/workspace";
import { WhyButton } from "@/components/app/evidence/WhyButton";
import { formatINR, useMarkedHoldings } from "@/hooks/use-dashboard-data";
import { useMarketNews } from "@/hooks/use-intelligence";
import { useJournal } from "@/hooks/use-trading-product";
import {
  useAllOrders,
  exchangeDay,
  useCalendar,
  useHistories,
  useIndexBars,
} from "@/hooks/use-quant-data";
import {
  calendarEvents,
  EVENT_LABELS,
  expiryEvents,
  knowable,
  newsEvents,
  postEventMove,
  reactionDistribution,
  type RadarEvent,
} from "@/lib/quant/events";
import { quantile } from "@/lib/quant/stats";
import { cn } from "@/lib/utils";

const WINDOWS = ["UPCOMING", "PAST 30D", "ALL"] as const;
const pct = (v: number | null | undefined, d = 2) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);

/**
 * Event Radar: scheduled exchange events, the NSE corporate calendar and
 * classified news, each with its source, publication time, relevance, the
 * holdings it touches, its historical reaction and whether it was knowable at
 * the time of your trades.
 */
export function EventRadarPage() {
  const [window, setWindow] = useState<(typeof WINDOWS)[number]>("UPCOMING");
  const [holdingsOnly, setHoldingsOnly] = useState(false);
  const [kind, setKind] = useState<string>("ALL");
  const calendar = useCalendar();
  const news = useMarketNews();
  const { data: holdings } = useMarkedHoldings();
  const orders = useAllOrders();
  const journal = useJournal();
  const nifty = useIndexBars("NIFTY");
  const held = useMemo(() => new Set((holdings ?? []).map((h) => h.symbol)), [holdings]);
  const histories = useHistories([...held], "1Y");

  const events = useMemo(() => {
    const now = Date.now();
    const list: RadarEvent[] = [
      ...calendarEvents(
        calendar.data?.events ?? [],
        calendar.data?.fetched_at ?? new Date().toISOString(),
      ),
      ...newsEvents((news.data?.articles ?? []).map((a) => ({ ...a, symbol: a.symbol }))),
      ...expiryEvents(now - 31 * 86_400_000, 3, exchangeDay),
    ];
    // Next settlement for trades placed today: T+1 on the next exchange day.
    const next = new Date(now + 330 * 60_000);
    for (let i = 1; i <= 7; i++) {
      const d = new Date(next.getTime() + i * 86_400_000).toISOString().slice(0, 10);
      if (exchangeDay(d)) {
        list.push({
          id: `settlement:${d}`,
          kind: "SETTLEMENT",
          symbol: null,
          title: `T+1 settlement for trades executed today (${d})`,
          event_at: `${d}T09:00:00+05:30`,
          time_known: false,
          published_at: null,
          source: "Exchange rule (computed)",
          url: null,
          relevance: "LOW",
          sectors: [],
        });
        break;
      }
    }
    return list.sort((a, b) => a.event_at.localeCompare(b.event_at));
  }, [calendar.data, news.data]);

  // Historical reaction of NIFTY on past monthly expiry days (one year).
  const expiryReaction = useMemo(() => {
    const bars = nifty.data?.candles ?? [];
    if (!bars.length) return null;
    const past = expiryEvents(Date.now() - 365 * 86_400_000, 12, exchangeDay)
      .map((e) => Date.parse(e.event_at) / 1000)
      .filter((t) => t < Date.now() / 1000);
    return reactionDistribution(bars, past);
  }, [nifty.data]);

  const now = Date.now();
  const filtered = events.filter((e) => {
    const t = Date.parse(e.event_at);
    if (window === "UPCOMING" && t < now - 86_400_000) return false;
    if (window === "PAST 30D" && (t > now || t < now - 30 * 86_400_000)) return false;
    if (holdingsOnly && !(e.symbol && held.has(e.symbol))) return false;
    if (kind !== "ALL" && e.kind !== kind) return false;
    return true;
  });
  const affecting = events.filter(
    (e) => e.symbol && held.has(e.symbol) && Date.parse(e.event_at) >= now - 86_400_000,
  );
  const kinds = [...new Set(events.map((e) => e.kind))];
  const loading = calendar.isLoading && news.isLoading;

  function preRisk(e: RadarEvent) {
    if (!e.symbol || !held.has(e.symbol)) return null;
    const bars = histories.bars[e.symbol];
    const holding = holdings?.find((h) => h.symbol === e.symbol);
    if (!bars || bars.length < 30 || !holding) return null;
    const moves = bars.slice(1).map((b, i) => Math.abs(b.close / bars[i]!.close - 1));
    const p95 = quantile(moves, 0.95);
    return p95 == null ? null : { value: holding.quantity * holding.last_price * p95, p95 };
  }

  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Event intelligence"
        title="Event radar"
        body="Earnings, board meetings, dividends, splits and bonuses, regulatory news, shareholder transactions, macro releases, derivatives expiry and settlement dates. Every event keeps its original source and publication time, so you can see whether it was knowable when a decision was made."
        status={
          calendar.data?.providers.map((p) => `${p.source}: ${p.status}`).join(" · ") ||
          "Loading sources"
        }
      >
        <MetricStrip
          items={[
            { label: "Events tracked", value: events.length },
            {
              label: "Touching your holdings",
              value: affecting.length,
              tone: affecting.length ? "warning" : "positive",
            },
            {
              label: "Next 7 days",
              value: events.filter(
                (e) =>
                  Date.parse(e.event_at) >= now && Date.parse(e.event_at) <= now + 7 * 86_400_000,
              ).length,
            },
            {
              label: "NIFTY on expiry days",
              value: expiryReaction?.n
                ? `${pct(expiryReaction.p5, 1)} to ${pct(expiryReaction.p95, 1)}`
                : "—",
              note: expiryReaction?.n
                ? `5–95% range over ${expiryReaction.n} past expiries`
                : "Insufficient history",
            },
          ]}
        />
      </PageIntro>
      <Card>
        <div className="flex flex-wrap items-center gap-3 p-4">
          <Segmented items={WINDOWS} value={window} onChange={setWindow} label="Time window" />
          <select
            aria-label="Event type"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="h-8 border border-border bg-background px-2 text-xs"
          >
            <option value="ALL">All types</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {EVENT_LABELS[k]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={holdingsOnly}
              onChange={(e) => setHoldingsOnly(e.target.checked)}
            />
            My holdings only
          </label>
        </div>
      </Card>
      {loading ? (
        <Skeleton className="h-64" />
      ) : !filtered.length ? (
        <Card>
          <EmptyState
            title="No events in this view"
            hint="Change the window or filters. Sources that failed are listed at the top of the page."
          />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {filtered.map((event) => {
              const risk = preRisk(event);
              const bars = event.symbol ? histories.bars[event.symbol] : null;
              const past = Date.parse(event.event_at) < now;
              const after =
                past && bars
                  ? postEventMove(bars, event.event_at)
                  : past && event.kind === "EXPIRY" && nifty.data
                    ? postEventMove(nifty.data.candles, event.event_at)
                    : null;
              const trades = (orders.data ?? []).filter(
                (o) => o.symbol === event.symbol && o.filled_quantity > 0,
              );
              const plans = (journal.data ?? []).filter((p) => p.symbol === event.symbol);
              return (
                <li key={event.id} className="grid gap-2 px-5 py-4 lg:grid-cols-[1fr_320px]">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-[13px]">
                      <Pill
                        tone={
                          event.relevance === "HIGH"
                            ? "warning"
                            : event.relevance === "MEDIUM"
                              ? "primary"
                              : "neutral"
                        }
                      >
                        {EVENT_LABELS[event.kind]}
                      </Pill>
                      {event.symbol && <span className="font-mono text-xs">{event.symbol}</span>}
                      {event.symbol && held.has(event.symbol) && <Pill tone="warning">Held</Pill>}
                      <span className="min-w-0">{event.title}</span>
                      <WhyButton
                        claim={{
                          id: `event:${event.id}`,
                          label: EVENT_LABELS[event.kind],
                          value: new Date(event.event_at).toLocaleDateString("en-IN"),
                          statement: event.title,
                          source: { name: event.source, url: event.url },
                          published_at: event.published_at,
                          available_at:
                            event.kind === "EXPIRY" || event.kind === "SETTLEMENT"
                              ? null
                              : (event.published_at ?? calendar.data?.fetched_at ?? null),
                          ...(plans[0]
                            ? {
                                decision: {
                                  label: `${plans[0].symbol} decision plan`,
                                  at: plans[0].created_at,
                                },
                              }
                            : {}),
                          page: "events",
                        }}
                      />
                    </p>
                    <p className="mt-1 text-[11px] text-subtle">
                      {new Date(event.event_at).toLocaleString("en-IN", {
                        timeZone: "Asia/Kolkata",
                        dateStyle: "medium",
                        ...(event.time_known ? { timeStyle: "short" } : {}),
                      })}
                      {event.time_known ? "" : " (time not announced)"} · {event.source}
                      {event.published_at
                        ? ` · published ${new Date(event.published_at).toLocaleString("en-IN")}`
                        : " · no publication time from source"}
                      {event.url && (
                        <a
                          href={event.url}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-1 inline-flex items-center gap-0.5 text-primary-soft"
                        >
                          source <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </p>
                    {event.sectors.length > 0 && (
                      <p className="mt-1 text-[11px] text-subtle">
                        Sectors: {event.sectors.join(", ")}
                      </p>
                    )}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
                    <dt className="text-subtle">Pre-event risk</dt>
                    <dd className="text-right font-mono">
                      {risk
                        ? `${formatINR(risk.value)} (p95 ${pct(risk.p95, 1)})`
                        : event.symbol && held.has(event.symbol)
                          ? "History loading"
                          : "Not held"}
                    </dd>
                    <dt className="text-subtle">Historical reaction</dt>
                    <dd className="text-right font-mono">
                      {event.kind === "EXPIRY" && expiryReaction?.n
                        ? `NIFTY median ${pct(expiryReaction.median)}`
                        : "Too few past instances"}
                    </dd>
                    <dt className="text-subtle">Post-event</dt>
                    <dd
                      className={cn(
                        "text-right font-mono",
                        after == null
                          ? "text-subtle"
                          : after >= 0
                            ? "text-positive"
                            : "text-negative",
                      )}
                    >
                      {after == null
                        ? past
                          ? "No price series"
                          : "Not yet"
                        : `${after.toFixed(2)}% since`}
                    </dd>
                    {trades.length > 0 && (
                      <>
                        <dt className="text-subtle">Known at your trades</dt>
                        <dd className="text-right">
                          {trades.slice(-3).map((t) => {
                            const k = knowable(event, t.created_at);
                            return (
                              <span key={t.id} className="block font-mono text-[10px]">
                                {new Date(t.created_at).toLocaleDateString("en-IN")}:{" "}
                                {k === "KNOWN"
                                  ? "known"
                                  : k === "NOT_YET_PUBLISHED"
                                    ? "not yet published"
                                    : "unknown"}
                              </span>
                            );
                          })}
                        </dd>
                      </>
                    )}
                  </dl>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <p className="text-[11px] text-subtle">
        News events are classified from headlines by keyword and may be mislabelled. Earnings
        reaction distributions need dated past announcements, which the connected calendar does not
        provide; they are shown only for computed exchange events.
      </p>
    </div>
  );
}
