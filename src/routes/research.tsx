import { createFileRoute } from "@tanstack/react-router";

import { ResearchSection } from "@/components/site/ResearchSection";
import { SignalEngine } from "@/components/site/SignalEngine";
import { Philosophy } from "@/components/site/Philosophy";
import { CallToAction } from "@/components/site/CallToAction";
import { PageHeader } from "@/components/site/PageHeader";

const title = "Research — Quant Plus";
const description =
  "Structured market research desks covering daily briefs, sector rotation, volatility regimes, macro conditions and earnings intelligence.";

export const Route = createFileRoute("/research")({
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
  component: ResearchPage,
});

function ResearchPage() {
  return (
    <>
      <PageHeader
        eyebrow="Research"
        heading="Research that states its limits."
        body="Six desks, each answering a single question with the data behind it — and an explicit note on what the data does not support."
        meta={["6 desks", "Daily · Weekly · On demand", "No performance claims"]}
      />
      <ResearchSection />
      <SignalEngine />
      <Philosophy />
      <CallToAction />
    </>
  );
}
