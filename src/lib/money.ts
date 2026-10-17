/** Integer minor-unit (paise) arithmetic for the paper book. */
export type Paise = number;

/** Converts a rupee amount with at most two decimals into exact integer paise. */
export function toPaise(rupees: unknown, code = "INVALID_AMOUNT"): Paise {
  if (typeof rupees !== "number" || !Number.isFinite(rupees)) throw new Error(code);
  const scaled = rupees * 100;
  const rounded = Math.round(scaled);
  // Provider floats such as 1234.5500000001 are accepted; sub-paisa precision is not.
  if (Math.abs(scaled - rounded) > 1e-6 * Math.max(1, Math.abs(scaled))) throw new Error(code);
  if (!Number.isSafeInteger(rounded)) throw new Error(code);
  return rounded;
}

/** Positive prices are quoted to the paisa; anything else is rejected. */
export function pricePaise(rupees: unknown, code = "INVALID_PRICE"): Paise {
  const value = toPaise(rupees, code);
  if (value <= 0) throw new Error(code);
  return value;
}

export function fromPaise(paise: Paise): number {
  return paise / 100;
}

/** Quantity × price in paise with overflow protection. */
export function notional(quantity: number, price: Paise): Paise {
  const value = quantity * price;
  if (!Number.isSafeInteger(value)) throw new Error("INVALID_PRICE");
  return value;
}

/** Round half away from zero for rates applied to paise amounts. */
export function applyRate(amount: Paise, rate: number): Paise {
  const value = amount * rate;
  return Math.sign(value) * Math.round(Math.abs(value));
}

/** Round a paise amount to the nearest whole rupee (half up). */
export function roundToRupee(amount: Paise): Paise {
  return Math.round(amount / 100) * 100;
}
