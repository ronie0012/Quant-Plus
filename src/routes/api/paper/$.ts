import { createFileRoute } from "@tanstack/react-router";
import type { ExecutionMode } from "@/lib/quote-eligibility";

const SYMBOL = /^[A-Z0-9][A-Z0-9&-]{0,29}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTENT = /^[A-Za-z0-9:_-]{8,160}$/;
const ORDER_SIDES = new Set(["BUY", "SELL"]);
const ORDER_TYPES = new Set(["MARKET", "LIMIT", "STOP"]);
const MAX_BASKET_LEGS = 20;
export const SAFE_BOOK_ERRORS = new Set([
  "INVALID_SYMBOL",
  "INVALID_SIDE",
  "INVALID_ORDER_TYPE",
  "INVALID_QUANTITY",
  "INVALID_PRICE",
  "INVALID_PRODUCT",
  "INVALID_VALIDITY",
  "INVALID_STOP_LOSS",
  "INVALID_TARGET",
  "INVALID_TRAILING_STOP",
  "TRADING_PAUSED",
  "ORDER_VALUE_LIMIT",
  "POSITION_VALUE_LIMIT",
  "NO_EQUITY",
  "NO_LIQUIDITY",
  "ORDER_NOT_FOUND",
  "ORDER_NOT_OPEN",
  "PRICE_CONDITION_NOT_MET",
  "INSUFFICIENT_FUNDS",
  "INSUFFICIENT_QUANTITY",
  "DAILY_LOSS_LIMIT",
  "INVALID_INTENT_ID",
  "IDEMPOTENCY_CONFLICT",
  "ORDER_EXPIRED",
  "LOCAL_STORE_BUSY",
  "QUOTE_REQUIRED",
  "CHARGE_SCHEDULE_UNAVAILABLE",
  "PROTECTION_NOT_FOUND",
  "PROTECTION_NOT_ACTIVE",
  "BOOK_VERSION_CONFLICT",
  "ORDER_VERSION_CONFLICT",
  "ORDER_AMEND_UNSUPPORTED",
]);

type OrderInput = {
  intent_id: string;
  symbol: string;
  company: string;
  side: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT" | "STOP";
  quantity: number;
  limitPrice: number | null;
  stopLoss: number | null;
  targetPrice: number | null;
  trailingStop: number | null;
  mode: ExecutionMode;
};

class PaperError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

function textResponse(status: number, message: string) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
const json = (value: unknown) => Response.json(value, { headers: { "Cache-Control": "no-store" } });

function finitePositive(value: unknown, field: string): number | null {
  if (value == null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    throw new PaperError(`Invalid ${field}`);
  return value;
}

export function readOrderInput(body: unknown): OrderInput {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new PaperError("Invalid order body");
  const input = body as Record<string, unknown>;
  const rawSymbol = typeof input["symbol"] === "string" ? input["symbol"].trim().toUpperCase() : "";
  const symbol = rawSymbol.replace(/\.NS$/, "");
  const side = typeof input["side"] === "string" ? input["side"] : "";
  const orderType = typeof input["order_type"] === "string" ? input["order_type"] : "";
  const quantity = input["quantity"];
  if (!SYMBOL.test(symbol)) throw new PaperError("Invalid symbol");
  if (!ORDER_SIDES.has(side)) throw new PaperError("Invalid order side");
  if (!ORDER_TYPES.has(orderType)) throw new PaperError("Invalid order type");
  if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity <= 0)
    throw new PaperError("Invalid quantity");
  const limitPrice = finitePositive(input["limit_price"], "limit price");
  if (orderType !== "MARKET" && limitPrice == null)
    throw new PaperError("A limit or trigger price is required");
  if (orderType === "MARKET" && limitPrice != null)
    throw new PaperError("Market orders cannot include a limit price");
  const product = typeof input["product"] === "string" ? input["product"] : "DELIVERY";
  const validity = typeof input["validity"] === "string" ? input["validity"] : "DAY";
  if (product.trim().toUpperCase() !== "DELIVERY") throw new PaperError("Invalid product");
  if (validity.trim().toUpperCase() !== "DAY") throw new PaperError("Invalid validity");
  const mode = input["execution_mode"] ?? "LIVE";
  if (mode !== "LIVE" && mode !== "LAST_SESSION_PRACTICE")
    throw new PaperError("Invalid execution mode");
  if (mode === "LAST_SESSION_PRACTICE" && orderType !== "MARKET")
    throw new PaperError("Closed-session practice supports immediate market intents only");
  const intent = input["intent_id"];
  if (typeof intent !== "string" || !INTENT.test(intent)) throw new PaperError("INVALID_INTENT_ID");
  const company =
    typeof input["company"] === "string" ? input["company"].trim().slice(0, 120) : symbol;
  return {
    intent_id: intent,
    symbol,
    company: company || symbol,
    side: side as OrderInput["side"],
    orderType: orderType as OrderInput["orderType"],
    quantity,
    limitPrice,
    stopLoss: finitePositive(input["stop_loss"], "stop loss"),
    targetPrice: finitePositive(input["target_price"], "target price"),
    trailingStop: finitePositive(input["trailing_stop"], "trailing stop"),
    mode,
  };
}

