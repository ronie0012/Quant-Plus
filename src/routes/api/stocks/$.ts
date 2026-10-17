import { createFileRoute } from "@tanstack/react-router";
import { proxy } from "../agent/$";

export const Route = createFileRoute("/api/stocks/$")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const url = new URL(request.url);
        url.pathname = url.pathname.replace(/^\/api\/stocks\//, "/api/agent/stocks/");
        return proxy(new Request(url, request));
      },
    },
  },
});
