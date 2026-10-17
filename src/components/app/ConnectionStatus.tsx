import { useQuery } from "@tanstack/react-query";
import { Activity, RefreshCw, ShieldCheck } from "lucide-react";
import { agentFetch } from "@/lib/agent-api";
import { cn } from "@/lib/utils";

type FeedStatus = {
  app_configured: boolean;
  authenticated: boolean;
  connected: boolean;
  login_required: boolean;
};

/** Provider readiness is distinct from the freshness of an individual quote. */
export function ConnectionStatus() {
  const status = useQuery<FeedStatus, Error>({
    queryKey: ["feed-status"],
    queryFn: async ({ signal }) => (await agentFetch("fyers/status", { signal })).json(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  const ready = status.data?.authenticated;
  const label = status.isPending
    ? "Checking market connection"
    : status.isError
      ? "Market service unavailable"
      : ready
        ? status.data?.connected
          ? "Fyers feed connected"
          : "Fyers signed in · awaiting feed"
        : "Fyers sign-in required · delayed fallback";
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-x-5 gap-y-1 rounded-md border border-border bg-panel/50 px-3.5 py-2 text-[12px]">
      <span className="flex items-center gap-2 font-medium text-primary-soft">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        Paper trading <span className="font-normal text-subtle">· virtual funds</span>
      </span>
      <div className="flex items-center gap-3">
        <span
          role="status"
          className={cn(
            "flex items-center gap-2",
            ready && !status.isError ? "text-positive" : "text-warning",
          )}
        >
          <Activity className="h-3.5 w-3.5" aria-hidden="true" />
          {label}
        </span>
        <button
          type="button"
          onClick={() => void status.refetch()}
          disabled={status.isFetching}
          aria-label="Check market connection"
          title="Check market connection"
          className="rounded p-1 text-subtle hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", status.isFetching && "animate-spin")}
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  );
}
