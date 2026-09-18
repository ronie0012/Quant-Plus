import { useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { AppSidebar } from "@/components/app/AppSidebar";
import { AppTopbar } from "@/components/app/AppTopbar";
import { QuantAIDock } from "@/components/app/QuantAIDock";
import { TradingDeskProvider } from "@/components/app/TradingDesk";
import { WalletGate } from "@/components/app/WalletGate";
import { cn } from "@/lib/utils";

/** Sidebar + topbar application shell for every authenticated screen. */
export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <TradingDeskProvider>
    <div className="relative min-h-screen bg-background">
      {/* ambient lighting */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(1100px 520px at 18% -10%, color-mix(in oklab, var(--color-primary) 16%, transparent), transparent 70%), radial-gradient(900px 480px at 92% 0%, color-mix(in oklab, var(--color-primary-soft) 8%, transparent), transparent 72%)",
        }}
      />

      <div className="relative z-10 flex min-h-screen">
        <AppSidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <AppTopbar onOpenMobile={() => setMobileOpen(true)} />
          <main className={cn("min-w-0 flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-8")}>
            <div className="mx-auto w-full max-w-[1600px]">{children}</div>
          </main>
        </div>
      </div>

      {pathname !== "/app/quant-ai" && <QuantAIDock />}
      <WalletGate />
    </div>
    </TradingDeskProvider>
  );
}
