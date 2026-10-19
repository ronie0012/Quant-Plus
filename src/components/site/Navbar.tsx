import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { PrimaryAction } from "./primitives";

const links = [
  { label: "Platform", to: "/platform" },
  { label: "Markets", to: "/markets" },
  { label: "Research", to: "/research" },
  { label: "AI Analyst", to: "/ai" },
] as const;

const navLink =
  "inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-soft [&[aria-current=page]]:text-primary-soft [&[aria-current=page]]:underline [&[aria-current=page]]:underline-offset-8";

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const destination = useRef<string | null>(null);

  useEffect(() => {
    setReady(true);
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  const follow = (to: string) => {
    destination.current = to === pathname ? null : to;
    setOpen(false);
  };

  return (
    <header className="vt-site-nav fixed inset-x-0 top-0 z-50 border-b border-border bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center justify-between gap-6 px-5 sm:px-8 lg:px-12">
        <Link
          to="/"
          aria-label="Quant Plus home"
          className="inline-flex min-h-11 shrink-0 items-center gap-2.5"
        >
          <span
            aria-hidden="true"
            className="grid h-4 w-4 place-items-center border border-primary-soft"
          >
            <span className="h-1 w-1 bg-primary-soft" />
          </span>
          <span className="font-mono text-sm tracking-[0.18em] uppercase">
            Quant<span className="text-primary-soft">+</span>
          </span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-7 lg:flex">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              aria-current={pathname === link.to ? "page" : undefined}
              className={navLink}
            >
              {link.label}
            </Link>
          ))}
          <Link
            to="/app/$section"
            params={{ section: "learn" }}
            preload={false}
            className={navLink}
          >
            Learn
          </Link>
        </nav>

        <div className="hidden lg:block">
          <PrimaryAction to="/app/dashboard">Open paper terminal</PrimaryAction>
        </div>

        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>
            <button
              type="button"
              aria-label="Open menu"
              disabled={!ready}
              className="grid h-11 w-11 place-items-center border border-border-strong text-foreground lg:hidden"
            >
              <Menu aria-hidden="true" className="h-5 w-5" />
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-[60] bg-background/80" />
            <Dialog.Content
              aria-describedby="mobile-nav-description"
              className="fixed inset-y-0 right-0 z-[61] flex w-full max-w-sm flex-col overflow-y-auto border-l border-border bg-background px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:px-8"
              onCloseAutoFocus={(event) => {
                if (window.matchMedia("(min-width: 1024px)").matches) {
                  event.preventDefault();
                  const current = document.querySelector<HTMLElement>(
                    'nav[aria-label="Primary"] [aria-current="page"]',
                  );
                  (current ?? document.getElementById("main-content"))?.focus({
                    preventScroll: true,
                  });
                  destination.current = null;
                  return;
                }
                if (!destination.current) return;
                // Let route focus management lead on navigation; Escape returns to the trigger.
                event.preventDefault();
                destination.current = null;
                document.getElementById("main-content")?.focus({ preventScroll: true });
              }}
            >
              <div className="flex items-center justify-between gap-4">
                <Dialog.Title className="font-mono text-sm tracking-[0.14em] uppercase">
                  Explore Quant Plus
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label="Close menu"
                    className="grid h-11 w-11 shrink-0 place-items-center border border-border-strong"
                  >
                    <X aria-hidden="true" className="h-5 w-5" />
                  </button>
                </Dialog.Close>
              </div>
              <Dialog.Description
                id="mobile-nav-description"
                className="mt-5 text-sm leading-relaxed text-muted-foreground"
              >
                Research Indian equities, learn the process, and practise with virtual funds.
              </Dialog.Description>
              <nav
                aria-label="Mobile primary"
                className="my-6 flex flex-col divide-y divide-border border-y border-border"
              >
                <Link
                  to="/"
                  onClick={() => follow("/")}
                  aria-current={pathname === "/" ? "page" : undefined}
                  className={`${navLink} py-3`}
                >
                  Home
                </Link>
                {links.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => follow(link.to)}
                    aria-current={pathname === link.to ? "page" : undefined}
                    className={`${navLink} py-3`}
                  >
                    {link.label}
                  </Link>
                ))}
                <Link
                  to="/app/$section"
                  params={{ section: "learn" }}
                  preload={false}
                  onClick={() => follow("/app/learn")}
                  className={`${navLink} py-3`}
                >
                  Learn
                </Link>
              </nav>
              <div className="mt-auto space-y-3">
                <Link
                  to="/app/dashboard"
                  preload={false}
                  onClick={() => follow("/app/dashboard")}
                  className="flex min-h-12 items-center justify-center border border-primary-soft bg-primary-soft px-4 py-3 text-sm font-medium text-background hover:bg-foreground"
                >
                  Open paper terminal
                </Link>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Paper trading only · No real broker orders
                </p>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </header>
  );
}