function rpcParameters(order: OrderInput) {
  return {
    p_intent_id: order.intent_id,
    p_symbol: order.symbol,
    p_company: order.company,
    p_side: order.side,
    p_type: order.orderType,
    p_qty: order.quantity,
    p_limit: order.limitPrice,
    p_product: "DELIVERY",
    p_validity: "DAY",
    p_stop_loss: order.stopLoss,
    p_target: order.targetPrice,
    p_trailing: order.trailingStop,
    p_execution_mode: order.mode,
  };
}

type Service = Awaited<ReturnType<typeof import("@/lib/book-service.server").resolveBookService>>;

async function service(request: Request): Promise<Service> {
  const { resolveBookService, BookAccessError } = await import("@/lib/book-service.server");
  try {
    return await resolveBookService(request);
  } catch (error) {
    if (error instanceof BookAccessError) throw new PaperError(error.message, error.status);
    throw error;
  }
}

/** Map engine error codes to safe client errors; anything else is internal. */
async function book<T>(operation: () => T | Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PaperError) throw error;
    // Hosted-book failures carry an explicit HTTP status and a safe message.
    if (error instanceof Error && error.name === "HostedBookError" && "status" in error)
      throw new PaperError(error.message, Number(error.status));
    if (error instanceof Error && SAFE_BOOK_ERRORS.has(error.message))
      throw new PaperError(error.message, error.message === "ORDER_NOT_FOUND" ? 404 : 409);
    throw error;
  }
}

async function quote(symbol: string, mode: ExecutionMode, request: Request) {
  const { executableQuote, QuoteUnavailable } = await import("@/lib/provider-quote.server");
  try {
    return await executableQuote(symbol, mode, request.signal);
  } catch (error) {
    if (error instanceof QuoteUnavailable) throw new PaperError(error.message, error.status);
    throw new PaperError("Live market price unavailable", 503);
  }
}

async function placeOne(books: Service, order: OrderInput, request: Request) {
  const parameters = rpcParameters(order);
  // A persisted intent replays its original result without a new quote.
  const prior = await book(() => books.replay(parameters));
  if (prior) return prior;
  const observed = await quote(order.symbol, order.mode, request);
  return book(() => books.rpc("place_server_advanced_order", { ...parameters, p_quote: observed }));
}

async function readBody(request: Request) {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw new PaperError("Invalid request body");
  }
}

function readLegs(body: unknown) {
  const legs = (body as { legs?: unknown } | null)?.legs;
  if (!Array.isArray(legs) || !legs.length || legs.length > MAX_BASKET_LEGS)
    throw new PaperError(`A basket needs 1-${MAX_BASKET_LEGS} legs`);
  const parsed = legs.map((leg) => readOrderInput(leg));
  if (new Set(parsed.map((leg) => leg.intent_id)).size !== parsed.length)
    throw new PaperError("Each basket leg needs its own intent ID");
  if (parsed.some((leg) => leg.mode !== "LIVE"))
    throw new PaperError("Baskets execute against live sessions only");
  return parsed;
}

