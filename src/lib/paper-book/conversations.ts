/**
 * Copilot conversations and AI usage, stored in the user's book so they persist
 * across navigation and restarts. Users can list, search, export and delete them.
 */
import { randomUUID } from "node:crypto";
import type { BookState, Clock, Row } from "./types.ts";

export const MAX_CONVERSATIONS = 200;
export const MAX_MESSAGES = 200;
const MODES = new Set([
  "general",
  "explain_move",
  "compare",
  "portfolio_risk",
  "pre_trade",
  "journal_review",
  "post_trade",
]);

type Message = { role: "user" | "assistant"; text: string; at: string; evidence?: unknown };

function readMessages(value: unknown): Message[] {
  if (!Array.isArray(value) || value.length > MAX_MESSAGES) throw new Error("INVALID_CONVERSATION");
  return value.map((item) => {
    const message = item as Record<string, unknown>;
    if (
      !message ||
      (message["role"] !== "user" && message["role"] !== "assistant") ||
      typeof message["text"] !== "string" ||
      message["text"].length > 8000
    )
      throw new Error("INVALID_CONVERSATION");
    const evidence = message["evidence"];
    if (evidence !== undefined && JSON.stringify(evidence).length > 20_000)
      throw new Error("INVALID_CONVERSATION");
    return {
      role: message["role"],
      text: message["text"],
      at: typeof message["at"] === "string" ? message["at"] : new Date(0).toISOString(),
      ...(evidence === undefined ? {} : { evidence }),
    };
  });
}

export function saveConversation(state: BookState, clock: Clock, values: Row) {
  const mode = String(values["mode"] ?? "general");
  if (!MODES.has(mode)) throw new Error("INVALID_CONVERSATION");
  const messages = readMessages(values["messages"]);
  const title =
    typeof values["title"] === "string" && values["title"].trim()
      ? values["title"].trim().slice(0, 120)
      : (messages.find((m) => m.role === "user")?.text.slice(0, 80) ?? "Conversation");
  const id = values["id"];
  const existing =
    typeof id === "string" ? state.conversations.find((c) => c["id"] === id) : undefined;
  if (typeof id === "string" && !existing) throw new Error("CONVERSATION_NOT_FOUND");
  if (existing) {
    Object.assign(existing, { title, mode, messages, updated_at: clock.iso });
    return existing;
  }
  if (state.conversations.length >= MAX_CONVERSATIONS) throw new Error("CONVERSATION_LIMIT");
  const row = {
    id: randomUUID(),
    title,
    mode,
    messages,
    created_at: clock.iso,
    updated_at: clock.iso,
  };
  state.conversations.push(row);
  return row;
}

export function deleteConversation(state: BookState, id: unknown) {
  const before = state.conversations.length;
  state.conversations = state.conversations.filter((c) => c["id"] !== id);
  if (state.conversations.length === before) throw new Error("CONVERSATION_NOT_FOUND");
  return { deleted: id };
}

export function listConversations(state: BookState, query: unknown) {
  const needle = typeof query === "string" ? query.trim().toLowerCase() : "";
  return state.conversations
    .filter(
      (c) =>
        !needle ||
        String(c["title"]).toLowerCase().includes(needle) ||
        (c["messages"] as Message[]).some((m) => m.text.toLowerCase().includes(needle)),
    )
    .map((c) => ({
      id: c["id"],
      title: c["title"],
      mode: c["mode"],
      messages: (c["messages"] as Message[]).length,
      updated_at: c["updated_at"],
    }))
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
}

export function getConversation(state: BookState, id: unknown) {
  const row = state.conversations.find((c) => c["id"] === id);
  if (!row) throw new Error("CONVERSATION_NOT_FOUND");
  return row;
}

/** Count one copilot request against today's (IST) budget; throws when exhausted. */
export function recordAiUsage(state: BookState, clock: Clock, limit: number) {
  const day = new Date(clock.now + 330 * 60_000).toISOString().slice(0, 10);
  const usage = (state.ai_usage ??= { date: day, requests: 0 });
  if (usage.date !== day) Object.assign(usage, { date: day, requests: 0 });
  if (usage.requests >= limit) throw new Error("AI_DAILY_LIMIT");
  usage.requests += 1;
  return { date: usage.date, requests: usage.requests, limit };
}
