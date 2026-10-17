import { createFileRoute } from "@tanstack/react-router";
import { proxy } from "../agent/$";

export const Route = createFileRoute("/api/market/$")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const url = new URL(request.url);
        url.pathname = url.pathname.replace(/^\/api\/market\//, "/api/agent/market/");
        return proxy(new Request(url, request));
      },
    },
  },
});
