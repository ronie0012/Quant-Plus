import { Link } from "@tanstack/react-router";

const columns = [
  {
    title: "Platform",
    links: [
      { label: "Platform", to: "/platform" as const },
      { label: "Markets", to: "/markets" as const },
      { label: "Research", to: "/research" as const },
      { label: "AI Analyst", to: "/ai" as const },
    ],
  },
  {
    title: "Access",
    links: [
      { label: "Home", to: "/" as const },
      { label: "Get started", to: "/auth" as const },
      { label: "Log in", to: "/auth" as const },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto w-full max-w-[1400px] px-5 py-16 sm:px-8 lg:px-12">
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-5">
            <span className="font-mono text-sm tracking-[0.22em] uppercase">
              Quant<span className="text-primary-soft">+</span>
            </span>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              AI-powered market intelligence. Turn market complexity into clarity.
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.title} className="md:col-span-2">
              <span className="label-tech">{col.title}</span>
              <ul className="mt-5 space-y-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      to={l.to}
                      className="text-sm text-muted-foreground transition-colors duration-300 hover:text-foreground"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="md:col-span-3">
            <div className="border border-border bg-background/35 p-5">
              <span className="label-tech text-primary-soft">Built for clarity</span>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Follow the evidence, see the data state, and keep risk visible before you decide.
              </p>
              <Link
                to="/auth"
                className="mt-5 inline-flex min-h-11 items-center border border-primary-soft bg-primary-soft px-4 font-mono text-[11px] tracking-[0.16em] text-background uppercase transition-colors duration-200 hover:border-foreground hover:bg-foreground"
              >
                Enter the workspace
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-16 border-t border-border pt-8">
          <p className="max-w-3xl text-[11px] leading-relaxed text-subtle">
            Risk disclosure: Quant Plus provides market data, quantitative indicators and
            AI-generated analysis for research purposes only. Nothing on this site is investment
            advice, a recommendation, or a prediction of future performance. Paper trading uses
            virtual funds; market observations come from connected providers and are shown as
            unavailable when no provider is connected. Markets involve risk of loss, including loss
            of capital.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <span className="label-tech">© {new Date().getFullYear()} Quant Plus</span>
            <span className="label-tech">Built for research, not speculation</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
