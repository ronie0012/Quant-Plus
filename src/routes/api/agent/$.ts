import { createFileRoute } from "@tanstack/react-router";

/** Authenticated, allowlisted proxy. Broker and agent secrets stay on servers. */
export async function proxy(request: Request) {
  const { authenticateRequest, RequestAuthError } = await import("@/lib/request-auth.server");
  try {
    await authenticateRequest(request);
  } catch (error) {
    if (error instanceof RequestAuthError)
      return new Response(error.message, { status: error.status });
    return new Response("Authentication service unavailable", { status: 503 });
  }
  try {
    const url = new URL(request.url);
    const path = url.pathname.slice("/api/agent/".length);
    let decoded: string;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      return new Response("Invalid path encoding", { status: 400 });
    }
    const allowed =
      request.method === "POST"
        ? /^stocks\/[A-Za-z0-9][A-Za-z0-9&-]{0,29}(?:\.NS)?\/(prediction|forecast|forecast\/personal)$/.test(
            decoded,
          )
        : /^stocks\/sessions\/[a-f0-9]{16}$/.test(decoded) ||
          decoded === "forecast/scoreboard" ||
          /^stocks\/[A-Za-z0-9][A-Za-z0-9&-]{0,29}(?:\.NS)?\/forecast(?:\/status)?$/.test(
            decoded,
          ) ||
          decoded === "stocks/search" ||
          decoded === "stocks/universe" ||
          decoded === "stocks/predictions" ||
          decoded === "fyers/status" ||
          decoded === "market/stream" ||
          decoded === "market/overview" ||
          decoded === "market/overview/stream" ||
          /^terminal\/(quotes|metrics|calendar|research)$/.test(decoded) ||
          /^terminal\/indices\/(NIFTY|BANK|VIX|SENSEX)\/history$/.test(decoded) ||
          /^terminal\/fundamentals\/[A-Za-z0-9][A-Za-z0-9&-]{0,29}$/.test(decoded) ||
          /^market\/(sentiment|sentiment\/history|intelligence|sectors|news)$/.test(decoded) ||
          /^stocks\/[A-Za-z0-9][A-Za-z0-9&-]{0,29}(?:\.NS)?\/(news|news-sentiment|intelligence)$/.test(
            decoded,
          ) ||
          /^stocks\/[A-Za-z0-9][A-Za-z0-9&-]{0,29}(?:\.NS)?\/(profile|prediction)$/.test(decoded) ||
          /^market\/[A-Za-z0-9][A-Za-z0-9&-]{0,29}(?:\.NS)?\/(quote|stream|history|option-chain)$/.test(
            decoded,
          );
    if (!allowed) return new Response("Not found", { status: 404 });
    if (!process.env["AGENT_SERVICE_API_KEY"])
      return new Response("Agent authentication is not configured", { status: 503 });
    const base = (process.env["AGENT_SERVICE_URL"] ?? "http://127.0.0.1:8000").replace(/\/$/, "");
    const streaming = path.endsWith("/stream");
    const cache = await import("@/lib/market-cache.server");
    const cacheKey = cache.marketCacheKey(request.method, decoded, url.search);
    // Single-symbol streams name their symbol in the path, not the query.
    const streamSearch = /^market\/[^/]+\/stream$/.test(decoded)
      ? `?symbols=${decoded.split("/")[1]!.toUpperCase().replace(/\.NS$/, "")}`
      : url.search;
    const fallback = async () =>
      streaming
        ? await cache.cachedMarketStream(decoded, streamSearch)
        : cacheKey
          ? await cache.cachedMarketResponse(cacheKey)
          : null;
    let upstream: Response;
    try {
      // Only the personal-fit POST carries a body: the caller's own paper book, size-capped.
      const body = decoded.endsWith("/forecast/personal") ? await request.text() : undefined;
      if (body !== undefined && body.length > 200_000)
        return new Response("Request too large", { status: 413 });
      upstream = await fetch(`${base}/api/v1/${path}${url.search}`, {
        method: request.method,
        headers: {
          "X-Quantplus-Key": process.env["AGENT_SERVICE_API_KEY"] ?? "",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body } : {}),
        signal: streaming
          ? request.signal
          : AbortSignal.any([
              request.signal,
              AbortSignal.timeout(
                /\/(news|news-sentiment|sentiment|sentiment\/history|sectors|intelligence)$/.test(
                  path,
                )
                  ? 120_000
                  : // Forecast generation runs several paced model calls before it locks a card.
                    (request.method === "POST" && path.endsWith("/forecast")) ||
                      path.endsWith("/forecast/status")
                    ? 180_000
                    : 20_000,
              ),
            ]),
      });
    } catch (error) {
      if (request.signal.aborted) throw error;
      const cached = await fallback();
      if (cached) return cached;
      throw error;
    }
    if (upstream.status >= 500 || upstream.status === 429) {
      const cached = await fallback();
      if (cached) {
        void upstream.body?.cancel().catch(() => undefined);
        return cached;
      }
    }
    if (upstream.ok && cacheKey) {
      const contentType = upstream.headers.get("content-type") ?? "application/json";
      const text = await upstream.text();
      void cache.storeMarketData(cacheKey, contentType, text);
      return new Response(text, {
        status: upstream.status,
        headers: { "Content-Type": contentType, "Cache-Control": "no-store" },
      });
    }
    const body =
      upstream.ok && streaming && upstream.body
        ? cache.recordMarketStream(decoded, upstream.body)
        : upstream.body;
    return new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
        ...(streaming ? { "X-Accel-Buffering": "no" } : {}),
      },
    });
  } catch {
    return Response.json({ detail: "Research service is offline" }, { status: 502 });
  }
}

export const Route = createFileRoute("/api/agent/$")({
  server: {
    handlers: {
      GET: ({ request }) => proxy(request),
      POST: ({ request }) => proxy(request),
    },
  },
});
