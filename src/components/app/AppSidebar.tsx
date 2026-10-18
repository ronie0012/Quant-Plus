import { useEffect, useRef } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  Compass,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  MoreHorizontal,
  PieChart,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  PRIMARY_WORKSPACE_ROUTES,
  workspaceLocationForPathname,
} from "@/components/app/workspace-routes";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useSession, displayNameFrom } from "@/hooks/use-session";
import { cn } from "@/lib/utils";
import { signOutWorkspace } from "@/lib/workspace-session";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  learn: GraduationCap,
  markets: Compass,
  portfolio: PieChart,
  journal: BookOpen,
  more: MoreHorizontal,
};

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
  const location = workspaceLocationForPathname(pathname);
  const { session } = useSession();
  const hosted = session?.mode === "hosted";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mobileRef = useRef<HTMLDivElement>(null);
  // The mobile drawer takes focus when it opens.
  useEffect(() => {
    if (mobileOpen) mobileRef.current?.querySelector<HTMLElement>("nav a")?.focus();
  }, [mobileOpen]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    // Hosted sessions are revoked; the local profile has no credentials to revoke.
    await signOutWorkspace();
    void navigate({ to: "/", replace: true });
  }

  const nav = (
    <nav
      aria-label="Primary areas"
      className={cn(
        "flex h-full flex-col border-r border-border bg-surface transition-[width] duration-300",
        collapsed ? "w-[68px]" : "w-[232px]",
      )}
    >
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <Link to="/app/dashboard" className="group flex min-w-0 items-center gap-2.5">
          <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
            <span className="absolute inset-0 border border-primary/70" aria-hidden="true" />
            <span className="h-1 w-1 bg-primary transition-transform duration-500 group-hover:scale-150" />
          </span>
          {!collapsed && (
            <span className="truncate text-[15px] font-semibold tracking-tight">
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

      <div className="flex-1 overflow-y-auto px-2.5 py-3 [scrollbar-width:thin]">
        <ul className="space-y-0.5" aria-label="Primary areas">
          {PRIMARY_WORKSPACE_ROUTES.map((route) => {
            const active = route.area === location.area;
            const Icon = ICONS[route.section] ?? LayoutDashboard;
            const linkProps =
              route.section === "dashboard"
                ? ({ to: "/app/dashboard" } as const)
                : ({ to: "/app/$section", params: { section: route.section } } as const);
            return (
              <li key={route.section}>
                <Link
                  {...linkProps}
                  aria-current={active ? "page" : undefined}
                  aria-label={collapsed ? route.label : undefined}
                  onClick={onCloseMobile}
                  title={collapsed ? route.label : undefined}
                  className={cn(
                    "group relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors duration-150",
                    collapsed && "justify-center px-0",
                    active
                      ? "bg-primary/12 font-medium text-foreground"
                      : "text-muted-foreground hover:bg-panel hover:text-foreground",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute top-1.5 bottom-1.5 left-0 w-[2px] origin-center rounded-full bg-primary transition-transform duration-200",
                      active ? "scale-y-100" : "scale-y-0",
                    )}
                  />
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors",
                      active ? "text-primary-soft" : "text-subtle group-hover:text-foreground",
                    )}
                  />
                  {!collapsed && <span className="truncate">{route.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t border-border p-3">
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[12px] font-semibold text-primary-soft">
            {displayNameFrom(session).slice(0, 1).toUpperCase()}
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{displayNameFrom(session)}</p>
              <p className="truncate text-[12px] text-subtle">
                {hosted ? "Hosted paper account" : "Local paper account"}
              </p>
            </div>
          )}
          {!collapsed && (
            <button
              type="button"
              onClick={signOut}
              aria-label={hosted ? "Sign out" : "Leave local terminal"}
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
            aria-label={hosted ? "Sign out" : "Leave local terminal"}
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
      <div className="vt-app-sidebar sticky top-0 hidden h-screen shrink-0 lg:block">{nav}</div>

      <div
        ref={mobileRef}
        inert={!mobileOpen}
        aria-hidden={!mobileOpen}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCloseMobile();
        }}
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
