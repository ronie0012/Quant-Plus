import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  Compass,
  LayoutDashboard,
  GraduationCap,
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
  const [signOutError, setSignOutError] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const resize = () => {
      if (desktop.matches) onCloseMobile();
    };
    desktop.addEventListener("change", resize);
    return () => desktop.removeEventListener("change", resize);
  }, [onCloseMobile]);

  async function signOut() {
    setSigningOut(true);
    setSignOutError(false);
    try {
      await signOutWorkspace();
      await queryClient.cancelQueries();
      queryClient.clear();
      void navigate({ to: "/", replace: true });
    } catch {
      setSignOutError(true);
    } finally {
      setSigningOut(false);
    }
  }

  const nav = (compact: boolean, mobile = false) => (
    <nav
      aria-label="Primary areas"
      className={cn(
        "flex h-full flex-col border-r border-border bg-surface transition-[width] duration-300",
        mobile ? "w-full" : compact ? "w-[76px]" : "w-[224px]",
      )}
    >
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <Link
          to="/app/dashboard"
          aria-label="Quant Plus home"
          onClick={onCloseMobile}
          className={cn("group min-h-11 min-w-0 items-center gap-2.5", compact ? "hidden" : "flex")}
        >
          <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
            <span className="absolute inset-0 border border-primary/70" aria-hidden="true" />
            <span className="h-1 w-1 bg-primary transition-transform duration-500 group-hover:scale-150" />
          </span>
          {!compact && (
            <span className="truncate text-[15px] font-semibold tracking-tight">
              Quant<span className="text-primary-soft">+</span>
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={onToggle}
          aria-label={compact ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "ml-auto h-9 w-9 shrink-0 items-center justify-center rounded-md text-subtle transition-colors hover:bg-panel hover:text-foreground",
            mobile ? "hidden" : "hidden lg:flex",
          )}
        >
          {compact ? (
            <PanelLeftOpen className="h-3.5 w-3.5" />
          ) : (
            <PanelLeftClose className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close menu"
          className={cn(
            "ml-auto h-11 w-11 items-center justify-center rounded-md text-subtle hover:bg-panel hover:text-foreground",
            mobile ? "flex" : "hidden",
          )}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 py-3 [scrollbar-width:thin]">
        <ul className="space-y-0.5" aria-label="Primary areas">
          {PRIMARY_WORKSPACE_ROUTES.map((route) => {
            // Learning belongs to Home in the hierarchy: new users reach it from there.
            const active =
              route.area === location.area || (location.area === "Learn" && route.area === "Home");
            const Icon = ICONS[route.section] ?? LayoutDashboard;
            const linkProps =
              route.section === "dashboard"
                ? ({ to: "/app/dashboard" } as const)
                : ({ to: "/app/$section", params: { section: route.section } } as const);
            return (
              <li key={route.section}>
                <Link
                  {...linkProps}
                  aria-current={
                    active
                      ? location.route?.section === route.section
                        ? "page"
                        : "location"
                      : undefined
                  }
                  aria-label={compact ? route.label : undefined}
                  onClick={onCloseMobile}
                  title={compact ? route.label : undefined}
                  className={cn(
                    "group relative flex min-h-11 items-center gap-2.5 rounded-md px-3 text-[13px] transition-colors duration-150",
                    compact && "justify-center px-0",
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
                  {!compact && <span className="truncate">{route.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-6 border-t border-border pt-4">
          <Link
            to="/app/$section"
            params={{ section: "learn" }}
            onClick={onCloseMobile}
            aria-label={compact ? "Learn & practise" : undefined}
            aria-current={location.area === "Learn" ? "location" : undefined}
            title={compact ? "Learn & practise" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-2.5 rounded-md px-3 text-sm transition-colors",
              compact && "justify-center px-0",
              location.area === "Learn"
                ? "bg-primary/10 text-primary-soft"
                : "text-muted-foreground hover:bg-panel hover:text-foreground",
            )}
          >
            <GraduationCap aria-hidden="true" className="h-4 w-4 shrink-0" />
            {!compact && <span>Learn & practise</span>}
          </Link>
          {!compact && (
            <p className="px-3 pt-2 text-xs leading-relaxed text-subtle">
              Build confidence before making a paper decision.
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-border p-3">
        <div className={cn("flex items-center gap-3", compact && "justify-center")}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[12px] font-semibold text-primary-soft">
            {displayNameFrom(session).slice(0, 1).toUpperCase()}
          </span>
          {!compact && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium">{displayNameFrom(session)}</p>
              <p className="truncate text-[12px] text-subtle">
                {hosted ? "Hosted paper account" : "Local paper account"}
              </p>
            </div>
          )}
          {!compact && (
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              aria-label={hosted ? "Sign out" : "Leave local terminal"}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-subtle transition-colors hover:bg-panel hover:text-negative disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {compact && (
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            aria-label={hosted ? "Sign out" : "Leave local terminal"}
            className="mt-3 flex min-h-11 w-full items-center justify-center rounded-md text-subtle transition-colors hover:bg-panel hover:text-negative disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        )}
        {signOutError && (
          <p role="alert" className="mt-2 text-xs text-negative">
            Sign out failed. Please retry.
          </p>
        )}
      </div>
    </nav>
  );

  return (
    <>
      <div className="vt-app-sidebar sticky top-0 hidden h-dvh shrink-0 lg:block">
        {nav(collapsed)}
      </div>
      <DialogPrimitive.Root
        open={mobileOpen}
        onOpenChange={(open) => {
          if (!open) onCloseMobile();
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
          <DialogPrimitive.Content
            id="workspace-mobile-navigation"
            className="fixed inset-y-0 left-0 z-50 w-[min(300px,calc(100vw-3rem))] outline-none"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              document.getElementById("workspace-menu-trigger")?.focus();
            }}
          >
            <DialogPrimitive.Title className="sr-only">Workspace navigation</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Choose an area or continue learning.
            </DialogPrimitive.Description>
            {nav(false, true)}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
