import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { agentFetch } from "@/lib/agent-api";
import type { Instrument } from "@/hooks/use-dashboard-data";

type Tick = Partial<Instrument> & { symbol: string };

/**
 * Keeps the index overview live: the server pushes a snapshot, then each index
 * tick, into the shared ["instruments"] query. Polling remains the fallback.
 */
export function useOverviewStream() {
  const client = useQueryClient();
  useEffect(() => {
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    let backoff = 2_000;

    const apply = (event: string, data: string) => {
      let value: unknown;
      try {
        value = JSON.parse(data);
      } catch {
        return;
      }
      if (event === "overview") {
        const instruments = (value as { instruments?: Instrument[] }).instruments;
        if (Array.isArray(instruments) && instruments.length)
          client.setQueryData<Instrument[]>(["instruments"], instruments);
        return;
      }
      if (event !== "tick") return;
      const tick = value as Tick;
      if (typeof tick.symbol !== "string" || typeof tick.value !== "number" || tick.value <= 0)
        return;
      client.setQueryData<Instrument[]>(["instruments"], (current) =>
        current?.map((item) => {
          if (item.symbol !== tick.symbol) return item;
          // Out-of-order ticks never move the display backwards in time.
          const before = Date.parse(item.updated_at ?? "");
          const after = Date.parse(tick.updated_at ?? "");
          if (Number.isFinite(before) && Number.isFinite(after) && after < before) return item;
          return { ...item, ...tick };
        }),
      );
    };

    const connect = async () => {
      try {
        const response = await agentFetch("market/overview/stream", {
          signal: controller.signal,
        });
        if (!response.body) throw new Error("Overview stream unavailable");
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        let received = false;
        while (!controller.signal.aborted) {
          const frame = await reader.read();
          if (frame.done) break;
          buffer += frame.value.replace(/\r/g, "");
          if (buffer.length > 262_144) throw new Error("Overview frame exceeds size limit");
          let boundary: number;
          while ((boundary = buffer.indexOf("\n\n")) >= 0) {
            const lines = buffer.slice(0, boundary).split("\n");
            buffer = buffer.slice(boundary + 2);
            const event =
              lines
                .find((l) => l.startsWith("event:"))
                ?.slice(6)
                .trim() ?? "";
            const data = lines
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trim())
              .join("\n");
            if (data) {
              apply(event, data);
              received = true;
            }
          }
        }
        if (received) backoff = 2_000;
      } catch {
        /* reconnect below; the polled overview keeps the strip populated */
      }
      if (controller.signal.aborted) return;
      retry = setTimeout(() => void connect(), backoff);
      backoff = Math.min(backoff * 2, 60_000);
    };
    void connect();
    return () => {
      controller.abort();
      clearTimeout(retry);
    };
  }, [client]);
}
