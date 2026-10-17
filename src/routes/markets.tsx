import { createFileRoute } from "@tanstack/react-router";

import { MarketIntelligence } from "@/components/site/MarketIntelligence";
import { MarketExplorer } from "@/components/site/MarketExplorer";
import { Coverage } from "@/components/site/Coverage";
import { CallToAction } from "@/components/site/CallToAction";
import { PageHeader } from "@/components/site/PageHeader";

const title = "Markets — Quant Plus Market Intelligence";
const description =
  "Follow NSE cash equities with quantitative context: provider quotes, momentum, volatility, breadth and market regime.";

export const Route = createFileRoute("/markets")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MarketsPage,
});

function MarketsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Markets"
        heading="NSE equities, measured honestly."
        body="NIFTY 50 stocks and NSE indices with source-labelled quotes, technical factors and market breadth. Live data appears inside the terminal; this page describes what it measures."
        meta={["NSE cash equities", "Momentum · Volatility · Breadth", "Live data in the terminal"]}
      />
      <MarketIntelligence />
      <MarketExplorer />
      <Coverage />
      <CallToAction />
    </>
  );
}
