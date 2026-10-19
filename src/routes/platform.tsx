import { createFileRoute } from "@tanstack/react-router";

import { DashboardReveal } from "@/components/site/DashboardReveal";
import { Coverage } from "@/components/site/Coverage";
import { ProcessStory } from "@/components/site/ProcessStory";
import { CallToAction } from "@/components/site/CallToAction";
import { PageHeader } from "@/components/site/PageHeader";

const title = "Platform — Quant Plus";
const description =
  "A personal Indian-equity workspace for learning, research and paper trading. Explore how market context, a paper portfolio and risk controls fit together.";

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
        heading="A workspace for better market habits."
        body="Move from learning to research to paper practice. Keep your market context, virtual portfolio and risk limits together, without losing sight of the next useful step."
        action={{ label: "Open paper terminal", to: "/app/dashboard" }}
        secondary={{ label: "Start learning", to: "/app/learn" }}
      />
      <DashboardReveal />
      <ProcessStory />
      <Coverage />
      <CallToAction />
    </>
  );
}
