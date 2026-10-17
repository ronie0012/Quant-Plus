/**
 * Basket preflight: simulates the independent-leg policy against a copy of the
 * book without persisting anything. Legs whose quote is unavailable have an
 * unknown estimate and make the basket total unknown rather than zero.
 */
import { localTransaction } from "./local-store.server";
import { availableCash, observationFromQuote, placeOrder } from "./paper-book/engine";
import { fromPaise } from "./money";
import type { PlaceInput } from "./paper-book/engine";
import type { BookState, Clock } from "./paper-book/types";

export type Leg = {
  parameters: Record<string, unknown>;
  quote: Record<string, unknown> | null;
  quote_error: string | null;
};

export function preflightBasket(legs: Leg[]) {
  return localTransaction((state, clock) => preflightState(state, clock, legs), false);
}

/** Pure preflight against a copy of any book state. */
export function preflightState(original: BookState, clock: Clock, legs: Leg[]) {
  {
    const state = structuredClone(original);
    const startCash = availableCash(state);
    let complete = true;
    const results = legs.map((leg) => {
      const p = leg.parameters;
      const base = { intent_id: p["p_intent_id"], symbol: p["p_symbol"], side: p["p_side"] };
      if (state.intents[String(p["p_intent_id"])])
        return { ...base, status: "ALREADY_SUBMITTED", estimate: null, error: null };
      if (!leg.quote) {
        complete = false;
        return { ...base, status: "UNKNOWN", estimate: null, error: leg.quote_error };
      }
      try {
        const before = state.account.cash_paise;
        const order = placeOrder(
          state,
          clock,
          {
            intent_id: String(p["p_intent_id"]),
            symbol: String(p["p_symbol"]),
            company: String(p["p_company"]),
            side: p["p_side"] as PlaceInput["side"],
            order_type: p["p_type"] as PlaceInput["order_type"],
            quantity: p["p_qty"] as number,
            limit_price: (p["p_limit"] ?? null) as number | null,
            stop_loss: (p["p_stop_loss"] ?? null) as number | null,
            target_price: (p["p_target"] ?? null) as number | null,
            trailing_stop: (p["p_trailing"] ?? null) as number | null,
            execution_mode: "LIVE",
          },
          observationFromQuote(leg.quote, clock),
        );
        return {
          ...base,
          status:
            order.status === "FILLED"
              ? "WOULD_FILL"
              : order.status === "OPEN"
                ? "WOULD_REST"
                : order.status,
          estimate: {
            price: fromPaise(order.price_paise),
            filled_quantity: order.filled_quantity,
            charges: fromPaise(
              order.filled_quantity ? order.charges_paise : order.estimated_charges_paise,
            ),
            cash_change: fromPaise(state.account.cash_paise - before),
          },
          error: null,
        };
      } catch (error) {
        return {
          ...base,
          status: "WOULD_REJECT",
          estimate: null,
          error: error instanceof Error ? error.message : "Rejected",
        };
      }
    });
    return {
      policy: "INDEPENDENT_LEGS",
      complete,
      available_cash_before: fromPaise(startCash),
      available_cash_after: complete ? fromPaise(availableCash(state)) : null,
      quote_snapshot_note:
        "Estimates use quotes observed now; execution re-reads quotes and may differ.",
      legs: results,
    };
  }
}
