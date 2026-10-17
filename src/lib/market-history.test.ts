import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ema, rsi, sma, validateCandles } from "./market-history.ts";

const close = (values: number[]) => values;

describe("history validation", () => {
  it("drops invalid, duplicate and out-of-order bars without repairing them", () => {
    const bar = (time: number, c: number, extra = {}) => ({
      time,
      open: c,
      high: c + 1,
      low: c - 1,
      close: c,
      volume: 10,
      ...extra,
    });
    const { candles, issues } = validateCandles([
      bar(1, 100),
      bar(1, 101),
      bar(0, 99),
      bar(2, 100, { high: 99 }),
      bar(3, 100, { volume: -1 }),
      bar(4, Number.NaN),
      bar(5, 0, { low: 0 }),
      bar(6, 102),
    ]);
    assert.deepEqual(
      candles.map((c) => c.time),
      [1, 6],
    );
    assert.deepEqual(
      issues.map((i) => i.issue),
      [
        "DUPLICATE_TIME",
        "OUT_OF_ORDER",
        "OHLC_ORDER",
        "NEGATIVE_VOLUME",
        "NON_FINITE",
        "NON_POSITIVE_PRICE",
      ],
    );
  });
});

describe("indicators", () => {
  it("returns null during warm-up and exact averages after", () => {
    const values = close([1, 2, 3, 4, 5]);
    assert.deepEqual(sma(values, 3), [null, null, 2, 3, 4]);
    const e = ema(values, 3);
    assert.deepEqual(e.slice(0, 2), [null, null]);
    assert.equal(e[2], 2);
    assert.equal(e[3], 4 * 0.5 + 2 * 0.5);
    assert.equal(e[4], 5 * 0.5 + 3 * 0.5);
  });
  it("matches an independent Wilder RSI and its boundary cases", () => {
    const values = [
      44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61,
      46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64,
    ];
    const result = rsi(values, 14);
    assert.ok(result.slice(0, 14).every((v) => v === null));
    // Independent reference: explicit Wilder smoothing.
    let gain = 0;
    let loss = 0;
    for (let i = 1; i <= 14; i++) {
      const change = values[i]! - values[i - 1]!;
      gain += Math.max(change, 0) / 14;
      loss += Math.max(-change, 0) / 14;
    }
    const expected = [100 - 100 / (1 + gain / loss)];
    for (let i = 15; i < values.length; i++) {
      const change = values[i]! - values[i - 1]!;
      gain = (gain * 13 + Math.max(change, 0)) / 14;
      loss = (loss * 13 + Math.max(-change, 0)) / 14;
      expected.push(100 - 100 / (1 + gain / loss));
    }
    result.slice(14).forEach((value, i) => assert.ok(Math.abs(value! - expected[i]!) < 1e-9));
    // Published worked example for this series (70.53, 66.32, ...). It rounds its intermediate
    // averages to two decimals, so exact arithmetic differs by under 0.1.
    [70.53, 66.32, 66.55, 69.41, 66.36, 57.97].forEach((published, i) =>
      assert.ok(Math.abs(result[14 + i]! - published) < 0.1),
    );
    assert.equal(rsi([1, 2, 3, 4, 5, 6], 3).at(-1), 100);
    assert.equal(rsi([6, 5, 4, 3, 2, 1], 3).at(-1), 0);
    assert.equal(rsi([5, 5, 5, 5, 5], 3).at(-1), 50);
  });
});
