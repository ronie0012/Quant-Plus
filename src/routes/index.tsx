import { createFileRoute } from "@tanstack/react-router";

import { Hero } from "@/components/landing/Hero";
import { MarketTicker } from "@/components/landing/MarketTicker";
import { MarketIntelligence } from "@/components/landing/MarketIntelligence";
import { SignalEngine } from "@/components/landing/SignalEngine";
import { AIAnalyst } from "@/components/landing/AIAnalyst";
import { DashboardReveal } from "@/components/landing/DashboardReveal";
import { Capabilities } from "@/components/landing/Capabilities";
import { MarketExplorer } from "@/components/landing/MarketExplorer";
import { ResearchSection } from "@/components/landing/ResearchSection";
import { PortfolioIntelligence } from "@/components/landing/PortfolioIntelligence";
import { RiskEngine } from "@/components/landing/RiskEngine";
import { Coverage } from "@/components/landing/Coverage";
import { Philosophy } from "@/components/landing/Philosophy";
import { ProductShowcase } from "@/components/landing/ProductShowcase";
import { CallToAction } from "@/components/landing/CallToAction";

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
    <div className="landing-page">
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
    </div>
  );
}
