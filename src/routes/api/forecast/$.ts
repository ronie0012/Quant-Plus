import { createFileRoute } from "@tanstack/react-router";
import { proxy } from "../agent/$";

export const Route = createFileRoute("/api/forecast/$")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const url = new URL(request.url);
        url.pathname = url.pathname.replace(/^\/api\/forecast\//, "/api/agent/forecast/");
        return proxy(new Request(url, request));
      },
    },
  },
});
