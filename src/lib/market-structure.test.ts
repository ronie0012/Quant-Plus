import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { normalizeBoard, normalizeRow } from "./market-structure-schema.ts";

const at = "2026-10-20T10:30:00+05:30";
const zone = {
  direction: "bullish",
  lower: 98,
  upper: 100,
  base_at: at,
  formed_at: at,
  status: "active",
  invalidated_at: null,
  invalidation_close: null,
};
const proxy = {
  kind: "equal_low",
  side: "sell_side",
  level: 98,
  tolerance: 0.1,
  touches: [at],
  formed_at: at,
  last_touch_at: at,
};
const sweep = {
  direction: "bullish",
  side: "sell_side",
  proxy_kind: "equal_low",
  liquidity_level: 98,
  swept_price: 97,
  close: 99,
  swept_at: at,
};
const depth = { bid_size: 10, ask_size: 10, imbalance: 0, bias: null, as_of: at, source: "fyers" };
const rank = { score: 0, label: "choppy", components: { active_zone: 0 } };
function row(extra: Record<string, unknown> = {}) {
  return {
    symbol: "RELIANCE",
    source: "fyers",
    as_of: at,
    data_cutoff: at,
    methodology_version: "quantplus.market_structure.v1",
    quality: "GOOD",
    quality_reasons: [],
    classification: { label: "choppy", reason: "Completed candles", evidence: [] },
    order_blocks: [zone],
    price_liquidity_proxies: [proxy],
    liquidity_sweeps: [sweep],
    depth_imbalance: depth,
    volume: {
      observed_candles: 4,
      missing_candles: 0,
      latest_volume: 0,
      recent_median_volume: 0,
      latest_vs_recent_median: null,
    },
    diagnostics: {
      input_candles: 4,
      valid_candles: 4,
      invalid_candles: 0,
      incomplete_candles_excluded: 0,
      future_candles_excluded: 0,
      duplicate_timestamps: 0,
      gap_count: 0,
      missing_volume_candles: 0,
      expected_interval_seconds: 86400,
    },
    live_price: 100,
    quote: null,
    history: { source: "fyers", as_of: at, interval: "1d", delayed: false },
    rank,
    ...extra,
  };
}
function board(extra: Record<string, unknown> = {}) {
  return {
    rows: [row()],
    universe: "NIFTY_50",
    requested: 1,
    observed: 1,
    source: "fixture",
    market_session: "open",
    updated_at: at,
    ...extra,
  };
}

