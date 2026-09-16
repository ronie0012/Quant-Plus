import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/ai")({
  component: Page,
});

function Page() {
  return null;
}
