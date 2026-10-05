import { stockBySymbol } from "@/data/nifty50";

/**
 * Deterministic simulated "live" price for a symbol at a moment in time.
 * Oscillates gently (about ±0.8%) around the demonstrative reference price so
 * alerts and bracket exits can fire during a session. Never a real quote.
 */
export function simulatedPrice(symbol: string, at: number = Date.now(), fallback = 0): number {
  const stock = stockBySymbol(symbol);
  const base = stock?.price ?? fallback;
  if (!base) return 0;
  const seed = stock?.seed ?? symbol.length * 7;
  const t = at / 1000;
  const wave = 0.005 * Math.sin(t / 47 + seed) + 0.0025 * Math.sin(t / 11 + seed * 2.1) + 0.001 * Math.sin(t / 3.7 + seed);
  return Number((base * (1 + wave)).toFixed(2));
}

/** True when a price-level alert's condition holds at the given price. */
export function alertHit(type: string, threshold: number | null, price: number) {
  if (threshold == null || !price) return false;
  if (type === "PRICE_ABOVE") return price >= threshold;
  if (type === "PRICE_BELOW") return price <= threshold;
  return false;
}

/** Decides whether a bracket position should exit, and why. */
export function bracketExit(
  o: { stop_loss: number | null; target_price: number | null; trailing_stop: number | null },
  price: number,
  peak: number,
): "STOP" | "TARGET" | "TRAIL" | null {
  if (o.target_price != null && price >= o.target_price) return "TARGET";
  if (o.stop_loss != null && price <= o.stop_loss) return "STOP";
  if (o.trailing_stop != null && o.trailing_stop > 0 && price <= peak - o.trailing_stop) return "TRAIL";
  return null;
}
