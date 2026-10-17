import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Bell, Command, Crosshair, Menu, Search, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTradingDesk } from "@/components/app/trading-desk-context";
import { usePriceAlerts } from "@/hooks/use-trading-product";
import { useWorkspacePrefs } from "@/hooks/use-workspace-prefs";
import { regularNseSession } from "@/lib/market-session";
import { workspaceLocationForPathname } from "@/components/app/workspace-routes";

/** The shell keeps the review-mode control, but gives it a distinct action label. */
function TopbarModeToggles() {
  const { workspace, save } = useWorkspacePrefs();
  const toggles = [
    {
      key: "focus_mode" as const,
      label: "Focus",
      icon: Crosshair,
      on: workspace.focus_mode,
      title: "Focus mode hides non-essential panels (F)",
    },
    {
      key: "review_mode" as const,
      label: "Plan gate",
      icon: ShieldCheck,
      on: workspace.review_mode,
      title: "Plan gate blocks new entries until a decision plan is complete (V)",
    },
  ];

  return (
    <span className="hidden items-center gap-1 md:flex">
      {toggles.map(({ key, label, icon: Icon, on, title }) => (
        <button
          key={key}
          type="button"
          title={title}
          aria-pressed={on}
          onClick={() => save.mutate({ [key]: !on })}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors",
            on
              ? "border-primary/60 bg-primary/10 text-primary-soft"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
        </button>
      ))}
    </span>
  );
}

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

  const location = workspaceLocationForPathname(pathname);
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
        <TopbarModeToggles />
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
          Paper trade
        </Button>
      </div>
    </header>
  );
}
