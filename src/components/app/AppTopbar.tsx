import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Bell, Command, Menu, Search, SlidersHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTradingDesk } from "@/components/app/trading-desk-context";
import { usePriceAlerts } from "@/hooks/use-trading-product";
import { useWorkspacePrefs } from "@/hooks/use-workspace-prefs";
import { regularNseSession } from "@/lib/market-session";
import { workspaceLocationForPathname } from "@/components/app/workspace-routes";
import { toast } from "sonner";
import { ConnectionStatus } from "@/components/app/ConnectionStatus";

/** The shell keeps the review-mode control, but gives it a distinct action label. */
function TopbarModeToggles() {
  const { workspace, save } = useWorkspacePrefs();
  const toggles = [
    {
      key: "focus_mode" as const,
      label: "Focus",
      on: workspace.focus_mode,
      title: "Focus mode hides non-essential panels (F)",
    },
    {
      key: "review_mode" as const,
      label: "Plan gate",
      on: workspace.review_mode,
      title: "Plan gate blocks new entries until a decision plan is complete (V)",
    },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Workspace options"
          title="Workspace options"
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-md border border-border text-subtle hover:text-foreground",
            workspace.focus_mode && "border-primary/50 text-primary-soft",
          )}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Workspace options</DropdownMenuLabel>
        {toggles.map(({ key, label, on, title }) => (
          <DropdownMenuCheckboxItem
            key={key}
            checked={on}
            disabled={save.isPending}
            onCheckedChange={(value) =>
              save.mutate(
                { [key]: value },
                { onError: () => toast.error(`${label} could not be saved`) },
              )
            }
            className="min-h-11 items-start"
          >
            <span>
              <span className="block">
                {label === "Plan gate" ? "Require a decision plan" : "Focus mode"}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-subtle">{title}</span>
            </span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppTopbar({
  onOpenMobile,
  mobileOpen,
}: {
  onOpenMobile: () => void;
  mobileOpen: boolean;
}) {
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

  const location = workspaceLocationForPathname(pathname);
  const open = now ? regularNseSession(now) : false;

  return (
    <header className="vt-app-topbar flex h-12 items-center gap-3 border-b border-border bg-background/95 px-3 backdrop-blur-md sm:px-4 lg:px-6">
      <button
        type="button"
        id="workspace-menu-trigger"
        onClick={onOpenMobile}
        aria-label="Open menu"
        aria-expanded={mobileOpen}
        aria-controls="workspace-mobile-navigation"
        aria-haspopup="dialog"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground lg:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>

      <div className="hidden min-w-0 shrink-0 items-center gap-2 text-[13px] md:flex">
        <span className="truncate font-medium text-foreground">{location.area}</span>
        {location.label !== location.area && (
          <>
            <span aria-hidden="true" className="text-subtle">
              /
            </span>
            <span className="truncate text-muted-foreground">{location.label}</span>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={openCommand}
        aria-label="Search symbols, pages and orders"
        className="ml-auto flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-md border border-border bg-panel/70 px-3 text-left transition-colors duration-200 hover:border-border-strong xl:max-w-[420px]"
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-subtle" />
        <span className="w-full truncate text-[13px] text-subtle">
          Search symbols, pages, orders…
        </span>
        <kbd className="hidden items-center gap-0.5 rounded border border-border px-1.5 py-0.5 font-sans text-[11px] text-subtle sm:flex">
          <Command className="h-3 w-3" />K
        </kbd>
      </button>

      <div className="flex shrink-0 items-center gap-1.5">
        <span
          title="All orders use virtual funds"
          className="hidden h-6 items-center rounded border border-primary/30 bg-primary/10 px-1.5 text-[11px] font-semibold tracking-wide text-primary-soft md:inline-flex"
        >
          PAPER
        </span>
        <ConnectionStatus />
        <span
          title="Regular NSE hours in Asia/Kolkata. Holidays and special sessions may differ; stock pages show provider status."
          className={cn(
            "hidden h-8 items-center gap-1.5 rounded-md px-2 text-[12px] xl:flex",
            open ? "text-positive" : "text-muted-foreground",
          )}
        >
          <span
            aria-hidden="true"
            className={cn("h-1.5 w-1.5 rounded-full", open ? "bg-positive" : "bg-subtle")}
          />
          {open ? "NSE open" : "NSE closed"}
        </span>
        <TopbarModeToggles />
        <button
          type="button"
          aria-label={`Notifications — ${triggered} triggered alerts`}
          title={`${triggered} triggered alerts`}
          onClick={() => void navigate({ to: "/app/$section", params: { section: "alerts" } })}
          className="relative flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
        >
          <Bell className="h-3.5 w-3.5" />
          {triggered > 0 && (
            <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-negative" />
          )}
        </button>
        {(location.area === "Portfolio" || pathname.startsWith("/app/stocks/")) && (
          <Button
            size="sm"
            onClick={() => openTicket()}
            className="hidden h-9 rounded-md bg-primary-action px-4 text-[13px] font-medium text-primary-foreground hover:bg-primary sm:inline-flex"
          >
            Paper trade
          </Button>
        )}
      </div>
    </header>
  );
}
