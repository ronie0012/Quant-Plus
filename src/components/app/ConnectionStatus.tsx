import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { agentFetch } from "@/lib/agent-api";
import { cn } from "@/lib/utils";

type FeedStatus = {
  app_configured: boolean;
  authenticated: boolean;
  connected: boolean;
  login_required: boolean;
};

/**
 * Compact feed indicator for the top bar. Provider readiness is distinct from
 * the freshness of an individual quote; the full state lives in the tooltip.
 */
export function ConnectionStatus() {
  const status = useQuery<FeedStatus, Error>({
    queryKey: ["feed-status"],
    queryFn: async ({ signal }) => (await agentFetch("fyers/status", { signal })).json(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  const authenticated = status.data?.authenticated;
  const ready = authenticated && status.data?.connected;
  const detail = status.isPending
    ? "Checking market connection"
    : status.isError
      ? "Market data service is offline. Prices and charts resume when it reconnects."
      : ready
        ? "Fyers feed connected"
        : authenticated
          ? "Fyers signed in · awaiting feed"
          : "Fyers sign-in required · delayed fallback";
  const [label, tone] = status.isPending
    ? (["Connecting", "muted"] as const)
    : status.isError
      ? (["Offline", "muted"] as const)
      : ready
        ? (["Live", "positive"] as const)
        : (["Delayed", "warning"] as const);
  return (
    <button
      type="button"
      onClick={() => void status.refetch()}
      disabled={status.isFetching}
      title={`${detail}. Select to check again.`}
      aria-label={`Market data: ${detail}. Check again`}
      className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted-foreground transition-colors hover:bg-panel hover:text-foreground"
    >
      {status.isFetching ? (
        <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            tone === "positive"
              ? "live-dot bg-positive"
              : tone === "warning"
                ? "bg-warning"
                : "bg-subtle",
          )}
        />
      )}
      <span className="hidden sm:inline">Data</span>
      <span
        className={cn(
          "font-medium",
          tone === "positive" ? "text-positive" : tone === "warning" ? "text-warning" : "",
        )}
      >
        {label}
      </span>
    </button>
  );
}
