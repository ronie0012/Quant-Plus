import { workspaceAuthorization } from "./workspace-session";

export type ChatMessage = { role: "user" | "assistant"; text: string };
export type CopilotMode =
  | "general"
  | "explain_move"
  | "compare"
  | "portfolio_risk"
  | "pre_trade"
  | "journal_review"
  | "post_trade";
export type CopilotContext = { symbol?: string; order_id?: string; journal_id?: string };
export type EvidenceMeta = {
  mode: CopilotMode;
  resolved: { symbol: string; company: string; matched: string; via: string }[];
  ambiguous: { term: string; candidates: string[] }[];
  evidence: { id: string; kind: string; source: string; as_of: string | null }[];
  tools: { tool: string; status: "ok" | "unavailable"; ms: number }[];
  model: string;
};

/** Decode the server's evidence/tool trace header; null when absent or malformed. */
export function readEvidenceHeader(response: Response): EvidenceMeta | null {
  const raw = response.headers.get("x-quantai-evidence");
  if (!raw) return null;
  try {
    const base64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as EvidenceMeta;
  } catch {
    return null;
  }
}

/** One request contract for the copilot, full chat and journal review. */
export async function chatFetch(
  message: string,
  history: ChatMessage[] = [],
  signal?: AbortSignal,
  options: { mode?: CopilotMode; context?: CopilotContext } = {},
) {
  const authorization = await workspaceAuthorization("Sign in again to use Quant AI.");
  if (message.length > 4000) throw new Error("Keep your question within 4000 characters.");
  const response = await fetch("/api/chat", {
    method: "POST",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(100_000)])
      : AbortSignal.timeout(100_000),
    headers: { "Content-Type": "application/json", Authorization: authorization },
    body: JSON.stringify({
      message,
      history: history.filter((item) => item.text).slice(-12),
      mode: options.mode ?? "general",
      ...(options.context ? { context: options.context } : {}),
    }),
  });
  if (!response.ok || !response.body) {
    const errors: Record<number, string> = {
      401: "Your session expired. Sign in again.",
      402: "AI credits are exhausted for this workspace.",
      429: (await response.text().catch(() => "")) || "Quant AI is busy. Try again shortly.",
      500: "Quant AI needs server configuration. Contact the workspace owner.",
      502: "AI service unavailable. Please try again.",
    };
    throw new Error(errors[response.status] ?? "Quant AI could not answer. Please try again.");
  }
  return response as Response & { body: ReadableStream<Uint8Array> };
}
