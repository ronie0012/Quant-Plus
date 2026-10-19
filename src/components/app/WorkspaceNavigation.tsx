import { Link, useRouterState } from "@tanstack/react-router";
import {
  AREA_NAVIGATION,
  resolveWorkspaceRoute,
  workspaceLocationForPathname,
} from "./workspace-routes";
import { cn } from "@/lib/utils";

/** Tools appear beside the journey they support, not in one undifferentiated menu. */
export function WorkspaceNavigation() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const location = workspaceLocationForPathname(pathname);
  const sections = [...AREA_NAVIGATION[location.area]];
  if (location.route && !sections.includes(location.route.section))
    sections.push(location.route.section);
  return (
    <nav aria-label={`${location.area} tools`} className="mb-6 min-w-0 border-b border-border">
      <ul className="flex min-w-0 gap-1 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {sections.map((section) => {
          const route = resolveWorkspaceRoute(section);
          if (!route) return null;
          const active = route.section === location.route?.section;
          return (
            <li key={section} className="shrink-0">
              <Link
                to="/app/$section"
                params={{ section }}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-md px-3 text-sm transition-colors",
                  active
                    ? "bg-primary/10 font-medium text-primary-soft"
                    : "text-muted-foreground hover:bg-panel hover:text-foreground",
                )}
              >
                {route.section === "markets"
                  ? "Market overview"
                  : route.section === "journal"
                    ? "Decision journal"
                    : route.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
