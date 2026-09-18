import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Bell, Command, Menu, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTradingDesk } from "@/components/app/TradingDesk";

function marketOpen(now: Date) {
  const day = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  return day >= 1 && day <= 5 && mins >= 555 && mins <= 930; // 09:15–15:30 local
}

export function AppTopbar({ onOpenMobile }: { onOpenMobile: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [now, setNow] = useState<Date | null>(null);
  const { openCommand, openTicket } = useTradingDesk();

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  const section = (pathname.split("/")[2] ?? "dashboard").replace(/-/g, " ");
  const open = now ? marketOpen(now) : false;

  return (
    <header className="sticky top-0 z-30 flex h-[68px] items-center gap-3 border-b border-border bg-background/75 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onOpenMobile}
        aria-label="Open menu"
        className="flex h-9 w-9 items-center justify-center border border-border text-muted-foreground transition-colors hover:text-foreground lg:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>

      <div className="hidden min-w-0 items-center gap-2 font-mono text-[10px] tracking-[0.2em] uppercase text-subtle sm:flex">
        <span className="text-muted-foreground">Quant+</span>
        <span aria-hidden="true">/</span>
        <span className="truncate text-foreground">{section}</span>
      </div>

      <button type="button" onClick={openCommand} className="ml-auto flex h-10 w-full max-w-[420px] items-center gap-2.5 border border-border bg-panel/70 px-3 text-left transition-colors duration-300 hover:border-border-strong">
        <Search className="h-3.5 w-3.5 shrink-0 text-subtle" />
        <span className="w-full truncate text-[13px] text-subtle">Search stocks, markets or analysis...</span>
        <span className="hidden items-center gap-1 font-mono text-[9px] tracking-[0.14em] text-subtle sm:flex">
          <Command className="h-3 w-3" />K
        </span>
      </button>

      <div className="ml-auto flex items-center gap-3 sm:gap-4">
        <Button size="sm" onClick={() => openTicket()} className="hidden h-9 font-mono text-[10px] tracking-[0.14em] uppercase sm:inline-flex">Trade</Button>
        <span
          className={cn(
            "hidden items-center gap-2 border border-border px-2.5 py-1.5 font-mono text-[9px] tracking-[0.18em] uppercase md:flex",
            open ? "text-positive" : "text-muted-foreground",
          )}
        >
          <span
            aria-hidden="true"
            className={cn("h-1.5 w-1.5", open ? "animate-pulse bg-positive" : "bg-subtle")}
          />
          {open ? "Market open" : "Market closed"}
        </span>

        <button
          type="button"
          aria-label="Notifications — no new notifications"
          title="No new notifications"
          className="flex h-9 w-9 items-center justify-center border border-border text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
        >
          <Bell className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}
