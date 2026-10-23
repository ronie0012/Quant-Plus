import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AREA_NAVIGATION,
  areaOverflow,
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
  const overflow = areaOverflow(location.area).filter((route) => !sections.includes(route.section));
  return (
    <nav
      aria-label={`${location.area} tools`}
      className="mb-4 flex min-w-0 items-end border-b border-border"
    >
      <ul className="-mb-px flex min-w-0 overflow-x-auto [scrollbar-width:none] max-sm:[mask-image:linear-gradient(to_right,black_85%,transparent)]">
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
                  "inline-flex min-h-10 items-center border-b-2 px-3 text-[13px] transition-colors",
                  active
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
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
      {overflow.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger className="mb-px inline-flex min-h-10 shrink-0 items-center gap-1 px-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground">
            More tools <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>{location.area}</DropdownMenuLabel>
            {overflow.map((route) => (
              <DropdownMenuItem key={route.section} asChild>
                <Link to="/app/$section" params={{ section: route.section }}>
                  {route.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </nav>
  );
}
