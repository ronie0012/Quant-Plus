import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/research")({
  component: Page,
});

function Page() {
  return null;
}
