/**
 * Resolves the paper-book authority for a request: the loopback-only local
 * profile, or (when configured) a verified InsForge user's hosted book.
 */
import { isLocalRequest, LOCAL_TOKEN } from "./local-session";
import type { Leg } from "./paper-basket.server";

export class BookAccessError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type BookService = {
  mode: "local" | "hosted";
  replay(input: Record<string, unknown>): Promise<unknown>;
  rpc(name: string, input: Record<string, unknown>): Promise<unknown>;
  order(id: string): Promise<{ symbol: string; status: string }>;
  query(input: Record<string, unknown>): Promise<unknown>;
  preflight(legs: Leg[]): Promise<unknown>;
};

export async function resolveBookService(request: Request): Promise<BookService> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new BookAccessError("Unauthorized", 401);
  const hosted = await import("./insforge-book.server");
  if (token === LOCAL_TOKEN) {
    if (hosted.insforgeProviderEnabled())
      throw new BookAccessError("Hosted mode requires an InsForge account session.", 503);
    if (!isLocalRequest(request))
      throw new BookAccessError("Local workspace requires localhost", 403);
    const local = await import("./local-store.server");
    const basket = await import("./paper-basket.server");
    return {
      mode: "local",
      replay: async (input) => local.localPaperReplay(input),
      rpc: async (name, input) => local.localPaperRpc(name, input),
      order: async (id) => local.localOrder(id),
      query: async (input) => local.localDataQuery(input),
      preflight: async (legs) => basket.preflightBasket(legs),
    };
  }
  const config = hosted.insforgeBookConfig();
  if (!config && hosted.insforgeProviderEnabled())
    throw new BookAccessError(
      "Hosted paper accounts are misconfigured. Contact the workspace administrator.",
      503,
    );
  if (!config)
    throw new BookAccessError(
      "Hosted paper accounts are not enabled yet. Use the local workspace on localhost.",
      503,
    );
  let userId: string;
  try {
    userId = await hosted.verifyInsForgeUser(config, token, request.signal);
  } catch (error) {
    if (error instanceof hosted.HostedBookError)
      throw new BookAccessError(error.message, error.status);
    throw new BookAccessError("Authentication service unavailable", 503);
  }
  const book = hosted.hostedBook(config, userId);
  const { preflightState } = await import("./paper-basket.server");
  return {
    mode: "hosted",
    replay: book.replay,
    rpc: book.rpc,
    order: book.order,
    query: book.query,
    preflight: (legs) =>
      hosted.insforgeTransaction(
        config,
        userId,
        (state, clock) => preflightState(state, clock, legs),
        false,
      ),
  };
}
