import { createFileRoute } from "@tanstack/react-router";

import { Hero } from "@/components/site/Hero";
import { MarketTicker } from "@/components/site/MarketTicker";
import { MarketIntelligence } from "@/components/site/MarketIntelligence";
import { SignalEngine } from "@/components/site/SignalEngine";
import { AIAnalyst } from "@/components/site/AIAnalyst";
import { DashboardReveal } from "@/components/site/DashboardReveal";
import { Capabilities } from "@/components/site/Capabilities";
import { MarketExplorer } from "@/components/site/MarketExplorer";
import { ResearchSection } from "@/components/site/ResearchSection";
import { PortfolioIntelligence } from "@/components/site/PortfolioIntelligence";
import { RiskEngine } from "@/components/site/RiskEngine";
import { Coverage } from "@/components/site/Coverage";
import { Philosophy } from "@/components/site/Philosophy";
import { ProductShowcase } from "@/components/site/ProductShowcase";
import { CallToAction } from "@/components/site/CallToAction";

const title = "Quant Plus — AI-Powered Market Intelligence";
const description =
  "Real-time market data, quantitative signals and AI analysis in one intelligent research platform. See the market differently.";

export const Route = createFileRoute("/")({
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
  component: Index,
});

function Index() {
  return (
    <>
      <Hero />
      <MarketTicker />
      <MarketIntelligence />
      <SignalEngine />
      <AIAnalyst />
      <DashboardReveal />
      <Capabilities />
      <MarketExplorer />
      <ResearchSection />
      <PortfolioIntelligence />
      <RiskEngine />
      <Coverage />
      <Philosophy />
      <ProductShowcase />
      <CallToAction />
    </>
  );
}
