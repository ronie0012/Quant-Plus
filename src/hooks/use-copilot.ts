import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  chatFetch,
  readEvidenceHeader,
  type ChatMessage,
  type CopilotContext,
  type CopilotMode,
  type EvidenceMeta,
} from "@/lib/chat-api";
import { workspaceRpc } from "@/lib/workspace-api";

export type CopilotMessage = ChatMessage & { at: string; evidence?: EvidenceMeta | null };
type SavedConversation = {
  id: string;
  title: string;
  mode: CopilotMode;
  messages: CopilotMessage[];
  updated_at: string;
};

/**
 * Shared copilot stream consumer: streaming, Stop, retry, evidence metadata and
 * (optionally) persisted conversations. Every chat surface uses this one hook.
 */
export function useCopilot(
  options: {
    mode?: CopilotMode;
    context?: CopilotContext;
    persist?: boolean;
  } = {},
) {
  const client = useQueryClient();
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  // The ref is the source of truth; state mirrors it for rendering.
  const latest = useRef<CopilotMessage[]>([]);
  const commit = useCallback((next: CopilotMessage[]) => {
    latest.current = next;
    setMessages(next);
  }, []);

  useEffect(() => () => controller.current?.abort(), []);

  const save = useCallback(
    async (next: CopilotMessage[], id: string | null, mode: CopilotMode) => {
      if (!options.persist) return id;
      try {
        const saved = await workspaceRpc<{ id: string }>("conversation_save", {
          ...(id ? { id } : {}),
          mode,
          messages: next.map(({ role, text, at, evidence }) => ({
            role,
            text,
            at,
            ...(evidence
              ? { evidence: { resolved: evidence.resolved, evidence: evidence.evidence } }
              : {}),
          })),
        });
        void client.invalidateQueries({ queryKey: ["conversations"] });
        return saved.id;
      } catch {
        return id;
      }
    },
    [client, options.persist],
  );

  const send = useCallback(
    async (raw: string, override: { mode?: CopilotMode; context?: CopilotContext } = {}) => {
      const message = raw.trim();
      if (!message || busy) return;
      const mode = override.mode ?? options.mode ?? "general";
      const context = override.context ?? options.context;
      const history = latest.current.map(({ role, text }) => ({ role, text }));
      const now = () => new Date().toISOString();
      setError(null);
      setBusy(true);
      commit([
        ...latest.current,
        { role: "user", text: message, at: now() },
        { role: "assistant", text: "", at: now() },
      ]);
      const abort = new AbortController();
      controller.current = abort;
      let answer = "";
      let evidence: EvidenceMeta | null = null;
      try {
        const response = await chatFetch(message, history, abort.signal, {
          mode,
          ...(context ? { context } : {}),
        });
        evidence = readEvidenceHeader(response);
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            answer += value;
            commit([
              ...latest.current.slice(0, -1),
              { role: "assistant", text: answer, at: now(), evidence },
            ]);
          }
        } finally {
          await reader.cancel().catch(() => undefined);
        }
      } catch (caught) {
        if (abort.signal.aborted) {
          answer = answer ? `${answer}\n\n(Stopped.)` : "";
        } else {
          setError(caught instanceof Error ? caught.message : "Something went wrong.");
        }
      } finally {
        controller.current = null;
        setBusy(false);
      }
      const finished: CopilotMessage[] = answer
        ? [...latest.current.slice(0, -1), { role: "assistant", text: answer, at: now(), evidence }]
        : latest.current.slice(0, -2);
      commit(finished);
      if (answer) setConversationId(await save(finished, conversationId, mode));
    },
    [busy, commit, conversationId, options.context, options.mode, save],
  );

  const stop = useCallback(() => controller.current?.abort(), []);
  const retry = useCallback(() => {
    const lastUser = [...latest.current].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    // Drop the failed exchange before asking again.
    commit(latest.current.slice(0, latest.current.lastIndexOf(lastUser)));
    void send(lastUser.text);
  }, [commit, send]);
  const reset = useCallback(() => {
    controller.current?.abort();
    commit([]);
    setConversationId(null);
    setError(null);
  }, [commit]);
  const load = useCallback(
    async (id: string) => {
      try {
        const saved = await workspaceRpc<SavedConversation>("conversation_get", { p_id: id });
        commit(saved.messages);
        setConversationId(saved.id);
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Conversation could not be loaded.");
      }
    },
    [commit],
  );

  return { messages, busy, error, send, stop, retry, reset, load, conversationId };
}

export function useConversations(query: string) {
  return useQuery({
    queryKey: ["conversations", query],
    queryFn: () =>
      workspaceRpc<
        { id: string; title: string; mode: string; messages: number; updated_at: string }[]
      >("conversation_list", { p_query: query }),
  });
}

export function useDeleteConversation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => workspaceRpc("conversation_delete", { p_id: id }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["conversations"] }),
  });
}

export async function exportConversation(id: string) {
  return workspaceRpc<SavedConversation>("conversation_get", { p_id: id });
}
