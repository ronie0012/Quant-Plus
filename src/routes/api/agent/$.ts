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
        ? /^stocks\/[A-Za-z0-9][A-Za-z0-9&-]{0,29}(?:\.NS)?\/prediction$/.test(decoded)
        : /^stocks\/sessions\/[a-f0-9]{16}$/.test(decoded) ||
          decoded === "stocks/search" ||
          decoded === "stocks/universe" ||
          decoded === "stocks/predictions" ||
          decoded === "fyers/status" ||
          decoded === "market/stream" ||
          decoded === "market/overview" ||
          /^terminal\/(quotes|metrics|calendar|research)$/.test(decoded) ||
          /^terminal\/indices\/(NIFTY|BANK|VIX|SENSEX)\/history$/.test(decoded) ||
          /^terminal\/fundamentals\/[A-Za-z0-9][A-Za-z0-9&-]{0,29}$/.test(decoded) ||
          /^market\/(sentiment|sentiment\/history|intelligence|sectors|news)$/.test(decoded) ||
          /^stocks\/[A-Za-z0-9][A-Za-z0-9&-]{0,29}(?:\.NS)?\/(news|news-sentiment|intelligence)$/.test(
            decoded,
          ) ||
          /^stocks\/[A-Za-z0-9][A-Za-z0-9&-]{0,29}(?:\.NS)?\/(profile|prediction)$/.test(decoded) ||
          /^market\/[A-Za-z0-9][A-Za-z0-9&-]{0,29}(?:\.NS)?\/(quote|stream|history)$/.test(decoded);
    if (!allowed) return new Response("Not found", { status: 404 });
    if (!process.env["AGENT_SERVICE_API_KEY"])
      return new Response("Agent authentication is not configured", { status: 503 });
    const base = (process.env["AGENT_SERVICE_URL"] ?? "http://127.0.0.1:8000").replace(/\/$/, "");
    const streaming = path.endsWith("/stream");
    const upstream = await fetch(`${base}/api/v1/${path}${url.search}`, {
      method: request.method,
      headers: { "X-Quantplus-Key": process.env["AGENT_SERVICE_API_KEY"] ?? "" },
      signal: streaming
        ? request.signal
        : AbortSignal.any([
            request.signal,
            AbortSignal.timeout(
              /\/(news|news-sentiment|sentiment|sentiment\/history|sectors|intelligence)$/.test(
                path,
              )
                ? 120_000
                : 20_000,
            ),
          ]),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
        ...(streaming ? { "X-Accel-Buffering": "no" } : {}),
      },
    });
  } catch {
    return Response.json(
      { detail: "Agent service unavailable. Check that the backend is running." },
      { status: 502 },
    );
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
