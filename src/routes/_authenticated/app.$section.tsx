import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Card, CardHead } from "@/components/app/cards";

export const Route = createFileRoute("/_authenticated/app/$section")({
  head: () => ({
    meta: [
      { title: "Workspace — Quant Plus Terminal" },
      {
        name: "description",
        content: "A Quant Plus terminal workspace module.",
      },
      { property: "og:title", content: "Workspace — Quant Plus Terminal" },
      { property: "og:description", content: "A Quant Plus terminal workspace module." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SectionPage,
});

function titleOf(slug: string) {
  return slug
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function SectionPage() {
  const { section } = Route.useParams();

  return (
    <div className="flex flex-col gap-5">
      <header className="reveal-in">
        <h1 className="text-[clamp(1.3rem,2.4vw,1.75rem)] tracking-tight">{titleOf(section)}</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          This workspace module is being built out next.
        </p>
      </header>

      <Card glow>
        <CardHead title={titleOf(section)} meta="Coming soon" />
        <div className="flex flex-col items-start gap-4 px-5 py-10">
          <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
            The dashboard is live with funds, market overview, sentiment, intelligence, watchlist,
            calendar, analyses and portfolio. This module will follow the same design language.
          </p>
          <Link
            to="/app/dashboard"
            className="flex items-center gap-2 border border-border-strong px-4 py-2.5 font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to dashboard
          </Link>
        </div>
      </Card>
    </div>
  );
}
