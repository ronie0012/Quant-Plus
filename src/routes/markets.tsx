import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/markets")({
  component: MarketsPage,
});

function MarketsPage() {
  return null;
}
