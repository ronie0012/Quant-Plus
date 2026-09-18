import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useDocumentProgress } from "@/hooks/use-live";
import { cn } from "@/lib/utils";

const links = [
  { label: "Markets", to: "/markets" },
  { label: "Research", to: "/research" },
  { label: "AI", to: "/ai" },
  { label: "Platform", to: "/platform" },
] as const;

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const progress = useDocumentProgress();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-500",
        scrolled
          ? "border-b border-border bg-background/72 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <nav
        aria-label="Primary"
        className="mx-auto flex h-14 w-full max-w-[1400px] items-center justify-between px-5 sm:px-8 lg:px-12"
      >
        <Link to="/" className="group flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <span className="relative flex h-4 w-4 items-center justify-center">
            <span className="absolute inset-0 border border-primary/70" aria-hidden="true" />
            <span className="h-1 w-1 bg-primary transition-transform duration-500 group-hover:scale-150" />
          </span>
          <span className="font-mono text-[13px] tracking-[0.2em] uppercase">
            Quant<span className="text-primary-soft">+</span>
          </span>
        </Link>

        <ul className="hidden items-center gap-9 md:flex">
          {links.map((link) => (
            <li key={link.to}>
              <Link
                to={link.to}
                className="group relative font-mono text-[11px] tracking-[0.2em] uppercase text-muted-foreground transition-colors duration-300 hover:text-foreground"
                activeProps={{ className: "text-foreground" }}
              >
                {link.label}
                <span
                  aria-hidden="true"
                  className="absolute -bottom-1.5 left-0 h-px w-0 bg-primary transition-all duration-500 group-hover:w-full"
                />
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-6 md:flex">
          <button
            type="button"
            className="font-mono text-[11px] tracking-[0.2em] uppercase text-muted-foreground transition-colors duration-300 hover:text-foreground"
          >
            Log in
          </button>
          <Link
            to="/platform"
            className="group flex items-center gap-2 border border-border-strong px-4 py-2 font-mono text-[11px] tracking-[0.2em] uppercase transition-colors duration-500 hover:border-primary hover:text-primary-soft"
          >
            Get Started
            <span
              aria-hidden="true"
              className="h-px w-4 bg-border-strong transition-all duration-500 group-hover:w-6 group-hover:bg-primary"
            />
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center border border-border-strong text-muted-foreground transition-colors hover:text-foreground md:hidden"
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </nav>

      <div
        className={cn(
          "fixed inset-x-0 top-14 bottom-0 z-40 border-t border-border bg-background/97 backdrop-blur-xl transition-all duration-500 md:hidden",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <div className="flex h-full flex-col justify-between px-5 py-10">
          <ul className="flex flex-col">
            {links.map((link, i) => (
              <li key={link.to} className="border-b border-border">
                <Link
                  to={link.to}
                  onClick={() => setOpen(false)}
                  className="flex items-baseline justify-between py-5 text-3xl tracking-tight"
                >
                  {link.label}
                  <span className="label-tech">{String(i + 1).padStart(2, "0")}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-3">
            <Link
              to="/platform"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center border border-primary bg-primary px-6 py-4 font-mono text-[11px] tracking-[0.2em] uppercase text-primary-foreground"
            >
              Get Started
            </Link>
            <button
              type="button"
              className="border border-border-strong px-6 py-4 font-mono text-[11px] tracking-[0.2em] uppercase text-muted-foreground"
            >
              Log in
            </button>
          </div>
        </div>
      </div>

      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-x-0 bottom-0 h-px origin-left bg-primary transition-opacity duration-500",
          scrolled ? "opacity-100" : "opacity-0",
        )}
        style={{ transform: `scaleX(${progress})` }}
      />
    </header>
  );
}
