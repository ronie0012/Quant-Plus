import { createFileRoute } from "@tanstack/react-router";

import { Hero } from "@/components/site/Hero";
import { Capabilities } from "@/components/site/Capabilities";
import { CallToAction } from "@/components/site/CallToAction";

const title = "Quant Plus — Indian Equity Research, Learning & Paper Trading";
const description =
  "Research Indian stocks, learn what moves them and practise decisions with virtual funds. A personal paper workspace with provider-labelled data and AI research.";

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
      <Capabilities />
      <CallToAction />
    </>
  );
}
