import { createFileRoute } from "@tanstack/react-router";

import { AIAnalyst } from "@/components/site/AIAnalyst";
import { CallToAction } from "@/components/site/CallToAction";
import { PageHeader } from "@/components/site/PageHeader";

const title = "AI Analyst — Quant Plus";
const description =
  "An AI companion for Indian-equity research and paper-account context. Ask questions, inspect supplied evidence and understand model and provider limitations.";

export const Route = createFileRoute("/ai")({
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
  component: AIPage,
});

function AIPage() {
  return (
    <>
      <PageHeader
        eyebrow="AI Analyst"
        heading="Better questions. More considered decisions."
        body="Use AI as a research companion for Indian equities, not as a source of certainty. Explore explanations, identify missing evidence and stay responsible for the decision."
        action={{ label: "Open paper terminal", to: "/app/dashboard" }}
        secondary={{ label: "Explore AI workspace", to: "/app/quant-ai" }}
      />
      <AIAnalyst />
      <CallToAction
        heading="Put the answer back into context."
        body="A useful response should improve your research process. Check the facts and the counter-case before you practise an idea."
        secondary={{ label: "See the research process", to: "/research" }}
      />
    </>
  );
}
