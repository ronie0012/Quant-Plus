import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, BarChart3, Bell, Bot, BriefcaseBusiness, ChevronRight, CircleHelp, Command, Database, FileClock, Gauge, LayoutDashboard, Menu, Newspaper, Search, Settings, ShieldCheck, Sparkles, Star, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const groups = [
  { label: "Overview", items: [["Dashboard", "/dashboard", LayoutDashboard], ["Research", "/dashboard", BriefcaseBusiness], ["Watchlist", "/dashboard", Star], ["Decisions", "/dashboard", FileClock]] },
  { label: "Market", items: [["Market overview", "/dashboard", BarChart3], ["Sectors", "/dashboard", Gauge], ["News", "/dashboard", Newspaper]] },
  { label: "Committee", items: [["Run analysis", "/dashboard", Sparkles], ["Agent activity", "/dashboard", Activity], ["Case studies", "/dashboard", Users]] },
  { label: "System", items: [["Settings", "/dashboard", Settings], ["API / Data status", "/dashboard", Database], ["Help", "/dashboard", CircleHelp]] },
] as const;

const searchResults = [
  ["RELIANCE", "Reliance Industries", "Energy"], ["TCS", "Tata Consultancy Services", "Technology"], ["INFY", "Infosys", "Technology"], ["HDFCBANK", "HDFC Bank", "Financials"], ["ICICIBANK", "ICICI Bank", "Financials"],
];

export function AppShell({ children, email }: { children: ReactNode; email?: string }) {
  const [mobile, setMobile] = useState(false);
  const [palette, setPalette] = useState(false);
  const [query, setQuery] = useState("");
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setPalette((value) => !value); } if (event.key === "Escape") setPalette(false); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);
  const results = searchResults.filter((item) => `${item[0]} ${item[1]} ${item[2]}`.toLowerCase().includes(query.toLowerCase()));
  const signOut = async () => { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); };
  const sidebar = <aside className="flex h-full w-[236px] shrink-0 flex-col border-r border-border bg-surface/95 p-4">
    <Link to="/" className="flex h-12 items-center gap-2.5 px-2"><span className="grid h-6 w-6 place-items-center border border-primary/60"><span className="h-1.5 w-1.5 bg-primary" /></span><span className="font-mono text-xs tracking-[0.2em]">QUANT<span className="text-primary-soft">+</span></span></Link>
    <nav className="mt-5 flex-1 space-y-5 overflow-y-auto">
      {groups.map((group, groupIndex) => <div key={group.label}><p className="px-2 font-mono text-[9px] uppercase tracking-[0.2em] text-subtle">{group.label}</p><div className="mt-2 space-y-1">{group.items.map(([label, to, Icon], index) => { const active = groupIndex === 0 && index === 0 && pathname === "/dashboard"; return <Link key={label} to={to} onClick={() => setMobile(false)} className={cn("group relative flex h-9 items-center gap-3 rounded-md px-2.5 text-xs text-muted-foreground transition-all hover:bg-panel hover:text-foreground", active && "bg-panel-elevated text-foreground")}><Icon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />{active && <motion.span layoutId="active-nav" className="absolute inset-y-2 left-0 w-px bg-primary" />}<span>{label}</span></Link>; })}</div></div>)}
    </nav>
    <button type="button" onClick={signOut} className="flex items-center gap-3 border-t border-border px-2 pt-4 text-left text-xs text-muted-foreground hover:text-foreground"><span className="grid h-8 w-8 place-items-center rounded-full bg-panel-elevated font-mono text-[10px] text-primary-soft">{(email?.[0] ?? "Q").toUpperCase()}</span><span className="min-w-0 flex-1 truncate">{email ?? "Quant member"}</span><ChevronRight className="h-3 w-3" /></button>
  </aside>;

  return <div className="app-ambient min-h-screen bg-background text-foreground">
    <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">{sidebar}</div>
    <AnimatePresence>{mobile && <><motion.button aria-label="Close navigation" className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={() => setMobile(false)} /><motion.div className="fixed inset-y-0 left-0 z-50 lg:hidden" initial={{x:-250}} animate={{x:0}} exit={{x:-250}} transition={{type:"spring", damping:28, stiffness:260}}>{sidebar}</motion.div></>}</AnimatePresence>
    <div className="lg:pl-[236px]">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-xl sm:px-6">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobile(true)} aria-label="Open navigation"><Menu /></Button>
        <div className="hidden items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-subtle sm:flex"><span>Quant Plus</span><span>/</span><span className="text-muted-foreground">Overview</span></div>
        <button type="button" onClick={() => setPalette(true)} className="mx-auto flex h-9 w-full max-w-md items-center gap-2 rounded-md border border-border bg-panel/80 px-3 text-left text-xs text-subtle transition-colors hover:border-border-strong"><Search className="h-3.5 w-3.5"/><span className="truncate">Search ticker, company or command…</span><span className="ml-auto hidden rounded-sm border border-border px-1.5 py-0.5 font-mono text-[9px] sm:block">⌘K</span></button>
        <div className="hidden items-center gap-2 font-mono text-[9px] text-positive xl:flex"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-positive"/>NSE OPEN</div>
        <Button variant="ghost" size="icon" aria-label="Notifications"><Bell /></Button>
      </header>
      {children}
    </div>
    <AnimatePresence>{palette && <motion.div className="fixed inset-0 z-[70] flex items-start justify-center bg-background/75 px-4 pt-[12vh] backdrop-blur-md" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onMouseDown={(event) => { if (event.target === event.currentTarget) setPalette(false); }}><motion.div className="w-full max-w-xl overflow-hidden rounded-lg border border-border-strong bg-panel-elevated shadow-2xl" initial={{opacity:0, y:-16, scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-10,scale:.98}}><div className="flex items-center gap-3 border-b border-border px-4"><Search className="h-4 w-4 text-primary-soft"/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search markets and commands" className="h-14 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"/><Button variant="ghost" size="icon" onClick={() => setPalette(false)}><X /></Button></div><div className="p-2"><p className="px-2 py-2 font-mono text-[9px] uppercase tracking-[0.18em] text-subtle">Indian equities · Demo directory</p>{results.map(([ticker, company, sector]) => <button key={ticker} type="button" onClick={() => { setPalette(false); setQuery(""); }} className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left hover:bg-background"><span className="grid h-8 w-8 place-items-center rounded bg-primary/10 font-mono text-[9px] text-primary-soft">{ticker.slice(0,2)}</span><span><span className="block font-mono text-xs">{ticker}</span><span className="mt-1 block text-[11px] text-subtle">{company} · {sector}</span></span><Command className="ml-auto h-3.5 w-3.5 text-subtle"/></button>)}</div></motion.div></motion.div>}</AnimatePresence>
  </div>;
}