describe("market structure response boundary", () => {
  it("accepts real Python endpoint payloads, including unavailable history and unknown metadata", () => {
    const payloads = JSON.parse(
      execFileSync(
        "python",
        [
          "-B",
          "-c",
          `import json
from datetime import datetime, timedelta, timezone
from quantplus_intelligence.terminal import _structure_payload
now = datetime(2026, 10, 23, 5, 0, 30, tzinfo=timezone.utc)
candles = [{"time": (now - timedelta(minutes=8-i)).timestamp(), "open": 100+i,
            "high": 102+i, "low": 99+i, "close": 101+i, "volume": 100} for i in range(8)]
history = {"candles": candles, "source": "fyers", "interval": "1m", "delayed": False}
quote = {"symbol": "INFY", "price": 108, "as_of": now.isoformat(),
         "source": "fyers", "stale": False, "market_session": None}
cases = [(None, {}), (None, history), (quote, history),
         (None, {**history, "delayed": None}),
         (None, {**history, "source": "yahoo", "delayed": True})]
print(json.dumps([_structure_payload("INFY", q, h, evaluated_at=now, session=None)
                  for q, h in cases]))`,
        ],
        {
          cwd: fileURLToPath(new URL("../../backend-extension", import.meta.url)),
          encoding: "utf8",
          timeout: 30_000,
        },
      ),
    ) as unknown[];
    const results = payloads.map(normalizeRow);
    assert.equal(results[0]?.quality, "UNAVAILABLE");
    assert.equal(results[0]?.history.delayed, null);
    assert.equal(results[1]?.classification.label, "bullish");
    assert.equal(results[2]?.quote?.market_session, null);
    assert.equal(results[3]?.history.delayed, null);
    assert.equal(results[4]?.history.delayed, true);
  });

  it("preserves observed zero and provider timestamps, stripping unknown fields", () => {
    const result = normalizeRow(row({ unvalidated_overlay: { price: "unsafe" } }));
    assert.equal(result.rank.score, 0);
    assert.equal(result.volume?.latest_volume, 0);
    assert.equal(result.depth_imbalance?.imbalance, 0);
    assert.equal(result.as_of, at);
    assert.equal("unvalidated_overlay" in result, false);
    assert.equal(normalizeBoard(board()).observed, 1);
  });

  it("keeps absent provider timestamps null rather than inventing a fresh time", () => {
    const result = normalizeRow(row({ as_of: undefined, data_cutoff: null }));
    assert.equal(result.as_of, null);
    assert.equal(result.data_cutoff, null);
    assert.equal(normalizeBoard(board({ updated_at: undefined })).updated_at, null);
    assert.equal(normalizeBoard(board({ updated_at: null })).updated_at, null);
  });

  it("accepts explicit unavailable data without turning it into scored observations", () => {
    const unavailable = row({
      quality: "UNAVAILABLE",
      as_of: null,
      data_cutoff: null,
      classification: { label: "unavailable", reason: "No candles", evidence: [] },
      rank: { score: null, label: "unavailable", components: {} },
      order_blocks: [],
      price_liquidity_proxies: [],
      liquidity_sweeps: [],
      depth_imbalance: null,
      volume: null,
      live_price: null,
    });
    const result = normalizeBoard(board({ rows: [unavailable], observed: 0 }));
    assert.equal(result.rows[0]?.rank.score, null);
    assert.equal(result.rows[0]?.classification.label, "unavailable");
    assert.equal(result.observed, 0);
  });

  const invalidRows: Array<[string, Record<string, unknown>, RegExp]> = [
    ["missing rank", { rank: undefined }, /rank/],
    ["missing sweeps", { liquidity_sweeps: undefined }, /liquidity_sweeps/],
    ["null zones", { order_blocks: [null] }, /order_blocks.0/],
    [
      "unknown classification",
      { classification: { label: "BUY", reason: "x", evidence: [] } },
      /classification.label/,
    ],
    ["unknown quality", { quality: "FRESH" }, /quality/],
    ["non-string industry", { industry: { name: "IT" } }, /industry/],
    ["numeric string", { rank: { ...rank, score: "80" } }, /rank.score/],
    ["score out of range", { rank: { ...rank, score: 101 } }, /rank.score/],
    [
      "infinite rank component",
      { rank: { ...rank, components: { active_zone: Infinity } } },
      /rank.components/,
    ],
    ["inconsistent rank", { rank: { ...rank, label: "bullish" } }, /rank.label/],
    [
      "invalid zone direction",
      { order_blocks: [{ ...zone, direction: "long" }] },
      /order_blocks.0.direction/,
    ],
    [
      "invalid zone status",
      { order_blocks: [{ ...zone, status: "pending" }] },
      /order_blocks.0.status/,
    ],
    ["inverted zone", { order_blocks: [{ ...zone, lower: 101 }] }, /order_blocks.0.upper/],
    ["non-finite zone", { order_blocks: [{ ...zone, lower: NaN }] }, /order_blocks.0.lower/],
    ["nonpositive price", { order_blocks: [{ ...zone, lower: 0 }] }, /order_blocks.0.lower/],
    [
      "invalid proxy kind",
      { price_liquidity_proxies: [{ ...proxy, kind: "other" }] },
      /price_liquidity_proxies.0.kind/,
    ],
    [
      "invalid proxy level",
      { price_liquidity_proxies: [{ ...proxy, level: Infinity }] },
      /price_liquidity_proxies.0.level/,
    ],
    [
      "invalid sweep side",
      { liquidity_sweeps: [{ ...sweep, side: "buy" }] },
      /liquidity_sweeps.0.side/,
    ],
    [
      "invalid sweep time",
      { liquidity_sweeps: [{ ...sweep, swept_at: "yesterday" }] },
      /liquidity_sweeps.0.swept_at/,
    ],
    ["invalid depth", { depth_imbalance: { ...depth, imbalance: 2 } }, /depth_imbalance.imbalance/],
    ["invalid timestamp", { as_of: "2026-02-30T10:00:00Z" }, /as_of/],
    ["invalid timestamp offset", { as_of: "2026-10-20T10:00:00+99:99" }, /as_of/],
    ["invalid quote", { quote: { symbol: "RELIANCE", stale: false, price: "100" } }, /quote.price/],
  ];
  for (const [name, extra, field] of invalidRows) {
    it(`rejects ${name} with a field-specific error before rendering`, () => {
      assert.throws(() => normalizeRow(row(extra)), field);
      assert.throws(() => normalizeBoard(board({ rows: [row(extra)] })), /rows.0/);
    });
  }

  for (const [name, extra, field] of [
    ["missing rows", { rows: undefined }, /rows/],
    ["missing counts", { observed: undefined }, /observed/],
    ["fractional count", { requested: 1.5 }, /requested/],
    ["negative count", { requested: -1 }, /requested/],
    ["inconsistent count", { observed: 0 }, /observed/],
    ["unknown session", { market_session: "live" }, /market_session/],
    ["invalid timestamp", { updated_at: "now" }, /updated_at/],
    ["duplicate symbols", { rows: [row(), row()], requested: 2, observed: 2 }, /rows/],
  ] as const) {
    it(`rejects board ${name}`, () => assert.throws(() => normalizeBoard(board(extra)), field));
  }
});
