import { createFileRoute } from "@tanstack/react-router";

import { MarketIntelligence } from "@/components/site/MarketIntelligence";
import { MarketExplorer } from "@/components/site/MarketExplorer";
import { Coverage } from "@/components/site/Coverage";
import { CallToAction } from "@/components/site/CallToAction";
import { PageHeader } from "@/components/site/PageHeader";

const title = "Markets — Quant Plus Market Intelligence";
const description =
  "Track indices, crypto, commodities and currencies with quantitative context: momentum, volatility, breadth and market regime.";

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
        heading="Every market, one language."
        body="Indices, crypto, commodities and currencies normalised into the same quantitative frame — so comparison is honest rather than convenient."
        meta={["8 instruments", "Momentum · Volatility · Breadth", "Sample data"]}
      />
      <MarketIntelligence />
      <MarketExplorer />
      <Coverage />
      <CallToAction />
    </>
  );
}
