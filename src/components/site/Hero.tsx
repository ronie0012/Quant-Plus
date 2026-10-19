import { Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, ScanLine, ShieldCheck } from "lucide-react";
import { MarketField } from "@/components/visuals/MarketField";
import { Eyebrow, GhostAction, PrimaryAction } from "./primitives";

export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative overflow-hidden border-b border-border pt-32 pb-16 md:pt-40 md:pb-24"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-30">
        <MarketField density="reduced" />
      </div>
      <div className="relative mx-auto grid w-full max-w-[1400px] items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1.3fr_0.7fr] lg:gap-16 lg:px-12">
        <div>
          <Eyebrow>Indian equities · Personal research</Eyebrow>
          <h1
            id="hero-title"
            className="mt-6 max-w-3xl text-[clamp(2.5rem,5.5vw,5rem)] leading-[1.06] tracking-[-0.04em]"
          >
            Understand the market.{" "}
            <span className="block text-primary-soft">Practise your decisions.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Research Indian stocks, learn what moves them, and build discipline with paper trading —
            in one personal workspace.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <PrimaryAction to="/app/dashboard">Open paper terminal</PrimaryAction>
            <GhostAction to="/app/learn">Start learning</GhostAction>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Virtual funds only. Market data requires a connected provider.
          </p>
        </div>

        <aside
          aria-label="Your first session"
          className="border border-border-strong bg-panel p-6 sm:p-8"
        >
          <p className="label-tech text-primary-soft">Your first session</p>
          <h2 className="mt-4 text-2xl leading-tight tracking-tight">
            One idea. A clearer process.
          </h2>
          <ol className="mt-6 divide-y divide-border">
            {[
              {
                icon: BookOpen,
                title: "Learn the basics",
                body: "Build a foundation before taking a position.",
              },
              {
                icon: ScanLine,
                title: "Examine the evidence",
                body: "Check the source, the thesis and the counter-case.",
              },
              {
                icon: ShieldCheck,
                title: "Practise with a plan",
                body: "Set risk limits and review your paper decisions.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4 py-5 first:pt-0 last:pb-0">
                <Icon aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-primary-soft" />
                <div>
                  <h3 className="text-sm font-medium">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ol>
          <Link
            to="/platform"
            className="mt-6 inline-flex min-h-11 items-center gap-3 text-sm text-primary-soft hover:text-foreground"
          >
            See how the workspace fits together{" "}
            <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
          </Link>
        </aside>
      </div>
    </section>
  );
}
