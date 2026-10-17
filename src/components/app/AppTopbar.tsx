import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Bell, Command, Menu, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTradingDesk } from "@/components/app/trading-desk-context";
import { usePriceAlerts } from "@/hooks/use-trading-product";
import { regularNseSession } from "@/lib/market-session";
import { ModeToggles } from "@/components/app/ShellExtras";
import { WORKSPACE_ROUTES } from "@/components/app/workspace-routes";

export function AppTopbar({ onOpenMobile }: { onOpenMobile: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [now, setNow] = useState<Date | null>(null);
  const { openCommand, openTicket } = useTradingDesk();
  const navigate = useNavigate();
  const { data: alerts } = usePriceAlerts();
  const triggered = alerts?.filter((alert) => alert.triggered_at).length ?? 0;

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  const slug = pathname.split("/")[2] ?? "dashboard";
  const section =
    slug === "stocks"
      ? `Stock · ${decodeURIComponent(pathname.split("/")[3] ?? "")}`
      : (WORKSPACE_ROUTES.find((route) => route.section === slug)?.label ??
        slug.replace(/-/g, " "));
  const open = now ? regularNseSession(now) : false;

  return (
    <header className="vt-app-topbar sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onOpenMobile}
        aria-label="Open menu"
        className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground lg:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>

      <div className="hidden min-w-0 items-center gap-2 text-[13px] sm:flex">
        <span className="text-subtle">Terminal</span>
        <span aria-hidden="true" className="text-subtle">
          /
        </span>
        <span className="truncate font-medium text-foreground">{section}</span>
      </div>

      <button
        type="button"
        onClick={openCommand}
        className="ml-auto flex h-8 w-full max-w-[380px] items-center gap-2.5 rounded-md border border-border bg-panel/70 px-3 text-left transition-colors duration-200 hover:border-border-strong"
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-subtle" />
        <span className="w-full truncate text-[13px] text-subtle">
          Search symbols, pages, orders…
        </span>
        <kbd className="hidden items-center gap-0.5 rounded border border-border px-1.5 py-0.5 font-sans text-[11px] text-subtle sm:flex">
          <Command className="h-3 w-3" />K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
        <span
          title="Regular NSE hours in Asia/Kolkata. Holidays and special sessions may differ; stock pages show provider status."
          className={cn(
            "hidden h-8 items-center gap-2 rounded-md px-2.5 text-[12px] xl:flex",
            open ? "text-positive" : "text-muted-foreground",
          )}
        >
          <span
            aria-hidden="true"
            className={cn("h-1.5 w-1.5 rounded-full", open ? "bg-positive" : "bg-subtle")}
          />
          {open ? "NSE open" : "NSE closed"}
        </span>
        <ModeToggles />
        <button
          type="button"
          aria-label={`Notifications — ${triggered} triggered alerts`}
          title={`${triggered} triggered alerts`}
          onClick={() => void navigate({ to: "/app/$section", params: { section: "alerts" } })}
          className="relative flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
        >
          <Bell className="h-3.5 w-3.5" />
          {triggered > 0 && (
            <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-negative" />
          )}
        </button>
        <Button
          size="sm"
          onClick={() => openTicket()}
          className="hidden h-8 rounded-md px-4 text-[13px] font-semibold sm:inline-flex"
        >
          Trade
        </Button>
      </div>
    </header>
  );
}
