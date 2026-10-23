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

/**
 * Session VWAP for intraday bars: resets at each IST trading day. Daily bars
 * have no intraday session, so VWAP is undefined for them (all null).
 */
export function vwap(candles: Candle[], intraday: boolean): (number | null)[] {
  if (!intraday) return candles.map(() => null);
  let day = "";
  let priceVolume = 0;
  let volume = 0;
  return candles.map((bar) => {
    const session = new Date((bar.time + 19_800) * 1000).toISOString().slice(0, 10);
    if (session !== day) {
      day = session;
      priceVolume = 0;
      volume = 0;
    }
    priceVolume += ((bar.high + bar.low + bar.close) / 3) * bar.volume;
    volume += bar.volume;
    return volume > 0 ? priceVolume / volume : null;
  });
}

/** Bollinger Bands: SMA(period) ± multiplier × population standard deviation. */
export function bollinger(values: number[], period = 20, multiplier = 2) {
  const middle = sma(values, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  values.forEach((_, index) => {
    const mean = middle[index];
    if (mean == null) {
      upper.push(null);
      lower.push(null);
      return;
    }
    const window = values.slice(index - period + 1, index + 1);
    const deviation = Math.sqrt(
      window.reduce((total, value) => total + (value - mean) ** 2, 0) / period,
    );
    upper.push(mean + multiplier * deviation);
    lower.push(mean - multiplier * deviation);
  });
  return { middle, upper, lower };
}

/** MACD(fast, slow, signal): line = EMA(fast) − EMA(slow); histogram = line − signal. */
export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9) {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const line = values.map((_, i) =>
    fastEma[i] == null || slowEma[i] == null ? null : fastEma[i]! - slowEma[i]!,
  );
  const start = line.findIndex((value) => value != null);
  const signal: (number | null)[] = values.map(() => null);
  if (start >= 0) {
    const tail = ema(line.slice(start) as number[], signalPeriod);
    tail.forEach((value, i) => (signal[start + i] = value));
  }
  const histogram = line.map((value, i) =>
    value == null || signal[i] == null ? null : value - signal[i]!,
  );
  return { line, signal, histogram };
}

/**
 * Supertrend(period, multiplier) on Wilder ATR. Returns the trailing band and
 * its direction (1 = uptrend, −1 = downtrend); null until ATR has warmed up.
 */
export function supertrend(candles: Candle[], period = 10, multiplier = 3) {
  const value: (number | null)[] = candles.map(() => null);
  const direction: (1 | -1 | null)[] = candles.map(() => null);
  let atr: number | null = null;
  let trSum = 0;
  let upper = 0;
  let lower = 0;
  let trend: 1 | -1 = 1;
  candles.forEach((bar, i) => {
    const previous = candles[i - 1];
    const tr = previous
      ? Math.max(
          bar.high - bar.low,
          Math.abs(bar.high - previous.close),
          Math.abs(bar.low - previous.close),
        )
      : bar.high - bar.low;
    if (i < period) {
      trSum += tr;
      if (i < period - 1) return;
      atr = trSum / period;
    } else {
      atr = (atr! * (period - 1) + tr) / period;
    }
    const mid = (bar.high + bar.low) / 2;
    const basicUpper = mid + multiplier * atr;
    const basicLower = mid - multiplier * atr;
    if (i === period - 1) {
      upper = basicUpper;
      lower = basicLower;
      trend = bar.close >= mid ? 1 : -1;
    } else {
      upper = basicUpper < upper || previous!.close > upper ? basicUpper : upper;
      lower = basicLower > lower || previous!.close < lower ? basicLower : lower;
      if (trend === 1 && bar.close < lower) trend = -1;
      else if (trend === -1 && bar.close > upper) trend = 1;
    }
    value[i] = trend === 1 ? lower : upper;
    direction[i] = trend;
  });
  return { value, direction };
}
