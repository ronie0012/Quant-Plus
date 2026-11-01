import { z } from "zod";

const text = z.string().trim().min(1);
const finite = z.number().finite();
const nonnegative = finite.nonnegative();
const price = finite.positive();
const count = nonnegative.int().safe();
const score = finite.min(0).max(100);
const timestamp = z
  .string()
  .datetime({ offset: true })
  .refine((value) => Number.isFinite(Date.parse(value)), "Invalid timestamp");
// Absent provider metadata stays absent; receipt time is not observation time.
const optionalTimestamp = timestamp.nullish().transform((value) => value ?? null);
const direction = z.enum(["bullish", "bearish"]);
const label = z.enum(["bullish", "bearish", "choppy", "unavailable"]);
const quality = z.enum(["GOOD", "PARTIAL", "DEGRADED", "UNAVAILABLE"]);
const side = z.enum(["buy_side", "sell_side"]);
const proxyKind = z.enum(["equal_high", "equal_low"]);
const session = z.enum(["open", "closed"]);

const zone = z
  .object({
    direction,
    lower: price,
    upper: price,
    base_at: timestamp,
    formed_at: timestamp,
    status: z.enum(["active", "invalidated"]),
    invalidated_at: timestamp.nullable(),
    invalidation_close: price.nullable(),
  })
  .refine((value) => value.lower <= value.upper, {
    path: ["upper"],
    message: "Zone upper must be at least lower",
  });

const proxy = z.object({
  kind: proxyKind,
  side,
  level: price,
  tolerance: nonnegative,
  touches: z.array(timestamp),
  formed_at: timestamp,
  last_touch_at: timestamp,
});

const sweep = z.object({
  direction,
  side,
  proxy_kind: proxyKind,
  liquidity_level: price,
  swept_price: price,
  close: price,
  swept_at: timestamp,
});

const depth = z.object({
  bid_size: nonnegative,
  ask_size: nonnegative,
  imbalance: finite.min(-1).max(1),
  bias: direction.nullable(),
  as_of: optionalTimestamp,
  source: text.nullable(),
});

const rank = z.object({
  score: score.nullable(),
  label,
  components: z.record(score),
});

// Only declared fields survive parsing, including the optional quote context.
const quote = z.object({
  symbol: text,
  price: price.optional(),
  change: finite.nullish(),
  change_pct: finite.nullish(),
  source: z.enum(["fyers", "yahoo"]).optional(),
  delayed: z.boolean().optional(),
  stale: z.boolean(),
  as_of: optionalTimestamp,
  received_at: optionalTimestamp,
  market_session: session.nullish(),
  open: nonnegative.nullish(),
  high: nonnegative.nullish(),
  low: nonnegative.nullish(),
  volume: nonnegative.nullish(),
  previous_close: nonnegative.nullish(),
  average_price: nonnegative.nullish(),
  bid: nonnegative.nullish(),
  ask: nonnegative.nullish(),
  bid_quantity: nonnegative.nullish(),
  ask_quantity: nonnegative.nullish(),
  last_quantity: nonnegative.nullish(),
  total_buy_quantity: nonnegative.nullish(),
  total_sell_quantity: nonnegative.nullish(),
  lower_circuit: nonnegative.nullish(),
  upper_circuit: nonnegative.nullish(),
  open_interest: nonnegative.nullish(),
  depth: z
    .array(
      z.object({
        bid: nonnegative.nullable(),
        ask: nonnegative.nullable(),
        bid_quantity: nonnegative.nullable(),
        ask_quantity: nonnegative.nullable(),
        bid_orders: count.nullable(),
        ask_orders: count.nullable(),
      }),
    )
    .optional(),
});

const structure = z
  .object({
    symbol: text,
    source: text.nullable(),
    as_of: optionalTimestamp,
    data_cutoff: optionalTimestamp,
    methodology_version: text,
    quality,
    quality_reasons: z.array(text),
    classification: z.object({ label, reason: text, evidence: z.array(text) }),
    order_blocks: z.array(zone),
    price_liquidity_proxies: z.array(proxy),
    liquidity_sweeps: z.array(sweep),
    depth_imbalance: depth.nullable(),
    volume: z
      .object({
        observed_candles: count,
        missing_candles: count,
        latest_volume: nonnegative.nullable(),
        recent_median_volume: nonnegative.nullable(),
        latest_vs_recent_median: nonnegative.nullable(),
      })
      .nullable(),
    diagnostics: z.object({
      input_candles: count,
      valid_candles: count,
      invalid_candles: count,
      incomplete_candles_excluded: count,
      future_candles_excluded: count,
      duplicate_timestamps: count,
      gap_count: count,
      missing_volume_candles: count,
      expected_interval_seconds: price.nullable(),
    }),
    live_price: price.nullable(),
    quote: quote.nullable(),
    history: z.object({
      source: text.nullable(),
      as_of: optionalTimestamp,
      interval: text.nullable(),
      delayed: z.boolean().nullable(),
    }),
    rank,
    industry: text.nullish(),
    market_session: session.nullish(),
    error: text.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.rank.label !== value.classification.label)
      ctx.addIssue({
        code: "custom",
        path: ["rank", "label"],
        message: "Rank and classification must agree",
      });
    if (value.quality === "UNAVAILABLE" && value.classification.label !== "unavailable")
      ctx.addIssue({
        code: "custom",
        path: ["classification", "label"],
        message: "Unavailable data cannot classify structure",
      });
    if (value.classification.label === "unavailable" && value.rank.score !== null)
      ctx.addIssue({
        code: "custom",
        path: ["rank", "score"],
        message: "Unavailable structure cannot have a score",
      });
  });

const board = z
  .object({
    rows: z.array(structure),
    universe: text,
    requested: count,
    observed: count,
    source: text.nullable(),
    market_session: session.nullable(),
    updated_at: optionalTimestamp,
  })
  .superRefine((value, ctx) => {
    if (value.rows.length > value.requested)
      ctx.addIssue({
        code: "custom",
        path: ["requested"],
        message: "Returned rows exceed requested symbols",
      });
    if (value.observed !== value.rows.filter((row) => row.quality !== "UNAVAILABLE").length)
      ctx.addIssue({
        code: "custom",
        path: ["observed"],
        message: "Observed count must match available rows",
      });
    if (new Set(value.rows.map((row) => row.symbol)).size !== value.rows.length)
      ctx.addIssue({
        code: "custom",
        path: ["rows"],
        message: "Duplicate symbols in structure board",
      });
  });

export type StructureLabel = z.infer<typeof label>;
export type StructureQuality = z.infer<typeof quality>;
export type StructureZone = z.infer<typeof zone>;
export type LiquidityProxy = z.infer<typeof proxy>;
export type LiquiditySweep = z.infer<typeof sweep>;
export type DepthImbalance = z.infer<typeof depth>;
export type StructureRank = z.infer<typeof rank>;
export type MarketStructure = z.infer<typeof structure>;
export type MarketStructureBoard = z.infer<typeof board>;

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown, name: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  // Field paths explain the failure without echoing arbitrary provider values.
  const fields = [
    ...new Set(result.error.issues.map((issue) => issue.path.join(".") || "response")),
  ];
  throw new Error(`${name} response is malformed: ${fields.slice(0, 4).join(", ")}`);
}

export function normalizeRow(value: unknown): MarketStructure {
  return parse(structure, value, "Market structure");
}

export function normalizeBoard(value: unknown): MarketStructureBoard {
  return parse(board, value, "Market structure board");
}
