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
];

const secondary = ["About", "Contact", "Privacy", "Terms"];
const social = ["LinkedIn", "GitHub", "X"];

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto w-full max-w-[1400px] px-5 py-16 sm:px-8 lg:px-12">
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-5">
            <span className="font-mono text-sm tracking-[0.22em] uppercase">
              Quant<span className="text-primary-soft">+</span> Plus
            </span>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              AI-powered market intelligence. Turn market complexity into clarity.
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.title} className="md:col-span-3">
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

          <div className="md:col-span-2">
            <span className="label-tech">Company</span>
            <ul className="mt-5 space-y-3">
              {secondary.map((l) => (
                <li key={l}>
                  <span className="text-sm text-muted-foreground">{l}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-2">
            <span className="label-tech">Social</span>
            <ul className="mt-5 space-y-3">
              {social.map((l) => (
                <li key={l}>
                  <span className="text-sm text-muted-foreground">{l}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-16 border-t border-border pt-8">
          <p className="max-w-3xl text-[11px] leading-relaxed text-subtle">
            Risk disclosure: Quant Plus provides market data, quantitative indicators and
            AI-generated analysis for research purposes only. Nothing on this site is investment
            advice, a recommendation, or a prediction of future performance. All figures shown are
            demonstrative sample data. Markets involve risk of loss, including loss of capital.
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
