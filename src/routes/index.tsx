import { createFileRoute } from "@tanstack/react-router";

import { Hero } from "@/components/site/Hero";
import { MarketTicker } from "@/components/site/MarketTicker";
import { ProcessStory } from "@/components/site/ProcessStory";
import { DashboardReveal } from "@/components/site/DashboardReveal";
import { Capabilities } from "@/components/site/Capabilities";
import { Coverage } from "@/components/site/Coverage";
import { Philosophy } from "@/components/site/Philosophy";
import { CallToAction } from "@/components/site/CallToAction";

const title = "Quant Plus — AI-Powered Market Intelligence";
const description =
  "Source-aware market data when connected, quantitative signals and AI research in one decision workspace. Make market decisions you can defend.";

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
      <DashboardReveal />
      {/* The product surface proves the promise before the scroll-driven story explains it. */}
      <ProcessStory />
      <Capabilities />
      <Coverage />
      <Philosophy />
      <CallToAction />
    </>
  );
}
