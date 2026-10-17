/**
 * Event intelligence. Events come from the NSE corporate calendar, classified
 * provider news and deterministic exchange schedules (settlement, monthly
 * expiry). Each event keeps its original source and publication time so the
 * radar can say whether it was knowable when a decision was made.
 */
import { distribution, round, type Distribution } from "./stats.ts";

export type EventKind =
  | "EARNINGS"
  | "BOARD_MEETING"
  | "DIVIDEND"
  | "SPLIT_BONUS"
  | "REGULATORY"
  | "SHAREHOLDER"
  | "SECTOR"
  | "MACRO"
  | "EXPIRY"
  | "SETTLEMENT"
  | "CORPORATE_ACTION";

export const EVENT_LABELS: Record<EventKind, string> = {
  EARNINGS: "Earnings",
  BOARD_MEETING: "Board meeting",
  DIVIDEND: "Dividend",
  SPLIT_BONUS: "Split / bonus",
  REGULATORY: "Regulatory",
  SHAREHOLDER: "Shareholder transaction",
  SECTOR: "Sector event",
  MACRO: "Macro release",
  EXPIRY: "Derivatives expiry",
  SETTLEMENT: "Settlement",
  CORPORATE_ACTION: "Corporate-action deadline",
};

export type RadarEvent = {
  id: string;
  kind: EventKind;
  symbol: string | null;
  title: string;
  /** When the event happens (or happened). */
  event_at: string;
  /** Whether the time of day is known, or only the date. */
  time_known: boolean;
  /** When the source published it; null when the source does not say. */
  published_at: string | null;
  source: string;
  url: string | null;
  relevance: "HIGH" | "MEDIUM" | "LOW";
  sectors: string[];
};

/** Classify a headline or calendar purpose into an event kind. */
export function classifyEvent(text: string): EventKind | null {
  const t = text.toLowerCase();
  if (/\b(split|sub-division|subdivision|bonus)\b/.test(t)) return "SPLIT_BONUS";
  if (/\bdividend\b/.test(t)) return "DIVIDEND";
  if (
    /\b(financial results|quarterly results|results|earnings|q[1-4] ?fy|profit|revenue)\b/.test(t)
  )
    return "EARNINGS";
  if (/\bboard meeting\b/.test(t)) return "BOARD_MEETING";
  if (
    /\b(sebi|rbi|regulator|regulatory|penalty|probe|show[- ]cause|licen[cs]e|ban|tribunal|nclt)\b/.test(
      t,
    )
  )
    return "REGULATORY";
  if (
    /\b(stake|block deal|bulk deal|promoter|pledge|acquire[sd]? .*shares|offer for sale|ofs|buyback)\b/.test(
      t,
    )
  )
    return "SHAREHOLDER";
  if (/\b(record date|ex-date|rights issue|book closure)\b/.test(t)) return "CORPORATE_ACTION";
  if (/\b(cpi|inflation|gdp|repo rate|monetary policy|iip|pmi|fiscal|budget)\b/.test(t))
    return "MACRO";
  return null;
}

const relevanceOf = (kind: EventKind): RadarEvent["relevance"] =>
  kind === "EARNINGS" || kind === "SPLIT_BONUS" || kind === "REGULATORY" || kind === "MACRO"
    ? "HIGH"
    : kind === "DIVIDEND" || kind === "SHAREHOLDER" || kind === "BOARD_MEETING" || kind === "EXPIRY"
      ? "MEDIUM"
      : "LOW";

export function calendarEvents(
  rows: {
    id: string;
    event: string;
    event_time: string;
    time_known?: boolean;
    source?: string;
    url?: string;
    symbol?: string;
  }[],
  fetchedAt: string,
): RadarEvent[] {
  return rows.map((row) => {
    const kind =
      classifyEvent(row.event) ??
      (row.id.startsWith("Corporate action") ? "CORPORATE_ACTION" : "BOARD_MEETING");
    return {
      id: `cal:${row.id}`,
      kind,
      symbol: row.symbol ?? (row.event.split(":")[0]?.trim() || null),
      title: row.event,
      event_at: row.event_time,
      time_known: row.time_known ?? false,
      // The NSE calendar does not carry an announcement time; the fetch time is
      // the latest moment at which the workspace is known to have had it.
      published_at: null,
      source: row.source ?? "NSE",
      url: row.url ?? null,
      relevance: relevanceOf(kind),
      sectors: [],
    };
  });
}

