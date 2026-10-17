/**
 * Assembles the pre-trade risk compiler's inputs from live data and evaluates
 * the user's behavioural protections and review-mode gate for one ticket.
 */
import { useMemo } from "react";
import { useStockQuote } from "@/hooks/use-agent-stock";
import { useAccount, useMarkedHoldings } from "@/hooks/use-dashboard-data";
import {
  useJournal,
  useRiskLimits,
  useRiskStatus,
  type JournalEntry,
} from "@/hooks/use-trading-product";
import {
  exchangeDay,
  useAllOrders,
  useCalendar,
  useIndexBars,
  useSymbolHistory,
} from "@/hooks/use-quant-data";
import { useBehaviorPolicy, useWorkspacePrefs } from "@/hooks/use-workspace-prefs";
import { stockBySymbol } from "@/data/nifty50";
import { validateCandles } from "@/lib/market-history";
import { compileRisk, historyRiskInputs, type RiskPreview } from "@/lib/quant/risk-compiler";
import {
  detectPatterns,
  evaluateProtections,
  realisedDrawdownPct,
  type BehaviorOrder,
  type ProtectionResult,
} from "@/lib/quant/behavior";
import { planReadiness } from "@/lib/quant/decision-plan";
import { classifyEvent, EVENT_LABELS, expiryEvents } from "@/lib/quant/events";
import type { Order } from "@/hooks/use-orders";

export type TicketSpec = {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  order_type: "MARKET" | "LIMIT" | "STOP";
  limit_price: number | null;
  stop: number | null;
  target: number | null;
  holding_days: number | null;
  plan_id?: string | null;
};

const istDay = (ms: number) => new Date(ms + 330 * 60_000).toISOString().slice(0, 10);

export function behaviorOrders(orders: Order[] | undefined): BehaviorOrder[] {
  return (orders ?? []).map((o) => ({
    id: o.id,
    symbol: o.symbol,
    side: o.side,
    status: o.status,
    created_at: o.created_at,
    filled_quantity: o.filled_quantity ?? 0,
    avg_fill_price: o.avg_fill_price ?? null,
    price: o.price,
    quote_stale: o.quote_snapshot?.["stale"] === true,
    quote_delayed: o.quote_snapshot?.["delayed"] === true,
  }));
}

export function behaviorPlans(entries: JournalEntry[] | undefined) {
  return (entries ?? []).map((e) => ({
    order_id: e.order_id,
    created_at: e.created_at,
    thesis: e.thesis,
    plan: e.plan ?? null,
  }));
}

/** Behavioural patterns and the drawdown input, shared by every ticket. */
export function useBehaviorState() {
  const orders = useAllOrders();
  const journal = useJournal();
  const account = useAccount();
  return useMemo(() => {
    const bOrders = behaviorOrders(orders.data);
    const patterns = detectPatterns(bOrders, behaviorPlans(journal.data));
    const deposits = Number(account.data?.total_funds ?? 0);
    return {
      orders: bOrders,
      patterns,
      drawdown_pct: realisedDrawdownPct(bOrders, deposits),
      loading: orders.isLoading || journal.isLoading,
    };
  }, [orders.data, journal.data, account.data, orders.isLoading, journal.isLoading]);
}

