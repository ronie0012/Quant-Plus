import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { getWorkspaceSession, WORKSPACE_SESSION_CHANGED } from "@/lib/workspace-session";
import { AppSidebar } from "@/components/app/AppSidebar";
import { AppTopbar } from "@/components/app/AppTopbar";
import { QuantAIDock } from "@/components/app/QuantAIDock";
import { TradingDeskProvider } from "@/components/app/TradingDesk";
import { OnboardingFlow } from "@/components/app/learn/OnboardingFlow";
import { TradingMonitor } from "@/components/app/TradingMonitor";
import { ConnectionStatus } from "@/components/app/ConnectionStatus";
import { WorkspaceNavigation } from "@/components/app/WorkspaceNavigation";
import { workspaceLocationForPathname } from "@/components/app/workspace-routes";
import { safeWorkspaceReturn } from "@/lib/workspace-return";
import { cn } from "@/lib/utils";
import { useTradingPreferences } from "@/hooks/use-trading-product";
import { useWorkspacePrefs } from "@/hooks/use-workspace-prefs";
import {
  BandwidthPolicy,
  OfflineSnapshot,
  ServiceWorkerRegistrar,
} from "@/components/app/ShellExtras";

/** Sidebar + topbar application shell for every authenticated screen. */
export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  // Remember the sidebar width between visits.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("qp:sidebar-collapsed") === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);
  const toggleCollapsed = () =>
    setCollapsed((value) => {
      try {
        localStorage.setItem("qp:sidebar-collapsed", value ? "0" : "1");
      } catch {
        /* storage unavailable */
      }
      return !value;
    });
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: preferences } = useTradingPreferences();
  const { workspace } = useWorkspacePrefs();
  const client = useQueryClient();
  const navigate = useNavigate();
  useEffect(() => {
    let active = true;
    const check = () => {
      void getWorkspaceSession()
        .then((session) => {
          if (!active || session) return;
          void client.cancelQueries();
          client.clear();
          void navigate({
            to: "/auth",
            search: {
              redirect: safeWorkspaceReturn(window.location.pathname + window.location.search),
            },
            replace: true,
          });
        })
        .catch(() => {
          /* transient auth failures do not erase the workspace */
        });
    };
    const changed = () => {
      void client.cancelQueries();
      client.clear();
      check();
    };
    check();
    window.addEventListener(WORKSPACE_SESSION_CHANGED, changed);
    return () => {
      active = false;
      window.removeEventListener(WORKSPACE_SESSION_CHANGED, changed);
    };
  }, [client, navigate]);

  return (
    <TradingDeskProvider>
      <div
        className={cn(
          "app-ui relative min-h-screen bg-background text-foreground",
          preferences?.calm_mode && "calm-mode",
          preferences?.density === "COMPACT" && "compact-mode",
          workspace.focus_mode && "focus-mode",
          workspace.low_bandwidth && "low-bandwidth",
        )}
      >
        <div className="relative z-10 flex min-h-screen">
          <AppSidebar
            collapsed={collapsed}
            onToggle={toggleCollapsed}
            mobileOpen={mobileOpen}
            onCloseMobile={() => setMobileOpen(false)}
          />

          <div className="flex min-w-0 flex-1 flex-col">
            <AppTopbar onOpenMobile={() => setMobileOpen(true)} mobileOpen={mobileOpen} />
            <main
              id="main-content"
              tabIndex={-1}
              className="min-w-0 flex-1 px-4 pt-4 pb-28 outline-none sm:px-6 sm:pt-5 lg:px-8"
            >
              <div className="mx-auto w-full max-w-[1560px]">
                {!["Learn", "More"].includes(workspaceLocationForPathname(pathname).area) && (
                  <ConnectionStatus />
                )}
                <WorkspaceNavigation />
                {children}
              </div>
            </main>
          </div>
        </div>

        {!["Learn", "More"].includes(workspaceLocationForPathname(pathname).area) &&
          !workspace.focus_mode && <QuantAIDock />}
        <ServiceWorkerRegistrar />
        <BandwidthPolicy />
        <OfflineSnapshot />
        <OnboardingFlow />
        <TradingMonitor />
      </div>
    </TradingDeskProvider>
  );
}