export function newsEvents(
  articles: {
    id: string;
    title: string;
    symbol?: string;
    published_at: string;
    source: string;
    url?: string;
    affected_sectors?: string[];
  }[],
): RadarEvent[] {
  const out: RadarEvent[] = [];
  for (const article of articles) {
    const kind = classifyEvent(article.title);
    if (!kind) continue;
    out.push({
      id: `news:${article.id}`,
      kind:
        kind === "BOARD_MEETING" || kind === "CORPORATE_ACTION" || kind === "MACRO"
          ? kind
          : article.symbol
            ? kind
            : "SECTOR",
      symbol:
        article.symbol && article.symbol !== "MARKET" ? article.symbol.replace(/\.NS$/, "") : null,
      title: article.title,
      event_at: article.published_at,
      time_known: true,
      published_at: article.published_at,
      source: article.source,
      url: article.url ?? null,
      relevance: relevanceOf(kind),
      sectors: article.affected_sectors ?? [],
    });
  }
  return out;
}

const ist = (ms: number) => new Date(ms + 330 * 60_000);

/**
 * Monthly NSE equity-derivatives expiry: the last Tuesday of the month from
 * September 2025 (last Thursday before that), moved to the previous trading
 * day when `isTradingDay` says the date is a holiday. `fromMs` may be in the
 * past to rebuild historical expiries.
 */
export function expiryEvents(
  fromMs: number,
  months: number,
  isTradingDay: (date: string) => boolean,
): RadarEvent[] {
  const out: RadarEvent[] = [];
  const start = ist(fromMs);
  for (let m = 0; m < months; m++) {
    const year = start.getUTCFullYear() + Math.floor((start.getUTCMonth() + m) / 12);
    const month = (start.getUTCMonth() + m) % 12;
    const last = new Date(Date.UTC(year, month + 1, 0));
    const weekday = Date.UTC(year, month, 1) >= Date.UTC(2025, 8, 1) ? 2 : 4;
    const back = (last.getUTCDay() - weekday + 7) % 7;
    const expiry = new Date(Date.UTC(year, month, last.getUTCDate() - back));
    let guard = 0;
    while (!isTradingDay(expiry.toISOString().slice(0, 10)) && guard++ < 7)
      expiry.setUTCDate(expiry.getUTCDate() - 1);
    const date = expiry.toISOString().slice(0, 10);
    out.push({
      id: `expiry:${date}`,
      kind: "EXPIRY",
      symbol: null,
      title: `NSE monthly equity-derivatives expiry (${date})`,
      event_at: `${date}T15:30:00+05:30`,
      time_known: true,
      published_at: null,
      source: "Exchange schedule (computed)",
      url: null,
      relevance: "MEDIUM",
      sectors: [],
    });
  }
  return out;
}

/** Reaction distribution: close-to-close return across the event session. */
export function reactionDistribution(
  bars: { time: number; close: number }[],
  eventTimes: number[],
): Distribution {
  const values: number[] = [];
  for (const t of eventTimes) {
    const i = bars.findIndex((bar) => bar.time >= t);
    if (i > 0 && i < bars.length) values.push(bars[i]!.close / bars[i - 1]!.close - 1);
  }
  return distribution(values);
}

/** Post-event update: move from the last close before to the latest close after. */
export function postEventMove(bars: { time: number; close: number }[], eventAt: string) {
  const t = Date.parse(eventAt) / 1000;
  const i = bars.findIndex((bar) => bar.time >= t);
  if (i <= 0) return null;
  return round((bars.at(-1)!.close / bars[i - 1]!.close - 1) * 100, 2);
}

/** Whether an event was knowable at a decision time. */
export function knowable(
  event: RadarEvent,
  decisionAt: string,
): "KNOWN" | "NOT_YET_PUBLISHED" | "UNKNOWN" {
  const published = event.published_at ? Date.parse(event.published_at) : null;
  if (published == null) {
    // Scheduled exchange events are deterministic and therefore always knowable.
    return event.kind === "EXPIRY" || event.kind === "SETTLEMENT" ? "KNOWN" : "UNKNOWN";
  }
  return published <= Date.parse(decisionAt) ? "KNOWN" : "NOT_YET_PUBLISHED";
}