export function useTradeGuard(ticket: TicketSpec | null) {
  const symbol = ticket?.symbol ?? "";
  const feed = useStockQuote(symbol, Boolean(ticket));
  const history = useSymbolHistory(symbol, "1Y", Boolean(ticket));
  const nifty = useIndexBars("NIFTY", Boolean(ticket));
  const { data: holdings } = useMarkedHoldings();
  const { data: account } = useAccount();
  const { data: limits } = useRiskLimits();
  const { data: status } = useRiskStatus();
  const { data: journal } = useJournal();
  const calendar = useCalendar(Boolean(ticket));
  const { workspace } = useWorkspacePrefs();
  const { policy } = useBehaviorPolicy();
  const behavior = useBehaviorState();

  const plan = ticket?.plan_id
    ? ((journal ?? []).find((e) => e.id === ticket.plan_id) ?? null)
    : null;
  const readiness = plan ? planReadiness(plan) : null;

  const result = useMemo(() => {
    const quote = feed.quote;
    if (!ticket || !quote?.price || !limits || quote.symbol !== ticket.symbol) return null;
    const bars = validateCandles(history.data?.candles).candles;
    const inputs = historyRiskInputs(bars, nifty.data?.candles);
    const now = Date.now();
    const today = istDay(now);
    const committed = (journal ?? [])
      .filter(
        (e) =>
          e.id !== ticket.plan_id &&
          e.plan?.decision === "TRADE" &&
          istDay(Date.parse(e.created_at)) === today &&
          e.plan.risk_preview?.planned_loss != null,
      )
      .reduce((t, e) => t + (e.plan!.risk_preview!.planned_loss ?? 0), 0);
    const symbolEvents = (calendar.data?.events ?? [])
      .filter((e) => (e.symbol ?? e.event.split(":")[0]?.trim()) === ticket.symbol)
      .map((e) => ({
        title: e.event,
        at: e.event_time,
        kind: EVENT_LABELS[classifyEvent(e.event) ?? "BOARD_MEETING"],
      }));
    const expiries = expiryEvents(now, 2, exchangeDay).map((e) => ({
      title: e.title,
      at: e.event_at,
      kind: EVENT_LABELS.EXPIRY,
    }));
    const value = ticket.quantity * (ticket.limit_price ?? quote.price);
    const protection: ProtectionResult = evaluateProtections(policy, {
      now,
      orders: behavior.orders,
      plan_ready: readiness?.ready ?? false,
      proposed_value: value,
      drawdown_pct: behavior.drawdown_pct,
      side: ticket.side,
      patterns: behavior.patterns,
    });
    const preview: RiskPreview = compileRisk({
      symbol: ticket.symbol,
      sector: stockBySymbol(ticket.symbol)?.sector ?? "Unclassified",
      side: ticket.side,
      quantity: ticket.quantity,
      order_type: ticket.order_type,
      limit_price: ticket.limit_price,
      quote: {
        price: quote.price,
        as_of: quote.as_of ?? null,
        bid: quote.bid ?? null,
        ask: quote.ask ?? null,
        bid_size: quote.bid_quantity ?? null,
        ask_size: quote.ask_quantity ?? null,
        stale: feed.stale || quote.stale,
        delayed: quote.delayed ?? false,
      },
      adv: inputs.adv,
      daily_vol: inputs.daily_vol,
      gap_p95: inputs.gap_p95,
      gap_worst: inputs.gap_worst,
      beta: inputs.beta,
      stop: ticket.stop,
      target: ticket.target,
      holding_days: ticket.holding_days,
      holdings: (holdings ?? []).map((h) => ({
        symbol: h.symbol,
        sector: stockBySymbol(h.symbol)?.sector ?? h.sector ?? "Unclassified",
        quantity: h.quantity,
        price: Number(h.last_price || h.avg_price || 0),
      })),
      cash: Number(account?.available_cash ?? account?.wallet_balance ?? 0),
      limits: {
        max_order_value: limits.max_order_value,
        max_position_pct: limits.max_position_pct,
        daily_loss_limit: limits.daily_loss_limit,
        max_sector_pct: workspace.max_sector_pct,
      },
      day_loss: Math.max(0, Number(status?.day_loss ?? 0)),
      committed_risk_today: committed,
      events: [...symbolEvents, ...expiries],
      behavior_warnings: policy.consent ? protection.warnings : [],
      // Fees and risk horizon are anchored to the provider observation used
      // for this preview, not to a browser render timestamp.
      at: quote.as_of ?? new Date(now).toISOString(),
    });
    return { preview, protection };
  }, [
    ticket,
    feed.quote,
    feed.stale,
    history.data,
    nifty.data,
    holdings,
    account,
    limits,
    status,
    journal,
    calendar.data,
    workspace.max_sector_pct,
    policy,
    behavior,
    readiness?.ready,
  ]);

  const reviewBlock =
    ticket && ticket.side === "BUY" && workspace.review_mode && !(readiness?.ready ?? false)
      ? plan
        ? `Review mode: complete the linked plan first (missing ${readiness!.missing.join(", ")}).`
        : "Review mode: new entries need a complete decision plan. Link or create one first."
      : null;
  const blocks = [
    ...(reviewBlock ? [reviewBlock] : []),
    ...(result?.protection.blocks ?? []),
    ...(result?.preview.violations.filter((v) => v.severity === "BLOCK").map((v) => v.message) ??
      []),
  ];
  return {
    preview: result?.preview ?? null,
    protection: result?.protection ?? null,
    blocks,
    plan,
    readiness,
    quote: feed.quote,
    loading: history.isLoading || !feed.quote,
    historyAvailable: Boolean(history.data?.candles?.length),
  };
}
