import { createFileRoute } from "@tanstack/react-router";

const SYSTEM = `You are Quant AI, the market intelligence assistant inside the Quant Plus terminal.
You explain Indian and global market structure, momentum, volatility, sentiment and portfolio risk in clear, precise language.
The dashboard shows demonstrative simulated data, so never state real-time prices as fact and never give personalised investment advice.
Be concise (under 140 words), structured, and always note that this is educational analysis, not advice.`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });

        const supabaseUrl = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
        const anonKey =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ??
          process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
          process.env["SUPABASE_ANON_KEY"];
        if (!supabaseUrl || !anonKey) return new Response("Not configured", { status: 500 });

        const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
          headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
        });
        if (!userRes.ok) return new Response("Unauthorized", { status: 401 });

        const lovableKey = process.env["LOVABLE_API_KEY"];
        if (!lovableKey) return new Response("AI is not configured", { status: 500 });

        let body: { message?: string };
        try {
          body = (await request.json()) as { message?: string };
        } catch {
          return new Response("Invalid body", { status: 400 });
        }
        const message = body.message?.trim();
        if (!message) return new Response("Message required", { status: 400 });

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": lovableKey,
            "X-Lovable-AIG-SDK": "fetch",
          },
          body: JSON.stringify({
            model: "openai/gpt-6-astra",
            instructions: SYSTEM,
            input: message,
            stream: true,
            store: false,
            reasoning: { effort: "low", summary: "auto" },
          }),
        });

        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text().catch(() => "");
          return new Response(text || "AI request failed", { status: upstream.status || 502 });
        }

        // Convert the gateway SSE stream into plain answer text chunks.
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const reader = upstream.body!.pipeThrough(new TextDecoderStream()).getReader();
            const encoder = new TextEncoder();
            let buffer = "";
            try {
              while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += value;
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                for (const line of lines) {
                  if (!line.startsWith("data:")) continue;
                  const payload = line.slice(5).trim();
                  if (!payload || payload === "[DONE]") continue;
                  try {
                    const event = JSON.parse(payload) as { type?: string; delta?: string };
                    if (event.type === "response.output_text.delta" && event.delta) {
                      controller.enqueue(encoder.encode(event.delta));
                    }
                  } catch {
                    // ignore partial / non-JSON events
                  }
                }
              }
              controller.close();
            } catch (error) {
              controller.error(error);
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
