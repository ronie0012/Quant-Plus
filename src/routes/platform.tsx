import { createFileRoute } from "@tanstack/react-router";

import { Capabilities } from "@/components/site/Capabilities";
import { DashboardReveal } from "@/components/site/DashboardReveal";
import { PortfolioIntelligence } from "@/components/site/PortfolioIntelligence";
import { RiskEngine } from "@/components/site/RiskEngine";
import { Coverage } from "@/components/site/Coverage";
import { ProductShowcase } from "@/components/site/ProductShowcase";
import { CallToAction } from "@/components/site/CallToAction";
import { PageHeader } from "@/components/site/PageHeader";

const title = "Platform — Quant Plus";
const description =
  "One workspace for market data, quantitative signals, AI research, portfolio intelligence and risk — built for clarity over noise.";

export const Route = createFileRoute("/platform")({
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
  component: PlatformPage,
});

function PlatformPage() {
  return (
    <>
      <PageHeader
        eyebrow="Platform"
        heading="One workspace for the whole market."
        body="Data, signals, research, portfolio and risk in a single interface — designed so the important thing is always the most visible thing."
        meta={["6 modules", "Web · Responsive", "Sample data shown"]}
      />
      <Capabilities />
      <DashboardReveal />
      <PortfolioIntelligence />
      <RiskEngine />
      <Coverage />
      <ProductShowcase />
      <CallToAction />
    </>
  );
}
