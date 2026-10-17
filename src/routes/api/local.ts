import { createFileRoute } from "@tanstack/react-router";

/** Workspace data boundary: the loopback local profile or a verified hosted user. */
export async function local(request: Request) {
  const { resolveBookService, BookAccessError } = await import("@/lib/book-service.server");
  let books;
  try {
    books = await resolveBookService(request);
  } catch (error) {
    if (error instanceof BookAccessError)
      return new Response(error.message, { status: error.status });
    return new Response("Workspace storage unavailable", { status: 503 });
  }
  try {
    const input: unknown = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new Error("Invalid local request");
    return Response.json(await books.query(input as Record<string, unknown>), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "HostedBookError" && "status" in error) {
      return new Response(error.message, {
        status: Number((error as Error & { status: number }).status),
      });
    }
    const message =
      error instanceof Error && !("code" in error) && !("status" in error)
        ? error.message
        : "Workspace storage unavailable";
    return new Response(message, { status: 400 });
  }
}
export const Route = createFileRoute("/api/local")({
  server: { handlers: { POST: ({ request }) => local(request) } },
});
