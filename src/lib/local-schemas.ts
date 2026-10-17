import { z } from "zod";
import { LOCAL_USER_ID } from "./local-session";

const symbol = z.string().regex(/^[A-Z0-9][A-Z0-9&-]{0,29}$/);
const text = z.string().max(10000);
const positive = z.number().finite().positive();
const nonnegative = z.number().finite().nonnegative();
const iso = z.string().datetime({ offset: true });
const price = positive.nullable();
const short = z.string().max(400);

/** Decision Plan stored on a journal row; see src/lib/quant/decision-plan.ts. */
const plan = z
  .object({
    plan_version: z.literal(1),
    side: z.enum(["BUY", "SELL"]),
    decision: z.enum(["TRADE", "NO_TRADE"]),
    expected_outcome: text,
    counter_thesis: text,
    holding_period_days: positive.int().max(3650).nullable(),
    entry: price,
    stop: price,
    target: price,
    time_exit: iso.nullable(),
    quantity: positive.int().safe().nullable(),
    sizing_method: z.enum(["FIXED_RISK", "FIXED_QUANTITY", "PERCENT_EQUITY"]),
    sizing_logic: text,
    expected_fees: nonnegative.nullable(),
    expected_slippage: nonnegative.nullable(),
    max_acceptable_loss: positive.nullable(),
    no_trade_reason: text,
    evidence_items: z
      .array(
        z
          .object({
            id: z.string().max(80),
            claim: z.string().max(2000),
            kind: z.enum(["OBSERVATION", "NEWS", "RESEARCH", "CALCULATION", "USER_NOTE"]),
            source: short,
            published_at: iso.nullable(),
            available_at: iso,
            url: z.string().url().max(2000).nullable().optional(),
            contradicted_by: z.string().max(2000).nullable().optional(),
          })
          .strict(),
      )
      .max(100),
    market_snapshot: z
      .object({
        symbol,
        price: positive,
        bid: price,
        ask: price,
        change_pct: z.number().finite().nullable(),
        volume: nonnegative.nullable(),
        source: z.string().max(40),
        as_of: iso,
        captured_at: iso,
        market_session: z.string().max(20).nullable(),
        delayed: z.boolean(),
        stale: z.boolean(),
      })
      .strict()
      .nullable(),
    risk_preview: z
      .object({
        planned_loss: z.number().finite().nullable(),
        gap_loss: z.number().finite().nullable(),
        fees: nonnegative,
        slippage: nonnegative,
        sector: short,
        sector_exposure_after_pct: z.number().finite().nullable(),
        daily_budget_used_pct: z.number().finite().nullable(),
        violations: z.array(z.string().max(600)).max(50),
        narrative: z.string().max(2000),
        compiled_at: iso,
      })
      .strict()
      .nullable(),
    // Revisions are appended by the server; a client-supplied list is ignored.
    revisions: z.array(z.unknown()).max(500).optional(),
    behavior_note: text,
    invalidated_at: iso.nullable().optional(),
  })
  .strict();

const behavior = z
  .object({
    consent: z.boolean(),
    cooling_off_minutes: nonnegative.int().max(1440),
    cooling_off_after_losses: positive.int().max(20),
    max_daily_decisions: nonnegative.int().max(500),
    mandatory_thesis: z.boolean(),
    drawdown_trigger_pct: nonnegative.max(100),
    drawdown_size_pct: positive.max(100),
    explain_prompt: z.boolean(),
  })
  .strict();

const workspace = z
  .object({
    mode: z.enum(["LEARNER", "TRADER", "RESEARCHER", "PORTFOLIO_MANAGER", "CUSTOM"]),
    panels: z.array(z.string().max(40)).max(40),
    focus_mode: z.boolean(),
    review_mode: z.boolean(),
    low_bandwidth: z.boolean(),
    attention_budget_per_hour: nonnegative.int().max(1000),
    push_notifications: z.boolean(),
    max_sector_pct: positive.max(100),
  })
  .partial()
  .strict();
