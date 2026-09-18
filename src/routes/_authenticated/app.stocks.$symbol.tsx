import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, EmptyState } from "@/components/app/cards";
import { PageIntro } from "@/components/app/pages/workspace";
import { StockDetail } from "@/components/app/stocks/StockDetail";
import { stockBySymbol } from "@/data/nifty50";

export const Route = createFileRoute("/_authenticated/app/stocks/$symbol")({
  head: ({ params }) => {
    const stock = stockBySymbol(params.symbol);
    const title = stock
      ? `${stock.symbol} — ${stock.company} | Quant Plus Terminal`
      : "Instrument — Quant Plus Terminal";
    const description = stock
      ? `${stock.company} price action, agent prediction, sentiment, news, depth and simulated dealing.`
      : "This instrument is not part of the tracked NIFTY 50 universe.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: StockPage,
});

function StockPage() {
  const { symbol } = Route.useParams();
  const stock = stockBySymbol(symbol);

  if (!stock) {
    return (
      <div className="flex flex-col gap-5">
        <PageIntro
          eyebrow="Instrument"
          title="Instrument not tracked"
          body="Only NIFTY 50 constituents are available in this workspace."
        />
        <Card>
          <EmptyState
            title={`${symbol.toUpperCase()} is not in the tracked universe`}
            hint="Return to the markets desk to choose a constituent."
          />
          <div className="px-5 pb-6">
            <Link
              to="/app/$section"
              params={{ section: "markets" }}
              className="font-mono text-[10px] tracking-[0.16em] uppercase text-primary-soft"
            >
              Back to markets
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return <StockDetail stock={stock} />;
}
