import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { useDocumentProgress } from "@/hooks/use-landing-live";
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
  const [ready, setReady] = useState(false);
  const progress = useDocumentProgress();
  const destination = useRef<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setReady(true);
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
          <li>
            <Link
              to="/app/$section"
              params={{ section: "learn" }}
              className="group relative font-mono text-[11px] tracking-[0.2em] uppercase text-muted-foreground transition-colors duration-300 hover:text-foreground"
            >
              Learn
              <span
                aria-hidden="true"
                className="absolute -bottom-1.5 left-0 h-px w-0 bg-primary transition-all duration-500 group-hover:w-full"
              />
            </Link>
          </li>
        </ul>

        <div className="hidden items-center gap-6 md:flex">
          <Link
            to="/app/dashboard"
            className="font-mono text-[11px] tracking-[0.2em] uppercase text-muted-foreground transition-colors duration-300 hover:text-foreground"
          >
            Open paper terminal
          </Link>
          <Link
            to="/auth"
            className="group flex items-center gap-2 border border-border-strong px-4 py-2 font-mono text-[11px] tracking-[0.2em] uppercase transition-colors duration-500 hover:border-primary hover:text-primary-soft"
          >
            Get Started
            <span
              aria-hidden="true"
              className="h-px w-4 bg-border-strong transition-all duration-500 group-hover:w-6 group-hover:bg-primary"
            />
          </Link>
        </div>

        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={open}
              id="landing-menu-trigger"
              ref={triggerRef}
              disabled={!ready}
              className="flex h-9 w-9 items-center justify-center border border-border-strong text-muted-foreground transition-colors hover:text-foreground md:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
          </Dialog.Trigger>

          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-[60] bg-background/80 md:hidden" />
            <Dialog.Content
              aria-label="Explore Quant Plus"
              aria-describedby="landing-mobile-nav-description"
              className="fixed inset-x-0 top-14 bottom-0 z-[61] border-t border-border bg-background/97 backdrop-blur-xl md:hidden"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (destination.current) {
                  destination.current = null;
                  window.setTimeout(() => {
                    document.getElementById("main-content")?.focus({ preventScroll: true });
                  }, 0);
                  return;
                }
                window.setTimeout(() => {
                  triggerRef.current?.focus({ preventScroll: true });
                }, 0);
              }}
            >
              <div className="flex h-full flex-col justify-between px-5 py-8">
                <div>
                  <div className="flex items-center justify-between gap-4">
                    <Dialog.Title className="font-mono text-sm tracking-[0.14em] uppercase">
                      Explore Quant Plus
                    </Dialog.Title>
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        aria-label="Close menu"
                        className="grid h-9 w-9 shrink-0 place-items-center border border-border-strong"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </Dialog.Close>
                  </div>
                  <Dialog.Description id="landing-mobile-nav-description" className="sr-only">
                    Explore markets, research and the paper terminal.
                  </Dialog.Description>
                  <nav aria-label="Mobile primary" className="mt-8 flex flex-col">
                    {links.map((link, i) => (
                      <Link
                        key={link.to}
                        to={link.to}
                        onClick={() => {
                          destination.current = link.to;
                          setOpen(false);
                        }}
                        className="flex items-baseline justify-between border-b border-border py-5 text-3xl tracking-tight"
                      >
                        {link.label}
                        <span aria-hidden="true" className="label-tech">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                      </Link>
                    ))}
                    <Link
                      to="/app/$section"
                      params={{ section: "learn" }}
                      onClick={() => {
                        destination.current = "/app/learn";
                        setOpen(false);
                      }}
                      className="flex items-baseline justify-between border-b border-border py-5 text-3xl tracking-tight"
                    >
                      Learn
                      <span aria-hidden="true" className="label-tech">
                        05
                      </span>
                    </Link>
                  </nav>
                </div>
                <div className="flex flex-col gap-3">
                  <Link
                    to="/auth"
                    onClick={() => {
                      destination.current = "/auth";
                      setOpen(false);
                    }}
                    className="flex items-center justify-center border border-primary-soft bg-primary-action px-6 py-4 font-mono text-[11px] tracking-[0.2em] uppercase text-primary-foreground"
                  >
                    Get Started
                  </Link>
                  <Link
                    to="/app/dashboard"
                    onClick={() => {
                      destination.current = "/app/dashboard";
                      setOpen(false);
                    }}
                    className="flex items-center justify-center border border-border-strong px-6 py-4 font-mono text-[11px] tracking-[0.2em] uppercase text-muted-foreground"
                  >
                    Open paper terminal
                  </Link>
                </div>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </nav>

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