const schemas = {
  risk_limits: z
    .object({
      daily_loss_limit: nonnegative,
      max_order_value: positive,
      max_position_pct: positive.max(100),
      confirmation_above: nonnegative,
      trading_paused: z.boolean(),
    })
    .partial()
    .strict(),
  watchlist_items: z.object({ symbol, company: text, sector: text.nullable() }).partial().strict(),
  trade_journal: z
    .object({
      symbol,
      order_id: z.string().uuid().nullable(),
      thesis: text,
      evidence: z.array(text).max(200),
      risks: z.array(text).max(200),
      invalidation: text,
      planned_exit: text,
      reflection: text,
      outcome: z.enum(["OPEN", "WIN", "LOSS", "FLAT", "CANCELLED"]),
      // Market observation when the decision was written; frozen after creation.
      decision_snapshot: z
        .object({
          price: positive,
          source: z.string().max(40),
          as_of: z.string().datetime(),
          market_session: z.string().max(20).optional(),
        })
        .strict()
        .nullable(),
      plan: plan.nullable(),
    })
    .partial()
    .strict(),
  research_items: z
    .object({
      kind: z.enum(["MEMO", "COMMENT", "STRATEGY", "BUNDLE", "REPLAY_RESULT"]),
      title: z.string().trim().min(1).max(300),
      ref: z.string().max(200).nullable(),
      status: z.enum(["DRAFT", "IN_REVIEW", "APPROVED", "REJECTED", "ARCHIVED", "SHADOW"]),
      body: z
        .record(z.string(), z.unknown())
        .refine((value) => JSON.stringify(value).length <= 200_000, "Body too large"),
    })
    .partial()
    .strict(),
  price_alerts: z
    .object({
      symbol,
      alert_type: z.enum(["PRICE_ABOVE", "PRICE_BELOW", "MOVE_PERCENT"]),
      threshold: positive,
      note: text,
      enabled: z.boolean(),
      triggered_at: z.string().datetime().nullable(),
    })
    .partial()
    .strict(),
  trading_preferences: z
    .object({
      display_name: z.string().trim().max(100),
      density: z.enum(["COMFORTABLE", "COMPACT"]),
      calm_mode: z.boolean(),
      default_order_type: z.enum(["MARKET", "LIMIT", "STOP"]),
      default_product: z.literal("DELIVERY"),
      default_quantity: positive.int().safe(),
      chart_type: z.enum(["CANDLE", "LINE", "AREA"]),
      show_volume: z.boolean(),
      notifications: z
        .object({ orders: z.boolean(), alerts: z.boolean(), news: z.boolean() })
        .partial()
        .strict(),
      behavior,
      workspace,
    })
    .partial()
    .strict(),
};

export function validateLocalValues(
  table: string,
  values: Record<string, unknown>,
  insert: boolean,
) {
  const schema = schemas[table as keyof typeof schemas];
  if (!schema) throw new Error("Unsupported editable table");
  // Ownership is always assigned by the server, never selected by a caller.
  const { user_id: userId, ...editable } = values;
  if (userId !== undefined && userId !== LOCAL_USER_ID) throw new Error("INVALID_OWNER");
  const parsed = schema.safeParse(editable);
  if (!parsed.success)
    throw new Error(table === "risk_limits" ? "RISK_LIMITS_INVALID" : "INVALID_RECORD");
  if (
    insert &&
    ["trade_journal", "watchlist_items", "price_alerts"].includes(table) &&
    !("symbol" in editable)
  )
    throw new Error("INVALID_SYMBOL");
  if (insert && table === "price_alerts" && (!editable["alert_type"] || !editable["threshold"]))
    throw new Error("INVALID_RECORD");
  if (insert && table === "research_items" && (!editable["kind"] || !editable["title"]))
    throw new Error("INVALID_RECORD");
  return parsed.data;
}