async function paper(request: Request) {
  try {
    const books = await service(request);
    if (request.method !== "POST") return textResponse(405, "Method not allowed");
    const path = new URL(request.url).pathname.replace(/^\/api\/paper\/?/, "");
    let parts: string[];
    try {
      parts = path.split("/").filter(Boolean).map(decodeURIComponent);
    } catch {
      throw new PaperError("Invalid path encoding");
    }

    if (parts.length === 1 && parts[0] === "orders")
      return json(await placeOne(books, readOrderInput(await readBody(request)), request));

    if (parts.length === 2 && parts[0] === "orders" && parts[1] === "oco") {
      const body = await readBody(request);
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw new PaperError("Invalid OCO body");
      const input = body as Record<string, unknown>;
      const order = readOrderInput({
        ...input,
        side: "SELL",
        order_type: "STOP",
        limit_price: input["stop_price"],
        execution_mode: "LIVE",
      });
      const target = finitePositive(input["target_price"], "target price");
      if (target == null) throw new PaperError("A target price is required");
      const observed = await quote(order.symbol, "LIVE", request);
      return json(
        await book(() =>
          books.rpc("place_server_oco", {
            p_intent_id: order.intent_id,
            p_symbol: order.symbol,
            p_company: order.company,
            p_qty: order.quantity,
            p_stop: order.limitPrice,
            p_target: target,
            p_quote: observed,
          }),
        ),
      );
    }

    if (parts.length === 3 && parts[0] === "orders") {
      const [, orderId, action] = parts as [string, string, string];
      if (!UUID.test(orderId)) throw new PaperError("Invalid order id");
      if (action === "cancel")
        return json(
          await book(() => books.rpc("cancel_server_open_order", { p_order_id: orderId })),
        );
      if (action === "audit")
        return json(
          await book(() => books.query({ rpc: "order_audit", values: { p_order_id: orderId } })),
        );
      if (action === "amend") {
        const body = await readBody(request);
        if (!body || typeof body !== "object" || Array.isArray(body))
          throw new PaperError("Invalid amendment body");
        const input = body as Record<string, unknown>;
        const intent = input["intent_id"];
        const quantity = input["quantity"];
        const version = input["expected_version"];
        const price = finitePositive(input["limit_price"], "limit price");
        if (typeof intent !== "string" || !INTENT.test(intent))
          throw new PaperError("INVALID_INTENT_ID");
        if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity <= 0)
          throw new PaperError("Invalid quantity");
        if (
          typeof version !== "number" ||
          !Number.isSafeInteger(version) ||
          version < 1 ||
          price == null
        )
          throw new PaperError("Invalid amendment");
        const order = await book(() => books.order(orderId));
        const observed = await quote(order.symbol, "LIVE", request);
        return json(
          await book(() =>
            books.rpc("amend_server_open_order", {
              p_intent_id: intent,
              p_order_id: orderId,
              p_qty: quantity,
              p_limit: price,
              p_version: version,
              p_quote: observed,
            }),
          ),
        );
      }
      if (action === "fill") {
        const order = await book(() => books.order(orderId));
        if (order.status !== "OPEN" && order.status !== "PARTIALLY_FILLED")
          throw new PaperError(
            order.status === "EXPIRED" ? "ORDER_EXPIRED" : "ORDER_NOT_OPEN",
            409,
          );
        const observed = await quote(order.symbol, "LIVE", request);
        return json(
          await book(() =>
            books.rpc("fill_server_open_order", {
              p_order_id: orderId,
              p_quote: observed,
            }),
          ),
        );
      }
    }

    if (parts.length === 3 && parts[0] === "protections" && parts[2] === "cancel") {
      const id = parts[1]!;
      if (!UUID.test(id)) throw new PaperError("Invalid protection id");
      return json(
        await book(() =>
          books.query({ rpc: "cancel_protection", values: { p_protection_id: id } }),
        ),
      );
    }

    if (parts.length === 2 && parts[0] === "baskets" && parts[1] === "preflight") {
      const legs = readLegs(await readBody(request));
      const quotes = await Promise.all(
        legs.map(async (leg) => {
          try {
            return { quote: await quote(leg.symbol, "LIVE", request), error: null };
          } catch (error) {
            return {
              quote: null,
              error: error instanceof Error ? error.message : "Quote unavailable",
            };
          }
        }),
      );
      return json(
        await book(() =>
          books.preflight(
            legs.map((leg, index) => ({
              parameters: rpcParameters(leg),
              quote: quotes[index]!.quote,
              quote_error: quotes[index]!.error,
            })),
          ),
        ),
      );
    }

    if (parts.length === 1 && parts[0] === "baskets") {
      const legs = readLegs(await readBody(request));
      // Independent-leg policy: each leg settles or rejects on its own intent.
      const results = [];
      for (const leg of legs) {
        try {
          const order = (await placeOne(books, leg, request)) as { status?: string };
          results.push({ intent_id: leg.intent_id, symbol: leg.symbol, ok: true, order });
        } catch (error) {
          results.push({
            intent_id: leg.intent_id,
            symbol: leg.symbol,
            ok: false,
            error: error instanceof PaperError ? error.message : "Paper execution unavailable",
          });
        }
      }
      return json({ policy: "INDEPENDENT_LEGS", results });
    }

    if (parts.length === 1 && parts[0] === "worker") {
      const { paperWorkerStatus } = await import("@/lib/paper-worker.server");
      return json({
        worker: paperWorkerStatus(),
        book: await books.query({ rpc: "book_report" }),
      });
    }
    return textResponse(404, "Not found");
  } catch (error) {
    if (error instanceof PaperError) return textResponse(error.status, error.message);
    console.error(error);
    return textResponse(502, "Paper execution unavailable. Please try again.");
  }
}

export { paper };

export const Route = createFileRoute("/api/paper/$")({
  server: {
    handlers: {
      POST: ({ request }) => paper(request),
    },
  },
});
