import { Link } from "@tanstack/react-router";

const explore = [
  { label: "Platform", to: "/platform" },
  { label: "Markets", to: "/markets" },
  { label: "Research", to: "/research" },
  { label: "AI Analyst", to: "/ai" },
] as const;
const footerLink =
  "inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors hover:text-foreground";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto w-full max-w-[1400px] px-5 py-12 sm:px-8 lg:px-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
          <div>
            <Link
              to="/"
              aria-label="Quant Plus home"
              className="inline-flex min-h-11 items-center font-mono text-sm tracking-[0.18em] uppercase"
            >
              Quant<span className="text-primary-soft">+</span>
            </Link>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
              A personal workspace for Indian-equity research, learning and paper trading.
            </p>
          </div>
          <nav aria-label="Footer explore">
            <h2 className="label-tech">Explore</h2>
            <ul className="mt-3">
              {explore.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className={footerLink}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Footer workspace">
            <h2 className="label-tech">Get into the workspace</h2>
            <ul className="mt-3">
              <li>
                <Link to="/app/dashboard" preload={false} className={footerLink}>
                  Open paper terminal
                </Link>
              </li>
              <li>
                <Link
                  to="/app/$section"
                  params={{ section: "learn" }}
                  preload={false}
                  className={footerLink}
                >
                  Start learning
                </Link>
              </li>
              <li>
                <Link to="/auth" preload={false} className={footerLink}>
                  Sign in
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <div className="mt-10 border-t border-border pt-6">
          <p className="max-w-4xl text-xs leading-relaxed text-muted-foreground">
            For research and education, not investment advice. Paper trading uses virtual funds and
            does not place real broker orders. Quotes and history depend on connected providers;
            unavailable data remains unavailable. AI analysis can be wrong and is not a validated
            prediction of future performance.
          </p>
          <p className="mt-5 font-mono text-xs text-muted-foreground">
            © {new Date().getFullYear()} Quant Plus
          </p>
        </div>
      </div>
    </footer>
  );
}
