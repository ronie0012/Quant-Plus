import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/platform")({
  component: Page,
});

function Page() {
  return null;
}
