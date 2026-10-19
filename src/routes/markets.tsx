import { createFileRoute } from "@tanstack/react-router";

import { MarketIntelligence } from "@/components/site/MarketIntelligence";
import { Coverage } from "@/components/site/Coverage";
import { CallToAction } from "@/components/site/CallToAction";
import { PageHeader } from "@/components/site/PageHeader";

const title = "Markets — Quant Plus Market Intelligence";
const description =
  "Explore Indian equities with source-labelled quotes, available price history and research context. Market data depends on connected providers; trading is paper only.";

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
        heading="Find the context behind a stock."
        body="Explore Indian equities with source-labelled observations, available history and relevant news. Start with what is known before deciding what it means."
        action={{ label: "Open paper terminal", to: "/app/dashboard" }}
        secondary={{ label: "Browse stocks", to: "/app/markets" }}
      />
      <MarketIntelligence />
      <Coverage />
      <CallToAction
        heading="Turn an observation into a research question."
        body="Check the evidence, write down your thesis, and practise only when you have a plan."
        secondary={{ label: "See the research process", to: "/research" }}
      />
    </>
  );
}
