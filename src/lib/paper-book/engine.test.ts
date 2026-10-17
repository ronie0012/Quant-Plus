import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { alertHit, fillQuote, protectionTrigger } from "./engine.ts";
import { pricePaise, toPaise } from "../money.ts";
import { deliveryCharges } from "../paper-fees.ts";
import type { Protection, QuoteObservation } from "./types.ts";

const observation = (price: number, extra: Partial<QuoteObservation> = {}): QuoteObservation => ({
  symbol: "RELIANCE",
  price_paise: price * 100,
  bid_paise: null,
  ask_paise: null,
  bid_size: null,
  ask_size: null,
  provider: "fyers",
  provider_time: "2026-10-14T05:00:00.000Z",
  received_at: "2026-10-14T05:00:00.000Z",
  decision_at: "2026-10-14T05:00:00.000Z",
  market_session: "open",
  delayed: false,
  stale: false,
  change_pct: null,
  ...extra,
});

describe("alert conditions", () => {
  it("handles price levels at the boundary", () => {
    assert.equal(alertHit("PRICE_ABOVE", 100, observation(100)), true);
    assert.equal(alertHit("PRICE_ABOVE", 100, observation(99.9)), false);
    assert.equal(alertHit("PRICE_BELOW", 100, observation(100)), true);
    assert.equal(alertHit("PRICE_BELOW", 100, observation(100.1)), false);
  });
  it("requires an observed change for move alerts", () => {
    assert.equal(alertHit("MOVE_PERCENT", 2, observation(100, { change_pct: -2.1 })), true);
    assert.equal(alertHit("MOVE_PERCENT", 2, observation(100, { change_pct: 1.99 })), false);
    assert.equal(alertHit("MOVE_PERCENT", 2, observation(100)), false);
    assert.equal(alertHit("NEWS", 2, observation(100)), false);
  });
});

describe("protection triggers", () => {
  const protection = (overrides: Partial<Protection>) =>
    ({
      stop_paise: 9000,
      target_paise: 11000,
      trailing_paise: null,
      peak_paise: 10000,
      ...overrides,
    }) as Protection;
  it("exits at target and stop, holds between", () => {
    assert.equal(protectionTrigger(protection({}), 11000), "TARGET");
    assert.equal(protectionTrigger(protection({}), 9000), "STOP");
    assert.equal(protectionTrigger(protection({}), 10000), null);
  });
  it("trails from the persisted peak", () => {
    const trailing = protection({
      stop_paise: null,
      target_paise: null,
      trailing_paise: 500,
      peak_paise: 10900,
    });
    assert.equal(protectionTrigger(trailing, 10400), "TRAIL");
    assert.equal(protectionTrigger(trailing, 10401), null);
  });
});

describe("fill evidence", () => {
  it("uses the valid side of the quote and its displayed size", () => {
    const fill = fillQuote(
      "BUY",
      observation(100, { bid_paise: 9995, ask_paise: 10005, ask_size: 7 }),
      0,
    );
    assert.deepEqual(fill, { price: 10005, reference: 10000, method: "QUOTE_BID_ASK", size: 7 });
    assert.equal(
      fillQuote("SELL", observation(100, { bid_paise: 9995, ask_paise: 10005 }), 0).price,
      9995,
    );
  });
  it("falls back to the last trade with explicit slippage when the spread is unusable", () => {
    const crossed = observation(100, { bid_paise: 10010, ask_paise: 10000 });
    assert.deepEqual(fillQuote("BUY", crossed, 10), {
      price: 10010,
      reference: 10000,
      method: "LAST_TRADE",
      size: null,
    });
    assert.equal(fillQuote("SELL", observation(100), 10).price, 9990);
  });
});

describe("money and charges", () => {
  it("accepts paisa precision only", () => {
    assert.equal(toPaise(1234.55), 123455);
    assert.equal(toPaise(1234.5500000001), 123455);
    assert.throws(() => toPaise(1.234), /INVALID_AMOUNT/);
    assert.throws(() => pricePaise(0), /INVALID_PRICE/);
    assert.throws(() => toPaise(Number.NaN));
  });
  it("itemises delivery charges by category and side", () => {
    const buy = deliveryCharges("BUY", 1_00_000_00, "2026-10-14T05:00:00Z");
    const codes = Object.fromEntries(buy.items.map((item) => [item.code, item.amount_paise]));
    assert.deepEqual(codes, {
      STT: 10000,
      EXCHANGE: 307,
      SEBI: 10,
      STAMP: 1500,
      BROKERAGE: 0,
      GST: 57,
    });
    const sell = deliveryCharges("SELL", 1_00_000_00, "2026-10-14T05:00:00Z");
    assert.equal(
      sell.items.some((item) => item.code === "STAMP"),
      false,
    );
    assert.equal(sell.items.find((item) => item.code === "DP")?.category, "BROKER_ASSUMPTION");
    assert.throws(
      () => deliveryCharges("BUY", 100, "2025-01-01T00:00:00Z"),
      /CHARGE_SCHEDULE_UNAVAILABLE/,
    );
  });
});
