import { createFileRoute } from "@tanstack/react-router";
import { proxy } from "../agent/$";

const forward = (request: Request) => {
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/^\/api\/stocks\//, "/api/agent/stocks/");
  return proxy(new Request(url, request));
};

export const Route = createFileRoute("/api/stocks/$")({
  server: {
    handlers: {
      GET: ({ request }) => forward(request),
      // Only the allowlisted forecast generation path is accepted by the proxy.
      POST: ({ request }) => forward(request),
    },
  },
});
