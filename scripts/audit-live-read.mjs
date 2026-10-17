import { loadEnv } from "vite";
const env = loadEnv("development", process.cwd(), "");
const base = (
  process.env.AGENT_SERVICE_URL ||
  env.AGENT_SERVICE_URL ||
  "http://127.0.0.1:8000"
).replace(/\/$/, "");
const key = process.env.AGENT_SERVICE_API_KEY || env.AGENT_SERVICE_API_KEY;
const paths = [
  "fyers/status",
  "market/RELIANCE/quote",
  "market/sentiment",
  "market/news",
  "stocks/RELIANCE/news",
  "stocks/RELIANCE/news-sentiment",
  "stocks/predictions?symbols=RELIANCE,HDFCBANK,TCS",
  "market/sentiment/history?range=1d&interval=5m",
];
for (const path of paths) {
  const start = performance.now();
  try {
    const res = await fetch(`${base}/api/v1/${path}`, {
      headers: { "X-Quantplus-Key": key || "" },
      signal: AbortSignal.timeout(45000),
    });
    const data = await res.json();
    const summary = {
      path,
      status: res.status,
      duration_ms: Math.round(performance.now() - start),
    };
    if (path === "fyers/status") Object.assign(summary, data);
    else if (path.endsWith("/quote"))
      for (const field of [
        "price",
        "source",
        "as_of",
        "market_session",
        "stale",
        "delayed",
        "fallback_reason",
        "error",
      ])
        summary[field] = data[field];
    else if (path.includes("predictions"))
      summary.predictions = Object.fromEntries(
        Object.entries(data.predictions || {}).map(([s, p]) => [
          s,
          {
            status: p.status,
            as_of: p.as_of,
            authority: p.decision?.authority,
            freshness: p.serving?.freshness,
          },
        ]),
      );
    else if (path.includes("history")) summary.snapshots = data.snapshots?.length;
    else
      for (const field of [
        "score",
        "label",
        "confidence",
        "data_quality",
        "coverage",
        "provider_status",
        "counts",
        "updated_at",
        "market_session",
        "market_data_status",
      ])
        if (data[field] !== undefined) summary[field] = data[field];
    console.log(JSON.stringify(summary));
  } catch (error) {
    console.log(
      JSON.stringify({
        path,
        status: "unreachable",
        error_type: error.name,
        duration_ms: Math.round(performance.now() - start),
      }),
    );
    break;
  }
}
