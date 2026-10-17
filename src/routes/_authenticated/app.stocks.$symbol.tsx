import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, EmptyState } from "@/components/app/cards";
import { PageIntro } from "@/components/app/pages/workspace";
import { StockDetail } from "@/components/app/stocks/StockDetail";
import { stockBySymbol } from "@/data/nifty50";
import { useQuery } from "@tanstack/react-query";
import { agentFetch } from "@/lib/agent-api";
import { Button } from "@/components/ui/button";

type StockProfile = { symbol: string; company: string; sector: string };

export const Route = createFileRoute("/_authenticated/app/stocks/$symbol")({
  head: ({ params }) => {
    const stock = stockBySymbol(params.symbol);
    const title = stock
      ? `${stock.symbol} — ${stock.company} | Quant Plus Terminal`
      : `${params.symbol.toUpperCase()} — Quant Plus Terminal`;
    const description = stock
      ? `${stock.company} price action, agent prediction, sentiment, news, depth and simulated dealing.`
      : "NSE stock prices and agentic AI research.";
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
  const normalized = symbol.trim().toUpperCase().replace(/\.NS$/, "");
  const valid = /^[A-Z0-9][A-Z0-9&-]{0,29}$/.test(normalized);
  const known = stockBySymbol(normalized);
  const profile = useQuery<StockProfile, Error>({
    queryKey: ["stock-profile", normalized],
    queryFn: async ({ signal }) =>
      (await agentFetch(`stocks/${encodeURIComponent(normalized)}/profile`, { signal })).json(),
    enabled: valid && !known,
    staleTime: 300_000,
    retry: false,
  });
  const stock =
    known ??
    (profile.data ? { ...profile.data, price: 0, changePct: 0, weight: 0, seed: 0 } : undefined);

  if (!stock) {
    return (
      <div className="flex flex-col gap-5">
        <PageIntro
          eyebrow="Instrument"
          title={valid ? normalized : "Invalid stock symbol"}
          body={
            valid
              ? "Looking up this stock with the market-data provider."
              : "Enter an NSE equity symbol such as TCS, SUZLON or M&M."
          }
        />
        <Card>
          <EmptyState
            title={
              valid
                ? profile.error
                  ? "Stock lookup unavailable"
                  : "Loading stock…"
                : "Invalid symbol"
            }
            hint={
              profile.error?.message ??
              "The same prediction and quote feeds work across supported NSE stocks."
            }
          />
          <div className="px-5 pb-6">
            {profile.error && (
              <Button variant="outline" onClick={() => void profile.refetch()} className="mr-4">
                Retry lookup
              </Button>
            )}
            <Link
              to="/app/$section"
              params={{ section: "markets" }}
              className="font-medium text-[11px] tracking-[0.06em] uppercase text-primary-soft"
            >
              Back to markets
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return <StockDetail key={normalized} stock={stock} showDemoPanels={!!known} />;
}
