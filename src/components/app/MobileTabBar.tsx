import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  Compass,
  LayoutDashboard,
  MoreHorizontal,
  PieChart,
  type LucideIcon,
} from "lucide-react";
import {
  PRIMARY_WORKSPACE_ROUTES,
  workspaceLocationForPathname,
} from "@/components/app/workspace-routes";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  markets: Compass,
  portfolio: PieChart,
  journal: BookOpen,
  more: MoreHorizontal,
};

/** Thumb-reach navigation for phones; the sidebar takes over from the lg breakpoint. */
export function MobileTabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const location = workspaceLocationForPathname(pathname);
  return (
    <nav
      aria-label="Quick navigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {PRIMARY_WORKSPACE_ROUTES.map((route) => {
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
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] transition-colors",
                  active ? "text-primary-soft" : "text-subtle hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {route.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
