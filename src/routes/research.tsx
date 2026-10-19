import { createFileRoute } from "@tanstack/react-router";

import { ResearchSection } from "@/components/site/ResearchSection";
import { CallToAction } from "@/components/site/CallToAction";
import { PageHeader } from "@/components/site/PageHeader";

const title = "Research — Quant Plus";
const description =
  "Build a reviewable Indian-equity thesis: check observations, compare the counter-case and record a paper decision. Research and model limitations stay visible.";

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
        heading="Build a view you can revisit."
        body="Keep observations, interpretations and decisions distinct. Research an Indian company, challenge your assumptions, and record what would change your mind."
        action={{ label: "Open paper terminal", to: "/app/dashboard" }}
        secondary={{ label: "Start learning", to: "/app/learn" }}
      />
      <ResearchSection />
      <CallToAction
        heading="Use AI to question the thesis, too."
        body="Ask for explanations and alternative views, then verify the supplied evidence before making your own paper decision."
        secondary={{ label: "Meet the AI analyst", to: "/ai" }}
      />
    </>
  );
}
