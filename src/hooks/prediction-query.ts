import type { QueryClient } from "@tanstack/react-query";
import { agentFetch, type Prediction } from "@/lib/agent-api";

export const predictionKey = (symbol: string) => ["agent-prediction", symbol] as const;
export const predictionSymbol = (symbol: string) =>
  symbol.trim().toUpperCase().replace(/\.NS$/, "");
export const predictionRunning = (result?: Prediction) =>
  result?.status === "queued" || result?.status === "running";
export const completedPrediction = (result?: Prediction) =>
  result?.status === "done" ? result : (result?.previous_result ?? undefined);

/** Keep the completed cutoff and provenance intact while a new session is incomplete. */
export function preserveCompleted(previous: Prediction | undefined, next: Prediction): Prediction {
  if (next.status === "done") return next;
  const saved = completedPrediction(previous);
  const supplied = completedPrediction(next);
  if (
    !saved ||
    saved.instrument !== next.instrument ||
    saved.analysis_interval !== next.analysis_interval ||
    (supplied && Date.parse(supplied.as_of) >= Date.parse(saved.as_of))
  )
    return next;
  return { ...next, previous_result: { ...saved, previous_result: null } };
}

/** Freshness belongs to the backend data cutoff, not when this browser last fetched it. */
export function predictionRefreshAt(result: Prediction, updatedAt: number) {
  const seconds = Number.isFinite(result.refresh_seconds) ? result.refresh_seconds : 900;
  const ttl = Math.max(60, seconds) * 1_000;
  const cutoff = Date.parse(result.as_of);
  // A stale/capacity/paused response is retried at most once a minute, even if
  // its original cutoff is long past. Preloads use the cutoff as updatedAt.
  const expires = (Number.isFinite(cutoff) ? cutoff : updatedAt) + ttl;
  return expires > updatedAt ? expires : updatedAt + 60_000;
}

type PredictionState = {
  data: Prediction | undefined;
  dataUpdatedAt: number;
  status: string;
  fetchStatus: string;
};

export function predictionStaleTime(state: PredictionState) {
  if (!state.data) return 0;
  if (predictionRunning(state.data)) return 1_000;
  if (state.data.status !== "done") return Infinity;
  return Math.max(0, predictionRefreshAt(state.data, state.dataUpdatedAt) - state.dataUpdatedAt);
}

export function predictionPollInterval(state: PredictionState) {
  // retry:false alone does not stop refetchInterval after a transport error.
  // Keep the last output and let the user explicitly resume status reads.
  if (state.status === "error" || state.fetchStatus === "fetching" || !state.data) return false;
  if (predictionRunning(state.data)) return 1_000;
  if (state.data.status !== "done") return false;
  return Math.max(1, predictionRefreshAt(state.data, state.dataUpdatedAt) - Date.now());
}

// POST accepts a job; aborting that HTTP request does not cancel the backend
// job. Share it through navigation/retries instead of losing its session id.
const starts = new WeakMap<QueryClient, Map<string, Promise<Prediction>>>();

export function startPrediction(client: QueryClient, symbol: string, retry = false) {
  let pending = starts.get(client);
  if (!pending) {
    pending = new Map();
    starts.set(client, pending);
  }
  const existing = pending.get(symbol);
  if (existing) return existing;
  const request = (async () => {
    const response = await agentFetch(
      `stocks/${encodeURIComponent(symbol)}/prediction${retry ? "?retry=true" : ""}`,
      { method: "POST" },
    );
    return (await response.json()) as Prediction;
  })().finally(() => pending.delete(symbol));
  pending.set(symbol, request);
  return request;
}

export async function readPrediction(
  client: QueryClient,
  symbol: string,
  getSignal: () => AbortSignal,
) {
  const key = predictionKey(symbol);
  const current = client.getQueryData<Prediction>(key);
  const due =
    !current ||
    (current.status === "done" &&
      Date.now() >= predictionRefreshAt(current, client.getQueryState(key)?.dataUpdatedAt ?? 0));
  const next = due
    ? await startPrediction(client, symbol)
    : ((await (
        await agentFetch(
          current.status === "done"
            ? `stocks/${encodeURIComponent(symbol)}/prediction`
            : `stocks/sessions/${encodeURIComponent(current.id)}`,
          { method: "GET", signal: getSignal() },
        )
      ).json()) as Prediction);
  return preserveCompleted(client.getQueryData<Prediction>(key), next);
}
