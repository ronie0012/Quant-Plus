import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }) => (await import("@/lib/hosted-auth.server")).hostedAuth(request),
      POST: async ({ request }) => (await import("@/lib/hosted-auth.server")).hostedAuth(request),
    },
  },
});
