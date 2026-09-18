import { createFileRoute } from "@tanstack/react-router";

import { AIAnalyst } from "@/components/site/AIAnalyst";
import { SignalEngine } from "@/components/site/SignalEngine";
import { RiskEngine } from "@/components/site/RiskEngine";
import { CallToAction } from "@/components/site/CallToAction";
import { PageHeader } from "@/components/site/PageHeader";

const title = "AI Analyst — Quant Plus";
const description =
  "Ask the market a question and see the reasoning: data retrieval, breadth, rotation, volatility and historical regime comparison.";

export const Route = createFileRoute("/ai")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: AIPage,
});

function AIPage() {
  return (
    <>
      <PageHeader
        eyebrow="AI Analyst"
        heading="Reasoning you can inspect."
        body="The analyst shows every step it takes — which data it read, which factors mattered, and how confident the conclusion is."
        meta={["Grounded in market data", "Reasoning shown", "Not investment advice"]}
      />
      <AIAnalyst />
      <SignalEngine />
      <RiskEngine />
      <CallToAction />
    </>
  );
}
