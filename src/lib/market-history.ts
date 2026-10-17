/**
 * Provider OHLCV history validation and indicators. Invalid bars are dropped,
 * never repaired; indicator values before their warm-up window are null.
 */
export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type HistoryIssue =
  | "NON_FINITE"
  | "NON_POSITIVE_PRICE"
  | "OHLC_ORDER"
  | "NEGATIVE_VOLUME"
  | "DUPLICATE_TIME"
  | "OUT_OF_ORDER";

/** Validated, strictly time-ordered candles plus the issues that removed bars. */
export function validateCandles(candles: Candle[] | undefined | null) {
  const valid: Candle[] = [];
  const issues: { time: number; issue: HistoryIssue }[] = [];
  for (const bar of candles ?? []) {
    const values = [bar.time, bar.open, bar.high, bar.low, bar.close, bar.volume];
    if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) {
      issues.push({ time: bar.time, issue: "NON_FINITE" });
      continue;
    }
    if (bar.open <= 0 || bar.high <= 0 || bar.low <= 0 || bar.close <= 0) {
      issues.push({ time: bar.time, issue: "NON_POSITIVE_PRICE" });
      continue;
    }
    if (bar.low > Math.min(bar.open, bar.close) || bar.high < Math.max(bar.open, bar.close)) {
      issues.push({ time: bar.time, issue: "OHLC_ORDER" });
      continue;
    }
    if (bar.volume < 0) {
      issues.push({ time: bar.time, issue: "NEGATIVE_VOLUME" });
      continue;
    }
    const previous = valid.at(-1);
    if (previous && bar.time === previous.time) {
      issues.push({ time: bar.time, issue: "DUPLICATE_TIME" });
      continue;
    }
    if (previous && bar.time < previous.time) {
      issues.push({ time: bar.time, issue: "OUT_OF_ORDER" });
      continue;
    }
    valid.push(bar);
  }
  return { candles: valid, issues };
}

export function validCloses(candles: Candle[] | undefined | null) {
  return validateCandles(candles).candles.map((bar) => bar.close);
}

/** Simple moving average; null until `period` values exist. */
export function sma(values: number[], period: number): (number | null)[] {
  let sum = 0;
  return values.map((value, index) => {
    sum += value;
    if (index >= period) sum -= values[index - period]!;
    return index >= period - 1 ? sum / period : null;
  });
}

/** Exponential moving average seeded with the first full-window SMA. */
export function ema(values: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  let previous: number | null = null;
  return values.map((value, index) => {
    if (index < period - 1) return null;
    if (previous == null) {
      previous = values.slice(0, period).reduce((total, item) => total + item, 0) / period;
      return previous;
    }
    previous = value * k + previous * (1 - k);
    return previous;
  });
}

/** Wilder's RSI; null until `period` price changes exist. */
export function rsi(values: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = values.map(() => null);
  if (values.length <= period) return result;
  let gain = 0;
  let loss = 0;
  for (let index = 1; index <= period; index++) {
    const change = values[index]! - values[index - 1]!;
    gain += Math.max(change, 0);
    loss += Math.max(-change, 0);
  }
  gain /= period;
  loss /= period;
  const value = () => (loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss));
  result[period] = value();
  for (let index = period + 1; index < values.length; index++) {
    const change = values[index]! - values[index - 1]!;
    gain = (gain * (period - 1) + Math.max(change, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-change, 0)) / period;
    result[index] = value();
  }
  return result;
}
