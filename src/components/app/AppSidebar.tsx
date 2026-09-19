import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BookOpen,
  Bot,
  Database,
  Gauge,
  History,
  HelpCircle,
  LayoutDashboard,
  LineChart,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  PieChart,
  BellRing,
  BookText,
  Rewind,
  ShieldAlert,
  Receipt,
  Settings,
  Star,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useSession, displayNameFrom } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

const groups = [
  {
    label: "Terminal",
    items: [
      { label: "Dashboard", to: "/app/dashboard", icon: LayoutDashboard },
      { label: "Markets", to: "/app/markets", icon: LineChart },
      { label: "Portfolio", to: "/app/portfolio", icon: PieChart },
      { label: "Watchlist", to: "/app/watchlist", icon: Star },
      { label: "Orders", to: "/app/orders", icon: Receipt },
      { label: "Wallet", to: "/app/wallet", icon: Wallet },
      { label: "Risk centre", to: "/app/risk", icon: ShieldAlert },
      { label: "Alerts", to: "/app/alerts", icon: BellRing },
      { label: "Research", to: "/app/research", icon: BookOpen },
      { label: "Decisions", to: "/app/decisions", icon: Gauge },
      { label: "History", to: "/app/history", icon: History },
      { label: "Journal", to: "/app/journal", icon: BookText },
      { label: "Replay", to: "/app/replay", icon: Rewind },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { label: "Quant AI", to: "/app/quant-ai", icon: Bot },
      { label: "Committee", to: "/app/committee", icon: Users },
      { label: "Agent activity", to: "/app/agent-activity", icon: Activity },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Settings", to: "/app/settings", icon: Settings },
      { label: "Data sources", to: "/app/data-sources", icon: Database },
      { label: "Help", to: "/app/help", icon: HelpCircle },
    ],
  },
] as const;

export function AppSidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { session } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  }

  const nav = (
    <nav
      aria-label="Terminal"
      className={cn(
        "flex h-full flex-col border-r border-border bg-surface/80 backdrop-blur-xl transition-[width] duration-500",
        collapsed ? "w-[76px]" : "w-[228px]",
      )}
    >
      <div className="flex h-[68px] items-center gap-2.5 border-b border-border px-4">
        <Link to="/app/dashboard" className="group flex min-w-0 items-center gap-2.5">
          <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
            <span className="absolute inset-0 border border-primary/70" aria-hidden="true" />
            <span className="h-1 w-1 bg-primary transition-transform duration-500 group-hover:scale-150" />
          </span>
          {!collapsed && (
            <span className="truncate font-mono text-[12px] tracking-[0.2em] uppercase">
              Quant<span className="text-primary-soft">+</span>
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="ml-auto hidden h-7 w-7 items-center justify-center text-subtle transition-colors hover:text-foreground lg:flex"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-3.5 w-3.5" />
          ) : (
            <PanelLeftClose className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close menu"
          className="ml-auto flex h-7 w-7 items-center justify-center text-subtle lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 py-4 [scrollbar-width:thin]">
        {groups.map((group) => (
          <div key={group.label} className="mb-5">
            {!collapsed && (
              <p className="px-2.5 pb-2 font-mono text-[9px] tracking-[0.22em] uppercase text-subtle">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.to;
                const slug = item.to.replace("/app/", "");
                const linkProps =
                  slug === "dashboard"
                    ? ({ to: "/app/dashboard" } as const)
                    : ({ to: "/app/$section", params: { section: slug } } as const);
                return (
                  <li key={item.to}>
                    <Link
                      {...linkProps}
                      onClick={onCloseMobile}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-[13px] transition-all duration-300",
                        active
                          ? "bg-primary/10 text-foreground"
                          : "text-muted-foreground hover:bg-panel hover:text-foreground",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute top-1.5 bottom-1.5 left-0 w-[2px] origin-center rounded-full bg-primary transition-transform duration-300",
                          active ? "scale-y-100" : "scale-y-0",
                        )}
                      />
                      <item.icon
                        className={cn(
                          "h-4 w-4 shrink-0 transition-colors",
                          active ? "text-primary-soft" : "text-subtle group-hover:text-foreground",
                        )}
                      />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-border p-3">
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-border bg-panel font-mono text-[11px] text-primary-soft">
            {displayNameFrom(session).slice(0, 1).toUpperCase()}
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px]">{displayNameFrom(session)}</p>
              <p className="truncate font-mono text-[9px] tracking-[0.18em] uppercase text-subtle">
                Simulated account
              </p>
            </div>
          )}
          {!collapsed && (
            <button
              type="button"
              onClick={signOut}
              aria-label="Sign out"
              className="text-subtle transition-colors hover:text-negative"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {collapsed && (
          <button
            type="button"
            onClick={signOut}
            aria-label="Sign out"
            className="mt-3 flex w-full justify-center text-subtle transition-colors hover:text-negative"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </nav>
  );

  return (
    <>
      <div className="sticky top-0 hidden h-screen shrink-0 lg:block">{nav}</div>

      <div
        className={cn(
          "fixed inset-0 z-50 transition-opacity duration-300 lg:hidden",
          mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <button
          type="button"
          aria-label="Close menu"
          onClick={onCloseMobile}
          className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        />
        <div
          className={cn(
            "absolute inset-y-0 left-0 transition-transform duration-500",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {nav}
        </div>
      </div>
    </>
  );
}
