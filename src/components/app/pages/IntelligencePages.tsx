import { useEffect, useRef, useState } from "react";
import {
  Bot,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  MessageSquare,
  Pause,
  Play,
  Send,
  Sparkles,
  Square,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHead, EmptyState, Pill, Skeleton, SourceTag } from "@/components/app/cards";
import { MetricStrip, PageIntro, ProgressBar } from "./workspace";
import {
  relativeTime,
  useAnalyses,
  useInstruments,
  useNews,
  type Analysis,
} from "@/hooks/use-dashboard-data";
import type { CopilotMode } from "@/lib/chat-api";
import {
  exportConversation,
  useConversations,
  useCopilot,
  useDeleteConversation,
} from "@/hooks/use-copilot";
import { CopilotMessageView } from "@/components/app/CopilotMessage";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ResearchWorkspace } from "@/components/app/ResearchWorkspace";
import { useNavigate } from "@tanstack/react-router";

function verdictTone(v: string) {
  return v.toUpperCase() === "BUY"
    ? ("positive" as const)
    : v.toUpperCase() === "SELL"
      ? ("negative" as const)
      : ("neutral" as const);
}
export function DecisionsPage() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useAnalyses();
  const [selected, setSelected] = useState<Analysis | null>(null);
  // Triage labels are personal notes saved in this browser (not part of the paper book).
  const [states, setStates] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem("qp-committee-triage") ?? "{}") as Record<
        string,
        string
      >;
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("qp-committee-triage", JSON.stringify(states));
    } catch {
      /* storage unavailable: labels last for this visit only */
    }
  }, [states]);
  const active = selected ?? data?.[0] ?? null;
  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Decision intelligence"
        title="From signal to decision."
        body="Review committee verdicts with their opinion strength, risks, rationale and audit trail. Opinion scores are not probabilities."
        action={
          <Button
            onClick={() => void navigate({ to: "/app/$section", params: { section: "committee" } })}
            size="sm"
            className="font-medium text-[11px] uppercase tracking-[0.06em]"
          >
            <Sparkles />
            New analysis
          </Button>
        }
      >
        <MetricStrip
          items={[
            { label: "Decision queue", value: data?.length ?? 0 },
            {
              label: "Opinion ≥ 80/100",
              value: data?.filter((x) => (x.conviction ?? 0) >= 80).length ?? 0,
              tone: "positive",
            },
            {
              label: "Needs review",
              value: Object.values(states).filter((x) => x === "Review").length,
              tone: "warning",
            },
            { label: "Method", value: "Committee", tone: "primary" },
          ]}
        />
      </PageIntro>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,.75fr)]">
        <Card>
          <CardHead
            title="Decision queue"
            meta="Latest CodeCraft research outputs"
            action={<SourceTag label="CodeCraft research" />}
          />
          {isLoading ? (
            <div className="space-y-2 p-5">
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </div>
          ) : isError ? (
            <EmptyState
              title="Queue unavailable"
              hint="Analysis records could not be loaded."
              onRetry={() => void refetch()}
            />
          ) : (
            <div className="divide-y divide-border">
              {data?.map((a, i) => (
                <button
                  key={a.id}
                  onClick={() => setSelected(a)}
                  className={cn(
                    "dash-rise group w-full px-5 py-4 text-left transition-colors hover:bg-panel-elevated/60",
                    active?.id === a.id && "bg-primary/10",
                  )}
                  style={{ ["--d" as string]: `${i * 60}ms` }}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-[12px] tracking-[0.04em]">{a.symbol}</span>
                    <Pill tone={verdictTone(a.verdict)}>{a.verdict}</Pill>
                    <span className="ml-auto font-mono text-[10px] text-subtle">
                      {relativeTime(a.created_at)}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-subtle transition-transform group-hover:translate-x-1" />
                  </div>
                  <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-4">
                    <ProgressBar
                      value={a.conviction ?? 0}
                      tone={verdictTone(a.verdict) === "negative" ? "negative" : "primary"}
                    />
                    <span className="font-mono text-[11px]">
                      {a.conviction == null ? "No opinion score" : `Opinion ${a.conviction}/100`}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
        <Card glow className="h-fit xl:sticky xl:top-[88px]">
          <CardHead
            title={active ? `${active.symbol} decision` : "Decision inspector"}
            meta={
              active ? `Committee verdict · ${relativeTime(active.created_at)}` : "Select a record"
            }
          />
          {active ? (
            <div className="p-5">
              <div className="flex items-center justify-between">
                <Pill tone={verdictTone(active.verdict)}>{active.verdict}</Pill>
                <Pill tone={active.risk.toLowerCase().includes("high") ? "warning" : "neutral"}>
                  Risk {active.risk}
                </Pill>
              </div>
              <p className="mt-5 text-[14px] leading-relaxed text-muted-foreground">
                {active.summary ?? "No committee rationale was stored for this decision."}
              </p>
              <div className="mt-6">
                <div className="mb-2 flex justify-between font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                  <span>Agent opinion strength (uncalibrated)</span>
                  <span>{active.conviction == null ? "—" : `${active.conviction}/100`}</span>
                </div>
                <ProgressBar value={active.conviction ?? 0} tone="primary" />
                <p className="mt-2 text-[11px] text-subtle">
                  An opinion score from the research committee, not a probability of being right.
                </p>
              </div>
              <div className="mt-7 grid grid-cols-3 gap-2">
                {["Review", "Accepted", "Archived"].map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={states[active.id] === s ? "default" : "outline"}
                    onClick={() => setStates((x) => ({ ...x, [active.id]: s }))}
                    className="px-2 font-medium text-[11px] uppercase tracking-[0.06em]"
                  >
                    {s}
                  </Button>
                ))}
              </div>
              <p className="mt-4 text-[10px] leading-relaxed text-subtle">
                Triage labels are saved in this browser only. They do not place or recommend a
                trade.
              </p>
            </div>
          ) : (
            <EmptyState title="No decision selected" hint="Choose an analysis from the queue." />
          )}
        </Card>
      </div>
    </div>
  );
}

export function HistoryPage() {
  const { data, isLoading } = useAnalyses();
  const [open, setOpen] = useState<string | null>(null);
  const groups = (data ?? []).reduce<Record<string, Analysis[]>>((a, x) => {
    const k = new Date(x.created_at).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    (a[k] ??= []).push(x);
    return a;
  }, {});
  return (
    <div className="flex flex-col gap-5">
      <PageIntro
        eyebrow="Audit trail"
        title="Decision history"
        body="A chronological record of every committee output, with context preserved for review."
        status="Private account history"
      >
        <MetricStrip
          items={[
            { label: "Recorded analyses", value: data?.length ?? 0 },
            {
              label: "Buy verdicts",
              value: data?.filter((x) => x.verdict === "BUY").length ?? 0,
              tone: "positive",
            },
            {
              label: "Hold verdicts",
              value: data?.filter((x) => x.verdict === "HOLD").length ?? 0,
            },
            {
              label: "Sell verdicts",
              value: data?.filter((x) => x.verdict === "SELL").length ?? 0,
              tone: "negative",
            },
          ]}
        />
      </PageIntro>
      <Card>
        <CardHead title="Activity ledger" meta="Newest first" />
        {isLoading ? (
          <div className="p-5">
            <Skeleton className="h-52" />
          </div>
        ) : !data?.length ? (
          <EmptyState title="No history yet" hint="Completed analyses will appear here." />
        ) : (
          <div>
            {Object.entries(groups).map(([day, items]) => (
              <section key={day} className="border-b border-border">
                <h2 className="bg-background/30 px-5 py-2.5 font-medium text-[11px] uppercase tracking-[0.06em] text-subtle">
                  {day}
                </h2>
                {items.map((a, i) => (
                  <div key={a.id} className="relative grid grid-cols-[24px_1fr] gap-3 px-5 py-4">
                    <span className="relative mt-1 flex h-5 w-5 items-center justify-center rounded-full border border-primary/40">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    </span>
                    <div>
                      <button
                        onClick={() => setOpen(open === a.id ? null : a.id)}
                        className="flex w-full items-center gap-3 text-left"
                      >
                        <span className="font-mono text-[11px]">{a.symbol}</span>
                        <Pill tone={verdictTone(a.verdict)}>{a.verdict}</Pill>
                        <span className="text-[11px] text-subtle">
                          Committee analysis completed
                        </span>
                        <span className="ml-auto font-mono text-[11px] text-subtle">
                          {new Date(a.created_at).toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <ChevronDown
                          className={cn(
                            "h-3.5 w-3.5 text-subtle transition-transform",
                            open === a.id && "rotate-180",
                          )}
                        />
                      </button>
                      <div
                        className={cn(
                          "grid transition-[grid-template-rows] duration-500",
                          open === a.id ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                        )}
                      >
                        <div className="overflow-hidden">
                          <p className="mt-3 border-l border-border pl-4 text-[12px] leading-relaxed text-muted-foreground">
                            {a.summary ?? "No summary stored."} Opinion strength{" "}
                            {a.conviction == null
                              ? "unavailable"
                              : `${a.conviction}/100 (uncalibrated)`}
                            . Risk {a.risk}.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

const modes: { value: CopilotMode; label: string; prompt: string }[] = [
  {
    value: "general",
    label: "Ask anything",
    prompt: "Summarise today's market condition with sources",
  },
  { value: "explain_move", label: "Explain a move", prompt: "Why did RELIANCE move today?" },
  {
    value: "compare",
    label: "Compare evidence",
    prompt: "Compare TCS and INFY on the available evidence",
  },
  {
    value: "portfolio_risk",
    label: "Portfolio risk",
    prompt: "Review my portfolio concentration and day-loss window",
  },
  {
    value: "pre_trade",
    label: "Pre-trade review",
    prompt: "What supports and contradicts a paper buy of HDFCBANK?",
  },
  { value: "post_trade", label: "Post-trade review", prompt: "Review my most recent filled order" },
];

export function QuantAIPage() {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<CopilotMode>("general");
  const [search, setSearch] = useState("");
  const copilot = useCopilot({ mode, persist: true });
  const { messages, busy, error } = copilot;
  const conversations = useConversations(search);
  const remove = useDeleteConversation();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  async function send(raw: string) {
    if (!raw.trim() || busy) return;
    setInput("");
    await copilot.send(raw, { mode });
  }
  async function download(id: string) {
    try {
      const data = await exportConversation(id);
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      toast.success("Conversation JSON copied to the clipboard");
    } catch {
      toast.error("Export failed or clipboard access was denied");
    }
  }
  return (
    <div className="flex min-h-[calc(100vh-132px)] flex-col gap-5">
      <PageIntro
        eyebrow="Quant AI · grounded reasoning"
        title="Ask the market."
        body="A read-only copilot that answers from cited evidence: provider quotes and history, news tone, saved research and your paper book. Figures it cannot trace are flagged."
        action={<SourceTag label="Read-only tools" />}
      />
      <div className="grid min-h-[620px] flex-1 gap-5 xl:grid-cols-[280px_minmax(0,1fr)_300px]">
        <Card>
          <CardHead title="Workflow" meta="Choose how the answer is framed" />
          <div className="space-y-2 p-3" role="radiogroup" aria-label="Copilot workflow">
            {modes.map((item) => (
              <button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={mode === item.value}
                onClick={() => setMode(item.value)}
                className={cn(
                  "w-full rounded-md border px-3 py-2.5 text-left text-[12px] transition-colors",
                  mode === item.value
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border",
                )}
              >
                {item.label}
                <span className="mt-1 block text-[10.5px] text-subtle">{item.prompt}</span>
              </button>
            ))}
          </div>
          <div className="m-3 border-t border-border pt-3">
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => void send(modes.find((m) => m.value === mode)!.prompt)}
              disabled={busy}
            >
              Ask the example question
            </Button>
          </div>
        </Card>
        <Card glow className="flex min-h-[560px] flex-col">
          <CardHead
            title="Conversation"
            meta={copilot.conversationId ? "Saved to your workspace" : "New conversation"}
            action={
              <div className="flex items-center gap-2">
                <Pill tone={error ? "warning" : "primary"}>
                  {busy ? "Answering" : error ? "Needs attention" : "Ready"}
                </Pill>
                <Button size="sm" variant="ghost" onClick={() => copilot.reset()} disabled={busy}>
                  New
                </Button>
              </div>
            }
          />
          <div
            className="flex-1 space-y-4 overflow-y-auto p-5"
            aria-live="polite"
            tabIndex={0}
            role="log"
            aria-label="Quant AI conversation"
          >
            {messages.length === 0 && (
              <div className="flex h-full min-h-72 flex-col items-center justify-center text-center">
                <span className="relative grid h-14 w-14 place-items-center rounded-full border border-primary/40 bg-primary/10 text-primary-soft">
                  <BrainCircuit className="h-6 w-6" />
                </span>
                <h2 className="mt-5 text-lg">Start with a question</h2>
                <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted-foreground">
                  Answers cite evidence IDs such as [Q1]. Opinion and tone scores are not
                  probabilities. Quant AI cannot place or change orders.
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <CopilotMessageView key={i} message={m} pending={busy && i === messages.length - 1} />
            ))}
            {error && (
              <p role="alert" className="text-[12px] text-negative">
                {error}{" "}
                <button type="button" className="underline" onClick={() => copilot.retry()}>
                  Retry
                </button>
              </p>
            )}
            <div ref={end} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="m-4 flex items-end gap-2 rounded-lg border border-border bg-background/40 p-2 focus-within:border-primary/50"
          >
            <textarea
              aria-label="Question for Quant AI"
              maxLength={4000}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={2}
              placeholder="Ask about markets, a symbol or portfolio risk… (Enter to send)"
              className="min-h-12 flex-1 resize-none bg-transparent px-2 py-1 text-[13px] outline-none placeholder:text-subtle"
            />
            {busy ? (
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => copilot.stop()}
                aria-label="Stop answer"
              >
                <Square />
              </Button>
            ) : (
              <Button size="icon" disabled={!input.trim()} aria-label="Send question">
                <Send />
              </Button>
            )}
          </form>
        </Card>
        <Card>
          <CardHead title="History" meta="Saved conversations" />
          <div className="p-3">
            <label htmlFor="conversation-search" className="sr-only">
              Search conversations
            </label>
            <input
              id="conversation-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations"
              className="h-9 w-full rounded-md border border-border bg-background/40 px-2 text-[12px] outline-none focus:border-primary/50"
            />
          </div>
          <ul className="max-h-[480px] divide-y divide-border overflow-y-auto">
            {(conversations.data ?? []).map((c) => (
              <li key={c.id} className="px-3 py-2.5">
                <button
                  type="button"
                  className="block w-full text-left text-[12px] hover:text-primary-soft"
                  onClick={() => void copilot.load(c.id)}
                  disabled={busy}
                >
                  {c.title}
                  <span className="mt-0.5 block font-mono text-[11px] text-subtle">
                    {c.mode.replaceAll("_", " ")} · {c.messages} messages ·{" "}
                    {relativeTime(c.updated_at)}
                  </span>
                </button>
                <div className="mt-1 flex gap-3 font-medium text-[11px] uppercase tracking-[0.06em]">
                  <button
                    type="button"
                    className="text-subtle hover:text-foreground"
                    onClick={() => void download(c.id)}
                  >
                    Export
                  </button>
                  <button
                    type="button"
                    className="text-subtle hover:text-negative"
                    onClick={() =>
                      remove.mutate(c.id, {
                        onSuccess: () => {
                          if (copilot.conversationId === c.id) copilot.reset();
                          toast.success("Conversation deleted");
                        },
                      })
                    }
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
            {conversations.data?.length === 0 && (
              <li className="px-3 py-6 text-[12px] text-muted-foreground">
                {search ? "No conversations match." : "Completed answers are saved here."}
              </li>
            )}
          </ul>
          <p className="border-t border-border px-3 py-3 text-[10.5px] leading-relaxed text-subtle">
            Conversations are stored in your workspace book (max 200). Delete removes them
            permanently.
          </p>
        </Card>
      </div>
    </div>
  );
}

export function CommitteePage() {
  return <ResearchWorkspace />;
}

export function AgentActivityPage() {
  return <ResearchWorkspace activity />;
}
