import type { CopilotMessage } from "@/hooks/use-copilot";
import { cn } from "@/lib/utils";

/** One copilot message with its evidence sources and tool status. */
export function CopilotMessageView({
  message,
  pending,
  compact = false,
}: {
  message: CopilotMessage;
  pending?: boolean;
  compact?: boolean;
}) {
  const meta = message.evidence;
  const unavailable = meta?.tools.filter((tool) => tool.status === "unavailable") ?? [];
  return (
    <div
      className={cn(
        "max-w-[92%] rounded-lg border leading-relaxed whitespace-pre-wrap",
        compact ? "px-3 py-2.5 text-[13px]" : "px-4 py-3 text-[13px]",
        message.role === "user"
          ? "ml-auto border-primary/35 bg-primary/10 text-foreground"
          : "border-border bg-background/30 text-muted-foreground",
      )}
    >
      {!compact && (
        <p className="mb-2 font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
          {message.role === "user" ? "You" : "Quant AI"}
        </p>
      )}
      {message.text || (pending ? "Reading evidence…" : "")}
      {message.role === "assistant" && meta && (
        <details className="mt-2 text-[11px] text-subtle">
          <summary className="cursor-pointer">
            {meta.evidence.length} evidence item(s)
            {meta.resolved.length ? ` · ${meta.resolved.map((r) => r.symbol).join(", ")}` : ""}
            {unavailable.length ? ` · ${unavailable.length} source(s) unavailable` : ""}
          </summary>
          <ul className="mt-1 space-y-0.5 font-mono text-[10px]">
            {meta.evidence.map((item) => (
              <li key={item.id}>
                [{item.id}] {item.kind.replaceAll("_", " ")} · {item.source}
                {item.as_of ? ` · ${new Date(item.as_of).toLocaleString("en-IN")}` : ""}
              </li>
            ))}
            {unavailable.map((tool) => (
              <li key={tool.tool} className="text-warning">
                {tool.tool}: unavailable
              </li>
            ))}
            {meta.ambiguous.map((item) => (
              <li key={item.term} className="text-warning">
                “{item.term}” is ambiguous: {item.candidates.join(", ")}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
